import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003",
});
for (const key of ["window", "document", "HTMLElement", "Event", "MouseEvent"])
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = await import("react");
const { render, screen, fireEvent, waitFor, cleanup, act } =
  await import("@testing-library/react");
const { default: ReservationDesk } =
  await import("../src/mera/workspace/ReservationDesk");
const { reservationArrivalEligible } =
  await import("../src/mera/workspace/reservationPresentation");
const reservations = [
  {
    id: "private-past",
    displayName: "Past party",
    status: "confirmed",
    partySize: 2,
    startsAt: "2026-11-18T10:00:00Z",
    endsAt: "2026-11-18T12:00:00Z",
  },
  {
    id: "private-current",
    displayName: "Current party",
    status: "arrived",
    partySize: 4,
    startsAt: "2026-11-19T10:00:00Z",
    endsAt: "2026-11-19T14:00:00Z",
  },
  {
    id: "private-unknown",
    displayName: "Unknown time",
    status: "confirmed",
    startsAt: "bad",
    endsAt: "bad",
  },
  {
    id: "private-closed",
    displayName: "Closed party",
    status: "no-show",
    partySize: 1,
    startsAt: "2026-11-17T10:00:00Z",
    endsAt: "2026-11-17T12:00:00Z",
  },
];
const props = {
  reservations,
  serverTime: "2026-11-19T12:00:00Z",
  timeZone: "Africa/Lagos",
  renderRecord: (row: any) => (
    <label>
      {row.displayName} note
      <input defaultValue="" />
    </label>
  ),
};
test("arrival preset and name search hide rather than unmount reservation actions and drafts; clear returns all", () => {
  try {
    const { container } = render(
      <ReservationDesk {...props} initialQueue="arrivals" />,
    );
    assert.equal(container.querySelectorAll("article").length, 4);
    assert.equal(container.querySelectorAll("article:not([hidden])").length, 2);
    const note = screen.getByLabelText("Current party note");
    fireEvent.change(note, {
      target: { value: "Preserve pending party notes" },
    });
    fireEvent.change(screen.getByLabelText("Search reservation names"), {
      target: { value: "Closed" },
    });
    assert.ok(screen.getByText("No reservations match these filters."));
    assert.equal(container.querySelectorAll("article").length, 4);
    fireEvent.click(
      screen.getByRole("button", { name: "Clear reservation filters" }),
    );
    assert.equal(container.querySelectorAll("article:not([hidden])").length, 4);
    assert.equal(
      (screen.getByLabelText("Current party note") as HTMLInputElement).value,
      "Preserve pending party notes",
    );
    fireEvent.change(screen.getByLabelText("Search reservation names"), {
      target: { value: "private-current" },
    });
    assert.ok(screen.getByText("No reservations match these filters."));
    assert.ok(!screen.queryByText(/private-current/));
  } finally {
    cleanup();
  }
});
test("unknown clock and invalid end retain arrival reviewability without false freshness or timezone claims", () => {
  try {
    const { container } = render(
      <ReservationDesk
        {...props}
        serverTime={undefined}
        timeZone="Invalid/Zone"
        initialQueue="arrivals"
      />,
    );
    assert.ok(screen.getByText(/Arrival freshness is unavailable/));
    assert.equal(container.querySelectorAll("article:not([hidden])").length, 3);
    assert.ok(
      screen.getByText(
        "18 Nov 2026, 10:00 · UTC (branch timezone unavailable)",
      ),
    );
    assert.equal(screen.getAllByText("Time unavailable").length, 2);
    assert.equal(reservationArrivalEligible(reservations[0], undefined), true);
    assert.equal(
      reservationArrivalEligible(reservations[0], props.serverTime),
      false,
    );
    assert.equal(
      reservationArrivalEligible(reservations[2], props.serverTime),
      true,
    );
  } finally {
    cleanup();
  }
});
test("selected closed reservation preset is visible and filter change clears selection without losing records", () => {
  try {
    const { container, rerender } = render(
      <ReservationDesk
        {...props}
        initialQueue="arrivals"
        initialReservationId="private-closed"
      />,
    );
    assert.equal(container.querySelectorAll("article:not([hidden])").length, 1);
    assert.ok(screen.getByRole("heading", { name: "Closed party" }));
    assert.ok(screen.getByText("Showing the selected reservation."));
    fireEvent.click(screen.getByRole("button", { name: "Upcoming / arrived" }));
    assert.equal(container.querySelectorAll("article:not([hidden])").length, 2);
    assert.ok(!screen.queryByText("Showing the selected reservation."));
    rerender(
      <ReservationDesk
        {...props}
        initialQueue="all"
        initialReservationId="private-past"
      />,
    );
    assert.equal(container.querySelectorAll("article:not([hidden])").length, 2);
  } finally {
    cleanup();
  }
});
test("missing list is unavailable, confirmed empty is empty, malformed duplicate records do not masquerade as complete", () => {
  try {
    const { rerender, container } = render(
      <ReservationDesk renderRecord={() => null} />,
    );
    assert.ok(screen.getByRole("alert"));
    assert.ok(!screen.queryByText("No reservations in this branch."));
    rerender(
      <ReservationDesk
        reservations={[]}
        serverTime={props.serverTime}
        renderRecord={() => null}
      />,
    );
    assert.ok(screen.getByText("No reservations in this branch."));
    assert.ok(!screen.queryByRole("alert"));
    rerender(
      <ReservationDesk
        reservations={[
          null,
          { id: "same", partySize: -1 },
          { id: "same", displayName: "Duplicate" },
        ]}
        serverTime={props.serverTime}
        renderRecord={() => null}
      />,
    );
    assert.equal(container.querySelectorAll("article").length, 1);
    assert.ok(screen.getByText("Reservation name unavailable"));
    assert.ok(screen.getByText("Party size unavailable"));
    assert.ok(screen.getByText("Status unavailable"));
    assert.ok(screen.getByRole("alert"));
    assert.ok(!screen.queryByText("Duplicate"));
  } finally {
    cleanup();
  }
});
