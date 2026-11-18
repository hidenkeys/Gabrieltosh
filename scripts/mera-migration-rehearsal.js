// Creates its OWN PostgreSQL 17 cluster. Never reads an existing store/demo/production database.
import pg from "pg";
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
for (const tool of ["initdb", "pg_ctl"]) {
  try {
    await access(join(bin, tool));
  } catch {
    throw new Error(
      `PostgreSQL 17 migration tools unavailable: ${tool}. Set MERA_RECOVERY_PG_BIN to a matching local PostgreSQL 17 bin directory.`,
    );
  }
  const { stdout } = await run(join(bin, tool), ["--version"]);
  if (!/\b17\./.test(stdout))
    throw new Error(
      "The isolated rehearsal requires matching PostgreSQL 17 initdb and server tools.",
    );
}
const folder = await mkdtemp(join(tmpdir(), "mera-migration-pg17-"));
const cluster = join(folder, "cluster"),
  password = randomBytes(32).toString("hex"),
  user = "mera_migration";
const suffix = randomBytes(8).toString("hex"),
  sourceName = "mera_source_" + suffix,
  targetName = "mera_fixture_import_" + suffix;
const config = {
  host: "127.0.0.1",
  port: 55444,
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
    { env, timeout: 60000 },
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
      "-h 127.0.0.1 -p 55444",
      "-w",
      "start",
    ],
    { env, timeout: 60000 },
  );
  admin = new pg.Client(config);
  await admin.connect();
  const serverVersion = (await admin.query("SHOW server_version")).rows[0]
    .server_version;
  assert.match(serverVersion, /^17\./);
  await admin.query("CREATE DATABASE " + sourceName);
  Object.assign(process.env, {
    DATABASE_URL: `postgres://${user}:${password}@127.0.0.1:55444/${sourceName}`,
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
    "Migration rehearsal owner",
    "migration_owner",
    randomBytes(24).toString("hex"),
  );
  const owner = (
    await db.query("SELECT id,name FROM users WHERE username='migration_owner'")
  ).rows[0];
  const { createApp } = await import("../server/app.js");
  const { migrateMera } = await import("../server/mera/index.js");
  await migrateMera(db);
  const app = createApp();
  http = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => http.once("listening", resolve));
  const base = `http://127.0.0.1:${http.address().port}`;
  const sessionToken = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,$3)",
    [
      createHash("sha256").update(sessionToken).digest("hex"),
      owner.id,
      new Date(Date.now() + 3600000),
    ],
  );
  async function request(path, body) {
    const response = await fetch(base + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pos-request": "1",
        Cookie: `pos_session=${sessionToken}`,
      },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    assert(response.ok, JSON.stringify(value));
    return value;
  }
  const product = (
    await db.query(
      "SELECT * FROM products WHERE available=true AND needs_review=false ORDER BY code LIMIT 1",
    )
  ).rows[0];
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const order = await request("/api/orders", {
      requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: i + 1 }],
      note: "ISOLATED MIGRATION FIXTURE",
    });
    ids.push(order.id);
    if (i !== 0)
      await request(`/api/orders/${order.id}/pay`, {
        method: "cash",
        cashTendered: order.total,
      });
    if (i === 2)
      await request(`/api/orders/${order.id}/refund`, {
        method: "cash",
        reason: "Isolated migration fixture refund",
      });
  }
  // Mutate the current menu after creating history; historical import must not reprice.
  await db.query("UPDATE products SET price=price+777 WHERE id=$1", [
    product.id,
  ]);
  source = new pg.Client({ ...config, database: sourceName });
  await source.connect();
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const orders = (
    await source.query(
      "SELECT * FROM orders WHERE id=ANY($1::text[]) ORDER BY number",
      [ids],
    )
  ).rows;
  const refunds = (
    await source.query(
      "SELECT * FROM refunds WHERE order_id=ANY($1::text[]) ORDER BY id",
      [ids],
    )
  ).rows;
  const audits = (
    await source.query(
      "SELECT * FROM audit WHERE order_id=ANY($1::text[]) ORDER BY created_at,id",
      [ids],
    )
  ).rows;
  assert.equal(orders.length, 3);
  assert.equal(refunds.length, 1);
  assert(orders.some((o) => o.payment_status === "unpaid"));
  assert(orders.some((o) => o.payment_status === "paid"));
  assert(orders.some((o) => o.payment_status === "refunded"));
  await admin.query("CREATE DATABASE " + targetName);
  restored = new pg.Client({ ...config, database: targetName });
  await restored.connect();
  await restored.query(
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  await restored.query(
    await readFile(
      new URL("../server/mera/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  const organizationId = randomUUID(),
    branchId = randomUUID(),
    batchId = randomUUID();
  await restored.query(
    "INSERT INTO mera_organizations(id,name,slug,policy) VALUES($1,$2,$3,$4)",
    [organizationId, "ISOLATED migration staging", "migration-fixture", {}],
  );
  await restored.query(
    "INSERT INTO mera_branches(id,organization_id,name) VALUES($1,$2,$3)",
    [branchId, organizationId, "Staging only"],
  );
  const { importLegacyFixture } =
    await import("../server/mera/legacy-import.js");
  const targetDb = {
    query: (sql, params) => restored.query(sql, params),
    transaction: async (fn) => {
      await restored.query("BEGIN");
      try {
        const value = await fn(restored);
        await restored.query("COMMIT");
        return value;
      } catch (error) {
        await restored.query("ROLLBACK");
        throw error;
      }
    },
  };
  process.env.MERA_LEGACY_IMPORT_FIXTURE = "true";
  const importOptions = {
    db: targetDb,
    organizationId,
    branchId,
    batchId,
    payload: { orders, refunds, audits },
    recognitionPolicy: "legacy_paid_basis",
  };
  const imported = await importLegacyFixture(importOptions);
  const records = (
    await restored.query("SELECT id,kind,data FROM mera_records ORDER BY id")
  ).rows;
  const beforeCount = records.length;
  const replay = await importLegacyFixture(importOptions);
  assert.equal(replay.replayed, true);
  assert.equal(
    Number(
      (await restored.query("SELECT COUNT(*) FROM mera_records")).rows[0].count,
    ),
    beforeCount,
  );
  await assert.rejects(
    importLegacyFixture({
      ...importOptions,
      payload: {
        ...importOptions.payload,
        orders: orders.map((order, index) =>
          index === 0 ? { ...order, staff_name: "CHANGED SOURCE" } : order,
        ),
      },
    }),
    (error) => error.status === 409,
  );
  for (const original of orders) {
    const actual = records.find(
      (r) => r.kind === "order" && r.data.sourceId === original.id,
    );
    assert.deepEqual(
      actual.data.legacySnapshot,
      JSON.parse(JSON.stringify(original)),
    );
    assert.equal(actual.data.items[0].basePrice, product.price);
    assert.notEqual(actual.data.items[0].basePrice, product.price + 777);
    assert.equal(actual.data.historicalReadOnly, true);
    assert.equal(actual.data.guestId, null);
    assert.equal(actual.data.stockHeld, false);
    assert.equal("collectedAt" in actual.data, false);
  }
  const sum = (values, key) =>
    values.reduce((total, value) => {
      assert(Number.isSafeInteger(value[key]));
      return total + value[key];
    }, 0);
  const sourceGross = sum(
      orders.filter((o) => o.paid_at),
      "total",
    ),
    sourceRefunds = sum(refunds, "amount");
  assert.equal(
    sum(
      records.filter((r) => r.kind === "payment").map((r) => r.data),
      "amount",
    ),
    sourceGross,
  );
  assert.equal(
    sum(
      records.filter((r) => r.kind === "refund").map((r) => r.data),
      "amount",
    ),
    sourceRefunds,
  );
  const ledgers = records.filter((r) => r.kind === "ledger");
  for (const row of ledgers)
    assert.equal(
      row.data.postings.reduce((n, p) => n + p.debit - p.credit, 0),
      0,
    );
  const { report, tradingDate, assertHistoricalWritable } =
    await import("../server/mera/domain.js");
  const branch = { timezone: "Africa/Lagos", cutoff: 0 };
  const actualReport = report(
    records,
    branch,
    tradingDate(orders[0].created_at, branch.timezone, 0),
  );
  assert.equal(actualReport.collections, sourceGross);
  assert.equal(actualReport.refunds, sourceRefunds);
  assert.equal(actualReport.grossSales, sourceGross);
  assert.equal(actualReport.netSales, sourceGross - sourceRefunds);
  assert.match(actualReport.recognitionBasis, /legacy_paid_basis/);
  await assert.rejects(
    restored.query("UPDATE mera_records SET data='{}' WHERE kind='audit'"),
    /append-only|read-only/,
  );
  assert.equal(
    records.filter((r) =>
      ["bill", "ticket", "stock_hold", "guest"].includes(r.kind),
    ).length,
    0,
  );
  const historicalOrder = records.find((row) => row.kind === "order").data;
  assert.throws(
    () => assertHistoricalWritable(historicalOrder),
    (error) => error.status === 409 && error.code === "HISTORICAL_READ_ONLY",
  );
  await assert.rejects(
    restored.query(
      "UPDATE mera_records SET data=jsonb_set(data,'{total}','1') WHERE id=$1",
      [historicalOrder.id],
    ),
    /read-only/,
  );
  await assert.rejects(
    restored.query("DELETE FROM mera_records WHERE id=$1", [
      historicalOrder.id,
    ]),
    /read-only/,
  );
  await source.query("COMMIT");
  console.log(
    JSON.stringify({
      status: "passed",
      scope: "isolated operational historical import fixture only",
      legacyOrders: 3,
      legacyPayments: 2,
      legacyRefunds: 1,
      operationalOrdersImported: imported.orders,
      balancedLedgerEntries: ledgers.length,
      grossMinorUnits: sourceGross,
      refundMinorUnits: sourceRefunds,
      netMinorUnits: sourceGross - sourceRefunds,
      canonicalReportReconciled: true,
      recognitionBasis: actualReport.recognitionBasis,
      historicalReadOnly: true,
      historicalMutationBlocked: true,
      historicalSnapshotsPreserved: true,
      currentMenuRepricingPrevented: true,
      immutableAuditLinks: true,
      exactReplayNoWrites: true,
      changedSourceRejected: true,
      productionCutoverApproved: false,
      productionDataRead: false,
      fulfilledOnlyImporterSupported: false,
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
        { env, timeout: 30000 },
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
          "Temporary migration server could not be stopped. Preserved its private data directory: " +
            folder,
        );
    }
  }
  await rm(folder, { recursive: true, force: true });
}
