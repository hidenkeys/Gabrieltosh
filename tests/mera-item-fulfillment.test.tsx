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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: ItemFulfillment } =
  await import("../src/mera/workspace/ItemFulfillment.tsx");
const { WorkspaceError } = await import("../src/mera/workspace/api.ts");
const order = {
  id: "order-one",
  version: 2,
  status: "preparing",
  items: [
    { orderLineId: "line-one", name: "Tea", quantity: 4, fulfilledQuantity: 1 },
  ],
};
const tickets = [
  {
    orderId: "order-one",
    status: "preparing",
    items: [{ orderLineId: "line-one", quantity: 4, preparedQuantity: 3 }],
  },
];
test("handoff is a monotonic set-total capped by prepared quantities", async () => {
  const calls: any[] = [];
  render(
    React.createElement(ItemFulfillment, {
      order,
      tickets,
      base: "/organizations/org/branches/branch",
      disabled: false,
      save: async (...args: any[]) => {
        calls.push(args);
        return { allItemsHandedOver: false };
      },
    }),
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Item to hand over" }),
    { target: { value: "line-one" } },
  );
  const number = screen.getByRole("spinbutton", {
    name: "Total handed over after this action",
  });
  assert.equal(number.getAttribute("min"), "2");
  assert.equal(number.getAttribute("max"), "3");
  fireEvent.change(number, { target: { value: "4" } });
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Record item handoff",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  fireEvent.change(number, { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Record item handoff" }));
  await screen.findByRole("status");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].fulfilledQuantity, 3);
  assert.equal(calls[0][2].version, 2);
  assert.match(calls[0][0], /items\/line-one\/fulfillment$/);
  assert.match(
    screen.getByRole("status").textContent || "",
    /not been marked collected/,
  );
  cleanup();
});
test("uncertain handoff retry preserves original quantity, key and version after refresh", async () => {
  const calls: any[] = [];
  const props = {
    order,
    tickets,
    base: "/organizations/org/branches/branch",
    disabled: false,
    save: async (...args: any[]) => {
      calls.push(args);
      if (calls.length === 1)
        throw new WorkspaceError("Network outcome unknown");
      return { allItemsHandedOver: true };
    },
  };
  const view = render(React.createElement(ItemFulfillment, props));
  fireEvent.change(
    screen.getByRole("combobox", { name: "Item to hand over" }),
    { target: { value: "line-one" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Record item handoff" }));
  await screen.findByRole("alert");
  view.rerender(
    React.createElement(ItemFulfillment, {
      ...props,
      order: { ...order, version: 3 },
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original handoff" }),
  );
  await screen.findByRole("status");
  assert.deepEqual(calls[0][2], calls[1][2]);
  assert.equal(calls[1][2].version, 2);
  assert.match(
    screen.getByRole("status").textContent || "",
    /does not recognize the sale/,
  );
  cleanup();
});
