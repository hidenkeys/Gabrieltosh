import test from "node:test";
import assert from "node:assert/strict";
import {
  beginBillChange,
  recordBillChange,
  assertExpectedBillActor,
} from "../server/mera/bill-attempts.js";
const s = { organizationId: "org", branchId: "branch" },
  a = {
    requestKey: "key",
    actorId: "actor",
    billId: "bill",
    operation: "split",
    intent: { name: "Guest", amount: 100, items: null },
  };
test("bill operation replays original result with exact JSONB intent independent of property order", async () => {
  const result = {
      source: { balance: 200 },
      bill: { id: "new", balance: 100 },
    },
    row = { ...a, intent: { items: null, amount: 100, name: "Guest" }, result };
  const db = {
    query: async (sql, args) => {
      assert.deepEqual(args, [
        "org",
        "branch",
        "bill_change_operation",
        "key",
        "actor",
      ]);
      return { rows: [{ data: row }] };
    },
  };
  assert.deepEqual(await beginBillChange(db, s, a), result);
  for (const patch of [
    { operation: "merge" },
    { billId: "other" },
    { intent: { ...a.intent, amount: 101 } },
  ])
    await assert.rejects(
      beginBillChange(db, s, { ...a, ...patch }),
      (e) => e.code === "IDEMPOTENCY_CONFLICT",
    );
});
test("bill fence prevents delayed changes and stores an independent original acknowledgment", async () => {
  const db = {
    query: async (sql, args) => ({
      rows: args[2] === "bill_change_resolution" ? [{ data: a }] : [],
    }),
  };
  await assert.rejects(
    beginBillChange(db, s, a),
    (e) => e.code === "BILL_CHANGE_ABANDONED",
  );
  let saved;
  const result = { bill: { balance: 100 } };
  await recordBillChange(null, s, async (c, s, k, d) => (saved = d), a, result);
  result.bill.balance = 0;
  assert.equal(saved.result.bill.balance, 100);
  assert.throws(
    () =>
      assertExpectedBillActor({ get: () => "other", user: { id: "actor" } }),
    (e) => e.code === "ACTOR_CHANGED",
  );
});
