import { z } from "zod";
import { fail } from "./domain.js";
import { projectStaffOrder } from "./projection.js";

export async function assertOrderRequestActive(c, s, requestKey, actorType, actorId) {
  const resolution = (await c.query(
    "SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='order_request_resolution' AND data->>'requestKey'=$3 AND data->>'actorType'=$4 AND data->>'actorId'=$5 AND data->>'status'='abandoned' LIMIT 1",
    [s.organizationId, s.branchId, requestKey, actorType, actorId],
  )).rows[0];
  if (resolution) throw fail("This order request was safely abandoned. Review your order before starting a new request.", 409, "ORDER_REQUEST_ABANDONED");
}

export function mountMeraOrderAttempts(router, { guard, scope, locked, record, event, publicContext, guest, publicOrder }) {
  const B = "/organizations/:organizationId/branches/:branchId/order-attempts/:requestKey";
  const P = "/public/:slug/:branchId/order-attempts/:requestKey";
  async function resolve(req, res, actorType, abandon) {
    res.set("Cache-Control", "no-store");
    const requestKey = z.string().uuid().parse(req.params.requestKey);
    const input = abandon ? z.object({ reason: z.string().trim().min(3).max(500) }).strict().parse(req.body) : null;
    const s = actorType === "guest" ? (await publicContext(req)).s : scope(req);
    const actor = actorType === "guest" ? await guest(req, s.organizationId) : req.user;
    const result = await locked(s, async (c) => {
      const column = actorType === "guest" ? "guestId" : "staffCreatorId";
      const own = (await c.query(
        `SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='order' AND data->>'requestKey'=$3 AND data->>'${column}'=$4 AND data->>'source'=$5 LIMIT 1`,
        [s.organizationId, s.branchId, requestKey, actor.id, actorType === "guest" ? "customer_qr" : "staff"],
      )).rows[0]?.data;
      if (own) return { status: "recorded", order: actorType === "guest" ? publicOrder(own) : projectStaffOrder(own, req.meraMembership.permissions) };
      let resolution = (await c.query(
        "SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='order_request_resolution' AND data->>'requestKey'=$3 AND data->>'actorType'=$4 AND data->>'actorId'=$5 LIMIT 1",
        [s.organizationId, s.branchId, requestKey, actorType, actor.id],
      )).rows[0];
      if (!resolution && input) {
        resolution = await record(c, s, "order_request_resolution", { requestKey, actorType, actorId: actor.id, status: "abandoned", reason: input.reason, createdAt: new Date().toISOString() });
        await event(c, s, "order_request_abandoned", actorType === "staff" ? actor : null, { requestKey, actorType, actorId: actor.id, resolutionId: resolution.id, reason: input.reason });
      }
      return resolution ? { status: "abandoned", resolutionId: resolution.id } : { status: "not_found" };
    });
    res.json(result);
  }
  router.get(B, guard("orders.create"), (req, res) => resolve(req, res, "staff", false));
  router.post(B + "/abandon", guard("orders.create"), (req, res) => resolve(req, res, "staff", true));
  router.get(P, (req, res) => resolve(req, res, "guest", false));
  router.post(P + "/abandon", (req, res) => resolve(req, res, "guest", true));
}
