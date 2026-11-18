import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>");
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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: OverviewActivity } =
  await import("../src/mera/workspace/OverviewActivity");
test("O2 activity hides all protected data without explicit permission", () => {
  try {
    const { container } = render(
      <OverviewActivity
        audit={[{ actorName: "Private actor" }]}
        shifts={[{ status: "open" }]}
        canViewAudit={false}
        canViewShifts={false}
        allowedDestinations={["shifts"]}
        onNavigate={() => {}}
      />,
    );
    assert.equal(container.textContent, "");
  } finally {
    cleanup();
  }
});
test("O2 unavailable data differs from an actually empty shift and activity snapshot", () => {
  try {
    const { rerender } = render(
      <OverviewActivity
        canViewAudit
        canViewShifts
        allowedDestinations={[]}
        onNavigate={() => {}}
      />,
    );
    assert(screen.getByText("Shift status unavailable."));
    assert(screen.getByText("Activity unavailable."));
    assert.equal(screen.queryByText("No open shifts."), null);
    rerender(
      <OverviewActivity
        audit={[]}
        shifts={[]}
        canViewAudit
        canViewShifts
        allowedDestinations={[]}
        onNavigate={() => {}}
      />,
    );
    assert(screen.getByText("No open shifts."));
    assert(screen.getByText("No recent branch activity."));
  } finally {
    cleanup();
  }
});
test("O2 labels real events and staff without rendering private details or raw IDs", () => {
  const calls: string[] = [];
  const id = "00000001-0000-4000-8000-000000000001";
  try {
    render(
      <OverviewActivity
        audit={[
          {
            id: "event1",
            action: "visit_opened",
            actorName: "Ada",
            createdAt: "2026-11-18T10:00:00Z",
            details: { joiningCode: "PRIVATE-CODE" },
          } as any,
          {
            id: "event2",
            action: "unknown_sensitive_action",
            actorName: id,
            createdAt: "bad",
          },
        ]}
        shifts={[
          {
            id: "shift1",
            status: "open",
            handlerId: id,
            createdAt: "2026-11-18T09:00:00Z",
          },
        ]}
        staff={[{ id, name: "Teni" }]}
        canViewAudit
        canViewShifts
        allowedDestinations={["tables"]}
        onNavigate={(value) => calls.push(value)}
      />,
    );
    assert(screen.getByText("Responsible: Teni"));
    assert(screen.getByText("Table visit opened"));
    assert(screen.getByText("Branch activity recorded"));
    assert.equal(screen.queryByText(id), null);
    assert.equal(screen.queryByText("PRIVATE-CODE"), null);
    assert.equal(screen.queryByText("unknown_sensitive_action"), null);
    assert.equal(screen.queryByRole("button", { name: "View shifts" }), null);
    fireEvent.click(screen.getByRole("button", { name: "View tables" }));
    assert.deepEqual(calls, ["tables"]);
  } finally {
    cleanup();
  }
});
test("O2 shift responsibility never substitutes an ID or invented staffing total", () => {
  try {
    render(
      <OverviewActivity
        audit={[{ actorName: "Hidden actor" }]}
        shifts={[{ status: "open", openedBy: "opaque-user" }]}
        canViewAudit={false}
        canViewShifts
        allowedDestinations={[]}
        onNavigate={() => {}}
      />,
    );
    assert(screen.getByText("Staff responsibility not available"));
    assert.equal(screen.queryByText("Hidden actor"), null);
    assert.equal(screen.queryByText("opaque-user"), null);
    assert.equal(screen.queryByText(/staff online/i), null);
  } finally {
    cleanup();
  }
});

test("O2 activity and shift times use the supplied branch timezone, with explicit UTC fallback", () => {
  const time = "2026-11-18T10:00:00Z";
  const props = {
    audit: [
      {
        id: "event",
        action: "visit_opened",
        actorName: "Ada",
        createdAt: time,
      },
    ],
    shifts: [{ id: "shift", status: "open", createdAt: time }],
    canViewAudit: true,
    canViewShifts: true,
    allowedDestinations: [],
    onNavigate: () => {},
  };
  const expected = (timezone: string) =>
    new Intl.DateTimeFormat("en-NG", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(time));
  try {
    const { container, rerender } = render(
      <OverviewActivity {...props} timezone="America/New_York" />,
    );
    assert.equal(container.querySelectorAll("time").length, 2);
    for (const node of container.querySelectorAll("time"))
      assert.equal(node.textContent, expected("America/New_York"));
    assert.notEqual(expected("America/New_York"), expected("UTC"));
    rerender(<OverviewActivity {...props} timezone="UTC" />);
    for (const node of container.querySelectorAll("time"))
      assert.equal(node.textContent, expected("UTC"));
    rerender(<OverviewActivity {...props} timezone="Invalid/Tablet" />);
    assert(
      screen.getByText("Times shown in UTC (branch timezone unavailable)."),
    );
    for (const node of container.querySelectorAll("time"))
      assert.equal(node.textContent, expected("UTC"));
  } finally {
    cleanup();
  }
});
test("O2 malformed runtime collections remain unavailable rather than crashing or appearing empty", () => {
  try {
    render(
      <OverviewActivity
        audit={{ private: "hidden" } as any}
        shifts={[null] as any}
        staff={null as any}
        canViewAudit
        canViewShifts
        allowedDestinations={null as any}
        onNavigate={() => {}}
      />,
    );
    assert(screen.getByText("Activity unavailable."));
    assert(screen.getByText("Shift status unavailable."));
    assert.equal(screen.queryByText("hidden"), null);
  } finally {
    cleanup();
  }
});

test("O2 common server audit events use safe summaries and honest destination links", () => {
  const events = [
    ["order_submitted", "Order placed", "View orders"],
    ["order_status", "Order status updated", "View orders"],
    ["order_item_cancelled", "Order item cancelled", "View orders"],
    ["stock_hold_expired", "Order stock hold expired", "View orders"],
    ["reservation_requested", "Reservation requested", "View reservations"],
    ["reservation_status", "Reservation status updated", "View reservations"],
    ["reservation_seated", "Reservation seated", "View tables"],
    ["table_status_changed", "Table status updated", "View tables"],
    ["bill_split", "Bill split", "View tables"],
    ["bills_merged", "Bills merged", "View tables"],
  ];
  for (const [action, label, link] of events) {
    try {
      const { container } = render(
        <OverviewActivity
          audit={[
            {
              id: action,
              action,
              actorName: "Ada",
              createdAt: "2026-11-18T10:00:00Z",
              details: {
                joiningCode: "PRIVATE-CODE",
                orderId: "PRIVATE-ID",
                status: "PRIVATE-STATUS",
              },
            } as any,
          ]}
          canViewAudit
          canViewShifts={false}
          allowedDestinations={["orders", "tables", "reservations"]}
          onNavigate={() => {}}
        />,
      );
      assert(screen.getByText(label));
      assert(screen.getByRole("button", { name: link }));
      assert(!container.textContent?.includes("PRIVATE-"));
      assert.equal(screen.queryByText("Branch activity recorded"), null);
    } finally {
      cleanup();
    }
  }
});
