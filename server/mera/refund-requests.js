import { z } from "zod";
const B = "/organizations/:organizationId/branches/:branchId";
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status, code: "REFUND_REQUEST_REVIEW" });
export async function reviewRefundRequest(
  client,
  services,
  scope,
  input,
  order,
  actorId,
) {
  if (!input.refundRequestId) return null;
  const request = await services.find(
    client,
    scope,
    "refund_request",
    input.refundRequestId,
  );
  if (
    request.status !== "pending" ||
    request.orderId !== order.id ||
    request.amount !== input.amount
  )
    throw fail(
      "This refund request changed or no longer matches the return being recorded.",
    );
  if (request.requestedBy === actorId)
    throw fail("Another authorized approver must review this request.", 403);
  return request;
}
export async function completeRefundRequest(
  client,
  services,
  scope,
  request,
  refund,
  actor,
) {
  if (!request) return;
  const result = {
    ...request,
    status: "recorded",
    version: request.version + 1,
    refundId: refund.id,
    approvedBy: actor.id,
    resolvedAt: new Date().toISOString(),
  };
  await services.update(client, scope, "refund_request", request.id, result);
  await services.event(client, scope, "refund_request_recorded", actor, {
    requestId: request.id,
    refundId: refund.id,
    amount: refund.amount,
  });
}
export function mountMeraRefundRequests(router, services) {
  const { db, guard, scope, locked, readRecords, find, record, update, event } =
    services;
  router.get(B + "/refund-requests", guard("orders.view"), async (req, res) => {
    const s = scope(req),
      access = req.meraMembership?.permissions || [];
    const records = (
      await db.query(
        "SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='refund_request' AND ($3::boolean OR data->>'requestedBy'=$4) ORDER BY (data->>'status'='pending') DESC,data->>'createdAt' DESC,id DESC LIMIT 100",
        [
          s.organizationId,
          s.branchId,
          access.includes("refunds.approve"),
          req.user.id,
        ],
      )
    ).rows;
    res
      .set("Cache-Control", "no-store")
      .json({ requests: records.map((r) => r.data) });
  });
  router.post(
    B + "/orders/:id/refund-requests",
    guard("refunds.request"),
    async (req, res) => {
      const input = z
          .object({
            requestKey: z.string().uuid(),
            amount: z.number().int().safe().positive().max(100000000000),
            reason: z.string().trim().min(10).max(500),
          })
          .strict()
          .parse(req.body),
        s = scope(req),
        orderId = z.string().uuid().parse(req.params.id);
      res.json(
        await locked(s, async (c) => {
          const previous = (await c.query(
            "SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='refund_request' AND data->>'requestKey'=$3 LIMIT 1",
            [s.organizationId,s.branchId,input.requestKey],
          )).rows[0]?.data;
          if (previous) {
            if (
              previous.orderId !== orderId ||
              previous.requestedBy !== req.user.id ||
              previous.amount !== input.amount ||
              previous.reason !== input.reason
            )
              throw fail("This key belongs to a different refund request.");
            return previous;
          }
          const order = await find(c, s, "order", orderId);
          if (
            order.historicalReadOnly ||
            input.amount >
              Math.max(0, (order.paid || 0) - (order.refunded || 0))
          )
            throw fail("Review the order’s remaining refundable amount.");
          const request = await record(c, s, "refund_request", {
            ...input,
            orderId,
            status: "pending",
            version: 1,
            requestedBy: req.user.id,
            requestedByName: req.user.name,
            createdAt: new Date().toISOString(),
          });
          await event(c, s, "refund_requested", req.user, {
            requestId: request.id,
            orderId,
            amount: input.amount,
            reason: input.reason,
          });
          return request;
        }),
      );
    },
  );
  router.post(
    B + "/refund-requests/:id/reject",
    guard("refunds.approve"),
    async (req, res) => {
      const input = z
          .object({
            version: z.number().int().positive(),
            reason: z.string().trim().min(10).max(500),
          })
          .strict()
          .parse(req.body),
        s = scope(req);
      res.json(
        await locked(s, async (c) => {
          const request = await find(
            c,
            s,
            "refund_request",
            z.string().uuid().parse(req.params.id),
          );
          if (request.status !== "pending" || request.version !== input.version)
            throw fail(
              "This refund request changed. Refresh before reviewing it.",
            );
          if (request.requestedBy === req.user.id)
            throw fail(
              "Another authorized approver must review this request.",
              403,
            );
          const result = {
            ...request,
            status: "rejected",
            version: request.version + 1,
            resolutionReason: input.reason,
            approvedBy: req.user.id,
            resolvedAt: new Date().toISOString(),
          };
          await update(c, s, "refund_request", request.id, result);
          await event(c, s, "refund_request_rejected", req.user, {
            requestId: request.id,
            reason: input.reason,
          });
          return result;
        }),
      );
    },
  );
}
