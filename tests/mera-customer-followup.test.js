import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mountMeraCustomerFollowup } from "../server/mera/customer-followup.js";
test("guest activity and cancellation preserve privacy, deposit review and exact retry intent", async () => {
  const app = express();
  app.use(express.json());
  const s = { organizationId: "org", branchId: "branch" };
  const id = "10000000-0000-4000-8000-000000000001",
    paidId = "10000000-0000-4000-8000-000000000002";
  const reservations = [
    { id, guestId: "one", status: "confirmed", depositAmount: 0 },
    { id: paidId, guestId: "one", status: "confirmed", depositAmount: 10000 },
    { id: "other", guestId: "two", status: "confirmed" },
  ];
  const complaints = [
    {
      id: "own",
      guestId: "one",
      text: "My feedback",
      status: "investigating",
      resolution: "Private investigation notes",
      handlerId: "private-staff",
    },
    { id: "other", guestId: "two", text: "Private other guest" },
  ];
  const router = express.Router();
  mountMeraCustomerFollowup(router, {
    db: {},
    publicContext: async () => ({ organization: { id: "org" }, s }),
    guest: async (req) => {
      if (!req.get("x-guest"))
        throw Object.assign(new Error("Sign in"), { status: 401 });
      return { id: req.get("x-guest") };
    },
    readRecords: async (_db, _o, _b, kind) =>
      (kind === "reservation" ? reservations : complaints).map((data) => ({
        data,
      })),
    locked: async (_s, fn) =>
      fn({ query: async () => ({ rows: [{ settings: {} }] }) }),
    find: async (_c, _s, _kind, wanted) => {
      const r = reservations.find((r) => r.id === wanted);
      if (!r) throw Object.assign(new Error("Not found"), { status: 404 });
      return r;
    },
    update: async () => {},
    event: async () => {},
  });
  app.use(router);
  app.use((err, _req, res, _next) =>
    res.status(err.status || 500).json({ error: err.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base =
    "http://127.0.0.1:" + server.address().port + "/public/shop/branch";
  const headers = { "content-type": "application/json", "x-guest": "one" };
  try {
    assert.equal((await fetch(base + "/activity")).status, 401);
    const activity = await (
      await fetch(base + "/activity", { headers })
    ).json();
    assert.equal(activity.reservations.length, 2);
    assert.equal(activity.feedback.length, 1);
    assert.equal(JSON.stringify(activity).includes("Private"), false);
    assert.equal(JSON.stringify(activity).includes("private-staff"), false);
    const body = {
      requestKey: "20000000-0000-4000-8000-000000000001",
      reason: "Plans changed",
    };
    const cancel = (target, bodyOverride = body, extra = {}) =>
      fetch(base + "/reservations/" + target + "/cancellation", {
        method: "POST",
        headers: { ...headers, ...extra },
        body: JSON.stringify(bodyOverride),
      });
    assert.equal((await cancel(id, body, { "x-guest": "two" })).status, 404);
    assert.equal((await (await cancel(id)).json()).status, "cancelled");
    assert.equal((await cancel(id)).status, 200);
    assert.equal(
      (await cancel(id, { ...body, reason: "Different reason" })).status,
      409,
    );
    const deposit = await (await cancel(paidId)).json();
    assert.equal(deposit.status, "confirmed");
    assert.equal(deposit.depositReviewRequired, true);
    assert.equal(deposit.refundConfirmed, false);
    assert.ok(deposit.cancellationRequestedAt);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
