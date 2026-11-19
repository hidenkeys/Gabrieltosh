import { hasAccessOperationMarker } from "./accessOperationJournal";
type Marker = { kind: string; startedAt: string };
const memory = new Map<string, Marker>();
const keyFor = (actor: string, organization: string) =>
  "mera:access-write:" +
  encodeURIComponent(actor) +
  ":" +
  encodeURIComponent(organization);
function storage() {
  return window.sessionStorage;
}
/** An unavailable journal is an unresolved state, so callers must not dispatch. */
export function hasLegacyAccessWrite(
  actor: string,
  organization: string,
): boolean {
  const key = keyFor(actor, organization);
  try {
    const saved = storage().getItem(key);
    if (saved === null) {
      memory.delete(key);
      return false;
    }
    const marker = JSON.parse(saved);
    if (
      typeof marker?.kind !== "string" ||
      typeof marker.startedAt !== "string"
    )
      return true;
    memory.set(key, marker);
    return true;
  } catch {
    return true;
  }
}
export function hasAccessWrite(actor: string, organization: string): boolean {
  return (
    hasLegacyAccessWrite(actor, organization) ||
    hasAccessOperationMarker(actor, organization)
  );
}
export function beginAccessWrite(
  actor: string,
  organization: string,
  kind: string,
): boolean {
  if (!actor || !organization || hasAccessWrite(actor, organization))
    return false;
  const key = keyFor(actor, organization),
    marker: Marker = { kind, startedAt: new Date().toISOString() };
  try {
    const encoded = JSON.stringify(marker);
    storage().setItem(key, encoded);
    if (storage().getItem(key) !== encoded) return false;
    memory.set(key, marker);
    return true;
  } catch {
    return false;
  }
}
/** Invoke only for the response to this dispatched write, never for a refreshed list. */
export function finishAccessWrite(actor: string, organization: string): void {
  const key = keyFor(actor, organization);
  try {
    storage().removeItem(key);
    if (storage().getItem(key) === null) memory.delete(key);
  } catch {
    /* A failed removal remains paused. */
  }
}

export function hasAnyAccessWrite(actor: string): boolean {
  try {
    const prefixes = ["mera:access-write:", "mera:access-operation:v1:"].map(
      (prefix) => prefix + encodeURIComponent(actor) + ":",
    );
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && prefixes.some((prefix) => k.startsWith(prefix))) return true;
    }
    return false;
  } catch {
    return true;
  }
}
