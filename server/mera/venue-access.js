import { z } from "zod";
import {
  CAPABILITIES,
  VENUE_TYPES,
  LOCATION_COLORS,
  capabilitiesToLegacyModes,
  capabilitiesFromLegacyModes,
  effectiveCapabilities,
  LEGACY_MODE_TO_CAPABILITIES,
} from "../../shared/mera-venues.js";
import { hasCapability } from "../../shared/mera-venues.js";
import { rolePermissions } from "../../shared/mera-contracts.js";
import { fail } from "./domain.js";
export const locationFields = {
  venueType: z.enum(VENUE_TYPES).optional(),
  capabilities: z
    .array(z.enum(CAPABILITIES))
    .max(CAPABILITIES.length)
    .optional(),
  code: z
    .string()
    .regex(/^[A-Z0-9]{2,5}$/)
    .optional(),
  colorTag: z.enum(LOCATION_COLORS).optional(),
  area: z.string().trim().max(60).optional(),
  role: z.enum(["outlet", "stock_room"]).optional(),
  entryProductId: z.string().uuid().nullable().optional(),
};
export function locationSettings(input, previous = {}) {
  // Legacy controls own only the capabilities represented by their switches.
  const legacyOwned = new Set(Object.values(LEGACY_MODE_TO_CAPABILITIES).flat());
  const capabilities = input.capabilities ?? (input.serviceModes
    ? [...effectiveCapabilities(previous).filter(cap => !legacyOwned.has(cap)), ...capabilitiesFromLegacyModes(input.serviceModes)]
    : undefined);
  return {
    ...input,
    ...(capabilities
      ? { capabilities, serviceModes: capabilitiesToLegacyModes(capabilities) }
      : {}),
  };
}
const ROUND_THREE = new Set(["organization.overview","stock.transfer","stock.receive","door.manage","room_charge.post"]);
function basePermissions(member) {
  if (member.role === "owner") return rolePermissions.owner || member.permissions || [];
  const defaults = rolePermissions[member.role] || [];
  if (!Array.isArray(member.permissions) || !member.permissions.length) return defaults;
  // Stored permissions win; built-in roles also gain permissions introduced in round three.
  return [...new Set([...member.permissions, ...defaults.filter((p) => ROUND_THREE.has(p))])];
}
export function canSeeBranch(member, id) {
  return (
    !!member &&
    (Object.hasOwn(member.branch_roles || {}, id) ||
      member.organization_wide ||
      (member.branch_ids || []).includes(id))
  );
}
export function effectiveBranchAccess(member, id) {
  if (!member) return { permissions: [] };
  if (!id)
    return {
      ...member,
      permissions: basePermissions(member),
    };
  if (!canSeeBranch(member, id)) return { ...member, permissions: [] };
  const grant = member.branch_roles?.[id];
  return grant
    ? {
        ...member,
        role: grant.role,
        permissions: grant.permissions ?? rolePermissions[grant.role] ?? [],
      }
    : {
        ...member,
        permissions: basePermissions(member),
      };
}
export function assertCapability(branch, capability) {
  if (
    branch.settings?.role === "stock_room" ||
    !hasCapability(branch.settings, capability)
  )
    throw fail(
      `${{ table_service: "Table service", reservations: "Reservations", qr_ordering: "QR ordering", open_tabs: "Open tabs", minimum_spend: "Minimum spend", deposits: "Deposits", guest_list: "Guest list", room_charge: "Room charges" }[capability] || "This service"} is turned off for this location.`,
      409,
      "CAPABILITY_OFF",
    );
}
export function assertBranchFeature(branch, key) {
  if (branch.settings?.platformFlags?.flags?.[key] === false)
    throw fail(
      "New requests for this service are temporarily unavailable.",
      409,
      "FEATURE_DISABLED",
    );
}
