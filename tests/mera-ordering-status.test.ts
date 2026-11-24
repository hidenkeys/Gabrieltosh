import test from "node:test";
import assert from "node:assert/strict";
import { orderingStatus } from "../src/mera/customer/orderingStatus";
const branch = {
  timezone: "Africa/Lagos",
  settings: {
    serviceHours: [
      { days: [0, 1, 2, 3, 4, 5, 6], start: "22:00", end: "23:59" },
      { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "05:00" },
    ],
  },
};
test("Pulse at 11am local is closed until tonight, while its after-midnight window is open", () => {
  assert.equal(
    orderingStatus(branch, new Date("2026-11-24T10:00:00Z")),
    "Closed now. Opens today at 22:00 (Africa/Lagos). You can still browse the menu.",
  );
  assert.match(
    orderingStatus(branch, new Date("2026-11-24T00:00:00Z")),
    /^Ordering is paused/,
  );
});
test("next opening follows local weekday across a week boundary", () => {
  assert.match(
    orderingStatus(
      {
        timezone: "Pacific/Auckland",
        settings: {
          serviceHours: [{ days: [1], start: "08:00", end: "09:00" }],
        },
      },
      new Date("2026-11-29T23:00:00Z"),
    ),
    /Opens Monday at 08:00/,
  );
});
