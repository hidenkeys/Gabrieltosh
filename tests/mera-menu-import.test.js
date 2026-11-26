import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMeraRouter } from "../server/mera/index.js";
import { rolePermissions } from "../shared/mera-contracts.js";
import { mockDraft } from "../server/mera/menu-import.js";
const oneItemDraft = () => ({
  currency: "NGN",
  categories: [
    {
      name: "Food",
      items: [
        {
          name: "Jollof rice",
          description: "",
          price: 2500,
          sizes: [],
          addOns: [],
          dietary: [],
          station: "kitchen",
          confidence: "high",
          note: "",
        },
      ],
    },
  ],
  warnings: [],
});
const org = randomUUID(),
  branch = randomUUID(),
  user = { id: randomUUID(), name: "Owner" };
const B = "/organizations/:organizationId/branches/:branchId";
const photo = {
  name: "menu.jpg",
  mime: "image/jpeg",
  data: Buffer.from([255, 216, 255, 0]).toString("base64"),
};
function fixture({
  env = { MERA_AI_MOCK: "true" },
  aiFetch = () => {
    throw Error("Unexpected network");
  },
  permissions = rolePermissions.owner,
  spend = 0,
  failProduct = 0,
  assetId,
} = {}) {
  let records = [],
    usage = [],
    productWrites = 0,
    transactions = 0;
  const db = {
    query: async (sql, p = []) => {
      let rows = [];
      if (sql.includes("FROM mera_assets"))
        rows =
          p[0] === assetId && p[1] === org && p[2] === branch
            ? [{ id: assetId }]
            : [];
      else if (sql.includes("FROM mera_memberships"))
        rows = [
          {
            role: permissions === rolePermissions.owner ? "owner" : "cashier",
            permissions,
            active: true,
            organization_wide: true,
            branch_ids: [],
            branch_roles: {},
          },
        ];
      else if (sql.includes("FROM mera_branches")) rows = [{ id: branch }];
      else if (sql.includes("FROM mera_organizations")) rows = [{ id: org }];
      else if (sql.includes("SUM(cost_usd)"))
        rows = [{ total: spend + usage.reduce((n, r) => n + r.cost_usd, 0) }];
      else if (sql.includes("COUNT(*)") && sql.includes("mera_ai_usage"))
        rows = [{ count: usage.length }];
      else if (sql.startsWith("INSERT INTO mera_ai_usage"))
        usage.push({
          id: p[0],
          organization_id: p[1],
          branch_id: p[2],
          user_id: p[3],
          feature: p[4],
          model: p[5],
          input_tokens: p[6],
          output_tokens: p[7],
          cost_usd: p[8],
          status: p[9],
          files: JSON.parse(p[10]),
        });
      else if (sql.startsWith("UPDATE mera_ai_usage"))
        Object.assign(
          usage.find((r) => r.id === p[4]),
          {
            input_tokens: p[0],
            output_tokens: p[1],
            cost_usd: p[2],
            status: p[3],
          },
        );
      else if (sql.includes("FROM mera_ai_usage")) rows = usage;
      else if (sql.startsWith("INSERT INTO mera_records")) {
        if (p[3] === "product" && ++productWrites === failProduct)
          throw Error("Simulated product failure");
        records.push({
          id: p[0],
          organization_id: p[1],
          branch_id: p[2],
          kind: p[3],
          data: JSON.parse(p[4]),
        });
      } else if (sql.includes("FROM mera_records")) {
        rows = records.filter((r) =>
          sql.includes("kind='category'")
            ? r.kind === "category" && r.id === p[0]
            : r.organization_id === p[0] &&
              r.branch_id === p[1] &&
              r.kind === p[2],
        );
      } else throw Error("Unexpected SQL: " + sql);
      return { rows };
    },
    transaction: async (fn) => {
      transactions++;
      const old = structuredClone(records),
        oldUsage = structuredClone(usage);
      try {
        return await fn(db);
      } catch (e) {
        records = old;
        usage = oldUsage;
        throw e;
      }
    },
  };
  const router = createMeraRouter(db, { env, aiFetch });
  return {
    get records() {
      return records;
    },
    get usage() {
      return usage;
    },
    get transactions() {
      return transactions;
    },
    call: async (action, body = {}, method = "POST") => {
      const path =
        action === "usage"
          ? "/organizations/:organizationId/ai-usage"
          : B + "/menu-import/" + action;
      const layer = router.stack.find(
        (l) => l.route?.path === path && l.route.methods[method.toLowerCase()],
      );
      const req = {
        params: { organizationId: org, branchId: branch },
        body,
        user,
        get: () => undefined,
      };
      const res = {
        statusCode: 200,
        json(v) {
          this.body = v;
          return this;
        },
        status(n) {
          this.statusCode = n;
          return this;
        },
      };
      try {
        for (const l of layer.route.stack) {
          let error;
          await l.handle(req, res, (e) => {
            error = e;
          });
          if (error) throw error;
        }
      } catch (e) {
        res.statusCode = e.status || (e.name === "ZodError" ? 400 : 500);
        res.body = { error: e.message };
      }
      return res;
    },
  };
}
test("extract sends images and PDFs with JSON schema and Bearer authentication; tracks priced tokens", async () => {
  const requests = [];
  const f = fixture({
    env: { AI_GATEWAY_API_KEY: "test-secret" },
    aiFetch: async (url, options) => {
      requests.push({ url, options });
      return Response.json(
        url.endsWith("/models")
          ? { data: [] }
          : {
              choices: [{ message: { content: JSON.stringify(mockDraft) } }],
              usage: { prompt_tokens: 100, completion_tokens: 20 },
            },
      );
    },
  });
  const r = await f.call("extract", {
    files: [
      photo,
      {
        name: "menu.pdf",
        mime: "text/plain",
        data: Buffer.from("%PDF test").toString("base64"),
      },
    ],
  });
  assert.equal(r.statusCode, 200);
  const { options } = requests[0],
    body = JSON.parse(options.body);
  assert.equal(options.headers.Authorization, "Bearer test-secret");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.temperature, 0);
  assert.equal(body.messages[1].content[0].text, "File 0: menu.jpg");
  assert.equal(body.messages[1].content[1].type, "image_url");
  assert.equal(body.messages[1].content[3].file.media_type, "application/pdf");
  assert.equal(f.usage[0].status, "ok");
  assert.equal(f.usage[0].input_tokens, 100);
  assert(Math.abs(f.usage[0].cost_usd - 0.0004) < 1e-10);
  assert.deepEqual(Object.keys(f.usage[0].files[0]), ["name", "mime", "bytes"]);
  assert(!JSON.stringify(f.usage).includes(photo.data));
});
test("extract rejects unconfigured provider, malformed JSON and bad magic and records attempts", async () => {
  for (const [env, files, aiFetch, status] of [
    [{}, [photo], undefined, 503],
    [
      { AI_GATEWAY_API_KEY: "test" },
      [photo],
      async (url) =>
        Response.json(
          url.endsWith("/models")
            ? { data: [] }
            : { choices: [{ message: { content: "bad" } }] },
        ),
      502,
    ],
    [
      { MERA_AI_MOCK: "true" },
      [{ ...photo, data: Buffer.from("not an image").toString("base64") }],
      undefined,
      400,
    ],
  ]) {
    const f = fixture({ env, aiFetch });
    assert.equal((await f.call("extract", { files })).statusCode, status);
    assert.equal(f.usage.length, 1);
    assert.equal(f.usage[0].status, "failed");
  }
});
test("mock never calls network and monthly / hourly limits reject extractions", async () => {
  const f = fixture();
  const r = await f.call("extract", { files: [photo] });
  assert.deepEqual(r.body.draft, mockDraft);
  assert.equal(f.usage[0].status, "mock");
  assert.equal(f.usage[0].cost_usd, 0);
  for (let i = 1; i < 10; i++)
    assert.equal((await f.call("extract", { files: [photo] })).statusCode, 200);
  assert.equal((await f.call("extract", { files: [photo] })).statusCode, 429);
  const limited = fixture({ spend: 5 });
  assert.equal(
    (await limited.call("extract", { files: [photo] })).statusCode,
    429,
  );
  assert.equal((await limited.call("usage", {}, "GET")).body.monthToDateUsd, 5);
});
test("extract retries once on provider 429 and rejects invalid structured output", async () => {
  let calls = 0;
  const f = fixture({
    env: { AI_GATEWAY_API_KEY: "test" },
    aiFetch: async (url) =>
      url.endsWith("/models")
        ? Response.json({ data: [] })
        : ++calls === 1
          ? Response.json({}, { status: 429 })
          : Response.json({
              choices: [{ message: { content: '{"categories":[]}' } }],
            }),
  });
  assert.equal((await f.call("extract", { files: [photo] })).statusCode, 200);
  assert.equal(calls, 2);
  const bad = fixture({
    env: { AI_GATEWAY_API_KEY: "test" },
    aiFetch: async () =>
      Response.json({
        choices: [{ message: { content: '{"categories":[{}]}' } }],
      }),
  });
  assert.equal((await bad.call("extract", { files: [photo] })).statusCode, 502);
});
test("menu.edit and organization.manage permissions are enforced", async () => {
  const f = fixture({ permissions: ["orders.view"] });
  assert.equal((await f.call("extract", { files: [photo] })).statusCode, 403);
  assert.equal((await f.call("apply", mockDraft)).statusCode, 403);
  assert.equal((await f.call("usage", {}, "GET")).statusCode, 403);
  assert.equal(f.usage.length, 0);
});
test("apply creates categories and draft products in kobo, variants and extras; skips duplicates and missing prices", async () => {
  const f = fixture(),
    draft = oneItemDraft(),
    rice = draft.categories[0].items[0];
  rice.sizes = [
    { name: "Small", price: 2500 },
    { name: "Large", price: 3500 },
  ];
  rice.addOns = [{ name: "Chicken", price: 500 }];
  draft.categories[0].items.push(
    { ...rice, name: "Unknown", price: null, sizes: [] },
    { ...rice, name: "Excluded", include: false },
  );
  const r = await f.call("apply", { ...draft, importId: randomUUID() });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.created, 1);
  assert.equal(r.body.categoriesCreated, 1);
  assert.deepEqual(r.body.skipped, [
    { name: "Unknown", reason: "Missing price" },
  ]);
  const p = f.records.find((r) => r.kind === "product").data;
  assert.equal(p.price, 250000);
  assert.equal(p.variants[1].price, 350000);
  assert.equal(p.modifierGroups[0].options[0].price, 50000);
  assert.equal(p.stock, 0);
  assert.equal(p.stockMode, "unlimited");
  assert.equal(f.transactions, 1);
  assert(
    f.records.some(
      (r) => r.kind === "audit" && r.data.action === "menu_imported",
    ),
  );
  draft.categories[0].name = "food";
  const again = await f.call("apply", draft);
  assert.equal(again.body.created, 0);
  assert.equal(again.body.categoriesCreated, 0);
  assert.equal(again.body.skipped[0].reason, "Already in this category");
});
test("apply rolls back categories, products and audit events on mid-transaction failure", async () => {
  const f = fixture({ failProduct: 2 }),
    draft = oneItemDraft();
  draft.categories[0].items.push({
    ...draft.categories[0].items[0],
    name: "Second",
  });
  assert.equal((await f.call("apply", draft)).statusCode, 500);
  assert.deepEqual(f.records, []);
  assert.equal(f.transactions, 1);
});

test("pg-mem migration and real SQL persist mock usage and imported draft products", async () => {
  const { newDb, DataType } = await import("pg-mem");
  const { migrateMenuImport } = await import("../server/mera/menu-import.js");
  const memory = newDb({ noAstCoverageCheck: true });
  memory.public.registerFunction({
    name: "date_trunc",
    args: [DataType.text, DataType.timestamptz],
    returns: DataType.timestamptz,
    implementation: (_, date) =>
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
  });
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  const db = {
    query: (sql, p) => pool.query(sql, p),
    transaction: async (fn) => {
      const backup = memory.backup();
      try {
        return await fn(db);
      } catch (e) {
        backup.restore();
        throw e;
      }
    },
  };
  await db.query(
    "CREATE TABLE mera_organizations(id text PRIMARY KEY); CREATE TABLE mera_branches(id text PRIMARY KEY,organization_id text); CREATE TABLE mera_memberships(id text,user_id text,organization_id text,role text,permissions jsonb,active boolean,organization_wide boolean,branch_ids jsonb,branch_roles jsonb); CREATE TABLE mera_records(id text PRIMARY KEY,organization_id text,branch_id text,kind text,data jsonb,created_at timestamptz DEFAULT now());",
  );
  await migrateMenuImport(db);
  await migrateMenuImport(db);
  await db.query("INSERT INTO mera_organizations(id) VALUES($1)", [org]);
  await db.query(
    "INSERT INTO mera_branches(id,organization_id) VALUES($1,$2)",
    [branch, org],
  );
  await db.query(
    "INSERT INTO mera_memberships(id,user_id,organization_id,role,permissions,active,organization_wide,branch_ids,branch_roles) VALUES($1,$2,$3,$4,$5,true,true,$6,$7)",
    [
      randomUUID(),
      user.id,
      org,
      "owner",
      JSON.stringify(rolePermissions.owner),
      "[]",
      "{}",
    ],
  );
  const router = createMeraRouter(db, {
    env: { MERA_AI_MOCK: "true" },
    aiFetch: () => {
      throw Error("Network forbidden");
    },
  });
  const call = async (action, body) => {
    let result;
    const req = {
        params: { organizationId: org, branchId: branch },
        user,
        body,
        get: () => undefined,
      },
      res = {
        json(v) {
          result = v;
        },
      };
    const route = router.stack.find(
      (l) => l.route?.path === B + "/menu-import/" + action,
    );
    for (const layer of route.route.stack) {
      let error;
      await layer.handle(req, res, (e) => (error = e));
      if (error) throw error;
    }
    return result;
  };
  try {
    const extracted = await call("extract", { files: [photo] });
    assert.equal(extracted.usage.costUsd, 0);
    assert.equal(
      (await db.query("SELECT * FROM mera_ai_usage")).rows[0].status,
      "mock",
    );
    const applied = await call("apply", {
      ...extracted.draft,
      importId: extracted.importId,
    });
    // The demo draft has 11 items; the one without a price is skipped.
    assert.equal(applied.created, 10);
    assert.deepEqual(applied.skipped, [
      { name: "Chef's special", reason: "Missing price" },
    ]);
    assert.equal(applied.categoriesCreated, 3);
    const product = (
      await db.query("SELECT data FROM mera_records WHERE kind='product'")
    ).rows
      .map((r) => r.data)
      .find((p) => p.name === "Jollof rice");
    assert.equal(product.price, 250000);
    assert.equal(product.category, "Mains");
    assert.equal(product.modifierGroups[0].options[0].price, 300000);
    assert.ok(
      (
        await db.query("SELECT data FROM mera_records WHERE kind='audit'")
      ).rows.some((r) => r.data.action === "menu_imported"),
    );
  } finally {
    await pool.end();
  }
});
test("extract normalizes invalid crop boxes and file indices to null", async () => {
  const boxes = [
    [0, 0, 500, 500],
    [0, 0, 10, 500],
    [-1, 0, 500, 500],
    [0, 0, 1001, 500],
    [500, 0, 0, 500],
    [0, 0, 500, 500],
  ];
  const d = oneItemDraft();
  d.categories[0].items = boxes.map((box, n) => ({
    ...d.categories[0].items[0],
    name: `Item ${n}`,
    photo: { kind: "crop", file: n === 5 ? 1 : 0, box },
  }));
  const f = fixture({
    env: { AI_GATEWAY_API_KEY: "test" },
    aiFetch: async (url) =>
      Response.json(
        url.endsWith("/models")
          ? { data: [] }
          : { choices: [{ message: { content: JSON.stringify(d) } }] },
      ),
  });
  const r = await f.call("extract", { files: [photo] });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.draft.categories[0].items[0].photo.kind, "crop");
  assert(
    r.body.draft.categories[0].items.slice(1).every((i) => i.photo === null),
  );
});
test("apply accepts scoped asset URLs and rejects invalid or foreign images", async () => {
  const assetId = randomUUID();
  for (const [image, status] of [
    [undefined, 200],
    [`/api/mera/v1/public/assets/${assetId}`, 200],
    [`/api/mera/v1/public/assets/${randomUUID()}`, 403],
    ["https://foreign.test/image.jpg", 400],
  ]) {
    const f = fixture({ assetId });
    const d = oneItemDraft();
    d.categories[0].items[0].image = image;
    const r = await f.call("apply", d);
    assert.equal(r.statusCode, status, JSON.stringify(r.body));
    if (status === 200 && image) {
      assert.equal(
        f.records.find((r) => r.kind === "product").data.image,
        image,
      );
      assert.equal(r.body.withPhotos, 1);
    }
  }
});
test("extract returns only referenced embedded photos and drops unknown and oversized references", async () => {
  const jpeg = (size) =>
    Buffer.concat([
      Buffer.from([255, 216, 255]),
      Buffer.alloc(size - 5),
      Buffer.from([255, 217]),
    ]);
  const chunks = [Buffer.from("%PDF-1.4\n")];
  for (const b of [jpeg(2200), jpeg(2300), jpeg(1600000)])
    chunks.push(
      Buffer.from(
        `<< /Subtype /Image /Filter /DCTDecode /Length ${b.length} >>\nstream\n`,
      ),
      b,
      Buffer.from("\nendstream\n"),
    );
  const d = oneItemDraft();
  const i = d.categories[0].items[0];
  d.categories[0].items = ["img1", "img3", "img99"].map((ref) => ({
    ...i,
    photo: { kind: "embedded", ref },
  }));
  const f = fixture({
    env: { AI_GATEWAY_API_KEY: "test" },
    aiFetch: async (url) =>
      Response.json(
        url.endsWith("/models")
          ? { data: [] }
          : { choices: [{ message: { content: JSON.stringify(d) } }] },
      ),
  });
  const r = await f.call("extract", {
    files: [
      { name: "menu.pdf", data: Buffer.concat(chunks).toString("base64") },
    ],
  });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(Object.keys(r.body.photos), ["img1"]);
  assert.equal(r.body.draft.categories[0].items[1].photo, null);
  assert.equal(r.body.draft.categories[0].items[2].photo, null);
});
