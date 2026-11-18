import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
export function mountMeraVisitAccess(
  router,
  { guard, scope, locked, find, update, event },
) {
  router.post(
    "/organizations/:organizationId/branches/:branchId/visits/:id/joining-code",
    guard("tables.manage"),
    async (req, res) => {
      const { version, reason } = z
        .object({
          version: z.number().int().positive(),
          reason: z.string().trim().min(3).max(300),
        })
        .strict()
        .parse(req.body);
      const result = await locked(scope(req), async (c) => {
        const visit = await find(
          c,
          scope(req),
          "visit",
          z.string().uuid().parse(req.params.id),
        );
        if (visit.status !== "open")
          throw Object.assign(
            new Error(
              "Only a current open visit can receive a new joining code.",
            ),
            { status: 409, code: "VISIT_CLOSED" },
          );
        if ((visit.version || 1) !== version)
          throw Object.assign(
            new Error(
              "The visit changed. Refresh before generating another private code.",
            ),
            { status: 409, code: "STALE_VERSION" },
          );
        const code = randomBytes(5).toString("hex").toUpperCase();
        visit.joiningCodeHash = createHash("sha256").update(code).digest("hex");
        visit.version = (visit.version || 1) + 1;
        await update(c, scope(req), "visit", visit.id, visit);
        await event(c, scope(req), "visit_joining_code_rotated", req.user, {
          visitId: visit.id,
          reason,
          existingGuestSessionsRetained: true,
        });
        return {
          visitId: visit.id,
          version: visit.version,
          joiningCode: code,
          existingGuestSessionsRetained: true,
        };
      });
      res.set("Cache-Control", "no-store").json(result);
    },
  );
}
