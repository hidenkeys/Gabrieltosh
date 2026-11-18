// Code-only local QA tool. Default execution performs read-only preflight.
import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdtemp,
  chmod,
  writeFile,
  readFile,
  lstat,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";
import { base32, encryptFactor } from "../server/mera/platform.js";

export const VISUAL_OPERATOR_USERNAME = "mera-visual-qa-operator";
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function visualOperatorConfig(env, args = []) {
  if (env.NODE_ENV === "production" || env.MERA_DEMO !== "true")
    throw new Error(
      "Visual operator QA requires explicit non-production MERA_DEMO=true.",
    );
  if (args.some((arg) => arg !== "--provision") || args.length > 1)
    throw new Error(
      "Only the optional --provision flag is supported; no target overrides.",
    );
  let target;
  try {
    target = new URL(env.DATABASE_URL || "");
  } catch {
    throw new Error("Supply the isolated visual database URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== "127.0.0.1" ||
    target.port !== "55443" ||
    target.pathname !== "/postgres" ||
    target.username !== "mera_demo" ||
    target.search ||
    target.hash
  )
    throw new Error(
      "Only the isolated visual PostgreSQL database at 127.0.0.1:55443 is permitted.",
    );
  const provision = args.includes("--provision");
  if (provision && !/^[a-f\d]{64}$/i.test(env.MERA_PLATFORM_MFA_KEY || ""))
    throw new Error(
      "Provisioning needs the visual server's explicit 32-byte MFA key.",
    );
  return {
    provision,
    databaseUrl: target.href,
    databaseDir: join(repository, "data/mera-demo-visual-db"),
    appUrl: "http://127.0.0.1:3006",
  };
}
export async function inspectVisualTarget(
  client,
  config,
  { resolvePath = realpath, fetcher = fetch } = {},
) {
  const target = (
    await client.query(
      "SELECT current_setting('data_directory') AS directory,host(inet_server_addr()) AS address,inet_server_port() AS port",
    )
  ).rows[0];
  if (
    !target ||
    target.address !== "127.0.0.1" ||
    Number(target.port) !== 55443 ||
    (await resolvePath(target.directory)) !==
      (await resolvePath(config.databaseDir))
  )
    throw new Error(
      "The connected database is not the dedicated visual QA cluster.",
    );
  for (const [path, valid] of [
    [
      "/api/health",
      (value) =>
        value.ok === true &&
        value.local === true &&
        value.mode === "simulation",
    ],
    [
      "/api/mera/v1/identity/capabilities",
      (value) => value.registration === "simulator",
    ],
  ]) {
    let response;
    try {
      response = await fetcher(config.appUrl + path, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new Error(
        "The loopback visual application is unavailable; no provisioning is permitted.",
      );
    }
    if (!response.ok || !valid(await response.json()))
      throw new Error(
        "The live visual application has not demonstrated local simulation mode.",
      );
  }
  if (
    (
      await client.query("SELECT id FROM users WHERE username=$1", [
        VISUAL_OPERATOR_USERNAME,
      ])
    ).rows.length
  )
    throw new Error(
      "The visual operator username already exists; refusing to change any account.",
    );
  if (
    (await client.query("SELECT user_id FROM mera_platform_factors LIMIT 1"))
      .rows.length
  )
    throw new Error(
      "This fixture already has an authenticator; refusing to replace or extend it.",
    );
  return {
    databaseVerified: true,
    appSimulationVerified: true,
    appDatabaseAttestation: false,
  };
}
export async function writeVisualSecrets(secrets) {
  const tempRoot = await realpath(tmpdir()),
    repoRoot = await realpath(repository);
  if (tempRoot === repoRoot || tempRoot.startsWith(repoRoot + sep))
    throw new Error("Secret storage must be outside the repository.");
  const directory = await mkdtemp(join(tempRoot, "mera-visual-operator-"));
  try {
    await chmod(directory, 0o700);
    const path = join(directory, "secrets.json");
    await writeFile(path, JSON.stringify(secrets), { flag: "wx", mode: 0o600 });
    return {
      path,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
// Load into memory only; callers must never print or serialize this result.
export async function loadVisualOperatorSecrets(path) {
  const tempRoot = await realpath(tmpdir()),
    repoRoot = await realpath(repository);
  const directory = dirname(resolve(path));
  const [file, parent] = await Promise.all([lstat(path), lstat(directory)]);
  if (
    !file.isFile() ||
    file.isSymbolicLink() ||
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    (file.mode & 0o777) !== 0o600 ||
    (parent.mode & 0o777) !== 0o700 ||
    file.size > 16384 ||
    (typeof process.getuid === "function" &&
      (file.uid !== process.getuid() || parent.uid !== process.getuid())) ||
    dirname(await realpath(directory)) !== tempRoot ||
    !directory.split(sep).at(-1).startsWith("mera-visual-operator-") ||
    directory === repoRoot ||
    directory.startsWith(repoRoot + sep)
  )
    throw new Error(
      "Visual secrets must be a private, owned temporary artifact outside the repository.",
    );
  const value = JSON.parse(await readFile(path, "utf8"));
  if (
    value.purpose !== "isolated_visual_qa_only" ||
    value.appUrl !== "http://127.0.0.1:3006" ||
    value.username !== VISUAL_OPERATOR_USERNAME ||
    !/^[a-f\d]{64}$/i.test(value.mfaKey || "") ||
    !/^[A-Z2-7]{32}$/.test(value.totpSecret || "") ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(value.password || "") ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    throw new Error(
      "The private artifact is not a valid isolated visual QA fixture.",
    );
  return value;
}
export async function visualOperatorProcessEnvironment(path, baseEnv = {}) {
  if (baseEnv.NODE_ENV === "production")
    throw new Error("Visual fixture cannot launch a production process.");
  const secrets = await loadVisualOperatorSecrets(path);
  return {
    ...baseEnv,
    MERA_PLATFORM_MFA_KEY: secrets.mfaKey,
    MERA_PREVIEW_INSTANCE: "visual",
    MERA_PREVIEW_PORT: "3006",
    MERA_PREVIEW_DB_PORT: "55443",
  };
}
export async function runVisualOperator({
  env,
  args = [],
  client,
  inspect = inspectVisualTarget,
  secretWriter = writeVisualSecrets,
}) {
  const config = visualOperatorConfig(env, args);
  if (!config.provision) {
    await client.query("BEGIN READ ONLY");
    try {
      return {
        mode: "read_only",
        ...(await inspect(client, config)),
        needs:
          "Normal password login and fresh authenticator verification; matching visual runtime MFA key.",
      };
    } finally {
      await client.query("ROLLBACK");
    }
  }
  let secretFile,
    committed = false;
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('mera-visual-operator-fixture'))",
    );
    await inspect(client, config);
    const userId = randomUUID(),
      password = randomBytes(32).toString("base64url"),
      secret = base32(randomBytes(20));
    const key = Buffer.from(env.MERA_PLATFORM_MFA_KEY, "hex");
    const passwordHash = await bcrypt.hash(password, 12);
    secretFile = await secretWriter({
      purpose: "isolated_visual_qa_only",
      appUrl: config.appUrl,
      username: VISUAL_OPERATOR_USERNAME,
      password,
      totpSecret: secret,
      mfaKey: env.MERA_PLATFORM_MFA_KEY,
      createdAt: new Date().toISOString(),
    });
    await client.query(
      "INSERT INTO users(id,name,username,password_hash,role,active) VALUES($1,'Mera visual QA operator',$2,$3,'cashier',true)",
      [userId, VISUAL_OPERATOR_USERNAME, passwordHash],
    );
    await client.query(
      "INSERT INTO mera_platform_members(user_id,active,strong_auth_verified) VALUES($1,true,false)",
      [userId],
    );
    await client.query(
      "INSERT INTO mera_platform_factors(user_id,secret_cipher) VALUES($1,$2)",
      [userId, encryptFactor(secret, key)],
    );
    await client.query("COMMIT");
    committed = true;
    return {
      mode: "provisioned_local_fixture",
      secretFile: secretFile.path,
      appUrl: config.appUrl,
      normalLoginRequired: true,
      mfaRequired: true,
    };
  } finally {
    if (!committed) {
      try {
        await client.query("ROLLBACK");
      } finally {
        if (secretFile) await secretFile.cleanup();
      }
    }
  }
}
async function main() {
  const config = visualOperatorConfig(process.env, process.argv.slice(2));
  const client = new pg.Client({
    connectionString: config.databaseUrl,
    ssl: false,
  });
  await client.connect();
  try {
    const result = await runVisualOperator({
      env: process.env,
      args: process.argv.slice(2),
      client,
    });
    console.log(
      result.mode === "read_only"
        ? "Visual QA read-only preflight passed. No account or secrets created."
        : `Visual QA fixture created. Private secret file: ${result.secretFile}`,
    );
  } finally {
    await client.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(() => {
    console.error(
      "Visual QA preflight/provisioning failed; no credential values are logged. Review the guarded checks before retrying.",
    );
    process.exitCode = 1;
  });
