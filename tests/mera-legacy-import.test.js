import test from "node:test";
import assert from "node:assert/strict";
import {
  planLegacyImport,
  importLegacyFixture,
} from "../server/mera/legacy-import.js";
const at = "2026-01-01T12:00:00Z";
const original = {
  id: "legacy-order",
  number: 1,
  status: "paid",
  payment_status: "paid",
  staff_id: "legacy-staff",
  staff_name: "Original cashier",
  items: [
    {
      name: "Original tea",
      productId: "source-product",
      quantity: 2,
      unitPrice: 10000,
      lineTotal: 20000,
      toppings: [{ name: "Original topping", price: 1000 }],
      options: { sweetness: "No sugar" },
    },
  ],
  subtotal: 20000,
  discount: 1000,
  total: 19000,
  created_at: at,
  updated_at: at,
  paid_at: at,
  paid_by: "legacy-staff",
  paid_by_name: "Original cashier",
  payment_method: "cash",
  refund_amount: 0,
};
const options = () => ({
  organizationId: "org",
  branchId: "branch",
  batchId: "batch",
  recognitionPolicy: "legacy_paid_basis",
  payload: { orders: [structuredClone(original)], refunds: [], audits: [] },
});
test("historical snapshots, recognition evidence and balanced immutable lineage do not reprice", () => {
  const first = planLegacyImport(options()),
    second = planLegacyImport(options());
  assert.deepEqual(first, second);
  const order = first.records.find((r) => r.kind === "order").data;
  assert.equal(order.historicalReadOnly, true);
  assert.equal(order.historicalRecognitionAt, at.replace("Z", ".000Z"));
  assert.equal("collectedAt" in order, false);
  assert.equal(order.stockHeld, false);
  assert.equal(order.guestId, null);
  assert.deepEqual(order.legacySnapshot, original);
  assert.equal(order.items[0].options.sweetness, "No sugar");
  assert.equal(order.items[0].unitPrice, 10000);
  const ledger = first.records.find((r) => r.kind === "ledger").data;
  assert.equal(
    ledger.postings.reduce((n, p) => n + p.debit - p.credit, 0),
    0,
  );
  assert.equal(ledger.postings[1].account, "merchant_sales");
  assert(
    first.records.some(
      (r) => r.kind === "audit" && r.data.sourceSnapshot.id === original.id,
    ),
  );
});
test("missing recognition policy/evidence, wrong money and unsupported fulfillment basis refuse", () => {
  assert.throws(
    () => planLegacyImport({ ...options(), recognitionPolicy: undefined }),
    /explicit|Explicit/,
  );
  assert.throws(
    () =>
      planLegacyImport({ ...options(), recognitionPolicy: "fulfilled_only" }),
    /unsupported/,
  );
  const absent = options();
  absent.payload.orders[0].paid_at = null;
  assert.throws(() => planLegacyImport(absent), /evidence/);
  const wrong = options();
  wrong.payload.orders[0].total++;
  assert.throws(() => planLegacyImport(wrong), /reconcile/);
});
function database() {
  const records = new Map();
  const query = async (sql, params = []) => {
    if (sql.startsWith("SELECT current_database"))
      return {
        rows: [
          {
            name: "mera_fixture_import_abc123",
            address: "127.0.0.1",
            port: 55444,
          },
        ],
      };
    if (sql.includes("mera_branches")) return { rows: [{ id: "branch" }] };
    if (sql.startsWith("SELECT data"))
      return {
        rows: records.has(params[0])
          ? [{ data: records.get(params[0]).data }]
          : [],
      };
    if (sql.startsWith("SELECT id FROM mera_records"))
      return {
        rows: params[0].filter((id) => records.has(id)).map((id) => ({ id })),
      };
    if (sql.startsWith("INSERT")) {
      records.set(params[0], { kind: params[3], data: JSON.parse(params[4]) });
      return { rows: [] };
    }
    throw Error(sql);
  };
  return { records, query, transaction: (fn) => fn({ query }) };
}
test("isolated import exact batch replay is idempotent after JSONB key ordering; changed payload rejects", async () => {
  const prior = process.env.MERA_LEGACY_IMPORT_FIXTURE;
  process.env.MERA_LEGACY_IMPORT_FIXTURE = "true";
  try {
    const db = database();
    const input = { ...options(), db };
    const first = await importLegacyFixture(input);
    const count = db.records.size;
    assert.equal(first.replayed, false);
    const reordered = {
      ...input,
      payload: {
        ...input.payload,
        orders: input.payload.orders.map((order) =>
          Object.fromEntries(Object.entries(order).reverse()),
        ),
      },
    };
    assert.equal((await importLegacyFixture(reordered)).replayed, true);
    assert.equal(db.records.size, count);
    const changed = { ...options(), db };
    changed.payload.orders[0].staff_name = "Changed";
    await assert.rejects(importLegacyFixture(changed), (e) => e.status === 409);
    assert.equal(db.records.size, count);
  } finally {
    if (prior === undefined) delete process.env.MERA_LEGACY_IMPORT_FIXTURE;
    else process.env.MERA_LEGACY_IMPORT_FIXTURE = prior;
  }
});
test("default refusal and caller database overrides fail before any transaction", async () => {
  const prior = process.env.MERA_LEGACY_IMPORT_FIXTURE;
  delete process.env.MERA_LEGACY_IMPORT_FIXTURE;
  try {
    await assert.rejects(
      importLegacyFixture({
        ...options(),
        db: {
          query() {
            throw Error("must not connect");
          },
        },
      }),
      /opt-in/,
    );
    process.env.MERA_LEGACY_IMPORT_FIXTURE = "true";
    await assert.rejects(
      importLegacyFixture({
        ...options(),
        db: database(),
        databaseUrl: "postgres://production.invalid",
      }),
      /no database URLs/,
    );
    const db = database();
    db.query = async () => ({
      rows: [{ name: "production", address: "127.0.0.1", port: 55444 }],
    });
    await assert.rejects(
      importLegacyFixture({ ...options(), db }),
      /isolated fixture/,
    );
  } finally {
    if (prior === undefined) delete process.env.MERA_LEGACY_IMPORT_FIXTURE;
    else process.env.MERA_LEGACY_IMPORT_FIXTURE = prior;
  }
});

test("pending orders create no ledger and evidenced refunds reverse recognized sales", () => {
  const input = options();
  input.payload.orders.push({
    ...structuredClone(original),
    id: "pending",
    number: 2,
    payment_status: "unpaid",
    status: "pending",
    paid_at: null,
    payment_method: null,
  });
  input.payload.orders.push({
    ...structuredClone(original),
    id: "refunded",
    number: 3,
    payment_status: "refunded",
    status: "cancelled",
    refund_amount: 19000,
  });
  input.payload.refunds.push({
    id: "refund-one",
    order_id: "refunded",
    amount: 19000,
    method: "cash",
    reason: "Historical return",
    staff_name: "Original manager",
    created_at: at,
  });
  const plan = planLegacyImport(input);
  assert.equal(plan.summary.orders, 3);
  assert.equal(plan.summary.payments, 2);
  assert.equal(plan.summary.refunds, 1);
  assert.equal(plan.summary.netMinorUnits, 19000);
  const pending = plan.records.find(
    (r) => r.kind === "order" && r.data.sourceId === "pending",
  );
  assert.equal(
    plan.records.some(
      (r) => r.kind === "ledger" && r.data.orderId === pending.id,
    ),
    false,
  );
  const refundLedger = plan.records.find(
    (r) => r.kind === "ledger" && r.data.refundId,
  );
  assert.equal(refundLedger.data.postings[0].account, "sales_returns");
  assert.equal(refundLedger.data.postings[1].account, "collections_cash");
});
