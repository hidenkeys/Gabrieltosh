import test from "node:test";
import assert from "node:assert/strict";
import {
  priceOrder,
  buildPrintPayloads,
  reportFor,
  dayBounds,
} from "../server/domain.js";
import { renderPrint } from "../server/printing.js";
const products = [
  {
    id: "tea",
    code: "C2",
    name: "Tea",
    category: "Fruit milk tea",
    price: 380000,
    size: "700 ml",
    available: true,
    label_required: true,
    options: true,
  },
  {
    id: "boba",
    name: "Boba",
    category: "Toppings",
    price: 50000,
    available: true,
    label_required: false,
  },
];
test("server prices quantities and attached toppings in minor units", () => {
  const r = priceOrder(
    [{ productId: "tea", quantity: 2, toppings: ["boba"] }],
    products,
    { type: "percent", value: 10, reason: "Offer" },
    "supervisor",
  );
  assert.equal(r.subtotal, 860000);
  assert.equal(r.discount, 86000);
  assert.equal(r.total, 774000);
  assert.equal(r.items[0].unitPrice, 430000);
});
test("cashiers cannot bypass discount permission", () =>
  assert.throws(
    () =>
      priceOrder(
        [{ productId: "tea", quantity: 1 }],
        products,
        { value: 10, type: "percent", reason: "x" },
        "cashier",
      ),
    /supervisor/,
  ));
test("reject unavailable products, invalid quantities and oversized discounts", () => {
  assert.throws(
    () =>
      priceOrder(
        [{ productId: "tea", quantity: 0 }],
        products,
        null,
        "cashier",
      ),
    /Quantity/,
  );
  assert.throws(
    () =>
      priceOrder(
        [{ productId: "missing", quantity: 1 }],
        products,
        null,
        "admin",
      ),
    /unavailable/,
  );
  assert.throws(
    () =>
      priceOrder(
        [{ productId: "tea", quantity: 1 }],
        products,
        { value: 101, type: "percent", reason: "x" },
        "admin",
      ),
    /100/,
  );
});
test("one receipt precedes one sticker per labelled unit", () => {
  const priced = priceOrder(
    [{ productId: "tea", quantity: 3 }],
    products,
    null,
    "cashier",
  );
  const jobs = buildPrintPayloads(
    { id: "o", number: 1, items: priced.items },
    {},
  );
  assert.deepEqual(
    jobs.map((j) => j.kind),
    ["receipt", "label", "label", "label"],
  );
  assert.equal(jobs[3].payload.count, 3);
  assert.equal(jobs[3].payload.index, 3);
});
test("reports exclude unpaid/cancelled sales and account for refund method", () => {
  const item = priceOrder(
    [{ productId: "tea", quantity: 1 }],
    products,
    null,
    "cashier",
  ).items;
  const r = reportFor(
    [
      {
        subtotal: 380000,
        discount: 0,
        total: 380000,
        payment_status: "paid",
        payment_method: "card",
        status: "fulfilled",
        items: item,
      },
      {
        subtotal: 380000,
        total: 380000,
        payment_status: "unpaid",
        status: "cancelled",
        items: item,
      },
    ],
    [{ amount: 100000, method: "cash" }],
  );
  assert.equal(r.net, 280000);
  assert.equal(r.paidOrders, 1);
  assert.equal(r.payments.cash, -100000);
  assert.equal(r.products[0].quantity, 1);
});
test("Lagos report boundaries include local midnight", () =>
  assert.deepEqual(dayBounds("2026-10-21"), [
    "2026-10-20T23:00:00.000Z",
    "2026-10-21T23:00:00.000Z",
  ]));
test("receipt escapes untrusted product and template text", () => {
  const priced = priceOrder(
    [{ productId: "tea", quantity: 1 }],
    products,
    null,
    "cashier",
  );
  const out = renderPrint({
    kind: "receipt",
    payload: {
      template: {
        businessName: "<script>x</script>",
        address: "",
        subtitle: "",
        footer: "",
        paperWidth: 58,
      },
      order: {
        ...priced,
        items: [{ ...priced.items[0], name: "<img onerror=x>" }],
        created_at: new Date(),
        number: 1,
      },
    },
  });
  assert(!out.includes("<script>"));
  assert(!out.includes("<img onerror"));
  assert(out.includes("&lt;script&gt;"));
});
