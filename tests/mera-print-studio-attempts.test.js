import test from "node:test";
import assert from "node:assert/strict";
import {
  beginPrintStudioOperation,
  recordPrintStudioOperation,
  cleanReprintJob,
} from "../server/mera/print-studio-attempts.js";
const s = { organizationId: "org", branchId: "branch" },
  a = {
    requestKey: "key",
    actorId: "actor",
    operation: "reprint",
    targetId: "source",
    intent: { reason: "Audited duplicate" },
  };
test("studio replay/fence bind actor tenant operation target and exact original intent", async () => {
  const result = { id: "duplicate" },
    row = { ...a, result };
  const db = {
    query: async (sql, args) => {
      assert.deepEqual(args, [
        "org",
        "branch",
        "print_studio_operation",
        "key",
        "actor",
      ]);
      return { rows: [{ data: row }] };
    },
  };
  assert.deepEqual(await beginPrintStudioOperation(db, s, a), result);
  for (const patch of [
    { targetId: "other" },
    { operation: "template_save" },
    { intent: { reason: "Other reason" } },
  ])
    await assert.rejects(
      beginPrintStudioOperation(db, s, { ...a, ...patch }),
      (e) => e.code === "IDEMPOTENCY_CONFLICT",
    );
  await assert.rejects(
    beginPrintStudioOperation(
      {
        query: async (sql, args) => ({
          rows: args[2] === "print_studio_resolution" ? [{ data: a }] : [],
        }),
      },
      s,
      a,
    ),
    (e) => e.code === "PRINT_STUDIO_REQUEST_ABANDONED",
  );
});
test("reprints preserve immutable document but drop every prior completion, browser or hypothetical worker claim field", async () => {
  const snapshot = { reference: "Order", template: { paperWidth: 58 } },
    job = {
      id: "source",
      orderId: "order",
      kind: "receipt",
      documentVersion: 2,
      documentSnapshot: snapshot,
      status: "printed",
      physicalConfirmed: true,
      claimToken: "secret",
      leaseToken: "secret",
      claimedBy: "station",
      printedAt: "old",
      browserSubmittedAt: "old",
      browserOutcome: "unverified",
      error: "old",
    };
  const duplicate = cleanReprintJob(job, {
    reason: "Reviewed duplicate",
    actorId: "actor",
    createdAt: "now",
  });
  assert.deepEqual(duplicate.documentSnapshot, snapshot);
  assert.equal(duplicate.status, "queued");
  assert.equal(duplicate.physicalConfirmed, false);
  assert.equal(duplicate.originalJobId, "source");
  for (const k of [
    "claimToken",
    "leaseToken",
    "claimedBy",
    "printedAt",
    "browserSubmittedAt",
    "browserOutcome",
    "error",
  ])
    assert.equal(k in duplicate, false);
  let saved;
  await recordPrintStudioOperation(
    null,
    s,
    async (c, s, k, d) => (saved = d),
    a,
    duplicate,
  );
  snapshot.reference = "Changed";
  assert.equal(saved.result.documentSnapshot.reference, "Order");
});
