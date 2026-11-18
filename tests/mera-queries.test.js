import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOrderPage,
  queryOrderPage,
  tradingDayWindow,
} from "../server/mera/queries.js";
test("order history is bounded, parameterized and binds cursors to tenant scope and filters", async () => {
  const s = { organizationId: "org", branchId: "branch" },
    queries = [];
  const rows = [1, 2, 3].map((n) => ({
    id: `10000000-0000-4000-8000-00000000000${n}`,
    data: {
      id: `10000000-0000-4000-8000-00000000000${n}`,
      createdAt: `2026-11-18T12:0${4 - n}:00.000Z`,
      total: 10000,
      paid: 10000,
      refunded: 0,
      financialPolicy: { monthlyPrice: 1350000 },
      policyVersion: "private",
      pricing: { total: 10000 },
    },
  }));
  const db = {
    query: async (sql, args) => {
      queries.push({ sql, args });
      return { rows };
    },
  };
  const page = await queryOrderPage(db, s, { take: 2, q: "Drink_%" }, [
    "orders.view",
  ]);
  assert.equal(page.orders.length, 2);
  assert.equal(page.hasMore, true);
  assert.ok(page.nextCursor);
  assert.equal(page.orders[0].financialPolicy, undefined);
  assert.equal(page.orders[0].pricing.total, 10000);
  assert.match(queries[0].sql, /organization_id=\$1 AND branch_id=\$2/);
  assert.equal(queries[0].sql.includes("Drink_"), false);
  assert.ok(queries[0].args.includes("%Drink\\_\\%%"));
  assert.equal(queries[0].args.at(-1), 3);
  await queryOrderPage(
    db,
    s,
    { take: 2, q: "Drink_%", cursor: page.nextCursor },
    ["orders.view"],
  );
  assert.ok(queries[1].args.includes(rows[1].data.createdAt));
  assert.ok(queries[1].args.includes(rows[1].id));
  const count = queries.length;
  await assert.rejects(
    queryOrderPage(
      db,
      { ...s, branchId: "other" },
      { take: 2, q: "Drink_%", cursor: page.nextCursor },
    ),
    /scope or filters/,
  );
  await assert.rejects(
    queryOrderPage(db, s, { take: 2, q: "Changed", cursor: page.nextCursor }),
    /scope or filters/,
  );
  assert.equal(queries.length, count);
});
test("history rejects unbounded filters and day windows delegate timezone/cutoff arithmetic to PostgreSQL", async () => {
  for (const input of [
    { take: 101 },
    { take: 0 },
    { historical: "anything" },
    { status: "fake" },
    { from: "2026-12-01T00:00:00Z", to: "2026-01-01T00:00:00Z" },
  ])
    assert.throws(() => normalizeOrderPage(input));
  const db = {
    query: async (sql, args) => {
      assert.match(sql, /AT TIME ZONE/);
      assert.deepEqual(args, ["2026-11-18", 360, "Africa/Lagos"]);
      return {
        rows: [
          {
            starts_at: "2026-11-18T05:00:00Z",
            ends_at: "2026-11-19T05:00:00Z",
          },
        ],
      };
    },
  };
  assert.deepEqual(
    await tradingDayWindow(
      db,
      { cutoff: 360, timezone: "Africa/Lagos" },
      "2026-11-18",
    ),
    { from: "2026-11-18T05:00:00.000Z", to: "2026-11-19T05:00:00.000Z" },
  );
});
