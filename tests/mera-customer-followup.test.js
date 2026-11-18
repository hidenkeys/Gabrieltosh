import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import { createHash } from "node:crypto";
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
test("current guest history uses scoped bounded cursors and ending a session preserves another venue cookie", async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const s = { organizationId: "org", branchId: "branch" },
    rows = [1, 2, 3].map((n) => ({
      data: {
        id: `10000000-0000-4000-8000-00000000000${n}`,
        guestId: "guest",
        createdAt: "2026-11-18T00:00:00.000Z",
        reference: "R" + n,
        secret: "private",
      },
    }));
  let expired = false;
  const router = express.Router();
  mountMeraCustomerFollowup(router, {
    db: {
      query: async (sql, args) => {
        if (sql.startsWith("UPDATE mera_guests")) {
          assert.deepEqual(args, ["guest", "org"]);
          expired = true;
          return { rows: [] };
        }
        assert.match(sql, /organization_id=\$1 AND branch_id=\$2/);
        assert.match(sql, /guestId'\=\$3/);
        assert.deepEqual(args.slice(0, 3), ["org", "branch", "guest"]);
        assert.equal(args[5], 3);
        return { rows };
      },
    },
    publicContext: async () => ({ organization: { id: "org" }, s }),
    guest: async () => {
      if (expired)
        throw Object.assign(new Error("Guest expired"), { status: 401 });
      return {
        id: "guest",
        token_hash: createHash("sha256").update("own-token").digest("hex"),
      };
    },
    publicOrder: (o) => ({ id: o.id, reference: o.reference }),
  });
  app.use(router);
  app.use((e, _req, res, _next) =>
    res.status(e.status || 400).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base =
    "http://127.0.0.1:" + server.address().port + "/public/shop/branch";
  try {
    const response = await fetch(base + "/guest-orders?take=2"),
      page = await response.json();
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(page.orders.length, 2);
    assert.equal(JSON.stringify(page).includes("private"), false);
    assert.ok(page.nextCursor);
    const cursor = JSON.parse(
      Buffer.from(page.nextCursor, "base64url").toString("utf8"),
    );
    cursor.guest = "other";
    assert.equal(
      (
        await fetch(
          base +
            "/guest-orders?take=2&cursor=" +
            Buffer.from(JSON.stringify(cursor)).toString("base64url"),
        )
      ).status,
      400,
    );
    assert.equal((await fetch(base + "/guest-orders?take=31")).status, 400);
    const ended = await fetch(base + "/guest/end", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "mera_guest=other-venue-token; mera_guest_org=own-token",
      },
      body: "{}",
    });
    assert.equal(ended.status, 200);
    assert.deepEqual(await ended.json(), {
      ended: true,
      ordersCancelled: false,
      refundConfirmed: false,
    });
    assert.match(ended.headers.get("set-cookie"), /mera_guest_org=/);
    assert.doesNotMatch(
      ended.headers.get("set-cookie"),
      /(?:^|,\s*)mera_guest=/,
    );
    assert.equal((await fetch(base + "/guest-orders?take=2")).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
