import { z } from "zod";
import { randomUUID } from "node:crypto";
const minutes = (n) => n * 60000;
const fail = (message) =>
  Object.assign(new Error(message), {
    status: 409,
    code: "RESERVATION_POLICY",
  });
export const reservationPolicySchema = z
  .object({
    approved: z.literal(true),
    enabled: z.boolean(),
    minimumLeadMinutes: z.number().int().min(0).max(10080),
    maximumAdvanceDays: z.number().int().min(1).max(365),
    bufferBeforeMinutes: z.number().int().min(0).max(180),
    bufferAfterMinutes: z.number().int().min(0).max(180),
    cancellationCutoffMinutes: z.number().int().min(0).max(10080).nullable(),
    lateAfterMinutes: z.number().int().min(0).max(1440).nullable(),
    refundHandling: z.literal("manual_review"),
    noShowHandling: z.literal("manual_review"),
  })
  .strict();
export function assertReservationWindow(input, branch, now = Date.now()) {
  const policy = branch.settings?.reservationPolicy;
  if (!policy?.enabled) return;
  if (!policy.approved)
    throw fail("Reservation timing policy requires explicit review.");
  const start = Date.parse(input.startsAt);
  if (start < now + minutes(policy.minimumLeadMinutes))
    throw fail("This booking is inside the minimum advance notice.");
  if (start > now + policy.maximumAdvanceDays * 86400000)
    throw fail("This booking is beyond the published booking window.");
}
export function reservationOverlaps(first, second, branch) {
  const p = branch.settings?.reservationPolicy,
    before = p?.enabled && p.approved ? minutes(p.bufferBeforeMinutes) : 0,
    after = p?.enabled && p.approved ? minutes(p.bufferAfterMinutes) : 0;
  return (
    Date.parse(first.startsAt) - before < Date.parse(second.endsAt) + after &&
    Date.parse(second.startsAt) - before < Date.parse(first.endsAt) + after
  );
}
export function cancellationNeedsReview(reservation, branch, now = Date.now()) {
  const p = branch.settings?.reservationPolicy;
  return (
    reservation.depositAmount > 0 ||
    (p?.enabled &&
      p.approved &&
      p.cancellationCutoffMinutes !== null &&
      Date.parse(reservation.startsAt) - now <
        minutes(p.cancellationCutoffMinutes))
  );
}
export function mountMeraReservationPolicy(
  router,
  { guard, scope, locked, event },
) {
  router.patch(
    "/organizations/:organizationId/branches/:branchId/reservation-policy",
    guard("organization.manage"),
    async (req, res) => {
      const input = reservationPolicySchema.parse(req.body);
      res.json(
        await locked(scope(req), async (c, b) => {
          const policy = {
            ...input,
          version: randomUUID(),
            reviewedBy: req.user.id,
            reviewedAt: new Date().toISOString(),
          };
          const settings = { ...b.settings, reservationPolicy: policy };
          await c.query(
            "UPDATE mera_branches SET settings=$1 WHERE id=$2 AND organization_id=$3",
            [JSON.stringify(settings), b.id, b.organization_id],
          );
          await event(c, scope(req), "reservation_policy_reviewed", req.user, {
            policy,
          });
          return policy;
        }),
      );
    },
  );
}
