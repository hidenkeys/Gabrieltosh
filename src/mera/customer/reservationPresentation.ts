// Labels describe server reservation state; they never infer acceptance or payment.
export function reservationStatusLabel(status: unknown): string {
  switch (status) {
    case "requested":
      return "Awaiting venue confirmation";
    case "confirmed":
      return "Reservation confirmed";
    case "seated":
      return "Seated";
    case "completed":
      return "Visit completed";
    case "cancelled":
    case "canceled":
      return "Reservation cancelled";
    case "no_show":
      return "Marked as not attended";
    case "declined":
      return "Reservation declined";
    default:
      return "Reservation status unavailable";
  }
}

export function reservationDateLabel(value: string, timeZone?: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  try {
    return (
      new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        ...(timeZone ? { timeZone } : {}),
      }).format(date) + ` (${timeZone || "your device’s time"})`
    );
  } catch {
    return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
  }
}
