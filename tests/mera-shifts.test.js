import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mountMeraShifts } from "../server/mera/shifts.js";
test("shift handover validates active branch scope and exact retry; variance approval is explicit", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "operator" };
    next();
  });
  const s = { organizationId: "org", branchId: "branch" },
    shift = { id: "shift", status: "open", openedBy: "operator" },
    audits = [];
  const target = "10000000-0000-4000-8000-000000000001",
    outside = "10000000-0000-4000-8000-000000000002";
  const client = {
    query: async (sql, args) => {
      assert.match(sql, /m.organization_id=\$2/);
      assert.equal(args[1], "org");
      return {
        rows: [
          {
            permissions: ["shifts.manage"],
            organization_wide: false,
            branch_ids: args[0] === target ? ["branch"] : ["other"],
          },
        ],
      };
    },
  };
  const router = express.Router();
  mountMeraShifts(router, {
    db: client,
    guard: () => (_r, _s, next) => next(),
    scope: () => s,
    locked: async (_s, fn) => fn(client),
    find: async () => shift,
    update: async () => {},
    event: async (_c, _s, name) => audits.push(name),
  });
  app.use(router);
  app.use((err, _req, res, _next) =>
    res.status(err.status || 400).json({ error: err.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base =
      "http://127.0.0.1:" +
      server.address().port +
      "/organizations/org/branches/branch/shifts/shift",
    headers = { "content-type": "application/json" };
  const call = (path, body) =>
    fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  try {
    const input = {
      requestKey: "20000000-0000-4000-8000-000000000001",
      toUserId: target,
      reason: "End of cashier duty",
    };
    assert.equal(
      (await call("/handover", { ...input, toUserId: outside })).status,
      409,
    );
    assert.equal(shift.handlerId, undefined);
    assert.equal((await call("/handover", input)).status, 200);
    assert.equal((await call("/handover", input)).status, 200);
    assert.equal(shift.handovers.length, 1);
    assert.equal(audits.length, 1);
    assert.equal(
      (await call("/handover", { ...input, toUserId: outside })).status,
      409,
    );
    assert.equal(
      (await call("/approve", { reason: "Variance reviewed" })).status,
      409,
    );
    shift.status = "pending_approval";
    shift.variance = -1000;
    assert.equal(
      (await call("/approve", { reason: "Cash difference investigated" }))
        .status,
      200,
    );
    assert.equal(shift.status, "closed");
    assert.equal(shift.approvedBy, "operator");
    assert.equal(audits.at(-1), "shift_variance_approved");
  } finally {
    await new Promise((r) => server.close(r));
  }
});
