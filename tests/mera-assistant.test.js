import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMeraRouter } from "../server/mera/index.js";
import {
  createAssistantRegistry,
  permittedTools,
  assistantSummary,
} from "../server/mera/assistant.js";
import { rolePermissions } from "../shared/mera-contracts.js";
const org = randomUUID(),
  branch = randomUUID(),
  actor = randomUUID(),
  product = randomUUID();
const B = "/organizations/:organizationId/branches/:branchId/assistant/";
function fixture({
  permissions = rolePermissions.owner,
  env = { MERA_AI_MOCK: "true" },
  aiFetch = () => {
    throw Error("Network forbidden");
  },
  spend = 0,
} = {}) {
  let rows = [
      {
        id: product,
        organization_id: org,
        branch_id: branch,
        kind: "product",
        data: {
          id: product,
          name: "Jollof rice",
          available: true,
          stockMode: "unlimited",
          variants: [],
        },
      },
    ],
    usage = [];
  const b = {
    id: branch,
    organization_id: org,
    name: "Test",
    timezone: "Africa/Lagos",
    cutoff: 0,
    currency: "NGN",
    settings: { version: 1 },
  };
  const db = {
    query: async (sql, p = []) => {
      let result = [];
      if (sql.includes("FROM mera_memberships"))
        result = [
          {
            role: permissions === rolePermissions.owner ? "owner" : "waiter",
            permissions,
            active: true,
            organization_wide: true,
            branch_ids: [],
            branch_roles: {},
          },
        ];
      else if (sql.includes("FROM mera_branches"))
        result = p[0] === branch && p[1] === org ? [b] : [];
      else if (sql.startsWith("UPDATE mera_branches"))
        b.settings = JSON.parse(p[0]);
      else if (sql.includes("FROM mera_organizations")) result = [{ id: org }];
      else if (sql.includes("SUM(cost_usd)"))
        result = [{ total: spend + usage.reduce((n, r) => n + r.cost, 0) }];
      else if (sql.includes("COUNT(*)") && sql.includes("mera_ai_usage"))
        result = [{ count: usage.length }];
      else if (sql.startsWith("INSERT INTO mera_ai_usage"))
        usage.push({ id: p[0], feature: p[4], cost: p[8] });
      else if (sql.startsWith("UPDATE mera_ai_usage"))
        usage.find((r) => r.id === p[4]).cost = p[2];
      else if (sql.startsWith("INSERT INTO mera_records"))
        rows.push({
          id: p[0],
          organization_id: p[1],
          branch_id: p[2],
          kind: p[3],
          data: JSON.parse(p[4]),
        });
      else if (sql.startsWith("UPDATE mera_records")) {
        const row = rows.find(
          (r) =>
            r.id === p[1] &&
            r.organization_id === p[2] &&
            r.branch_id === p[3] &&
            r.kind === p[4],
        );
        if (row) {
          row.data = JSON.parse(p[0]);
          result = [{ id: row.id }];
        }
      } else if (sql.includes("FROM mera_records")) {
        if (sql.includes("WHERE id=$1"))
          result = rows.filter(
            (r) =>
              r.id === p[0] &&
              r.organization_id === p[1] &&
              r.branch_id === p[2] &&
              r.kind === p[3],
          );
        else
          result = rows.filter(
            (r) =>
              r.organization_id === p[0] &&
              r.branch_id === p[1] &&
              (!p[2] || r.kind === p[2]),
          );
        result = structuredClone(result);
      } else throw Error("Unexpected SQL " + sql);
      return { rows: result };
    },
    transaction: async (fn) => {
      const snapshot = structuredClone(rows),
        oldUsage = structuredClone(usage);
      try {
        return await fn(db);
      } catch (e) {
        rows = snapshot;
        usage = oldUsage;
        throw e;
      }
    },
  };
  const router = createMeraRouter(db, { env, aiFetch });
  return {
    get rows() {
      return rows;
    },
    usage,
    b,
    setPermissions: (p) => {
      permissions = p;
    },
    call: async (action, body = {}, userId = actor, branchId = branch) => {
      const layer = router.stack.find((l) => l.route?.path === B + action),
        req = {
          params: { organizationId: org, branchId },
          body,
          user: { id: userId, name: "Staff" },
          get: () => undefined,
        };
      const res = {
        json(v) {
          this.body = v;
          return this;
        },
      };
      for (const entry of layer.route.stack) {
        let error;
        await entry.handle(req, res, (e) => {
          error = e;
        });
        if (error) throw error;
      }
      return res.body;
    },
  };
}
const toolResponse = (name, args = {}) =>
  Response.json({
    choices: [
      {
        message: {
          tool_calls: [
            {
              id: randomUUID(),
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  });
test("registry filters required permissions; no forbidden financial tools exist", () => {
  const registry = createAssistantRegistry({});
  assert.deepEqual(permittedTools(registry, []), []);
  assert.deepEqual(
    permittedTools(registry, ["orders.view"]).map((t) => t.name),
    ["open_orders", "menu_search", "stock_status"],
  );
  assert.ok(
    registry.every((t) => !/refund|payment|void|delete|price/.test(t.name)),
  );
  assert.ok(
    registry.every(
      (t) => t.schema && t.description && t.kind && t.permissions.length,
    ),
  );
});
test("waiter refund is refused without invoking AI; forbidden tool injection is rejected", async () => {
  let calls = 0;
  const f = fixture({
    permissions: ["orders.view"],
    env: { AI_GATEWAY_API_KEY: "injected" },
    aiFetch: () => {
      calls++;
      return toolResponse("product_availability", {
        productId: product,
        available: false,
      });
    },
  });
  const answer = await f.call("messages", { message: "Refund this order" });
  assert.match(answer.message, /do not have permission/);
  assert.equal(calls, 0);
  assert.equal(answer.cards.length, 0);
  await assert.rejects(
    f.call("messages", { message: "Help me with this order" }),
    (e) => e.status === 403,
  );
  assert.equal(f.rows.filter((r) => r.kind === "assistant_action").length, 0);
});
test("owner mock weekly summary and deterministic endpoint use recognized sales and matching previous days", async () => {
  const f = fixture(),
    now = new Date().toISOString();
  f.rows.push({
    kind: "order",
    branch_id: branch,
    organization_id: org,
    data: {
      id: randomUUID(),
      createdAt: now,
      collectedAt: now,
      status: "collected",
      total: 700000,
      items: [{ productId: product, name: "Jollof rice", quantity: 2 }],
    },
  });
  const response = await f.call("messages", { message: "Weekly summary" }),
    s = response.results[0].data;
  assert.equal(s.orders, 1);
  assert.equal(s.revenue, 700000);
  assert.equal(s.averageOrder, 700000);
  assert.equal(s.topItems[0].quantity, 2);
  assert.equal(s.previous.revenue, 0);
  assert.equal((await f.call("weekly-summary")).revenue, 700000);
  assert.equal(f.usage[0].feature, "assistant");
});
test("summary includes previous week, slow products, busiest local hour and sold-out events", () => {
  const b = {
    id: branch,
    timezone: "Africa/Lagos",
    cutoff: 0,
    currency: "NGN",
    settings: {},
  };
  const order = (at, total) => ({
    kind: "order",
    branch_id: branch,
    data: {
      id: randomUUID(),
      createdAt: at,
      collectedAt: at,
      total,
      status: "collected",
      items: [{ productId: product, name: "Rice", quantity: 3 }],
    },
  });
  const rows = [
    order("2026-11-24T12:00:00Z", 20000),
    order("2026-11-17T12:00:00Z", 10000),
    { kind: "product", branch_id: branch, data: { id: "slow", name: "Beans" } },
    {
      kind: "audit",
      branch_id: branch,
      data: {
        createdAt: "2026-11-24T12:00:00Z",
        action: "bulk_product_availability",
        details: { available: false },
      },
    },
  ];
  const s = assistantSummary(b, rows, "this_week", "2026-11-25T15:00:00Z");
  assert.equal(s.revenue, 20000);
  assert.equal(s.previous.revenue, 10000);
  assert.equal(s.change.revenue, 10000);
  assert.equal(s.slowItems[0].quantity, 0);
  assert.equal(s.busiestHours[0].hour, "13");
  assert.equal(s.soldOutEvents, 1);
});
test("sold out creates pending card; confirm executes same availability service once with audit tags", async () => {
  const f = fixture(),
    answer = await f.call("messages", { message: "mark Jollof rice sold out" }),
    card = answer.cards[0];
  assert.ok(card);
  assert.equal(f.rows.find((r) => r.id === product).data.available, true);
  const result = await f.call("confirm", { actionId: card.actionId });
  assert.equal(result.status, "executed");
  assert.equal(f.rows.find((r) => r.id === product).data.available, false);
  await assert.rejects(
    f.call("confirm", { actionId: card.actionId }),
    (e) => e.status === 409,
  );
  const event = f.rows.find(
    (r) => r.kind === "audit" && r.data.action === "bulk_product_availability",
  );
  assert.equal(event.data.details.source, "assistant");
  assert.equal(event.data.details.actionId, card.actionId);
  assert.equal(event.data.details.conversationId, answer.conversationId);
});
test("expired, cancelled, other actor, revoked permission and cross-branch actions cannot execute", async () => {
  for (const mode of [
    "expired",
    "cancelled",
    "actor",
    "permission",
    "branch",
  ]) {
    const f = fixture(),
      answer = await f.call("messages", {
        message: "mark Jollof rice sold out",
      }),
      actionId = answer.cards[0].actionId;
    if (mode === "expired")
      f.rows.find((r) => r.id === actionId).data.expiresAt =
        "2000-01-01T00:00:00Z";
    if (mode === "cancelled")
      assert.equal((await f.call("cancel", { actionId })).status, "cancelled");
    if (mode === "permission") f.setPermissions(["orders.view"]);
    await assert.rejects(
      f.call(
        "confirm",
        { actionId },
        mode === "actor" ? randomUUID() : actor,
        mode === "branch" ? randomUUID() : branch,
      ),
    );
    assert.equal(f.rows.find((r) => r.id === product).data.available, true);
  }
});
test("cross-tenant model supplied product id cannot create pending action", async () => {
  const f = fixture({
    env: { AI_GATEWAY_API_KEY: "injected" },
    aiFetch: async () =>
      toolResponse("product_availability", {
        productId: randomUUID(),
        available: false,
      }),
  });
  await assert.rejects(
    f.call("messages", { message: "Mark rice sold out" }),
    (e) => e.status === 404,
  );
  assert.equal(f.rows.filter((r) => r.kind === "assistant_action").length, 0);
});
test("budget exhausted makes no gateway call; reservations also block insufficient remaining budget", async () => {
  for (const spend of [5, 4.5]) {
    let calls = 0;
    const f = fixture({
      spend,
      env: { AI_GATEWAY_API_KEY: "injected" },
      aiFetch: async () => {
        calls++;
        throw Error("Forbidden");
      },
    });
    await assert.rejects(
      f.call("messages", { message: "Weekly summary" }),
      (e) => e.code === "AI_BUDGET_EXCEEDED",
    );
    assert.equal(calls, 0);
  }
});
test("30 messages per user/hour including refusals", async () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) await f.call("messages", { message: "refund" });
  await assert.rejects(
    f.call("messages", { message: "Weekly summary" }),
    (e) => e.code === "ASSISTANT_RATE_LIMIT",
  );
});
test("tool loop capped at four gateway calls and tools filtered in payload", async () => {
  let calls = 0;
  const f = fixture({
    permissions: ["orders.view"],
    env: { AI_GATEWAY_API_KEY: "injected" },
    aiFetch: async (_url, opts) => {
      calls++;
      const body = JSON.parse(opts.body);
      assert.equal(body.max_tokens, 800);
      assert.deepEqual(
        body.tools.map((t) => t.function.name),
        ["open_orders", "menu_search", "stock_status"],
      );
      return toolResponse("open_orders");
    },
  });
  const answer = await f.call("messages", { message: "Open orders" });
  assert.equal(calls, 4);
  assert.match(answer.message, /step limit/);
});
test("no key in nonproduction uses mock; bounded private conversations cannot be reused by another actor", async () => {
  const f = fixture({ env: { NODE_ENV: "test" } }),
    answer = await f.call("messages", {
      message: "Weekly summary password=secret",
    });
  assert.ok(answer.results[0]);
  const stored = f.rows.find((r) => r.kind === "assistant_conversation");
  assert.ok(!JSON.stringify(stored.data).includes("password=secret"));
  await assert.rejects(
    f.call(
      "messages",
      { conversationId: answer.conversationId, message: "Open orders" },
      randomUUID(),
    ),
    (e) => e.status === 404,
  );
  for (let i = 0; i < 8; i++)
    await f.call("messages", {
      conversationId: answer.conversationId,
      message: "Open orders",
    });
  assert.equal(
    f.rows.find((r) => r.id === answer.conversationId).data.messages.length,
    12,
  );
});
test("pause and resume ordering require confirmation and share settings persistence", async () => {
  const f = fixture();
  for (const message of ["Pause ordering", "Resume ordering"]) {
    const answer = await f.call("messages", { message });
    await f.call("confirm", { actionId: answer.cards[0].actionId });
    assert.equal(f.b.settings.orderingPaused, message.startsWith("Pause"));
  }
  assert.equal(f.b.settings.version, 3);
});
test("real SQL persists usage, scoped conversations, single-use actions and audit", async () => {
  const { newDb, DataType } = await import("pg-mem");
  const { migrateMenuImport } = await import("../server/mera/menu-import.js");
  const memory = newDb({ noAstCoverageCheck: true });
  memory.public.registerFunction({
    name: "date_trunc",
    args: [DataType.text, DataType.timestamptz],
    returns: DataType.timestamptz,
    implementation: (_, d) =>
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
  });
  const { Pool } = memory.adapters.createPg(),
    pool = new Pool();
  const db = {
    query: (sql, p) => pool.query(sql, p),
    transaction: async (fn) => {
      const snapshot = memory.backup();
      try {
        return await fn(db);
      } catch (e) {
        snapshot.restore();
        throw e;
      }
    },
  };
  try {
    await db.query(
      "CREATE TABLE mera_organizations(id text PRIMARY KEY); CREATE TABLE mera_branches(id text PRIMARY KEY,organization_id text,timezone text,currency text,cutoff int,settings jsonb); CREATE TABLE mera_memberships(id text,user_id text,organization_id text,role text,permissions jsonb,active boolean,organization_wide boolean,branch_ids jsonb,branch_roles jsonb); CREATE TABLE mera_records(id text PRIMARY KEY,organization_id text,branch_id text,kind text,data jsonb,created_at timestamptz DEFAULT now());",
    );
    await migrateMenuImport(db);
    await db.query("INSERT INTO mera_organizations VALUES($1)", [org]);
    await db.query("INSERT INTO mera_branches VALUES($1,$2,$3,$4,0,$5)", [
      branch,
      org,
      "Africa/Lagos",
      "NGN",
      "{}",
    ]);
    await db.query(
      "INSERT INTO mera_memberships VALUES($1,$2,$3,$4,$5,true,true,$6,$7)",
      [
        randomUUID(),
        actor,
        org,
        "owner",
        JSON.stringify(rolePermissions.owner),
        "[]",
        "{}",
      ],
    );
    await db.query(
      "INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,$4,$5)",
      [
        product,
        org,
        branch,
        "product",
        JSON.stringify({ id: product, name: "Rice", available: true }),
      ],
    );
    const router = createMeraRouter(db, {
      env: { MERA_AI_MOCK: "true" },
      aiFetch: () => {
        throw Error("Network forbidden");
      },
    });
    async function call(action, body) {
      const route = router.stack.find((l) => l.route?.path === B + action);
      let output;
      const req = {
        params: { organizationId: org, branchId: branch },
        body,
        user: { id: actor },
        get: () => undefined,
      };
      for (const layer of route.route.stack) {
        let error;
        await layer.handle(
          req,
          {
            json: (v) => {
              output = v;
            },
          },
          (e) => {
            error = e;
          },
        );
        if (error) throw error;
      }
      return output;
    }
    const answer = await call("messages", { message: "mark Rice sold out" });
    await call("confirm", { actionId: answer.cards[0].actionId });
    await assert.rejects(
      call("confirm", { actionId: answer.cards[0].actionId }),
      (e) => e.status === 409,
    );
    assert.equal(
      (await db.query("SELECT data FROM mera_records WHERE kind='product'"))
        .rows[0].data.available,
      false,
    );
    const audit = (
      await db.query("SELECT data FROM mera_records WHERE kind='audit'")
    ).rows.map((r) => r.data);
    assert.ok(audit.every((a) => a.details.source === "assistant"));
    assert.equal(
      (await db.query("SELECT feature FROM mera_ai_usage")).rows[0].feature,
      "assistant",
    );
    assert.equal(
      (
        await db.query(
          "SELECT data FROM mera_records WHERE kind='assistant_conversation'",
        )
      ).rows[0].data.actorId,
      actor,
    );
  } finally {
    await pool.end();
  }
});

test("help tool applies the existing per-category permissions and omits guest text", async () => {
  const f = fixture({ permissions: ["tables.manage"] });
  for (const category of ["service", "payment", "reservation", "other"])
    f.rows.push({
      id: randomUUID(),
      organization_id: org,
      branch_id: branch,
      kind: "help_request",
      data: {
        id: randomUUID(),
        category,
        status: "open",
        message: "private guest text",
        internalNotes: ["private note"],
      },
    });
  const answer = await f.call("messages", { message: "Open help requests" });
  assert.equal(answer.results[0].data.length, 1);
  assert.equal(answer.results[0].data[0].category, "service");
  assert.ok(!JSON.stringify(answer).includes("private guest text"));
  assert.ok(!JSON.stringify(answer).includes("private note"));
});
