type ServiceWindow = { days: number[]; start: string; end: string };
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** Device-local preferred start times, guided by branch-local service windows.
 * This is not a capacity, reservation-policy or booking-availability decision. */
export function serviceHourSuggestions(
  day: string,
  windows: unknown,
  timeZone: unknown,
): { configured: boolean; times: string[] } {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(day + "T12:00:00Z")) ||
    new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day ||
    typeof timeZone !== "string" ||
    !Array.isArray(windows) ||
    !windows.length ||
    !windows.every(
      (window) =>
        window &&
        typeof window === "object" &&
        Array.isArray(window.days) &&
        window.days.length > 0 &&
        window.days.every(
          (d: unknown) =>
            Number.isInteger(d) && Number(d) >= 0 && Number(d) <= 6,
        ) &&
        typeof window.start === "string" &&
        typeof window.end === "string" &&
        clock.test(window.start) &&
        clock.test(window.end) &&
        window.start < window.end,
    )
  )
    return { configured: false, times: [] };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return { configured: false, times: [] };
  }
  const times: string[] = [];
  for (let minute = 0; minute < 1440; minute += 30) {
    const hour = Math.floor(minute / 60),
      part = minute % 60,
      time =
        String(hour).padStart(2, "0") + ":" + String(part).padStart(2, "0");
    const instant = new Date(day + "T" + time);
    if (
      !Number.isFinite(instant.getTime()) ||
      instant.getHours() !== hour ||
      instant.getMinutes() !== part
    )
      continue;
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    const branchDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        parts.weekday,
      ),
      branchTime = parts.hour + ":" + parts.minute;
    if (
      (windows as ServiceWindow[]).some(
        (window) =>
          window.days.includes(branchDay) &&
          branchTime >= window.start &&
          branchTime < window.end,
      )
    )
      times.push(time);
  }
  return { configured: true, times };
}
