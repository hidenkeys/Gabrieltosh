import { z } from "zod";
export const accessOperationSchema = z.enum([
  "membership_update",
  "role_create",
  "role_update",
  "invitation_create",
  "invitation_revoke",
]);
const schema = z
  .object({
    version: z.literal(1),
    actorId: z.string().min(1).max(100),
    organizationId: z.string().min(1).max(100),
    operation: accessOperationSchema,
    targetId: z.string().min(1).max(100).nullable(),
    requestKey: z.string().uuid(),
  })
  .strict()
  .refine((v) =>
    v.operation.endsWith("_create") ? v.targetId === null : v.targetId !== null,
  );
export type AccessOperationMarker = z.infer<typeof schema>;
const prefix = "mera:access-operation:v1:";
const key = (actor: string, org: string) =>
  prefix + encodeURIComponent(actor) + ":" + encodeURIComponent(org);
export function readAccessOperationMarker(
  actor: string,
  org: string,
): AccessOperationMarker | null {
  const raw = window.sessionStorage.getItem(key(actor, org));
  if (raw === null) return null;
  if (raw.length > 2048) throw Error("Saved access reference is invalid.");
  const value = schema.parse(JSON.parse(raw));
  if (value.actorId !== actor || value.organizationId !== org)
    throw Error(
      "Saved access reference belongs to another account or organization.",
    );
  return value;
}
export function hasAccessOperationMarker(actor: string, org: string) {
  try {
    return window.sessionStorage.getItem(key(actor, org)) !== null;
  } catch {
    return true;
  }
}
export function saveAccessOperationMarker(value: AccessOperationMarker) {
  const marker = schema.parse(value),
    old = readAccessOperationMarker(marker.actorId, marker.organizationId),
    raw = JSON.stringify(marker);
  if (old && JSON.stringify(old) !== raw)
    throw Error("Review the original access change first.");
  window.sessionStorage.setItem(
    key(marker.actorId, marker.organizationId),
    raw,
  );
  if (
    window.sessionStorage.getItem(
      key(marker.actorId, marker.organizationId),
    ) !== raw
  )
    throw Error("The recovery reference could not be saved.");
  window.dispatchEvent(new Event("mera:access-operation"));
  return marker;
}
export function clearAccessOperationMarker(value: AccessOperationMarker) {
  const old = readAccessOperationMarker(value.actorId, value.organizationId);
  if (!old || JSON.stringify(old) !== JSON.stringify(value))
    throw Error(
      "The original access reference changed. Review it before continuing.",
    );
  window.sessionStorage.removeItem(key(value.actorId, value.organizationId));
  if (
    window.sessionStorage.getItem(key(value.actorId, value.organizationId)) !==
    null
  )
    throw Error("The access reference could not be cleared.");
  window.dispatchEvent(new Event("mera:access-operation"));
}
