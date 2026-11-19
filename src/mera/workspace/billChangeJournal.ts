import { z } from "zod";
const markerSchema = z
  .object({
    version: z.literal(1),
    actorId: z.string().min(1).max(100),
    base: z.string().regex(/^\/organizations\/[^/]+\/branches\/[^/]+$/),
    billId: z.string().min(1).max(100),
    operation: z.enum(["split", "merge"]),
    requestKey: z.string().uuid(),
  })
  .strict();
export type BillChangeMarker = z.infer<typeof markerSchema>;
const prefix = "mera:bill-change:v1:";
const key = (actorId: string, base: string) =>
  prefix + encodeURIComponent(actorId) + ":" + encodeURIComponent(base);
export function readBillChangeMarker(
  actorId: string,
  base: string,
): BillChangeMarker | null {
  const raw = window.sessionStorage.getItem(key(actorId, base));
  if (raw === null) return null;
  if (raw.length > 2048) throw Error("Saved request reference is invalid.");
  const value = markerSchema.parse(JSON.parse(raw));
  if (value.actorId !== actorId || value.base !== base)
    throw Error("Saved request belongs to another account or branch.");
  return value;
}
export function saveBillChangeMarker(marker: BillChangeMarker) {
  const value = markerSchema.parse(marker),
    raw = JSON.stringify(value),
    old = readBillChangeMarker(value.actorId, value.base);
  if (old && JSON.stringify(old) !== raw)
    throw Error("Review the previous bill change first.");
  window.sessionStorage.setItem(key(value.actorId, value.base), raw);
  if (window.sessionStorage.getItem(key(value.actorId, value.base)) !== raw)
    throw Error(
      "This tab could not save a recovery reference. No update was sent.",
    );
  window.dispatchEvent(new Event("mera:bill-recovery"));
  return value;
}
export function clearBillChangeMarker(marker: BillChangeMarker) {
  const old = readBillChangeMarker(marker.actorId, marker.base);
  if (
    !old ||
    old.requestKey !== marker.requestKey ||
    old.billId !== marker.billId ||
    old.operation !== marker.operation
  )
    throw Error(
      "The saved update reference changed. Review it before continuing.",
    );
  window.sessionStorage.removeItem(key(marker.actorId, marker.base));
  if (window.sessionStorage.getItem(key(marker.actorId, marker.base)) !== null)
    throw Error(
      "The saved reference could not be cleared. Check the outcome again.",
    );
  window.dispatchEvent(new Event("mera:bill-recovery"));
}
export function hasBillChangeMarkers(actorId: string) {
  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(prefix + encodeURIComponent(actorId) + ":"))
        return true;
    }
    return false;
  } catch {
    return true;
  }
}
