import { z } from "zod";
const keys = [
  "customer_ordering",
  "new_reservations",
  "new_table_visits",
  "zidi",
];
export function organizationFeatures(organization) {
  const value = organization?.platform_flags || {};
  return {
    version: value.version || 1,
    flags: Object.fromEntries(
      keys.map((key) => [key, value.flags?.[key] !== false]),
    ),
    existingServiceContinues: true,
  };
}
export function assertOrganizationFeature(organization, key) {
  if (!keys.includes(key)) throw new Error("Unknown organization feature.");
  if (!organizationFeatures(organization).flags[key])
    throw Object.assign(
      new Error(
        "New requests for this service are temporarily unavailable. Existing service and permitted exports remain available.",
      ),
      { status: 409, code: "FEATURE_DISABLED" },
    );
}
export function mountMeraFeatureFlags(
  router,
  { db, platformGuard, platformAudit },
) {
  router.patch(
    "/platform/organizations/:organizationId/feature-flags",
    platformGuard,
    async (req, res) => {
      const input = z
          .object({
            version: z.number().int().positive(),
            flags: z
              .object(
                Object.fromEntries(
                  keys.map((key) => [key, z.boolean().optional()]),
                ),
              )
              .strict()
              .refine((v) => Object.keys(v).length > 0),
            reason: z.string().trim().min(10).max(500),
          })
          .strict()
          .parse(req.body),
        orgId = z.string().uuid().parse(req.params.organizationId);
      res.json(
        await db.transaction(async (c) => {
          const org = (
            await c.query(
              "SELECT platform_flags FROM mera_organizations WHERE id=$1 FOR UPDATE",
              [orgId],
            )
          ).rows[0];
          if (!org)
            throw Object.assign(new Error("Organization not found."), {
              status: 404,
            });
          const old = organizationFeatures(org);
          if (old.version !== input.version)
            throw Object.assign(
              new Error(
                "Feature controls changed. Review their current version.",
              ),
              { status: 409, code: "STALE_VERSION" },
            );
          const value = {
            version: old.version + 1,
            flags: { ...old.flags, ...input.flags },
            changedAt: new Date().toISOString(),
            changedBy: req.user.id,
          };
          await c.query(
            "UPDATE mera_organizations SET platform_flags=$1 WHERE id=$2",
            [JSON.stringify(value), orgId],
          );
          await platformAudit(c, req, "organization_features_changed", orgId, {
            reason: input.reason,
            from: old.flags,
            to: value.flags,
            existingServiceContinues: true,
          });
          return {
            ...organizationFeatures({ platform_flags: value }),
            liveMoneyEnabled: false,
          };
        }),
      );
    },
  );
}
