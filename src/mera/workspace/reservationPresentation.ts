export const reservationInstant = (value: unknown): number =>
  typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
/** Matches current attention: confirmed/arrived records with unknown end times remain reviewable. */
export function reservationArrivalEligible(row: any, serverTime?: unknown) {
  if (!row || !["confirmed", "arrived"].includes(row.status)) return false;
  const clock = reservationInstant(serverTime),
    end = reservationInstant(row.endsAt);
  return !Number.isFinite(clock) || !Number.isFinite(end) || end >= clock;
}
export function reservationDate(value: unknown, timeZone?: string) {
  const instant = reservationInstant(value);
  if (!Number.isFinite(instant)) return "Time unavailable";
  if (timeZone) {
    try {
      return (
        new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        }).format(instant) +
        " · " +
        timeZone
      );
    } catch {
      /* Explicit fallback, not a branch-local claim. */
    }
  }
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(instant) + " · UTC (branch timezone unavailable)"
  );
}
export const reservationStatusLabel = (value: unknown) =>
  (
    ({
      requested: "Requested",
      confirmed: "Confirmed",
      arrived: "Arrived",
      seated: "Seated",
      completed: "Completed",
      cancelled: "Cancelled",
      "no-show": "No-show",
    }) as Record<string, string>
  )[String(value)] || "Status unavailable";
