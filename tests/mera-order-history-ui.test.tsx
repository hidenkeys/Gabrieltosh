import { chooseField, choiceValue } from "./choice-field-helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/platform",
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
const { default: OrderHistory } =
  await import("../src/mera/workspace/OrderHistory");

const base = "/organizations/org/branches/branch";
const order = {
  id: "order-1",
  reference: "M-ONE",
  displayName: "Ada",
  status: "completed",
  paymentStatus: "paid",
  source: "staff",
  total: 800000,
  createdAt: "2026-11-19T10:00:00Z",
  handlerName: "Sam",
  historicalReadOnly: true,
};
const page = (orders: any[] = [order]) => ({
  orders,
  pageSize: 50,
  hasMore: false,
  nextCursor: null,
});
test("P2 history presents readable order columns and fetches permitted read-only detail before showing money", async () => {
  let finish: ((response: Response) => void) | undefined;
  const methods: string[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    methods.push(init.method || "GET");
    if (String(input).endsWith("/orders/order-1"))
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    return Response.json(page());
  }) as any;
  try {
    render(<OrderHistory base={base} />);
    await screen.findByText("M-ONE · Ada");
    for (const title of [
      "Order",
      "Placed",
      "Order status",
      "Payment",
      "Total",
      "Handler",
      "Details",
    ])
      assert.ok(screen.getByRole("columnheader", { name: title }));
    assert.equal(
      screen
        .getByRole("region", { name: "History results" })
        .getAttribute("tabindex"),
      "0",
    );
    const trigger = screen.getByRole("button", { name: "View M-ONE" });
    fireEvent.click(trigger);
    await screen.findByText("Loading permitted order detail…");
    assert.equal(screen.queryByText("Applied payments"), null);
    await waitFor(() => assert.ok(finish));
    await act(async () => {
      finish!(
        Response.json({
          ...order,
          effectivePaid: 800000,
          outstandingBalance: 0,
          items: [],
          history: [],
          historicalTaxStatus: "unresolved_source_tax_breakdown",
        }),
      );
    });
    const heading = screen.getByRole("heading", { name: "Order detail" });
    await waitFor(() => assert.equal(document.activeElement, heading));
    assert.ok(screen.getByText("Applied payments"));
    assert.ok(
      screen.getAllByText("Imported source history · read only").length >= 1,
    );
    assert.equal(
      screen.queryByRole("button", {
        name: /refund|record payment|cancel order/i,
      }),
      null,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close order detail" }));
    assert.equal(document.activeElement, trigger);
    assert.ok(methods.every((method) => method === "GET"));
  } finally {
    cleanup();
  }
});
test("P2 more filters retain draft inputs and apply only through the scoped query", async () => {
  const urls: URL[] = [];
  globalThis.fetch = (async (input: any) => {
    urls.push(new URL(String(input), "http://localhost"));
    return Response.json(page());
  }) as any;
  try {
    render(<OrderHistory base={base} />);
    await screen.findByText("M-ONE · Ada");
    const disclosure = screen
      .getByText("More filters", { exact: false, selector: "summary" })
      .closest("details")!;
    assert.equal(disclosure.open, false);
    fireEvent.click(disclosure.querySelector("summary")!);
    chooseField(screen, fireEvent, "History order status", String("completed"));
    fireEvent.change(screen.getByLabelText("Search order history"), {
      target: { value: " Ada " },
    });
    fireEvent.click(disclosure.querySelector("summary")!);
    fireEvent.click(disclosure.querySelector("summary")!);
    assert.equal(choiceValue(screen, "History order status"), "completed");
    assert.equal(urls.length, 1);
    fireEvent.click(
      screen.getByRole("button", { name: "Apply history filters" }),
    );
    await waitFor(() => assert.equal(urls.length, 2));
    assert.equal(urls[1].searchParams.get("q"), "Ada");
    assert.equal(urls[1].searchParams.get("status"), "completed");
    assert.equal(urls[1].searchParams.has("cursor"), false);
  } finally {
    cleanup();
  }
});
test("P2 failed history loads show recovery without a false empty result", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) throw new Error("Connection interrupted");
    return Response.json(page([]));
  }) as any;
  try {
    render(<OrderHistory base={base} />);
    await screen.findByRole("alert");
    assert.equal(screen.queryByText("No matching orders"), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload history from first page" }),
    );
    await screen.findByText("No matching orders");
    assert.equal(calls, 2);
  } finally {
    cleanup();
  }
});

test("P2 responsibility history labels only known identity and renders Customer QR clearly", async () => {
  const unknownId = "11111111-2222-4333-8444-555555555555";
  globalThis.fetch = (async (input: any) =>
    Response.json(
      String(input).endsWith("/orders/order-1")
        ? {
            ...order,
            source: "customer_qr",
            staffCreatorId: unknownId,
            handlerId: unknownId,
            items: [],
            history: [
              { action: "submitted", actorId: unknownId, at: order.createdAt },
              {
                action: "joined",
                actorType: "guest",
                actorId: unknownId,
                at: order.createdAt,
              },
              {
                action: "accepted",
                actorType: "staff",
                actorId: unknownId,
                at: order.createdAt,
              },
              {
                action: "prepared",
                actorType: "staff",
                actorName: "Sam",
                actorId: unknownId,
                at: order.createdAt,
              },
            ],
          }
        : page([{ ...order, source: "customer_qr" }]),
    )) as any;
  try {
    render(<OrderHistory base={base} />);
    await screen.findByText("M-ONE · Ada");
    assert.ok(screen.getByText("Customer QR"));
    fireEvent.click(screen.getByRole("button", { name: "View M-ONE" }));
    await screen.findByRole("heading", {
      name: "Responsibility & transaction history",
    });
    assert.equal(screen.queryByText(new RegExp(unknownId)), null);
    assert.ok(screen.getByText(/Submitted · Identity unavailable/));
    assert.ok(screen.getByText(/Joined · Guest/));
    assert.ok(screen.getByText(/Accepted · Staff name unavailable/));
    assert.ok(screen.getByText(/Prepared · Sam/));
  } finally {
    cleanup();
  }
});
test("P2 history uses branch dates, honest missing references and allowlisted states without opaque identifiers", async () => {
  const privateId = "private-opaque-order-id";
  globalThis.fetch = (async () =>
    Response.json(
      page([
        {
          ...order,
          id: privateId,
          reference: null,
          status: "internal_order_code",
          paymentStatus: "internal_payment_code",
          source: "internal_source_code",
        },
      ]),
    )) as any;
  try {
    render(<OrderHistory base={base} timeZone="Africa/Lagos" />);
    await screen.findByText(/Reference unavailable/);
    assert.ok(screen.getByRole("button", { name: "View order details" }));
    assert.ok(screen.getByText("19 Nov 2026, 11:00 · Africa/Lagos"));
    assert.ok(screen.getByText("Status unavailable"));
    assert.ok(screen.getByText("Payment status unavailable"));
    assert.ok(!screen.queryByText(new RegExp(privateId)));
    assert.ok(
      !screen.queryByText(
        /internal_order_code|internal_payment_code|internal_source_code/,
      ),
    );
  } finally {
    cleanup();
  }
});
test("shared order timeline keeps zero money, actual assignment names and explicit missing history without inventing actors", async () => {
  const { OrderTimeline } = await import("../src/mera/workspace/OrderHistory");
  try {
    const view = render(<OrderTimeline entries={undefined} />);
    assert.ok(screen.getByText("History unavailable."));
    view.rerender(<OrderTimeline entries={[]} />);
    assert.ok(screen.getByText("No events recorded."));
    view.rerender(
      <OrderTimeline
        timeZone="Africa/Lagos"
        entries={[
          { action: "payment_recorded", amount: 0, at: "2026-11-19T10:00:00Z" },
          {
            action: "assigned",
            actorId: "private-staff-id",
            from: null,
            to: "private-next-id",
            fromName: null,
            toName: "Ada",
            at: "2026-11-19T10:00:00Z",
          },
          { action: "assigned", actorName: "Manager", at: "bad-date" },
        ]}
      />,
    );
    assert.ok(
      screen.getByText(/Payment recorded · Identity unavailable.*₦0.00/),
    );
    assert.ok(screen.getByText("Unassigned → Ada"));
    assert.ok(
      screen.getByText("Staff name unavailable → Staff name unavailable"),
    );
    assert.ok(screen.getByText(/Assigned · Identity unavailable/));
    assert.ok(!screen.queryByText(/private-staff-id|private-next-id/));
    assert.ok(screen.getByText(/Time unavailable/));
  } finally {
    cleanup();
  }
});
