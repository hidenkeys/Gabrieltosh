import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<html><body></body></html>", {
  url: "http://localhost/mera/workspace",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "FormData",
])
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = await import("react");
const { render, screen, fireEvent, cleanup, waitFor, within } =
  await import("@testing-library/react");
const { default: CashMovement } =
  await import("../src/mera/workspace/CashMovement");
const { default: RefundRequests } =
  await import("../src/mera/workspace/RefundRequests");
const { default: ItemCancellation } =
  await import("../src/mera/workspace/ItemCancellation");
test.afterEach(cleanup);
test("cash presets submit their exact label and formatted naira remains integer kobo", async () => {
  let body: any;
  render(
    <CashMovement
      base="/branch"
      shiftId="shift"
      disabled={false}
      save={async (_p, _m, b) => {
        body = b;
      }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Cash in" }));
  fireEvent.change(screen.getByLabelText("Movement amount (naira)"), {
    target: { value: "1,234.56" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Float top-up" }));
  fireEvent.click(screen.getByRole("button", { name: "Record cash movement" }));
  await waitFor(() => assert.ok(body));
  assert.equal(body.amount, 123456);
  assert.equal(body.reason, "Float top-up");
  assert.equal(body.direction, "in");
  assert.equal(screen.queryByRole("spinbutton"), null);
});
test("refund full and half amounts use remaining paid credit and line values stay explicit before review", async () => {
  globalThis.fetch = async () => Response.json({ requests: [] });
  const calls: any[] = [];
  render(
    <RefundRequests
      base="/branch"
      userId="owner"
      orders={[
        {
          id: "o",
          reference: "REF-12",
          displayName: "Ada",
          paid: 100001,
          refunded: 10000,
          items: [{ orderLineId: "l", quantity: 1, name: "Tea", total: 35000 }],
        },
      ]}
      canRequest
      canApprove={false}
      disabled={false}
      save={async (...args) => {
        calls.push(args);
      }}
    />,
  );
  const order = screen.getByRole("combobox", { name: "Order" });
  fireEvent.focus(order);
  fireEvent.keyDown(order, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Full amount" }));
  assert.equal(
    (screen.getByLabelText("Requested return (₦)") as HTMLInputElement).value,
    "900.01",
  );
  fireEvent.click(screen.getByRole("button", { name: "Half amount" }));
  assert.equal(
    (screen.getByLabelText("Requested return (₦)") as HTMLInputElement).value,
    "450.00",
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /Tea/ }));
  assert.equal(
    (screen.getByLabelText("Requested return (₦)") as HTMLInputElement).value,
    "350.00",
  );
  assert.ok(screen.getByText(/exclude order-level charges and discounts/));
  fireEvent.click(screen.getByRole("radio", { name: "Wrong item received" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Submit refund request" }),
  );
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0][2].amount, 35000);
  assert.equal(calls[0][2].reason, "Wrong item received");
  assert.deepEqual(Object.keys(calls[0][2]).sort(), [
    "amount",
    "reason",
    "requestKey",
  ]);
});
test("cancellation preset remains exact and quantity stepper cannot exceed unprepared items", async () => {
  const calls: any[] = [];
  render(
    <ItemCancellation
      base="/branch"
      order={{
        id: "o",
        version: 4,
        status: "preparing",
        paid: 0,
        items: [{ orderLineId: "l", quantity: 3, name: "Tea" }],
      }}
      tickets={[
        { orderId: "o", items: [{ orderLineId: "l", preparedQuantity: 2 }] },
      ]}
      disabled={false}
      save={async (...args) => {
        calls.push(args);
      }}
    />,
  );
  fireEvent.click(screen.getByText("Cancel unprepared items"));
  const item = screen.getByRole("combobox", { name: "Item to cancel" });
  fireEvent.focus(item);
  fireEvent.keyDown(item, { key: "Enter" });
  const count = screen.getByLabelText("Quantity to cancel") as HTMLInputElement;
  assert.equal(count.max, "1");
  fireEvent.click(
    within(
      screen.getByRole("group", { name: "Cancellation reason" }),
    ).getByRole("radio", { name: "Item unavailable" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Cancel selected quantity" }),
  );
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0][2].quantity, 1);
  assert.equal(calls[0][2].version, 4);
  assert.equal(calls[0][2].reason, "Item unavailable");
});
