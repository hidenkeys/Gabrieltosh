import test from "node:test";
import assert from "node:assert/strict";
import { serviceHourSuggestions } from "../src/mera/customer/serviceHourSuggestions";
function deviceUTC(run: () => void) {
  const old = process.env.TZ;
  process.env.TZ = "UTC";
  try {
    run();
  } finally {
    if (old === undefined) delete process.env.TZ;
    else process.env.TZ = old;
  }
}
test("service-hour suggestions convert device date into branch weekday and clock across midnight", () =>
  deviceUTC(() => {
    // Wednesday00:00UTC is Tuesday14:00Honolulu, not Wednesday service hours.
    const result = serviceHourSuggestions(
      "2030-01-02",
      [{ days: [2], start: "14:00", end: "16:00" }],
      "Pacific/Honolulu",
    );
    assert.deepEqual(result, {
      configured: true,
      times: ["00:00", "00:30", "01:00", "01:30"],
    });
  }));
test("closed weekday has no suggestions and split windows retain only actual start/end-exclusive periods", () =>
  deviceUTC(() => {
    assert.deepEqual(
      serviceHourSuggestions(
        "2030-01-02",
        [{ days: [1], start: "09:00", end: "12:00" }],
        "UTC",
      ),
      { configured: true, times: [] },
    );
    assert.deepEqual(
      serviceHourSuggestions(
        "2030-01-02",
        [
          { days: [3], start: "09:00", end: "10:00" },
          { days: [3], start: "17:00", end: "18:00" },
        ],
        "UTC",
      ).times,
      ["09:00", "09:30", "17:00", "17:30"],
    );
  }));
for (const [day, hours, zone] of [
  ["2030-02-30", [{ days: [3], start: "09:00", end: "12:00" }], "UTC"],
  ["2030-01-02", [], "UTC"],
  ["2030-01-02", [{ days: [3], start: "25:00", end: "26:00" }], "UTC"],
  ["2030-01-02", [{ days: [3], start: "09:00", end: "12:00" }], "Unknown/Zone"],
] as const)
  test("missing or malformed schedule never invents service-hour guidance", () => {
    assert.deepEqual(serviceHourSuggestions(day, hours, zone), {
      configured: false,
      times: [],
    });
  });
