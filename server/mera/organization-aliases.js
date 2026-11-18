import { readFile } from "node:fs/promises";
import { z } from "zod";
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status, code: "SLUG_CLAIM_CONFLICT" });
export const organizationSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(50)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
  .refine(
    (slug) =>
      ![
        "www",
        "app",
        "admin",
        "api",
        "support",
        "billing",
        "mera",
        "platform",
        "mail",
        "cdn",
        "status",
      ].includes(slug),
    "That subdomain is reserved.",
  );
export async function migrateMeraAliases(db) {
  await db.query(
    await readFile(new URL("./aliases-schema.sql", import.meta.url), "utf8"),
  );
}
export async function claimOrganizationSlug(client, organizationId, value) {
  const slug = organizationSlugSchema.parse(value);
  const canonical = (
    await client.query("SELECT id FROM mera_organizations WHERE slug=$1", [
      slug,
    ])
  ).rows[0];
  if (canonical && canonical.id !== organizationId)
    throw fail("That organization address is already claimed.");
  await client.query(
    "INSERT INTO mera_slug_claims(slug,organization_id) VALUES($1,$2) ON CONFLICT(slug) DO NOTHING",
    [slug, organizationId],
  );
  const claim = (
    await client.query(
      "SELECT organization_id FROM mera_slug_claims WHERE slug=$1 FOR UPDATE",
      [slug],
    )
  ).rows[0];
  if (!claim || claim.organization_id !== organizationId)
    throw fail(
      "That organization address is permanently reserved for another organization.",
    );
  return slug;
}
export async function resolveOrganizationSlug(db, value) {
  const parsed = organizationSlugSchema.safeParse(value);
  if (!parsed.success) return null;
  return (
    (
      await db.query(
        "SELECT o.* FROM mera_organizations o WHERE o.id=(SELECT organization_id FROM mera_slug_claims WHERE slug=$1) OR (o.slug=$1 AND NOT EXISTS(SELECT 1 FROM mera_slug_claims WHERE slug=$1)) LIMIT 1",
        [parsed.data],
      )
    ).rows[0] || null
  );
}
export function mountMeraOrganizationAliases(
  router,
  { db, platformGuard, platformAudit },
) {
  router.post(
    "/platform/organizations/:organizationId/rename",
    platformGuard,
    async (req, res) => {
      const input = z
          .object({
            expectedSlug: organizationSlugSchema,
            newSlug: organizationSlugSchema,
            reason: z.string().trim().min(10).max(500),
          })
          .strict()
          .parse(req.body),
        id = z.string().uuid().parse(req.params.organizationId);
      res.json(
        await db.transaction(async (client) => {
          const organization = (
            await client.query(
              "SELECT id,name,slug FROM mera_organizations WHERE id=$1 FOR UPDATE",
              [id],
            )
          ).rows[0];
          if (!organization) throw fail("Organization not found.", 404);
          if (organization.slug !== input.expectedSlug)
            throw fail(
              "The organization address changed. Refresh before renaming.",
            );
          await claimOrganizationSlug(client, id, organization.slug);
          await claimOrganizationSlug(client, id, input.newSlug);
          if (input.newSlug !== organization.slug) {
            await client.query(
              "UPDATE mera_organizations SET slug=$1 WHERE id=$2",
              [input.newSlug, id],
            );
            await platformAudit(client, req, "organization_slug_renamed", id, {
              previousSlug: organization.slug,
              newSlug: input.newSlug,
              reason: input.reason,
              oldAliasPreserved: true,
            });
          }
          return {
            id: organization.id,
            name: organization.name,
            slug: input.newSlug,
            previousSlug: organization.slug,
          };
        }),
      );
    },
  );
}
