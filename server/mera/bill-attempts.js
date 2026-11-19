import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { fail } from "./domain.js";
export function assertExpectedBillActor(req) {
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
    "This key belongs to a different bill change.",
    409,
    "IDEMPOTENCY_CONFLICT",
  );
const matches = (r, a) => r.billId === a.billId && r.operation === a.operation;
const own = async (c, s, kind, key, actorId) =>
  (
    await c.query(
      "SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind=$3 AND data->>'requestKey'=$4 AND data->>'actorId'=$5 LIMIT 1",
      [s.organizationId, s.branchId, kind, key, actorId],
    )
  ).rows[0]?.data;
export async function beginBillChange(c, s, a) {
  if (!a.requestKey) return null;
  const prior = await own(
    c,
    s,
    "bill_change_operation",
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
    "bill_change_resolution",
    a.requestKey,
    a.actorId,
  );
  if (stopped) {
    if (!matches(stopped, a)) throw conflict();
    throw fail(
      "This bill change was safely abandoned. Review a new change before submitting again.",
      409,
      "BILL_CHANGE_ABANDONED",
    );
  }
  return null;
}
export async function recordBillChange(c, s, record, a, result) {
  if (a.requestKey)
    await record(c, s, "bill_change_operation", {
      ...a,
      result: structuredClone(result),
      createdAt: new Date().toISOString(),
    });
}
export function mountMeraBillAttempts(
  router,
  { guard, scope, locked, find, record, event },
) {
  const path =
    "/organizations/:organizationId/branches/:branchId/bills/:id/change-attempts/:operation/:requestKey";
  async function resolve(req, res, abandon) {
    res.set("Cache-Control", "no-store");
    assertExpectedBillActor(req);
    const operation = z.enum(["split", "merge"]).parse(req.params.operation),
      requestKey = z.string().uuid().parse(req.params.requestKey),
      billId = z.string().uuid().parse(req.params.id),
      s = scope(req),
      actorId = req.user.id,
      a = { operation, billId };
    const input = abandon
      ? z
          .object({ reason: z.string().trim().min(3).max(500) })
          .strict()
          .parse(req.body)
      : null;
    const result = await locked(s, async (c) => {
      await find(c, s, "bill", billId);
      const prior = await own(
        c,
        s,
        "bill_change_operation",
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
            billId,
            operation,
            intent: prior.intent,
            createdAt: prior.createdAt,
          },
        };
      }
      let resolution = await own(
        c,
        s,
        "bill_change_resolution",
        requestKey,
        actorId,
      );
      if (resolution && !matches(resolution, a)) throw conflict();
      if (!resolution && input) {
        resolution = await record(c, s, "bill_change_resolution", {
          requestKey,
          actorId,
          billId,
          operation,
          status: "abandoned",
          reason: input.reason,
          createdAt: new Date().toISOString(),
        });
        await event(c, s, "bill_change_abandoned", req.user, {
          requestKey,
          billId,
          operation,
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
      billId,
      operation,
    });
  }
  router.get(path, guard("payments.record"), (req, res) =>
    resolve(req, res, false),
  );
  router.post(path + "/abandon", guard("payments.record"), (req, res) =>
    resolve(req, res, true),
  );
}
