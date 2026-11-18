import test from "node:test";
import assert from "node:assert/strict";
import {
  quote,
  transition,
  ledgerPostings,
  integratedFee,
  tradingDate,
  overlaps,
} from "../server/mera/domain.js";
const p = {
  id: "one",
  name: "Tea",
  code: "T1",
  available: true,
  price: 320000,
  size: "700ml",
  stockMode: "counted",
  stock: 1,
  station: "bar",
  variants: [],
  modifierGroups: [
    {
      id: "sweet",
      name: "Sweetness",
      min: 1,
      max: 1,
      options: [{ id: "half", name: "50%", price: 0 }],
    },
  ],
};
test("Mera server pricing enforces stock and required modifier choices", () => {
  assert.throws(() =>
    quote([{ productId: "one", quantity: 1, modifiers: [] }], [p]),
  );
  assert.throws(() =>
    quote([{ productId: "one", quantity: 2, modifiers: ["half"] }], [p]),
  );
  assert.equal(
    quote([{ productId: "one", quantity: 1, modifiers: ["half"] }], [p]).total,
    320000,
  );
  assert.throws(() =>
    quote(
      [{ productId: "one", quantity: 1, modifiers: ["half", "half"] }],
      [p],
    ),
  );
});
test("Mera order state is independent from printing and paid orders are protected", () => {
  assert.equal(
    transition(
      { status: "accepted", paid: 320000, total: 320000, refunded: 0 },
      "preparing",
    ),
    "preparing",
  );
  assert.throws(() =>
    transition(
      { status: "accepted", paid: 0, total: 320000, refunded: 0 },
      "preparing",
    ),
  );
  assert.throws(() =>
    transition(
      { status: "accepted", paid: 320000, total: 320000, refunded: 0 },
      "cancelled",
    ),
  );
});
test("Mera manual collections incur no integrated fee and live policy stays blocked", () => {
  assert.equal(integratedFee(100000, "external_pos"), 0);
  assert.equal(integratedFee(100000, "cash"), 0);
  assert.throws(() => integratedFee(100000, "mera_integrated"));
  const posts = ledgerPostings(320000, "cash");
  assert.equal(
    posts.reduce((n, p) => n + p.debit - p.credit, 0),
    0,
  );
});
test("Mera cutoff and overlapping reservation boundaries are explicit", () => {
  assert.equal(
    tradingDate("2026-11-18T00:30:00Z", "Africa/Lagos", 240),
    "2026-11-17",
  );
  assert.equal(
    overlaps(
      { startsAt: "2026-11-18T10:00:00Z", endsAt: "2026-11-18T11:00:00Z" },
      { startsAt: "2026-11-18T11:00:00Z", endsAt: "2026-11-18T12:00:00Z" },
    ),
    false,
  );
});

test("Mera sales recognition uses immutable fulfillment time, not order creation or later status", async () => {
  const { report } = await import("../server/mera/domain.js");
  const records = [
    {
      kind: "order",
      data: {
        id: "o1",
        createdAt: "2026-11-17T12:00:00Z",
        collectedAt: "2026-11-18T12:00:00Z",
        completedAt: "2026-11-19T12:00:00Z",
        status: "completed",
        total: 10000,
        paid: 10000,
        items: [{ name: "Tea", quantity: 1 }],
      },
    },
    {
      kind: "order",
      data: {
        id: "o2",
        createdAt: "2026-11-18T12:00:00Z",
        status: "submitted",
        total: 20000,
        paid: 0,
        items: [{ name: "Unpaid", quantity: 1 }],
      },
    },
    {
      kind: "refund",
      data: { orderId: "o1", createdAt: "2026-11-19T14:00:00Z", amount: 5000 },
    },
  ];
  const branch = { timezone: "Africa/Lagos", cutoff: 0 };
  assert.equal(report(records, branch, "2026-11-17").grossSales, 0);
  assert.equal(report(records, branch, "2026-11-18").grossSales, 10000);
  assert.equal(report(records, branch, "2026-11-18").products.length, 1);
  assert.equal(report(records, branch, "2026-11-19").grossSales, 0);
  assert.equal(report(records, branch, "2026-11-19").netSales, -5000);
});
