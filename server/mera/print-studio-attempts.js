import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { fail } from "./domain.js";
export function assertExpectedPrintActor(req) {
  const expected = req.get("X-Mera-Actor-Id");
  if (expected !== undefined && expected !== req.user.id)
    throw fail(
      "Your signed-in account changed. Refresh the workspace before continuing.",
      403,
      "ACTOR_CHANGED",
    );
}
const conflict = () =>
  fail(
    "This key belongs to a different receipt-studio operation.",
    409,
    "IDEMPOTENCY_CONFLICT",
  );
const matches = (r, a) =>
  r.operation === a.operation && r.targetId === a.targetId;
const own = async (c, s, kind, key, actorId) =>
  (
    await c.query(
      "SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind=$3 AND data->>'requestKey'=$4 AND data->>'actorId'=$5 LIMIT 1",
      [s.organizationId, s.branchId, kind, key, actorId],
    )
  ).rows[0]?.data;
export async function beginPrintStudioOperation(c, s, a) {
  if (!a.requestKey) return null;
  const prior = await own(
    c,
    s,
    "print_studio_operation",
    a.requestKey,
    a.actorId,
  );
  if (prior) {
    if (!matches(prior, a) || !isDeepStrictEqual(prior.intent, a.intent))
      throw conflict();
    return prior.result;
  }
  const stopped = await own(
    c,
    s,
    "print_studio_resolution",
    a.requestKey,
    a.actorId,
  );
  if (stopped) {
    if (!matches(stopped, a)) throw conflict();
    throw fail(
      "This receipt-studio request was safely abandoned. Review a new request before submitting again.",
      409,
      "PRINT_STUDIO_REQUEST_ABANDONED",
    );
  }
  return null;
}
export async function recordPrintStudioOperation(c, s, record, a, result) {
  if (a.requestKey)
    await record(c, s, "print_studio_operation", {
      ...a,
      result: structuredClone(result),
      createdAt: new Date().toISOString(),
    });
}
export function cleanReprintJob(job, { reason, actorId, createdAt }) {
  return {
    orderId: job.orderId,
    kind: job.kind,
    documentVersion: job.documentVersion,
    documentKey: job.documentKey,
    batchId: job.batchId,
    settlement: job.settlement,
    documentSnapshot: job.documentSnapshot,
    originalJobId: job.id,
    automaticPaid: false,
    status: "queued",
    duplicate: true,
    reason,
    requestedBy: actorId,
    physicalConfirmed: false,
    createdAt,
  };
}
export function mountMeraPrintStudioAttempts(
  router,
  { guard, scope, locked, find, record, event },
) {
  const B = "/organizations/:organizationId/branches/:branchId";
  async function resolve(req, res, operation, abandon) {
    res.set("Cache-Control", "no-store");
    assertExpectedPrintActor(req);
    const requestKey = z.string().uuid().parse(req.params.requestKey),
      targetId =
        operation === "reprint" ? z.string().uuid().parse(req.params.id) : null,
      s = scope(req),
      actorId = req.user.id,
      a = { operation, targetId };
    const input = abandon
      ? z
          .object({ reason: z.string().trim().min(3).max(500) })
          .strict()
          .parse(req.body)
      : null;
    const result = await locked(s, async (c) => {
      if (targetId) await find(c, s, "print_job", targetId);
      const prior = await own(
        c,
        s,
        "print_studio_operation",
        requestKey,
        actorId,
      );
      if (prior) {
        if (!matches(prior, a)) throw conflict();
        return {
          status: "recorded",
          result: prior.result,
          resultBasis: "recorded_operation_snapshot",
          operationRecord: {
            id: prior.id,
            requestKey,
            actorId,
            operation,
            targetId,
            intent: prior.intent,
            createdAt: prior.createdAt,
          },
        };
      }
      let resolution = await own(
        c,
        s,
        "print_studio_resolution",
        requestKey,
        actorId,
      );
      if (resolution && !matches(resolution, a)) throw conflict();
      if (!resolution && input) {
        resolution = await record(c, s, "print_studio_resolution", {
          requestKey,
          actorId,
          operation,
          targetId,
          status: "abandoned",
          reason: input.reason,
          createdAt: new Date().toISOString(),
        });
        await event(c, s, "print_studio_request_abandoned", req.user, {
          requestKey,
          operation,
          targetId,
          resolutionId: resolution.id,
          reason: input.reason,
        });
      }
      return resolution
        ? { status: "abandoned", resolutionId: resolution.id }
        : { status: "not_found" };
    });
    res.json({
      ...result,
      requestKey,
      actorId,
      organizationId: s.organizationId,
      branchId: s.branchId,
      operation,
      targetId,
    });
  }
  for (const [operation, path, permission] of [
    ["template_save", B + "/templates/save-attempts/:requestKey", "menu.edit"],
    [
      "reprint",
      B + "/print-jobs/:id/reprint-attempts/:requestKey",
      "orders.fulfill",
    ],
  ]) {
    router.get(path, guard(permission), (req, res) =>
      resolve(req, res, operation, false),
    );
    router.post(path + "/abandon", guard(permission), (req, res) =>
      resolve(req, res, operation, true),
    );
  }
}
