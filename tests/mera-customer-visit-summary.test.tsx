import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
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
const { render, screen, fireEvent, cleanup, within } =
  await import("@testing-library/react");
const { default: VisitSummary } =
  await import("../src/mera/customer/VisitSummary");
test.afterEach(cleanup);
const data = {
  visit: { id: "private-visit-id", tableName: "Window table", status: "open" },
  balance: 700,
  orders: [
    {
      id: "private-order-id",
      reference: "M-ROUND1",
      displayName: "Guest",
      status: "preparing",
      total: 100000,
      paid: 100000,
      effectivePaid: 50000,
      writtenOff: 49300,
      balance: 700,
      items: [
        {
          quantity: 1,
          name: "Large tea",
          size: "700 ml",
          modifiers: [{ name: "Pearls" }],
          total: 100000,
        },
      ],
    },
  ],
  bills: [
    {
      id: "private-bill-id",
      name: "Shared bill",
      total: 100000,
      paid: 150000,
      balance: -50000,
      charges: [
        { id: "charge-id", name: "Large tea", quantity: 1, amount: 100000 },
      ],
    },
  ],
};
test("visit summary uses canonical order balance separately from unused bill deposit credit without deriving totals", () => {
  render(<VisitSummary data={data} refreshing={false} onRefresh={() => {}} />);
  const top = document.querySelector(".mc-visit-balance-card")!;
  assert(within(top as HTMLElement).getByText("Outstanding on orders"));
  assert(within(top as HTMLElement).getByText("₦7.00"));
  assert(screen.getByText("Unused deposit credit"));
  assert(
    within(screen.getByRole("region", { name: "Your table bills" })).getByText(
      "₦500.00",
    ),
  );
  assert(
    screen.getByText(/Unused deposit credit is not available for withdrawal/),
  );
  assert(screen.getByText("Payments applied to this order"));
  assert(screen.getByText("Staff-approved adjustment"));
  assert(screen.getByText("Being prepared"));
  for (const privateId of [
    "private-visit-id",
    "private-order-id",
    "private-bill-id",
  ])
    assert.equal(document.body.textContent?.includes(privateId), false);
  const details = [...document.querySelectorAll("details")];
  assert.equal(details.length, 2);
  assert(details.every((item) => !item.open));
});
test("minimum progress uses server shortfall and waiver fields without inventing a charge or recomputing", () => {
  render(
    <VisitSummary
      data={{
        ...data,
        minimumSpend: {
          policy: {
            enabled: true,
            amount: 1000000,
            disclosure: "Original visit terms",
          },
          summary: { netPaid: 100000, waived: 200000, shortfall: 12345 },
        },
      }}
      refreshing={false}
      onRefresh={() => {}}
    />,
  );
  assert(screen.getByText("Still to meet"));
  assert(screen.getByText("₦123.45"));
  assert(screen.getByText("Reduction agreed by staff"));
  assert(screen.getByText("Original visit terms"));
  assert(screen.getByText(/does not add an automatic charge/));
  assert.equal(screen.queryByText("₦7,000.00"), null);
});
test("missing balances and minimum progress remain unavailable rather than falsely zero or settled", () => {
  render(
    <VisitSummary
      data={{
        visit: data.visit,
        balance: NaN,
        orders: [],
        minimumSpend: {
          policy: { enabled: true, amount: 100000, disclosure: "Agreed terms" },
          summary: null,
        },
      }}
      refreshing={false}
      onRefresh={() => {}}
    />,
  );
  assert(screen.getByText(/Balance unavailable/));
  assert(screen.getByText(/could not provide the minimum-spend progress/));
  assert(screen.getByText(/No orders have been linked/));
  assert.equal(screen.queryByText("₦0.00"), null);
});
test("refresh and additional round are explicit parent callbacks, with loading and stale-error states", (t) => {
  let reads = 0,
    rounds = 0;
  t.mock.method(globalThis, "fetch", () => {
    throw Error("Leaf must not call API");
  });
  const props = {
    data,
    refreshing: false,
    onRefresh: () => {
      reads++;
    },
    onOrderMore: () => {
      rounds++;
    },
  };
  const view = render(<VisitSummary {...props} />);
  assert.equal(reads, 0);
  assert.equal(rounds, 0);
  fireEvent.click(screen.getByRole("button", { name: "Refresh bill" }));
  assert.equal(reads, 1);
  fireEvent.click(screen.getByRole("button", { name: "Add another round" }));
  assert.equal(rounds, 1);
  view.rerender(<VisitSummary {...props} refreshing={true} />);
  assert(screen.getByRole("status"));
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Checking your bill…",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  view.rerender(
    <VisitSummary {...props} refreshError="Connection unavailable" />,
  );
  assert.match(
    screen.getByRole("alert").textContent || "",
    /last confirmed bill is shown/,
  );
  assert(screen.getByText("Window table"));
});
