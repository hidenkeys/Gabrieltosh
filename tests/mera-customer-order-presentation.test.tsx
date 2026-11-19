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
const { render, screen, fireEvent, cleanup, waitFor, act } =
  await import("@testing-library/react");
const { orderStateLabel, paymentStateLabel, activityLabel, customerDate } =
  await import("../src/mera/customer/orderPresentation");
const { default: SessionOrders } =
  await import("../src/mera/customer/SessionOrders");
test("customer labels distinguish submitted orders from confirmed payments and keep unknown internal states private", () => {
  assert.equal(orderStateLabel("submitted"), "Sent to the venue");
  assert.equal(orderStateLabel("ready"), "Ready");
  assert.equal(
    activityLabel("balance_written_off"),
    "Balance adjustment recorded",
  );
  assert.equal(paymentStateLabel("unpaid"), "Payment not yet confirmed");
  assert.equal(paymentStateLabel("paid"), "Payment confirmed");
  assert.equal(paymentStateLabel("partially_refunded"), "Partly refunded");
  assert.equal(activityLabel("items_handed_over"), "Items handed over");
  assert.equal(activityLabel("refund_requested"), "Refund requested");
  assert.equal(activityLabel("payment_recorded"), "Payment recorded");
  for (const value of [null, undefined, "private_internal_token"]) {
    assert.equal(orderStateLabel(value), "Status unavailable");
    assert.equal(paymentStateLabel(value), "Payment status unavailable");
    assert.equal(activityLabel(value), "Order activity recorded");
  }
});
test("customer times use explicit branch zone and labelled device fallback, absent dates stay unavailable", () => {
  assert.equal(
    customerDate("2026-11-19T10:00:00Z", "Africa/Lagos"),
    "19 Nov 2026, 11:00 · Africa/Lagos",
  );
  assert.match(customerDate("2026-11-19T10:00:00Z"), /Device time$/);
  assert.match(
    customerDate("2026-11-19T10:00:00Z", "Invalid/Zone"),
    /Device time$/,
  );
  for (const value of [undefined, null, "", "bad-date", 0])
    assert.equal(customerDate(value), "Time unavailable");
});
test("session orders show readable separate states and branch time without rendering internal IDs; open still fetches canonical private order", async () => {
  const original = globalThis.fetch;
  let selected: any = null;
  const paths: string[] = [];
  globalThis.fetch = async (input: any) => {
    paths.push(String(input));
    return new Response(
      JSON.stringify(
        String(input).includes("guest-orders")
          ? {
              orders: [
                {
                  id: "internal-private-order-id",
                  reference: "MERA-123",
                  status: "submitted",
                  paymentStatus: "unpaid",
                  createdAt: "2026-11-19T10:00:00Z",
                },
              ],
              nextCursor: null,
            }
          : {
              id: "internal-private-order-id",
              reference: "MERA-123",
              status: "accepted",
            },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    render(
      React.createElement(SessionOrders, {
        prefix: "/public/organizations/venue/branches/store",
        timeZone: "Africa/Lagos",
        onSelect: (value: any) => (selected = value),
        onClear: () => {},
      }),
    );
    await screen.findByText(
      /MERA-123 · Sent to the venue · Payment not yet confirmed/,
    );
    assert.ok(screen.getByText("19 Nov 2026, 11:00 · Africa/Lagos"));
    assert.equal(screen.queryByText(/internal-private-order-id/), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Open order MERA-123" }),
    );
    await waitFor(() => assert.equal(selected?.status, "accepted"));
    assert.ok(
      paths.some((path) =>
        path.endsWith("/public/orders/internal-private-order-id"),
      ),
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
