import { z } from "zod";
const markerSchema = z
  .object({
    version: z.literal(1),
    actorId: z.string().min(1).max(100),
    base: z.string().regex(/^\/organizations\/[^/]+\/branches\/[^/]+$/),
    helpRequestId: z.string().min(1).max(100),
    requestKey: z.string().uuid(),
  })
  .strict();
export type HelpUpdateMarker = z.infer<typeof markerSchema>;
const prefix = "mera:help-update:v1:";
const key = (actorId: string, base: string) =>
  prefix + encodeURIComponent(actorId) + ":" + encodeURIComponent(base);
export function readHelpUpdateMarker(
  actorId: string,
  base: string,
): HelpUpdateMarker | null {
  const raw = window.sessionStorage.getItem(key(actorId, base));
  if (raw === null) return null;
  if (raw.length > 2048) throw Error("Saved request reference is invalid.");
  const value = markerSchema.parse(JSON.parse(raw));
  if (value.actorId !== actorId || value.base !== base)
    throw Error("Saved request belongs to another account or branch.");
  return value;
}
export function saveHelpUpdateMarker(marker: HelpUpdateMarker) {
  const value = markerSchema.parse(marker),
    raw = JSON.stringify(value),
    old = readHelpUpdateMarker(value.actorId, value.base);
  if (old && JSON.stringify(old) !== raw)
    throw Error("Review the previous help update first.");
  window.sessionStorage.setItem(key(value.actorId, value.base), raw);
  if (window.sessionStorage.getItem(key(value.actorId, value.base)) !== raw)
    throw Error(
      "This tab could not save a recovery reference. No update was sent.",
    );
  window.dispatchEvent(new Event("mera:help-recovery"));
  return value;
}
export function clearHelpUpdateMarker(marker: HelpUpdateMarker) {
  const old = readHelpUpdateMarker(marker.actorId, marker.base);
  if (
    !old ||
    old.requestKey !== marker.requestKey ||
    old.helpRequestId !== marker.helpRequestId
  )
    throw Error(
      "The saved update reference changed. Review it before continuing.",
    );
  window.sessionStorage.removeItem(key(marker.actorId, marker.base));
  if (window.sessionStorage.getItem(key(marker.actorId, marker.base)) !== null)
    throw Error(
      "The saved reference could not be cleared. Check the outcome again.",
    );
  window.dispatchEvent(new Event("mera:help-recovery"));
}
export function hasHelpUpdateMarkers(actorId: string) {
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
