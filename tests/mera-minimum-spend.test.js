import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createHash } from "node:crypto";
import {
  minimumSpendSnapshot,
  minimumSpendSummary,
  assertMinimumSpendAcknowledged,
  mountMeraMinimumSpend,
} from "../server/mera/minimum-spend.js";
const policy = {
  enabled: true,
  approved: true,
  amount: 120000,
  basis: "net_paid_bill",
  shortfallTreatment: "manager_review",
  disclosure:
    "Net recorded payments including tax and service count; shortfalls require manager review.",
  version: "10000000-0000-4000-8000-000000000001",
};
test("minimum-spend terms are explicit immutable snapshots, with noncash writeoffs excluded from spend", () => {
  assert.throws(() =>
    minimumSpendSnapshot({ settings: { minimumSpend: 10000 } }),
  );
  assert.throws(() =>
    minimumSpendSnapshot({
      settings: { minimumSpendPolicy: { ...policy, approved: false } },
    }),
  );
  const branch = { settings: { minimumSpendPolicy: { ...policy } } },
    snapshot = minimumSpendSnapshot(branch);
  branch.settings.minimumSpendPolicy.amount = 900000;
  assert.equal(snapshot.amount, 120000);
  assert.throws(() => assertMinimumSpendAcknowledged(snapshot, {}));
  assert.throws(() =>
    assertMinimumSpendAcknowledged(snapshot, {
      minimumSpendAcknowledged: true,
      minimumSpendPolicyVersion: "different",
    }),
  );
  assert.doesNotThrow(() =>
    assertMinimumSpendAcknowledged(snapshot, {
      minimumSpendAcknowledged: true,
      minimumSpendPolicyVersion: policy.version,
    }),
  );
  const visit = {
      id: "visit",
      minimumSpendPolicy: snapshot,
      minimumSpendWaived: 5000,
    },
    orders = [
      {
        visitId: "visit",
        status: "collected",
        total: 70000,
        paid: 80000,
        refunded: 10000,
      },
      {
        visitId: "visit",
        status: "collected",
        total: 30000,
        paid: 60000,
        refunded: 0,
      },
      {
        visitId: "visit",
        status: "collected",
        total: 50000,
        paid: 0,
        refunded: 0,
        writtenOff: 50000,
      },
      {
        visitId: "other",
        status: "collected",
        total: 900000,
        paid: 900000,
        refunded: 0,
      },
    ];
  assert.equal(minimumSpendSummary(visit, orders).netPaid, 100000);
  assert.equal(minimumSpendSummary(visit, orders).shortfall, 15000);
  visit.minimumSpendWaived = 20000;
  assert.equal(minimumSpendSummary(visit, orders).shortfall, 0);
  orders[1].refunded = 45000;
  assert.equal(minimumSpendSummary(visit, orders).shortfall, 15000);
});
test("valid code reveals only visit terms; waiver is reviewed, idempotent and creates no collection", async () => {
  const visit = {
      id: "visit",
      tableId: "10000000-0000-4000-8000-000000000002",
      status: "open",
      version: 1,
      minimumSpendPolicy: policy,
      guestIds: [],
      joiningCodeHash: createHash("sha256")
        .update("PRIVATE-CODE")
        .digest("hex"),
    },
    records = [];
  const s = { organizationId: "org", branchId: "branch" },
    app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "manager" };
    next();
  });
  const router = express.Router();
  mountMeraMinimumSpend(router, {
    db: {},
    guard: () => (_r, _s, next) => next(),
    scope: () => s,
    locked: async (_s, fn) => fn({}),
    readRecords: async (_c, _o, _b, kind) =>
      kind === "visit"
        ? [{ data: visit }]
        : kind === "minimum_spend_waiver"
          ? records.map((data) => ({ data }))
          : [],
    find: async (_c, scope) => {
      assert.equal(scope.branchId, "branch");
      return visit;
    },
    update: async () => {},
    record: async (_c, _s, kind, data) => {
      assert.equal(kind, "minimum_spend_waiver");
      records.push(data);
      return data;
    },
    event: async () => {},
    publicContext: async () => ({ organization: { id: "org" }, s }),
    guest: async (req) => {
      if (!req.get("x-guest"))
        throw Object.assign(new Error("Guest required"), { status: 401 });
      return { id: "guest" };
    },
  });
  app.use(router);
  app.use((e, _q, r, _n) =>
    r.status(e.status || 400).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const root = "http://127.0.0.1:" + server.address().port,
    headers = { "content-type": "application/json", "x-guest": "guest" };
  try {
    const body = { tableId: visit.tableId, code: "private-code" },
      terms = await (
        await fetch(root + "/public/shop/branch/visits/terms", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })
      ).json();
    assert.equal(terms.privateBillAccessGranted, false);
    assert.equal(terms.minimumSpendPolicy.amount, 120000);
    assert.deepEqual(visit.guestIds, []);
    assert.equal(terms.joiningCodeHash, undefined);
    assert.equal(
      (
        await fetch(root + "/public/shop/branch/visits/terms", {
          method: "POST",
          headers,
          body: JSON.stringify({ ...body, code: "wrong" }),
        })
      ).status,
      403,
    );
    const path =
        root +
        "/organizations/org/branches/branch/visits/visit/minimum-spend/waive",
      intent = {
        requestKey: "20000000-0000-4000-8000-000000000001",
        version: 1,
        expectedShortfall: 120000,
        reason: "Manager reviewed the service exception",
      };
    for (let n = 0; n < 2; n++)
      assert.equal(
        (
          await fetch(path, {
            method: "POST",
            headers,
            body: JSON.stringify(intent),
          })
        ).status,
        200,
      );
    assert.equal(records.length, 1);
    assert.equal(visit.minimumSpendWaived, 120000);
    assert.equal(
      (
        await fetch(path, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...intent, reason: "A different intent" }),
        })
      ).status,
      409,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});
