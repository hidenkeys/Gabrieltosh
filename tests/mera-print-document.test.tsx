import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { printDocumentHtml } from "../src/mera/workspace/PrintDocument";
const receipt = {
  documentVersion: 1,
  kind: "receipt",
  duplicate: false,
  documentSnapshot: {
    businessName: "Saved venue",
    branchName: "Surulere",
    reference: "M-ORIGINAL",
    currency: "NGN",
    customerName: "Ada",
    staffName: "Tomi",
    recordedByName: "Bola",
    settledAt: "2026-11-19T12:00:00.000Z",
    note: "Less ice please",
    source: "customer",
    items: [
      {
        name: "Tea",
        size: "Large",
        quantity: 2,
        unitPrice: 100000,
        total: 200000,
        modifiers: [{ name: "Pearls" }],
        allergens: ["Milk"],
        dietary: ["Vegetarian"],
      },
    ],
    total: 225000,
    appliedPaid: 225000,
    lifetimeCollected: 250000,
    refunded: 25000,
    pricing: {
      subtotal: 200000,
      discount: 10000,
      serviceCharge: 20000,
      tax: 15000,
      total: 225000,
      lines: [
        { type: "discount", label: "Member discount", amount: -10000 },
        { type: "service_charge", label: "Service fee", amount: 20000 },
        { type: "tax", label: "VAT", amount: 15000 },
      ],
    },
    template: {
      paperWidth: 58,
      businessName: "Saved venue",
      footer: "Thank you",
      showStaff: true,
    },
  },
};
const parse = (job: any) => new JSDOM(printDocumentHtml(job)).window.document;
for (const width of [58, 80])
  test(`receipt${width} preserves saved lines, price breakdown and payment totals without another calculation`, () => {
    const job = {
      ...receipt,
      documentSnapshot: {
        ...receipt.documentSnapshot,
        template: { ...receipt.documentSnapshot.template, paperWidth: width },
      },
    };
    const before = JSON.stringify(job),
      html = printDocumentHtml(job),
      doc = new JSDOM(html).window.document;
    assert(html.includes(`size:${width}mm auto`));
    assert.equal(doc.body.dataset.paperWidthMm, String(width));
    assert.match(doc.body.textContent || "", /2 × TeaLarge/);
    for (const value of [
      "Pearls",
      "Allergens: Milk",
      "Vegetarian",
      "Member discount",
      "Service fee",
      "VAT",
      "Total₦2,250.00",
      "Applied payment₦2,250.00",
      "Lifetime collected₦2,500.00",
      "Recorded refunds₦250.00",
      "Staff: Tomi",
      "Payment recorded by: Bola",
    ])
      assert(doc.body.textContent?.includes(value), value);
    assert.equal(doc.querySelectorAll(".totals .amount-row").length, 8);
    assert.equal(JSON.stringify(job), before);
  });
for (const [width, height] of [
  [20, 15],
  [60, 150],
])
  test(`sticker${width}x${height} retains all critical saved text without silent clipping`, () => {
    const job = {
      kind: "label",
      documentVersion: 2,
      duplicate: true,
      documentSnapshot: {
        ...receipt.documentSnapshot,
        template: { width, height },
        name: "Very long product name that must remain complete",
        size: "Large",
        quantity: 1,
        modifiers: [{ name: "Less sugar and extra pearls" }],
        allergens: ["Milk", "Nuts"],
        unitIndex: 1,
        unitCount: 2,
        context: { fulfillment: "table_service", tableName: "Window table" },
      },
    };
    const html = printDocumentHtml(job),
      doc = new JSDOM(html).window.document;
    assert(html.includes(`size:${width}mm ${height}mm`));
    assert.equal(doc.body.dataset.paperHeightMm, String(height));
    for (const text of [
      "Very long product name that must remain complete",
      "Less sugar and extra pearls",
      "Allergens: Milk, Nuts",
      "Window table",
      "Unit 1 / 2",
      "DUPLICATE",
      "Less ice please",
    ])
      assert(doc.body.textContent?.includes(text), text);
    assert.equal(html.includes("overflow:hidden"), false);
    assert.equal(html.includes("line-clamp"), false);
  });
test("every user-controlled string is escaped and no external markup/resources execute", () => {
  const bad =
    '</title><script>alert("bad")</script><img src="https://evil.invalid/a" onerror="bad()">';
  const job = {
    ...receipt,
    duplicate: true,
    documentSnapshot: {
      ...receipt.documentSnapshot,
      businessName: bad,
      branchName: bad,
      reference: bad,
      customerName: bad,
      staffName: bad,
      recordedByName: bad,
      note: bad,
      items: [
        {
          name: bad,
          size: bad,
          quantity: 1,
          total: 100,
          modifiers: [{ name: bad }],
          allergens: [bad],
        },
      ],
      pricing: {
        ...receipt.documentSnapshot.pricing,
        lines: [{ type: "tax", label: bad, amount: 100 }],
      },
      template: { ...receipt.documentSnapshot.template, footer: bad },
      context: { fulfillment: "table_service", tableName: bad },
      branch: { address: bad, publicContact: bad, timezone: "Africa/Lagos" },
    },
  };
  const html = printDocumentHtml(job),
    doc = new JSDOM(html).window.document;
  assert(html.includes("&lt;script&gt;"));
  assert.equal(doc.querySelectorAll("script,img,a,link").length, 0);
  assert(doc.body.textContent?.includes(bad));
  assert.equal(doc.querySelectorAll("[onerror]").length, 0);
});
test("missing and malformed legacy money never becomes a zero or current menu/template fallback", () => {
  const job = {
    kind: "receipt",
    documentVersion: 1,
    currentMenu: { businessName: "Current venue", price: 0 },
    template: { paperWidth: 80 },
    documentSnapshot: {
      businessName: "Legacy saved heading",
      reference: "OLD",
      currency: "NGN",
      template: { paperWidth: 58 },
      items: [{ name: "Old item", quantity: 1, total: null }],
      total: "120000",
      appliedPaid: undefined,
      lifetimeCollected: null,
      refunded: "0",
    },
  };
  const html = printDocumentHtml(job),
    doc = new JSDOM(html).window.document;
  assert(!doc.body.textContent?.includes("₦0.00"));
  assert(doc.body.textContent?.includes("Amount unavailable"));
  assert(
    doc.body.textContent?.includes("Tax and charge breakdown not recorded"),
  );
  assert(doc.body.textContent?.includes("Pickup/table context not recorded"));
  assert.equal(html.includes("Current venue"), false);
  assert(html.includes("size:58mm auto"));
});
test("known zero remains actual zero while absent currency does not assume naira", () => {
  const value = {
    ...receipt,
    documentSnapshot: {
      ...receipt.documentSnapshot,
      total: 0,
      appliedPaid: 0,
      lifetimeCollected: 0,
      refunded: 0,
      pricing: null,
    },
  };
  assert(parse(value).body.textContent?.includes("Total₦0.00"));
  const missing = parse({
    ...value,
    documentSnapshot: { ...value.documentSnapshot, currency: undefined },
  });
  assert.equal(missing.body.textContent?.includes("₦"), false);
  assert(missing.body.textContent?.includes("Amount unavailable"));
});
test("v2 branch/context/payment summary uses saved data only and does not infer a cash method", () => {
  const job = {
    ...receipt,
    documentVersion: 2,
    paymentMethod: "cash",
    documentSnapshot: {
      ...receipt.documentSnapshot,
      branch: {
        address: "123 Example Road",
        publicContact: "0800 000 0000",
        timezone: "Africa/Lagos",
      },
      context: { fulfillment: "counter_pickup", tableName: null },
      paymentSummary: {
        appliedPaid: 123400,
        lifetimeCollected: 150000,
        refunded: 26600,
        methodBreakdownStatus: "unavailable",
      },
    },
  };
  const doc = parse(job);
  for (const value of [
    "123 Example Road",
    "0800 000 0000",
    "Counter pickup",
    "19 Nov 2026, 13:00 · Africa/Lagos",
    "Applied payment₦1,234.00",
    "Lifetime collected₦1,500.00",
    "Recorded refunds₦266.00",
    "Payment-method breakdown not recorded",
  ])
    assert(doc.body.textContent?.includes(value), value);
  assert.equal(doc.body.textContent?.includes("Cash"), false);
});
for (const template of [
  { paperWidth: 200 },
  { paperWidth: "58" },
  { paperWidth: 0 },
])
  test("unsupported receipt dimensions cannot be injected or silently substituted", () => {
    assert.throws(
      () =>
        printDocumentHtml({
          ...receipt,
          documentSnapshot: { ...receipt.documentSnapshot, template },
        }),
      /dimensions/,
    );
  });
for (const template of [
  { width: 19, height: 40 },
  { width: 61, height: 40 },
  { width: 20, height: 14 },
  { width: 20, height: 151 },
  { width: "50", height: 40 },
])
  test("unsupported sticker dimensions remain invalid", () => {
    assert.throws(
      () =>
        printDocumentHtml({ kind: "label", documentSnapshot: { template } }),
      /dimensions/,
    );
  });
test("unsupported snapshots are rejected and explicit sample documents remain renderable without a live job", () => {
  assert.throws(() => printDocumentHtml({ kind: "receipt" }), /immutable/);
  assert.throws(
    () => printDocumentHtml({ ...receipt, documentVersion: 3 }),
    /immutable/,
  );
  const html = printDocumentHtml({
    kind: "receipt",
    documentSnapshot: {
      ...receipt.documentSnapshot,
      reference: "SAMPLE",
      customerName: "SAMPLE — NOT A SALE",
      appliedPaid: 0,
    },
  });
  assert(html.includes("SAMPLE — NOT A SALE"));
});
