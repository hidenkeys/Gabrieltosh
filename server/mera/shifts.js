import { z } from "zod";
const fail = (message) => Object.assign(new Error(message), { status: 409 });
export function mountMeraShifts(
  router,
  { db, guard, scope, locked, find, update, event },
) {
  const B = "/organizations/:organizationId/branches/:branchId";
  router.get(B + "/shift-staff", guard("shifts.manage"), async (req, res) => {
    const s = scope(req);
    const members = (
      await db.query(
        "SELECT m.*,u.name FROM mera_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.active=true AND u.active=true",
        [s.organizationId],
      )
    ).rows;
    res.json(
      members
        .filter(
          (m) =>
            m.permissions.includes("shifts.manage") &&
            (m.organization_wide || m.branch_ids.includes(s.branchId)),
        )
        .map((m) => ({ userId: m.user_id, name: m.name })),
    );
  });
  router.post(
    B + "/shifts/:id/approve",
    guard("organization.manage"),
    async (req, res) => {
      const { reason } = z
        .object({ reason: z.string().trim().min(3).max(500) })
        .strict()
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const shift = await find(c, scope(req), "shift", req.params.id);
          if (shift.status !== "pending_approval")
            throw fail(
              "Only a shift awaiting variance review can be approved.",
            );
          shift.status = "closed";
          shift.approvedBy = req.user.id;
          shift.approvalReason = reason;
          shift.approvedAt = new Date().toISOString();
          await update(c, scope(req), "shift", shift.id, shift);
          await event(c, scope(req), "shift_variance_approved", req.user, {
            shiftId: shift.id,
            variance: shift.variance,
            reason,
          });
          return shift;
        }),
      );
    },
  );
  router.post(
    B + "/shifts/:id/handover",
    guard("shifts.manage"),
    async (req, res) => {
      const input = z
        .object({
          requestKey: z.string().uuid(),
          toUserId: z.string().uuid(),
          reason: z.string().trim().min(3).max(500),
        })
        .strict()
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const s = scope(req),
            shift = await find(c, s, "shift", req.params.id),
            prior = shift.handovers?.find(
              (h) => h.requestKey === input.requestKey,
            );
          if (prior) {
            if (
              prior.toUserId !== input.toUserId ||
              prior.reason !== input.reason ||
              prior.actorId !== req.user.id
            )
              throw fail("This key records a different shift handover.");
            return shift;
          }
          if (shift.status !== "open")
            throw fail("Only an open shift can be handed over.");
          const target = (
            await c.query(
              "SELECT m.* FROM mera_memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.organization_id=$2 AND m.active=true AND u.active=true",
              [input.toUserId, s.organizationId],
            )
          ).rows[0];
          if (
            !target ||
            !target.permissions.includes("shifts.manage") ||
            (!target.organization_wide &&
              !target.branch_ids.includes(s.branchId))
          )
            throw fail(
              "Choose an active staff member authorized for shifts at this branch.",
            );
          const fromUserId = shift.handlerId || shift.openedBy;
          if (fromUserId === input.toUserId)
            throw fail("This staff member already holds the shift.");
          shift.handlerId = input.toUserId;
          shift.handovers = [
            ...(shift.handovers || []),
            {
              ...input,
              fromUserId,
              actorId: req.user.id,
              at: new Date().toISOString(),
            },
          ];
          await update(c, s, "shift", shift.id, shift);
          await event(c, s, "shift_handed_over", req.user, {
            shiftId: shift.id,
            fromUserId,
            toUserId: input.toUserId,
            reason: input.reason,
          });
          return shift;
        }),
      );
    },
  );
}
