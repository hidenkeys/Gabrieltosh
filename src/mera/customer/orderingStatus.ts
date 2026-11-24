/** Presentation only; the server remains authoritative for accepting orders. */
export function orderingStatus(branch: any, at = new Date()): string {
  const paused = "Ordering is paused. You can still browse the menu.";
  const windows = branch?.settings?.serviceHours;
  if (!Array.isArray(windows) || !windows.length) return paused;
  try {
    const timeZone = branch.timezone || "Africa/Lagos";
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(at).map((p) => [p.type, p.value]),
    );
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.weekday,
    );
    const time = `${parts.hour}:${parts.minute}`;
    if (
      windows.some(
        (w) => w.days.includes(day) && time >= w.start && time < w.end,
      )
    )
      return paused;
    for (let offset = 0; offset <= 7; offset++) {
      const next = windows
        .filter(
          (w) =>
            w.days.includes((day + offset) % 7) &&
            (offset > 0 || w.start > time),
        )
        .sort((a, b) => a.start.localeCompare(b.start))[0];
      if (next) {
        const when =
          offset === 0
            ? "today"
            : offset === 1
              ? "tomorrow"
              : [
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ][(day + offset) % 7];
        return `Closed now. Opens ${when} at ${next.start} (${timeZone}). You can still browse the menu.`;
      }
    }
    return "Closed now. You can still browse the menu.";
  } catch {
    return paused;
  }
}
