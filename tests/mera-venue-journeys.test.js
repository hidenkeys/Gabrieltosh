import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import EmbeddedPostgres from "embedded-postgres";
import { newDb, DataType } from "pg-mem";
import express from "express";
import cookieParser from "cookie-parser";
import { createMeraRouter } from "../server/mera/index.js";
import { buildVenuePortfolio } from "../server/mera/venue-portfolio.js";
import { proposedPolicy, rolePermissions } from "../shared/mera-contracts.js";

// Real mounted routes and permissions over a fresh in-memory relational database.
// Default mode covers door/transfers in pg-mem. The opt-in PostgreSQL mode also
// covers SQL-dependent checkout/payment journeys. Neither mode certifies hardware
// or concurrent execution; the broad PostgreSQL suite covers migration/lock guards.
async function fixture(t) {
  const memory = newDb(),
    { Pool } = memory.adapters.createPg();
  let pool, cluster, directory;
  if (process.env.RUN_MERA_VENUE_PG_TESTS === "true") {
    directory = await mkdtemp(join(tmpdir(), "mera-venue-journeys-"));
    cluster = new EmbeddedPostgres({
      databaseDir: join(directory, "db"),
      user: "venue_test",
      password: "TemporaryVenueTestsOnly",
      port: 55446,
      persistent: false,
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: () => {},
    });
    t.after(async () => {
      try {
        await pool?.end();
      } finally {
        let stopped = false;
        try {
          await cluster.stop();
          stopped = true;
        } finally {
          // Never remove files from a cluster whose shutdown failed.
          if (stopped) await rm(directory, { recursive: true, force: true });
        }
      }
    });
    await cluster.initialise();
    await cluster.start();
    pool = new pg.Pool({
      connectionString:
        "postgres://venue_test:TemporaryVenueTestsOnly@127.0.0.1:55446/postgres",
    });
  } else {
    pool = new Pool();
    t.after(() => pool.end());
  }
  memory.public.registerOperator({
    operator: "?",
    left: DataType.jsonb,
    right: DataType.text,
    returns: DataType.bool,
    implementation: (value, key) => Object.hasOwn(value, key),
  });
  await pool.query(
    "CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,username TEXT UNIQUE,password_hash TEXT,role TEXT)",
  );
  const schema = await readFile(
    new URL("../server/mera/schema.sql", import.meta.url),
    "utf8",
  );
  await pool.query(schema.split("CREATE OR REPLACE FUNCTION")[0]);
  await pool.query(
    "ALTER TABLE mera_organizations ADD COLUMN operating JSONB NOT NULL DEFAULT '{}'; ALTER TABLE mera_organizations ADD COLUMN platform_flags JSONB NOT NULL DEFAULT '{}'; ALTER TABLE mera_memberships ADD COLUMN branch_roles JSONB NOT NULL DEFAULT '{}'",
  );
  const db = {
    query: (sql, values) => pool.query(sql, values),
    transaction: async (fn) => {
      if (cluster) {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const result = await fn(c);
          await c.query("COMMIT");
          return result;
        } catch (error) {
          await c.query("ROLLBACK");
          throw error;
        } finally {
          c.release();
        }
      }
      const backup = memory.backup();
      try {
        return await fn(db);
      } catch (error) {
        backup.restore();
        throw error;
      }
    },
  };
  const portfolio = buildVenuePortfolio({ days: 1 });
  for (const org of portfolio) {
    await db.query(
      "INSERT INTO mera_organizations(id,name,slug,policy,subscription,onboarding,operating) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        org.id,
        org.name,
        org.slug,
        JSON.stringify(proposedPolicy),
        JSON.stringify({
          status: "active",
          billingEnabled: false,
          includedBranchIds: org.branches.map((b) => b.id),
        }),
        JSON.stringify({ status: "published" }),
        JSON.stringify(org.operating),
      ],
    );
    for (const u of org.users) {
      await db.query(
        "INSERT INTO users(id,name,username,password_hash,role) VALUES($1,$2,$3,'unused','cashier')",
        [u.id, u.name, u.username],
      );
      await db.query(
        "INSERT INTO mera_memberships(id,user_id,organization_id,role,permissions,branch_ids,organization_wide) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          randomUUID(),
          u.id,
          org.id,
          u.role,
          JSON.stringify(rolePermissions[u.role]),
          JSON.stringify([org.branches[0].id]),
          u.role === "owner",
        ],
      );
    }
    for (const b of org.branches) {
      await db.query(
        "INSERT INTO mera_branches(id,organization_id,name,timezone,cutoff,settings,menu_version,published_menu) VALUES($1,$2,$3,$4,$5,$6,1,$7)",
        [
          b.id,
          org.id,
          b.name,
          b.timezone,
          b.cutoff,
          JSON.stringify({ ...b.settings, serviceHours: [] }),
          JSON.stringify(b.products),
        ],
      );
    }
    // Fresh journeys, not pre-existing historical orders/payments.
    for (const r of org.records.filter((r) =>
      ["product", "category"].includes(r.kind),
    ))
      await db.query(
        "INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,$4,$5)",
        [r.id, org.id, r.branch_id, r.kind, JSON.stringify(r.data)],
      );
  }
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, res, next) => {
    if (req.get("x-test-user"))
      req.user = { id: req.get("x-test-user"), name: "Synthetic staff" };
    next();
  });
  app.use("/api/mera/v1", createMeraRouter(db));
  app.use((e, req, res, next) =>
    res.status(e.status || 400).json({ error: e.message, code: e.code }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/mera/v1`;
  const venue = (slug) => {
    const org = portfolio.find((o) => o.slug === slug);
    return {
      org,
      b: org.branches[0],
      owner: org.users.find((u) => u.role === "owner").id,
    };
  };
  const call = async (path, method = "GET", body, actor) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(actor ? { "x-test-user": actor } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };
  const records = async (branch, kind) =>
    (
      await db.query(
        "SELECT data FROM mera_records WHERE branch_id=$1 AND kind=$2",
        [branch, kind],
      )
    ).rows.map((r) => r.data);
  return { db, portfolio, venue, call, records };
}
const B = (org, b) => `/organizations/${org.id}/branches/${b.id}`;
const ok = (response, status = 200) => {
  assert.equal(response.status, status, JSON.stringify(response.data));
  return response.data;
};

test("club door check-in persists once and rejects another tenant and a cashier", async (t) => {
  const f = await fixture(t),
    { org, b, owner } = f.venue("pulse"),
    path = B(org, b) + "/guest-list";
  const body = {
    requestKey: randomUUID(),
    name: "Fictional party",
    partySize: 2,
    tradingDate: "2026-11-24",
  };
  const entry = ok(await f.call(path, "POST", body, owner), 201);
  const check = { requestKey: randomUUID(), version: 1, count: 1 };
  const arrived = ok(
    await f.call(path + `/${entry.id}/check-in`, "POST", check, owner),
  );
  assert.equal(arrived.arrivedCount, 1);
  assert.deepEqual(
    ok(await f.call(path + `/${entry.id}/check-in`, "POST", check, owner)),
    arrived,
  );
  assert.equal((await f.records(b.id, "guest_list_entry"))[0].arrivedCount, 1);
  assert.equal(
    (
      await f.call(
        path + `/${entry.id}/check-in`,
        "POST",
        { ...check, requestKey: randomUUID(), version: 2, count: 2 },
        owner,
      )
    ).status,
    409,
  );
  assert.equal(
    (await f.call(path, "GET", undefined, f.venue("oak-ember").owner)).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        path,
        "POST",
        { ...body, requestKey: randomUUID() },
        org.users.find((u) => u.role === "cashier").id,
      )
    ).status,
    403,
  );
});

test("central-store transfer sends, receives and cancels through scoped routes without duplicate stock", async (t) => {
  const f = await fixture(t),
    { org, b, owner } = f.venue("harbour-hotel"),
    central = org.branches.find((x) => x.code === "CST"),
    path = `/organizations/${org.id}/stock-transfers`;
  const stock = async (branch) =>
    (await f.records(branch.id, "product")).find((p) => p.code === "DRINK")
      .stock;
  const beforeFrom = await stock(central),
    beforeTo = await stock(b);
  const input = {
    requestKey: randomUUID(),
    fromBranchId: central.id,
    toBranchId: b.id,
    lines: [{ code: "DRINK", quantity: 5 }],
  };
  const sent = ok(await f.call(path, "POST", input, owner), 201);
  assert.equal(await stock(central), beforeFrom - 5);
  ok(await f.call(path, "POST", input, owner), 201);
  assert.equal(await stock(central), beforeFrom - 5);
  const receive = {
    requestKey: randomUUID(),
    version: 1,
    lines: [{ code: "DRINK", receivedQuantity: 4 }],
  };
  ok(
    await f.call(path + `/${sent.transfer.id}/receive`, "POST", receive, owner),
  );
  ok(
    await f.call(path + `/${sent.transfer.id}/receive`, "POST", receive, owner),
  );
  assert.equal(await stock(b), beforeTo + 4);
  assert.equal(await stock(central), beforeFrom - 5);
  const next = ok(
    await f.call(path, "POST", { ...input, requestKey: randomUUID() }, owner),
    201,
  );
  const cancel = { requestKey: randomUUID(), version: 1 };
  ok(await f.call(path + `/${next.transfer.id}/cancel`, "POST", cancel, owner));
  ok(await f.call(path + `/${next.transfer.id}/cancel`, "POST", cancel, owner));
  assert.equal(await stock(central), beforeFrom - 5);
  assert.equal(
    (await f.records(central.id, "stock_movement")).filter(
      (r) => r.reason === "transfer_loss",
    ).length,
    1,
  );
  assert.equal(
    (
      await f.call(
        path,
        "POST",
        {
          ...input,
          requestKey: randomUUID(),
          toBranchId: f.venue("pulse").b.id,
        },
        owner,
      )
    ).status,
    404,
  );
  assert.equal(
    (await f.call(path, "GET", undefined, f.venue("pulse").owner)).status,
    403,
  );
});

async function counterOrder(f, org, b, owner, items, extra = {}) {
  const input = {
    requestKey: randomUUID(),
    menuVersion: 1,
    displayName: "Synthetic journey",
    items,
    ...extra,
  };
  return {
    input,
    response: await f.call(B(org, b) + "/orders", "POST", input, owner),
  };
}

test(
  "package and combo orders hold component stock once and rejected choices leave stock unchanged",
  { skip: process.env.RUN_MERA_VENUE_PG_TESTS !== "true" },
  async (t) => {
    const f = await fixture(t),
      { org, b, owner } = f.venue("kerbside-grill"),
      path = B(org, b);
    const product = (code) => b.products.find((p) => p.code === code);
    const stock = async (code) =>
      (await f.records(b.id, "product")).find((p) => p.code === code).stock;
    const before = await stock("MAIN"),
      drinkBefore = await stock("DRINK");
    const pack = await counterOrder(f, org, b, owner, [
      { productId: product("PACK").id, quantity: 2, modifiers: [] },
    ]);
    const order = ok(pack.response, 201);
    assert.equal(await stock("MAIN"), before - 2);
    assert.equal(await stock("DRINK"), drinkBefore - 12);
    assert.equal(
      ok(await f.call(path + "/orders", "POST", pack.input, owner), 201).id,
      order.id,
    );
    assert.equal(await stock("MAIN"), before - 2);
    assert.equal(await stock("DRINK"), drinkBefore - 12);
    const combo = product("COMBO"),
      choices = combo.choiceGroups.map((g) => ({
        groupId: g.id,
        productId: g.options[0].productId,
      }));
    const invalid = await counterOrder(f, org, b, owner, [
      { productId: combo.id, quantity: 1, modifiers: [] },
    ]);
    assert.equal(invalid.response.status, 400);
    assert.equal(await stock("MAIN"), before - 2);
    const meal = await counterOrder(f, org, b, owner, [
      { productId: combo.id, quantity: 1, modifiers: [], choices },
    ]);
    ok(meal.response, 201);
    assert.equal(await stock("MAIN"), before - 3);
    assert.equal(await stock("DRINK"), drinkBefore - 13);
    const cancellation = ok(
      await f.call(
        path + `/orders/${order.id}/status`,
        "POST",
        {
          status: "cancelled",
          version: order.version,
          reason: "Synthetic cancellation",
        },
        owner,
      ),
    );
    assert.equal(cancellation.status, "cancelled");
    assert.equal(await stock("MAIN"), before - 1);
    assert.equal(await stock("DRINK"), drinkBefore - 1);
    const foreignProduct = f.venue("oak-ember").b.products[0];
    const foreign = await counterOrder(f, org, b, owner, [
      { productId: foreignProduct.id, quantity: 1, modifiers: [] },
    ]);
    assert.notEqual(foreign.response.status, 201);
    assert.equal(await stock("MAIN"), before - 1);
    const club = f.venue("pulse"),
      clubPath = B(club.org, club.b),
      bottle = club.b.products.find((p) => p.code === "PACK");
    const noTable = await counterOrder(f, club.org, club.b, club.owner, [
      { productId: bottle.id, quantity: 1, modifiers: [] },
    ]);
    assert.equal(noTable.response.data.code, "TABLE_REQUIRED");
    const table = ok(
      await f.call(
        clubPath + "/tables",
        "POST",
        { name: "Synthetic VIP", capacity: 6, zone: "VIP" },
        club.owner,
      ),
      201,
    );
    const visit = ok(
      await f.call(
        clubPath + "/visits",
        "POST",
        {
          tableId: table.id,
          displayName: "Synthetic party",
          minimumSpendAcknowledged: true,
          minimumSpendPolicyVersion: club.b.settings.minimumSpendPolicy.version,
        },
        club.owner,
      ),
      201,
    );
    const withTable = await counterOrder(
      f,
      club.org,
      club.b,
      club.owner,
      [{ productId: bottle.id, quantity: 1, modifiers: [] }],
      { fulfillment: "table_service", visitId: visit.id },
    );
    ok(withTable.response, 201);
    assert.equal(
      (await f.records(club.b.id, "product")).find((p) => p.code === "DRINK")
        .stock,
      club.b.products.find((p) => p.code === "DRINK").stock - 6,
    );
  },
);

test(
  "hotel room charge completes an order and appears separately from cash in reporting",
  { skip: process.env.RUN_MERA_VENUE_PG_TESTS !== "true" },
  async (t) => {
    const f = await fixture(t),
      { org, b, owner } = f.venue("harbour-hotel"),
      path = B(org, b),
      product = b.products.find((p) => p.code === "DRINK");
    const order = ok(
      (
        await counterOrder(f, org, b, owner, [
          { productId: product.id, quantity: 1, modifiers: [] },
        ])
      ).response,
      201,
    );
    const payment = {
      requestKey: randomUUID(),
      amount: order.total,
      method: "room_charge",
      reference: "102 Example",
    };
    const cashier = org.users.find((u) => u.role === "cashier").id;
    assert.equal(
      (
        await f.call(
          path + `/orders/${order.id}/payments`,
          "POST",
          payment,
          cashier,
        )
      ).status,
      403,
    );
    const paid = ok(
      await f.call(
        path + `/orders/${order.id}/payments`,
        "POST",
        payment,
        owner,
      ),
    );
    assert.deepEqual(
      ok(
        await f.call(
          path + `/orders/${order.id}/payments`,
          "POST",
          payment,
          owner,
        ),
      ),
      paid,
    );
    assert.equal((await f.records(b.id, "payment")).length, 1);
    const current = (await f.records(b.id, "order")).find(
      (o) => o.id === order.id,
    );
    const accepted = ok(
      await f.call(
        path + `/orders/${order.id}/status`,
        "POST",
        { status: "accepted", version: current.version },
        owner,
      ),
    );
    const tickets = await f.records(b.id, "ticket");
    assert.equal(tickets.length, 1);
    const ready = ok(
      await f.call(
        path + `/tickets/${tickets[0].id}/status`,
        "POST",
        { status: "ready", version: tickets[0].version },
        owner,
      ),
    );
    const collected = ok(
      await f.call(
        path + `/orders/${order.id}/status`,
        "POST",
        { status: "collected", version: ready.order.version },
        owner,
      ),
    );
    assert.equal(collected.status, "collected");
    const completed = ok(
      await f.call(
        path + `/orders/${order.id}/status`,
        "POST",
        { status: "completed", version: collected.version },
        owner,
      ),
    );
    assert.equal(completed.status, "completed");
    const report = ok(
      await f.call(
        `/organizations/${org.id}/overview?preset=today`,
        "GET",
        undefined,
        owner,
      ),
    );
    assert.equal(report.totals.revenue, order.total);
    assert.equal(report.totals.roomCharges, order.total);
    assert.deepEqual(report.paymentMix, [
      { method: "room_charge", amount: order.total },
    ]);
    assert.equal(
      (
        await f.call(
          path + `/orders/${order.id}/payments`,
          "POST",
          { ...payment, requestKey: randomUUID() },
          f.venue("pulse").owner,
        )
      ).status,
      403,
    );
  },
);
