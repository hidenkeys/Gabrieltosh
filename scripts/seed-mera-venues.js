import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath, open, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { meraPreviewConfig } from "./mera-preview-config.js";
import { seedVenuePortfolio } from "../server/mera/venue-portfolio.js";
export function assertVenueSeedTarget(env, config) {
  if (
    env.NODE_ENV === "production" ||
    env.MEMORY_DB === "true" ||
    !env.MERA_PREVIEW_INSTANCE ||
    env.MERA_PREVIEW_INSTANCE === "ux-next"
  )
    throw new Error("An isolated non-production preview instance is required.");
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("Explicit local DATABASE_URL required.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.search ||
    Number(url.port || 5432) !== config.dbPort ||
    url.pathname !== "/postgres"
  )
    throw new Error("Database must match the isolated loopback preview.");
  if (!/^data\/mera-demo-[a-z0-9-]+-db$/.test(config.databaseDir))
    throw new Error("Invalid preview data directory.");
}
export async function runVenueSeed({ credentialsOut } = {}) {
  const env = process.env;
  const config = meraPreviewConfig(env);
  assertVenueSeedTarget(env, config);
  const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
  // Resolve parents to prevent a symlink from redirecting credentials into the repository.
  if (!credentialsOut || !path.isAbsolute(credentialsOut))
    throw new Error(
      "--credentials-out requires an absolute path outside the repository.",
    );
  const destination = path.join(
    await realpath(path.dirname(credentialsOut)),
    path.basename(credentialsOut),
  );
  const protectedRoots = [root];
  for (
    let parent = path.dirname(root);
    parent !== path.dirname(parent);
    parent = path.dirname(parent)
  )
    if (existsSync(path.join(parent, ".git")))
      protectedRoots.push(await realpath(parent));
  for (const protectedRoot of protectedRoots) {
    const relative = path.relative(protectedRoot, destination);
    if (!relative.startsWith(`..${path.sep}`) && relative !== "..")
      throw new Error("Credentials must be outside the repository.");
  }
  const dataParent = await realpath(path.join(root, "data"));
  const actualData = await realpath(path.join(root, config.databaseDir));
  if (
    dataParent !== path.join(root, "data") ||
    path.dirname(actualData) !== dataParent ||
    path.basename(actualData) !== path.basename(config.databaseDir)
  )
    throw new Error(
      "Preview data directory must not escape through a symlink.",
    );
  const handle = await open(destination, "wx", 0o600);
  let db;
  let credentialsWritten = false;
  try {
    // Import only after all guards pass. This command never migrates or starts a server.
    db = await import("../server/db.js");
    const directory = (await db.query("SHOW data_directory")).rows[0]
      ?.data_directory;
    if (!directory || (await realpath(directory)) !== actualData)
      throw new Error(
        "Connected database does not belong to this preview instance.",
      );
    const credentials = [];
    const transactionalDb = {
      transaction: (fn) =>
        db.transaction(async (client) => {
          const result = await fn(client);
          await handle.writeFile(
            JSON.stringify(
              { instance: config.instance, credentials },
              null,
              2,
            ) + "\n",
          );
          await handle.sync();
          credentialsWritten = true;
          return result;
        }),
    };
    const counts = await seedVenuePortfolio(transactionalDb, {
      passwordFor: (user) => {
        const password = randomBytes(24).toString("base64url");
        credentials.push({ username: user.username, password });
        return password;
      },
    });
    console.log(JSON.stringify(counts));
  } catch (error) {
    // Keep durable credentials when a COMMIT outcome might be unknown.
    if (!credentialsWritten) await unlink(destination).catch(() => {});
    throw error;
  } finally {
    await handle.close();
    if (db) await db.pool.end();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--credentials-out")
    throw new Error(
      "Usage: seed:mera-venues -- --credentials-out /private/path/credentials.json",
    );
  await runVenueSeed({ credentialsOut: args[1] });
}
