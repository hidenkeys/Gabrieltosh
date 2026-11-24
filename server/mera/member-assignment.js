import { z } from "zod";
import { permissions } from "../../shared/mera-contracts.js";
import { resolveRole } from "./roles.js";
import { fail } from "./domain.js";
const uuid = z.string().uuid();
export const memberUpdateSchema = z.union([
  z.object({ active: z.boolean(), requestKey: uuid.optional() }).strict(),
  z
    .object({
      requestKey: uuid,
      version: z.number().int().positive(),
      role: z.string().min(1).max(100),
      branchIds: z
        .array(uuid)
        .max(100)
        .transform((v) => [...new Set(v)].sort()),
      organizationWide: z.boolean(),
      branch_roles: z.record(
        uuid,
        z
          .object({
            role: z.string().min(1).max(100),
            permissions: z.array(z.enum(permissions)).optional(),
          })
          .strict(),
      ),
    })
    .strict(),
]);
export async function validateMemberAssignment(c, req, input) {
  const org = req.params.organizationId,
    actor = req.meraMembership;
  const ids = (
    await c.query("SELECT id FROM mera_branches WHERE organization_id=$1", [
      org,
    ])
  ).rows.map((b) => b.id);
  if (
    [...input.branchIds, ...Object.keys(input.branch_roles)].some(
      (id) => !ids.includes(id),
    )
  )
    throw fail("Invalid branch scope.", 403);
  async function grant(role, requested) {
    const resolved = await resolveRole(c, org, role),
      values = requested || resolved.permissions;
    if (
      (role === "owner" && actor.role !== "owner") ||
      values.some(
        (p) =>
          !resolved.permissions.includes(p) || !actor.permissions.includes(p),
      )
    )
      throw fail("Cannot grant privileges beyond your authority.", 403);
    return [...new Set(values)].sort();
  }
  const base = await grant(input.role),
    branchRoles = {};
  for (const [id, value] of Object.entries(input.branch_roles))
    branchRoles[id] = {
      role: value.role,
      permissions: await grant(value.role, value.permissions),
    };
  return { permissions: base, branchRoles };
}
