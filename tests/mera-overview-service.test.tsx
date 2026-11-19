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
const { default: OperationalOverview } =
  await import("../src/mera/workspace/OperationalOverview");
const { serviceState, overviewTime } =
  await import("../src/mera/workspace/overviewPresentation");
const clock = "2026-11-19T12:00:00Z";
const order = {
  id: "private-a",
  reference: "M-A",
  displayName: "Local guest",
  status: "submitted",
  total: 1000,
  createdAt: "2026-11-19T11:30:00Z",
  paymentStatus: "unpaid",
  stockHeld: false,
};
const data = {
  serverTime: clock,
  report: {
    date: "2026-11-19",
    orders: 2,
    netSales: 0,
    collections: 0,
    outstanding: 1000,
    paymentMethods: { cash: 0 },
  },
  branch: { timezone: "Africa/Lagos" },
  delayedOrders: [],
  lowStockAlerts: [],
  reservations: [],
  shifts: [],
};
const props = {
  data,
  orders: [order],
  base: "/org/branch",
  disabled: false,
  canCreate: false,
  canViewOrders: true,
  onNavigate: () => {},
  canNavigate: (id: string) => id === "orders",
};
test("service classification excludes historical, expired and elapsed stock holds while retaining unknown hold state", () => {
  assert.equal(serviceState(order, clock), "active");
  assert.equal(
    serviceState({ ...order, historicalReadOnly: true }, clock),
    "inactive",
  );
  assert.equal(
    serviceState({ ...order, paymentStatus: "expired" }, clock),
    "expired",
  );
  assert.equal(
    serviceState({ ...order, stockHeld: true, holdExpiresAt: clock }, clock),
    "expired",
  );
  assert.equal(
    serviceState({ ...order, stockHeld: true, holdExpiresAt: "bad" }, clock),
    "unavailable",
  );
  assert.equal(
    serviceState(
      { ...order, stockHeld: true, holdExpiresAt: "2026-11-19T13:00:00Z" },
      undefined,
    ),
    "unavailable",
  );
  assert.equal(
    serviceState({ ...order, status: "collected" }, clock),
    "inactive",
  );
  assert.equal(
    serviceState({ ...order, status: "not_a_state" }, clock),
    "unavailable",
  );
});
test("overview active table and review link use current service rather than expired recent orders", () => {
  let review: any[] = [];
  try {
    render(
      <OperationalOverview
        {...props}
        orders={[
          order,
          {
            ...order,
            id: "expired",
            reference: "M-OLD",
            paymentStatus: "expired",
          },
        ]}
        onReviewOrders={(...args) => review.push(args)}
      />,
    );
    assert(screen.getByText("1 active"));
    assert(screen.getByText(/1 expired order is excluded/));
    assert(!screen.queryByText("M-OLD"));
    fireEvent.click(screen.getByRole("button", { name: "Open M-A" }));
    assert.deepEqual(review[0], ["M-A", "active"]);
    fireEvent.click(screen.getByRole("button", { name: "View active orders" }));
    assert.deepEqual(review[1], [undefined, "active"]);
  } finally {
    cleanup();
  }
});
test("missing permission or records never displays a zero service count", () => {
  try {
    const view = render(<OperationalOverview {...props} orders={undefined} />);
    assert(screen.getAllByText("Order activity unavailable").length > 0);
    assert(!screen.queryByText("0 active"));
    view.rerender(<OperationalOverview {...props} canViewOrders={false} />);
    assert(
      screen.getByText("Your account does not have access to order activity."),
    );
    assert(!screen.queryByRole("region", { name: "Current service orders" }));
    assert(!screen.queryByText("Local guest"));
  } finally {
    cleanup();
  }
});
test("unknown hold details, stale reads, bad timezone and missing method breakdown remain truthful", () => {
  try {
    render(
      <OperationalOverview
        {...props}
        stale
        orders={[{ ...order, stockHeld: true, holdExpiresAt: "bad" }]}
        data={{
          ...data,
          branch: { timezone: "Bad/Zone" },
          report: { ...data.report, paymentMethods: null },
        }}
      />,
    );
    assert(screen.getByText("Service count needs checking"));
    assert(screen.getByText("Payment-method breakdown is unavailable."));
    assert(screen.getByText(/Showing previously loaded records/));
    assert(!screen.queryByText("0 active"));
    assert.match(
      overviewTime(order.createdAt, "Bad/Zone"),
      /UTC \(branch timezone unavailable\)/,
    );
    assert.equal(overviewTime("bad", "Bad/Zone"), "Time unavailable");
  } finally {
    cleanup();
  }
});
