import { z } from "zod";
import { fail } from "./domain.js";
import { publicMinimumSpend } from "./minimum-spend.js";

export async function assertReservationRequestActive(c, s, requestKey, guestId) {
  const resolution = (await c.query(
    "SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='reservation_request_resolution' AND data->>'requestKey'=$3 AND data->>'guestId'=$4 AND data->>'status'='abandoned' LIMIT 1",
    [s.organizationId, s.branchId, requestKey, guestId],
  )).rows[0];
  if (resolution) throw fail("This reservation request was safely abandoned. Review a new booking before submitting again.", 409, "RESERVATION_REQUEST_ABANDONED");
}
export function publicReservationAttempt(r) {
  return {
    id: r.id, displayName: r.displayName, partySize: r.partySize,
    startsAt: r.startsAt, endsAt: r.endsAt, status: r.status,
    depositAmount: r.depositAmount || 0,
    depositGrossCollected: r.depositGrossCollected ?? r.depositAmount ?? 0,
    depositReturned: r.depositReturned || 0, depositForfeited: r.depositForfeited || 0,
    depositDisposition: r.depositDisposition || null, depositRequired: r.depositRequired || 0,
    cancellationRequestedAt: r.cancellationRequestedAt || null, createdAt: r.createdAt,
    minimumSpendPolicy: publicMinimumSpend(r.minimumSpendPolicy),
    tableId: r.tableId || null, visitId: r.visitId || null,
  };
}
export function mountMeraReservationAttempts(router, { publicContext, guest, locked, record, event }) {
  const P = "/public/:slug/:branchId/reservation-attempts/:requestKey";
  async function resolve(req, res, abandon) {
    res.set("Cache-Control", "no-store");
    const requestKey = z.string().uuid().parse(req.params.requestKey);
    const input = abandon ? z.object({ reason: z.string().trim().min(3).max(500) }).strict().parse(req.body) : null;
    const { s } = await publicContext(req), g = await guest(req, s.organizationId);
    const result = await locked(s, async c => {
      const own = (await c.query(
        "SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='reservation' AND data->>'requestKey'=$3 AND data->>'guestId'=$4 LIMIT 1",
        [s.organizationId, s.branchId, requestKey, g.id],
      )).rows[0]?.data;
      if (own) return { status: "recorded", reservation: publicReservationAttempt(own) };
      let resolution = (await c.query(
        "SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='reservation_request_resolution' AND data->>'requestKey'=$3 AND data->>'guestId'=$4 LIMIT 1",
        [s.organizationId, s.branchId, requestKey, g.id],
      )).rows[0];
      if (!resolution && input) {
        resolution = await record(c, s, "reservation_request_resolution", { requestKey, guestId: g.id, actorType: "guest", actorId: g.id, status: "abandoned", reason: input.reason, createdAt: new Date().toISOString() });
        await event(c, s, "reservation_request_abandoned", null, { requestKey, guestId: g.id, resolutionId: resolution.id, reason: input.reason });
      }
      return resolution ? { status: "abandoned", resolutionId: resolution.id } : { status: "not_found" };
    });
    res.json({ ...result, sessionRef: g.id, organizationId: s.organizationId, branchId: s.branchId });
  }
  router.get(P, (req, res) => resolve(req, res, false));
  router.post(P + "/abandon", (req, res) => resolve(req, res, true));
}
