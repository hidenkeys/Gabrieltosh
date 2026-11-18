import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mountMeraFulfillment } from "../server/mera/fulfillment.js";
test("partial handoff is versioned, bounded by preparation and does not recognize or collect the order", async () => {
  const order = {
    id: "10000000-0000-4000-8000-000000000001",
    version: 3,
    status: "preparing",
    total: 20000,
    paid: 20000,
    pricing: { total: 20000, tax: 0 },
    items: [{ orderLineId: "line", quantity: 2 }],
    history: [],
  };
  const tickets = [
      {
        orderId: order.id,
        status: "preparing",
        items: [{ orderLineId: "line", quantity: 2, preparedQuantity: 1 }],
      },
    ],
    records = [],
    events = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: req.get("x-actor") || "staff", name: "Demo staff" };
    next();
  });
  const router = express.Router();
  mountMeraFulfillment(router, {
    guard: () => (_r, _s, next) => next(),
    scope: () => ({ organizationId: "org", branchId: "branch" }),
    locked: async (_s, fn) => fn({}, { settings: { payLater: false } }),
    readRecords: async (_c, _o, _b, kind) =>
      kind === "ticket"
        ? tickets.map((data) => ({ data }))
        : records.map((data) => ({ data })),
    find: async () => order,
    update: async () => {},
    record: async (_c, _s, kind, data) => {
      assert.equal(kind, "item_fulfillment");
      records.push({
        ...data,
        intent: Object.fromEntries(Object.entries(data.intent).reverse()),
      });
    },
    event: async (_c, _s, name) => events.push(name),
    paidForBill: (o) => o.paid,
  });
  app.use(router);
  app.use((e, _q, r, _n) =>
    r.status(e.status || 400).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base =
    "http://127.0.0.1:" +
    server.address().port +
    "/organizations/org/branches/branch/orders/" +
    order.id +
    "/items/line/fulfillment";
  const key = "20000000-0000-4000-8000-000000000001",
    body = {
      requestKey: key,
      version: 3,
      fulfilledQuantity: 1,
      reason: "Ready drink served",
    };
  const post = (value, actor = "staff") =>
    fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor": actor },
      body: JSON.stringify(value),
    });
  try {
    assert.equal((await post({ ...body, fulfilledQuantity: 2 })).status, 409);
    assert.equal(records.length, 0);
    const first = await (await post(body)).json();
    assert.equal(first.fulfilledQuantity, 1);
    assert.equal(first.allItemsHandedOver, false);
    assert.equal(order.status, "preparing");
    assert.equal(order.total, 20000);
    assert.equal(order.paid, 20000);
    assert.deepEqual(order.pricing, { total: 20000, tax: 0 });
    assert.equal((await post(body)).status, 200);
    assert.equal(records.length, 1);
    assert.equal(events.length, 1);
    assert.equal((await post(body, "different-staff")).status, 409);
    assert.equal(
      (
        await post({
          ...body,
          requestKey: "20000000-0000-4000-8000-000000000002",
          fulfilledQuantity: 2,
        })
      ).status,
      409,
    );
    tickets[0].items[0].preparedQuantity = 2;
    const final = await (
      await post({
        ...body,
        requestKey: "20000000-0000-4000-8000-000000000003",
        version: order.version,
        fulfilledQuantity: 2,
      })
    ).json();
    assert.equal(final.allItemsHandedOver, true);
    assert.equal(order.status, "preparing");
    assert.equal(order.collectedAt, undefined);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
