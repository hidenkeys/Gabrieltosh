// Creates its OWN PostgreSQL 17 cluster. Never reads an existing store/demo/production database.
import pg from "pg";
import express from "express";
import cookieParser from "cookie-parser";
import { mkdtemp, rm, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
if (process.env.NODE_ENV === "production")
  throw new Error("This rehearsal is development-only.");
if (process.argv.length !== 2)
  throw new Error(
    "This rehearsal accepts no database URL or command-line overrides.",
  );
const run = promisify(execFile);
const bin =
  process.env.MERA_RECOVERY_PG_BIN || "/opt/homebrew/opt/postgresql@17/bin";
for (const tool of ["initdb", "pg_ctl", "pg_dump", "pg_restore"]) {
  try {
    await access(join(bin, tool));
  } catch {
    throw new Error(
      `PostgreSQL 17 recovery tools unavailable: ${tool}. Set MERA_RECOVERY_PG_BIN to a matching local PostgreSQL 17 bin directory.`,
    );
  }
  const { stdout } = await run(join(bin, tool), ["--version"]);
  if (!/\b17\./.test(stdout))
    throw new Error(
      "The isolated rehearsal requires matching PostgreSQL 17 initdb, server, dump and restore tools.",
    );
}
const folder = await mkdtemp(join(tmpdir(), "mera-recovery-pg17-"));
const cluster = join(folder, "cluster"),
  password = randomBytes(32).toString("hex"),
  user = "mera_recovery";
const suffix = randomBytes(8).toString("hex"),
  sourceName = "mera_source_" + suffix,
  targetName = "mera_restored_" + suffix;
const config = {
  host: "127.0.0.1",
  port: 55443,
  user,
  password,
  database: "postgres",
};
const env = { ...process.env };
// libpq service files/options must not redirect native tools to another server.
for (const name of Object.keys(env))
  if (name.startsWith("PG")) delete env[name];
Object.assign(env, {
  PGHOST: config.host,
  PGPORT: String(config.port),
  PGUSER: user,
  PGPASSWORD: password,
});
let clusterAttempted = false,
  db,
  admin,
  source,
  restored,
  http;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
async function signature(client) {
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  const contents = {};
  for (const { tablename } of tables) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = (
      await client.query(`SELECT row_to_json(t) AS value FROM ${quoted} t`)
    ).rows
      .map((row) => JSON.stringify(canonical(row.value)))
      .sort();
    contents[tablename] = {
      count: rows.length,
      sha256: createHash("sha256").update(rows.join("\n")).digest("hex"),
    };
  }
  const financial = (
    await client.query(
      `SELECT kind,COUNT(*)::integer AS count,COALESCE(SUM(CASE WHEN data ? 'amount' THEN (data->>'amount')::bigint ELSE 0 END),0)::text AS amount FROM mera_records WHERE kind IN ('payment','refund','ledger','allocation','deposit') GROUP BY kind ORDER BY kind`,
    )
  ).rows;
  const ledger = (
    await client.query("SELECT data FROM mera_records WHERE kind='ledger'")
  ).rows;
  const debits = ledger.reduce(
      (sum, row) => sum + row.data.postings.reduce((n, p) => n + p.debit, 0),
      0,
    ),
    credits = ledger.reduce(
      (sum, row) => sum + row.data.postings.reduce((n, p) => n + p.credit, 0),
      0,
    );
  assert.equal(
    debits,
    credits,
    "Fixture ledger must balance before restore is compared",
  );
  return {
    tables: contents,
    financial,
    ledger: { entries: ledger.length, debits, credits },
  };
}
try {
  const pwfile = join(folder, "init-password");
  await writeFile(pwfile, password, { mode: 0o600 });
  await run(
    join(bin, "initdb"),
    [
      "-D",
      cluster,
      "-U",
      user,
      "--encoding=UTF8",
      "--locale=C",
      "--auth=scram-sha-256",
      "--pwfile",
      pwfile,
    ],
    { timeout: 60000 },
  );
  await rm(pwfile);
  clusterAttempted = true;
  await run(
    join(bin, "pg_ctl"),
    [
      "-D",
      cluster,
      "-l",
      join(folder, "postgres.log"),
      "-o",
      "-h 127.0.0.1 -p 55443",
      "-w",
      "start",
    ],
    { timeout: 60000 },
  );
  admin = new pg.Client(config);
  await admin.connect();
  const serverVersion = (await admin.query("SHOW server_version")).rows[0]
    .server_version;
  assert.match(serverVersion, /^17\./);
  await admin.query("CREATE DATABASE " + sourceName);
  Object.assign(process.env, {
    DATABASE_URL: `postgres://${user}:${password}@127.0.0.1:55443/${sourceName}`,
    MEMORY_DB: "false",
    MERA_DEMO: "true",
    MERA_ENABLED: "true",
    DISABLE_BACKUPS: "true",
  });
  db = await import("../server/db.js");
  await db.migrate();
  const { seed, createAdmin } = await import("../server/seed.js");
  await seed();
  await createAdmin(
    "Recovery rehearsal owner",
    "recovery_owner",
    randomBytes(24).toString("hex"),
  );
  const owner = (
    await db.query("SELECT id,name FROM users WHERE username='recovery_owner'")
  ).rows[0];
  const {
    migrateMera,
    seedMeraDemo,
    createMeraRouter,
    DEMO_ORGANIZATION,
    DEMO_BRANCH,
  } = await import("../server/mera/index.js");
  await migrateMera(db);
  await seedMeraDemo({ ...db, userId: owner.id });
  const { migrateMeraPlatform, encryptFactor, decryptFactor, base32 } =
    await import("../server/mera/platform.js");
  await migrateMeraPlatform(db);
  const factorKey = randomBytes(32),
    factorSecret = base32(randomBytes(20));
  const factorCipher = encryptFactor(factorSecret, factorKey),
    sessionHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  await db.query(
    "INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,$3)",
    [sessionHash, owner.id, new Date(Date.now() + 3600000)],
  );
  await db.query(
    "INSERT INTO mera_platform_factors(user_id,secret_cipher) VALUES($1,$2)",
    [owner.id, factorCipher],
  );
  await db.query(
    "INSERT INTO mera_platform_stepups(session_hash,user_id,expires_at) VALUES($1,$2,$3)",
    [sessionHash, owner.id, new Date(Date.now() + 600000)],
  );
  await db.query(
    "INSERT INTO mera_platform_audit(id,actor_id,action,organization_id,details) VALUES($1,$2,$3,$4,$5)",
    [
      randomUUID(),
      owner.id,
      "recovery_fixture",
      DEMO_ORGANIZATION,
      JSON.stringify({ isolated: true }),
    ],
  );
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.user = { ...owner, active: true, role: "admin" };
    next();
  });
  app.use("/api/mera/v1", createMeraRouter(db));
  http = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => http.once("listening", resolve));
  const base = `http://127.0.0.1:${http.address().port}/api/mera/v1/organizations/${DEMO_ORGANIZATION}/branches/${DEMO_BRANCH}`;
  async function request(path, body) {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-pos-request": "1" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    assert(response.ok, JSON.stringify(data));
    return data;
  }
  const products = (
    await db.query(
      "SELECT data FROM mera_records WHERE kind='product' ORDER BY id",
    )
  ).rows.map((r) => r.data);
  const product = products.find((p) => p.available);
  const order = await request("/orders", {
    requestKey: randomUUID(),
    menuVersion: 1,
    displayName: "Recovery fixture",
    fulfillment: "takeaway",
    items: [{ productId: product.id, quantity: 2, modifiers: [] }],
    note: "ISOLATED BACKUP RESTORE REHEARSAL",
  });
  const first = Math.floor(order.total / 2);
  await request(`/orders/${order.id}/payments`, {
    requestKey: randomUUID(),
    method: "cash",
    amount: first,
    reference: "RECOVERY-A",
  });
  await request(`/orders/${order.id}/payments`, {
    requestKey: randomUUID(),
    method: "external_pos",
    amount: order.total - first,
    reference: "RECOVERY-B",
  });
  await new Promise((resolve, reject) =>
    http.close((error) => (error ? reject(error) : resolve())),
  );
  http = null;
  source = new pg.Client({ ...config, database: sourceName });
  await source.connect();
  await source.query("SET TIME ZONE 'UTC'");
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const before = await signature(source);
  assert.equal(before.tables.mera_organizations.count, 1);
  assert.equal(before.tables.products.count, 34);
  assert.equal(before.financial.find((p) => p.kind === "payment")?.count, 2);
  assert(before.ledger.entries >= 2);
  assert.equal(before.ledger.debits, order.total);
  const snapshot = (
    await source.query("SELECT pg_export_snapshot() AS snapshot")
  ).rows[0].snapshot;
  const dump = join(folder, "rehearsal.dump");
  await run(
    join(bin, "pg_dump"),
    ["--format=custom", "--snapshot", snapshot, "--file", dump, sourceName],
    { env, timeout: 60000 },
  );
  await source.query("COMMIT");
  await admin.query("CREATE DATABASE " + targetName);
  await run(
    join(bin, "pg_restore"),
    [
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--dbname",
      targetName,
      dump,
    ],
    { env, timeout: 60000 },
  );
  restored = new pg.Client({ ...config, database: targetName });
  await restored.connect();
  await restored.query("SET TIME ZONE 'UTC'");
  assert.deepEqual(
    await signature(restored),
    before,
    "Restored rows and finance must exactly match exported source snapshot",
  );
  assert.equal(before.tables.mera_platform_factors.count, 1);
  assert.equal(before.tables.mera_platform_stepups.count, 1);
  assert.equal(before.tables.mera_platform_audit.count, 1);
  assert.equal(
    decryptFactor(
      (
        await restored.query(
          "SELECT secret_cipher FROM mera_platform_factors WHERE user_id=$1",
          [owner.id],
        )
      ).rows[0].secret_cipher,
      factorKey,
    ),
    factorSecret,
    "MFA ciphertext must restore without changing the secret",
  );
  // Prove the comparison detects data corruption even when all row counts remain equal.
  await restored.query(
    "UPDATE mera_records SET data=jsonb_set(data,'{amount}',to_jsonb((data->>'amount')::integer+1)) WHERE id=(SELECT id FROM mera_records WHERE kind='payment' LIMIT 1)",
  );
  assert.notDeepEqual(
    await signature(restored),
    before,
    "Financial mutation must invalidate the restored signature",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      isolation: "fresh temporary PostgreSQL 17 cluster on loopback:55443",
      serverVersion,
      tablesCompared: Object.keys(before.tables).length,
      seededProducts: 34,
      paymentsCompared: 2,
      ledgerEntries: before.ledger.entries,
      balancedLedgerMinorUnits: before.ledger.debits,
      exactRowHashesMatch: true,
      mfaCipherRestored: true,
      tamperDetected: true,
      productionDataRead: false,
    }),
  );
} finally {
  if (http) await new Promise((resolve) => http.close(resolve));
  if (restored) await restored.end();
  if (source) await source.end();
  if (db) await db.pool.end();
  if (admin) await admin.end();
  if (clusterAttempted) {
    try {
      await run(
        join(bin, "pg_ctl"),
        ["-D", cluster, "-m", "fast", "-w", "stop"],
        { timeout: 30000 },
      );
    } catch (error) {
      const stillRunning = await run(join(bin, "pg_ctl"), [
        "-D",
        cluster,
        "status",
      ]).then(
        () => true,
        () => false,
      );
      if (stillRunning)
        throw new Error(
          "Temporary recovery server could not be stopped. Preserved its private data directory: " +
            folder,
        );
    }
  }
  await rm(folder, { recursive: true, force: true });
}
