export const overviewText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;
const serviceStates = new Set(["submitted", "accepted", "preparing", "ready"]);
/** Display-only classification. Status writes still use the server's current version. */
export function serviceState(
  order: any,
  serverTime?: string,
): "active" | "expired" | "inactive" | "unavailable" {
  if (!order || typeof order !== "object" || typeof order.status !== "string")
    return "unavailable";
  if (
    ![
      "submitted",
      "accepted",
      "preparing",
      "ready",
      "collected",
      "completed",
      "cancelled",
      "rejected",
    ].includes(order.status)
  )
    return "unavailable";
  if (order.historicalReadOnly || !serviceStates.has(order.status))
    return "inactive";
  if (order.holdExpired || order.paymentStatus === "expired") return "expired";
  if (order.stockHeld === true) {
    const expiry = Date.parse(order.holdExpiresAt),
      clock = Date.parse(serverTime || "");
    if (!Number.isFinite(expiry) || !Number.isFinite(clock))
      return "unavailable";
    if (expiry <= clock) return "expired";
  }
  return "active";
}
export function overviewTime(value: unknown, timezone?: string) {
  const timestamp = Date.parse(typeof value === "string" ? value : "");
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  const date = new Date(timestamp);
  timezone =
    typeof timezone === "string" && timezone.trim() ? timezone : undefined;
  try {
    return (
      date.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone || "UTC",
      }) + ` · ${timezone || "UTC"}`
    );
  } catch {
    return (
      date.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }) + " · UTC (branch timezone unavailable)"
    );
  }
}
