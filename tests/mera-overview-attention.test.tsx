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
const { default: OverviewAttention } =
  await import("../src/mera/workspace/OverviewAttention");
const { default: ServiceAttention } =
  await import("../src/mera/workspace/ServiceAttention");
const data = {
  serverTime: "2026-11-19T12:00:00Z",
  branch: { timezone: "Africa/Lagos" },
  delayedOrders: [],
  lowStockAlerts: [],
  reservations: [],
  shifts: [],
};
const props = { data, canNavigate: () => true, onNavigate: () => {} };
test("missing clock keeps confirmed records unverified, invalid end retained and known starts sort first; invalid zone has explicit UTC fallback", () => {
  try {
    const { container } = render(
      <OverviewAttention
        {...props}
        data={{
          ...data,
          serverTime: null,
          branch: { timezone: "Invalid/Zone" },
          reservations: [
            {
              id: "unknown",
              status: "confirmed",
              startsAt: "invalid",
              endsAt: "invalid",
            },
            {
              id: "known",
              displayName: "Known start",
              status: "arrived",
              startsAt: "2026-11-19T10:00:00Z",
              endsAt: "invalid",
            },
          ],
          shifts: [{ id: "shift", status: "pending_approval", variance: null }],
        }}
      />,
    );
    assert.ok(screen.getByText(/Arrival freshness is unavailable/));
    assert.ok(screen.getByText(/19 Nov 2026, 10:00 · UTC/));
    assert.equal(screen.getAllByText(/End time unavailable/).length, 2);
    assert.ok(screen.getByText("Variance unavailable"));
    assert.ok(!screen.queryByText("No confirmed arrivals waiting."));
    const strong = Array.from(container.querySelectorAll("li strong")).map(
      (node) => node.textContent,
    );
    assert.deepEqual(strong, [
      "Known start",
      "Reservation name unavailable",
      "Awaiting manager approval",
    ]);
  } finally {
    cleanup();
  }
});
test("malformed rows and missing arrays report unavailable rather than empty or throwing", () => {
  try {
    render(
      <OverviewAttention
        {...props}
        data={{
          ...data,
          delayedOrders: [null],
          lowStockAlerts: [true],
          reservations: {},
          shifts: [null],
        }}
      />,
    );
    for (const message of [
      "Waiting-time alerts are unavailable.",
      "Stock alerts are unavailable.",
      "Arrival details are unavailable.",
      "Shift details are unavailable.",
    ])
      assert.ok(screen.getByText(message));
  } finally {
    cleanup();
  }
});
test("bounded alert counts, honest ages and per-reference drilldowns retain permission-scoped sections", () => {
  const reviewed: (string | undefined)[] = [],
    navigated: string[] = [];
  try {
    render(
      <OverviewAttention
        {...props}
        canNavigate={(id) => ["orders", "menu"].includes(id)}
        onNavigate={(id) => navigated.push(id)}
        onReviewOrders={(reference) => reviewed.push(reference)}
        data={{
          ...data,
          delayedOrders: Array.from({ length: 5 }, (_, i) => ({
            id: "private" + i,
            reference: i ? "R-" + i : null,
            ageMinutes: i === 1 ? -1 : i === 2 ? 1.5 : 25,
          })),
          lowStockAlerts: Array.from({ length: 4 }, (_, i) => ({
            productId: "private" + i,
            name: i ? "Tea" : null,
            stock: 0,
          })),
        }}
      />,
    );
    assert.ok(screen.getByText("2 more waiting orders."));
    assert.ok(screen.getByText("1 more stock alert."));
    assert.equal(screen.getAllByText("Waiting time unavailable").length, 2);
    assert.ok(screen.getByText("Order reference unavailable"));
    assert.ok(screen.getByText("Product name unavailable"));
    assert.ok(!screen.queryByText("Upcoming arrivals"));
    assert.ok(!screen.queryByText(/private/));
    fireEvent.click(screen.getByRole("button", { name: "Review order R-1" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Review orders", exact: true }),
    );
    assert.deepEqual(reviewed, ["R-1", undefined]);
    fireEvent.click(screen.getByRole("button", { name: "Review stock" }));
    assert.deepEqual(navigated, ["menu"]);
  } finally {
    cleanup();
  }
});
test("service alerts do not invent missing threshold, reject malformed rows and validate waiting ages", () => {
  const reviewed: (string | undefined)[] = [];
  try {
    const view = render(
      <ServiceAttention
        orders={[{ id: "private", reference: "R-7", ageMinutes: -2 }]}
        onReview={() => {
          throw Error("fallback should not run");
        }}
        onReviewOrders={(value) => reviewed.push(value)}
      />,
    );
    fireEvent.click(screen.getByText("Waiting order details"));
    assert.ok(screen.getByText(/alert threshold is unavailable/));
    assert.ok(screen.getByText(/Waiting time unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Review order R-7" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Review branch orders" }),
    );
    assert.deepEqual(reviewed, ["R-7", undefined]);
    view.rerender(<ServiceAttention orders={[null]} onReview={() => {}} />);
    assert.ok(screen.getByText("Waiting-time alerts are unavailable."));
    assert.ok(!screen.queryByText(/active order needs/));
  } finally {
    cleanup();
  }
});
test("known clock filters past valid arrivals, retains invalid expiry honestly and displays explicit branch timezone", () => {
  try {
    render(
      <OverviewAttention
        {...props}
        data={{
          ...data,
          reservations: [
            {
              id: "past",
              displayName: "Past party",
              status: "confirmed",
              startsAt: "2026-11-18T10:00:00Z",
              endsAt: "2026-11-18T12:00:00Z",
            },
            {
              id: "future",
              displayName: "Future party",
              status: "confirmed",
              startsAt: "2026-11-20T10:00:00Z",
              endsAt: "bad",
            },
          ],
        }}
      />,
    );
    assert.ok(!screen.queryByText("Past party"));
    assert.ok(screen.getByText("Future party"));
    assert.ok(screen.getByText(/20 Nov 2026, 11:00 · Africa\/Lagos/));
    assert.ok(screen.getByText(/End time unavailable/));
  } finally {
    cleanup();
  }
});
