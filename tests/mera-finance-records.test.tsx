import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { formatMoney } from "../src/mera/workspace/api";
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
const { PaymentRecords, ShiftRecord } =
  await import("../src/mera/workspace/FinanceRecords");
test("finance records distinguish missing/empty/zero, protect returns by permission, and never substitute private order identifiers", () => {
  try {
    const { rerender } = render(
      <PaymentRecords
        payments={undefined}
        refunds={[{ id: "r", amount: 900 }]}
        orders={[]}
        canViewRefunds={false}
      />,
    );
    assert(screen.getByText(/Records are unavailable/));
    assert.equal(
      screen.queryByRole("region", { name: "Recorded returns" }),
      null,
    );
    rerender(
      <PaymentRecords
        payments={[]}
        refunds={[]}
        orders={[]}
        canViewRefunds={true}
      />,
    );
    assert(screen.getByText("No collections recorded for this branch."));
    assert(screen.getByText("No returns recorded for this branch."));
    rerender(
      <PaymentRecords
        payments={[
          {
            id: "p",
            amount: 0,
            orderId: "private-order",
            method: "cash",
            createdAt: "2026-11-18T23:30:00Z",
          },
        ]}
        refunds={[]}
        orders={[]}
        timeZone="Africa/Lagos"
        canViewRefunds={false}
      />,
    );
    assert(screen.getByText(formatMoney(0)));
    assert(screen.getByText("Order reference unavailable"));
    assert(!document.body.textContent?.includes("private-order"));
    assert(document.body.textContent?.includes("19 Nov 2026"));
  } finally {
    cleanup();
  }
});
test("shift facts preserve zero and distinguish unknown expected balances from counted cash", () => {
  try {
    const { rerender } = render(
      <ShiftRecord shift={{ status: "open", openingFloat: 0 }}>
        <button>Existing shift action</button>
      </ShiftRecord>,
    );
    assert(screen.getByText(formatMoney(0)));
    assert(screen.getByText("Calculated at close"));
    assert(screen.getByText("Not counted"));
    assert(screen.getByRole("button", { name: "Existing shift action" }));
    rerender(
      <ShiftRecord
        shift={{ status: "closed", expectedCash: 0, countedCash: 0 }}
      >
        {null}
      </ShiftRecord>,
    );
    assert.equal(screen.getAllByText(formatMoney(0)).length, 2);
    assert(screen.getByText("Unavailable"));
    assert.equal(screen.queryByText("Calculated at close"), null);
  } finally {
    cleanup();
  }
});
