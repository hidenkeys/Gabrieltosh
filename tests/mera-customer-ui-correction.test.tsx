import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001",
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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: CustomerExperience } =
  await import("../src/mera/customer/CustomerExperience.tsx");
const product = {
  id: "tea",
  code: "C2",
  name: "Brown Sugar Boba",
  category: "Drinks",
  price: 380000,
  size: "700 ml",
  available: true,
  stockMode: "unlimited",
  variants: [{ id: "regular", name: "Regular", price: 380000 }],
  modifierGroups: [
    {
      id: "sweetness",
      name: "Sweetness",
      min: 1,
      max: 1,
      options: [{ id: "less-sugar", name: "Less sugar", price: 0 }],
    },
  ],
  allergens: ["Milk"],
  dietary: [],
  description: "",
};
const menu = {
  organization: { name: "Bing Chun" },
  branch: { name: "Surulere" },
  version: 1,
  orderingAvailable: true,
  products: [
    product,
    {
      ...product,
      id: "sold-out",
      name: "Seasonal smoothie",
      category: "Smoothies",
      available: false,
      variants: [],
      modifierGroups: [],
    },
  ],
};
function mockMenu(t: any, value: any = menu) {
  const writes: any[] = [];
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (init?.method !== "GET") writes.push({ path, body: init.body });
    if (path.endsWith("/menu")) return Response.json(value);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json(
        { error: "Guest session required" },
        { status: 401 },
      );
    throw Error("Unexpected request");
  });
  return writes;
}
test("C1 browse is immediate, compact, and does not create a guest or write an order", async (t) => {
  const writes = mockMenu(t);
  render(React.createElement(CustomerExperience));
  await screen.findByRole("heading", { level: 1, name: "Menu" });
  await screen.findByText("Brown Sugar Boba");
  assert.equal(screen.queryByText("Something lovely,"), null);
  assert.equal(writes.length, 0);
  assert.equal(screen.getByRole("button", { name: "Sold out" }).disabled, true);
  assert.match(
    document.querySelector(".mera-customer")?.getAttribute("style") || "",
    /Inter/,
  );
  cleanup();
});
test("C1 search and category recovery have a clear empty state", async (t) => {
  mockMenu(t);
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  fireEvent.change(screen.getByRole("combobox", { name: "Category" }), {
    target: { value: "legacy:Drinks" },
  });
  assert.equal(screen.queryByText("Seasonal smoothie"), null);
  fireEvent.change(screen.getByRole("textbox", { name: "Search menu" }), {
    target: { value: "missing menu item" },
  });
  assert(screen.getByRole("heading", { name: "No items found" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Clear search and filters" }),
  );
  assert(screen.getByText("Brown Sugar Boba"));
  assert(screen.getByText("Seasonal smoothie"));
  assert.equal(screen.getByRole("combobox", { name: "Category" }).value, "All");
  assert.equal(
    document.activeElement,
    screen.getByRole("textbox", { name: "Search menu" }),
  );
  cleanup();
});
test("C1 persistent basket access retains customization, quantities and keyboard destination", async (t) => {
  const writes = mockMenu(t);
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Less sugar" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to collection" }));
  assert(screen.getByText("Regular · Less sugar"));
  fireEvent.click(
    screen.getByRole("button", { name: "View basket, 1 item, ₦3,800" }),
  );
  assert.equal(
    document.activeElement,
    screen.getByRole("heading", { name: "Your basket" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Add one Brown Sugar Boba" }),
  );
  assert.equal(
    screen.queryByRole("button", { name: "View basket, 2 items, ₦7,600" }),
    null,
  );
  fireEvent.click(screen.getByRole("button", { name: "Back to menu" }));
  assert.equal(
    document.activeElement,
    screen.getByRole("textbox", { name: "Search menu" }),
  );
  assert(screen.getByRole("button", { name: "View basket, 2 items, ₦7,600" }));
  assert.equal(writes.length, 0);
  cleanup();
});
test("C1 paused and unpublished menus explain availability without accepting an order", async (t) => {
  mockMenu(t, { ...menu, orderingAvailable: false, products: [] });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Ordering is paused. You can still browse the menu.");
  assert(screen.getByRole("heading", { name: "The menu is on its way" }));
  assert.equal(
    screen.getByRole("button", { name: "Submit order" }).disabled,
    true,
  );
  cleanup();
});

test("C1 menu load failure offers a working retry without opening checkout", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async (input: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) {
      attempts++;
      if (attempts === 1) throw new TypeError("Failed to fetch");
      return Response.json(menu);
    }
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    return Response.json({ error: "Guest required" }, { status: 401 });
  });
  render(React.createElement(CustomerExperience));
  await screen.findByRole("alert");
  assert.equal(screen.queryByText("Brown Sugar Boba"), null);
  fireEvent.click(screen.getByRole("button", { name: "Refresh menu" }));
  await screen.findByText("Brown Sugar Boba");
  assert.equal(attempts, 2);
  assert.equal(
    screen.getByRole("button", { name: "Submit order" }).disabled,
    true,
  );
  cleanup();
});

test("C1 basket visibility suppresses the fixed shortcut during ordinary scrolling", async (t) => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "IntersectionObserver",
  );
  let observed: Element | undefined, callback: any;
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: class {
      constructor(cb: any) {
        callback = cb;
      }
      observe(element: Element) {
        observed = element;
      }
      disconnect() {}
    },
  });
  t.after(() => {
    cleanup();
    if (original)
      Object.defineProperty(globalThis, "IntersectionObserver", original);
    else delete (globalThis as any).IntersectionObserver;
  });
  mockMenu(t);
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  assert.equal(observed?.id, "mc-basket");
  const { act } = await import("@testing-library/react");
  await act(() => callback([{ isIntersecting: true }]));
  assert.equal(
    screen.queryByRole("button", { name: "View basket, 0 items, ₦0" }),
    null,
  );
  await act(() => callback([{ isIntersecting: false }]));
  assert(screen.getByRole("button", { name: "View basket, 0 items, ₦0" }));
});

test("C2 freezes the complete order intent through pending and uncertain delivery", async (t) => {
  const attempts: any[] = [];
  let rejectFirst: (error: Error) => void = () => {};
  let announcePosted: () => void = () => {};
  const posted = new Promise<void>((resolve) => {
    announcePosted = resolve;
  });
  let menuReads = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) {
      menuReads++;
      return Response.json({
        ...menu,
        version: menuReads,
        orderingAvailable: menuReads === 1,
      });
    }
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "Guest required" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.endsWith("/orders")) {
      attempts.push(JSON.parse(init.body));
      if (attempts.length === 1) {
        announcePosted();
        return new Promise((resolve, reject) => {
          rejectFirst = reject;
        });
      }
      return Response.json({
        id: "order-one",
        reference: "M-LOCKED",
        status: "submitted",
        paymentStatus: "unpaid",
        paid: 0,
        total: 380000,
        items: [],
        history: [],
      });
    }
    if (path.includes("/guest-orders?"))
      return Response.json({ orders: [], nextCursor: null });
    if (path.endsWith("/activity"))
      return Response.json({ reservations: [], feedback: [] });
    if (path.endsWith("/consent")) return Response.json({ marketing: false });
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Less sugar" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to collection" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), {
    target: { value: "Ada" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Enjoy it" }), {
    target: { value: "takeaway" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "Anything we should know?" }),
    { target: { value: "Original note" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await posted;
  assert.equal(
    screen.getByRole("textbox", { name: "Your name" }).disabled,
    true,
  );
  assert.equal(
    screen.getByRole("textbox", { name: "Anything we should know?" }).disabled,
    true,
  );
  assert.equal(
    screen.getByRole("combobox", { name: "Enjoy it" }).disabled,
    true,
  );
  assert.equal(
    screen.getByRole("button", { name: "Add one Brown Sugar Boba" }).disabled,
    true,
  );
  assert.equal(screen.getByRole("button", { name: "Choose" }).disabled, true);
  rejectFirst(new TypeError("Failed to fetch"));
  await screen.findByRole("button", { name: "Retry original order" });
  assert.equal(
    screen.getByRole("button", { name: "Retry original order" }).disabled,
    false,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), {
    target: { value: "Changed name" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "Anything we should know?" }),
    { target: { value: "Changed note" } },
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Enjoy it" }), {
    target: { value: "counter_pickup" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Add one Brown Sugar Boba" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry original order" }));
  await screen.findByText("M-LOCKED");
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[1], attempts[0]);
  assert.equal(attempts[1].displayName, "Ada");
  assert.equal(attempts[1].note, "Original note");
  assert.equal(attempts[1].fulfillment, "takeaway");
  assert.equal(attempts[1].menuVersion, 1);
  assert.equal(attempts[1].items[0].quantity, 1);
  assert.deepEqual(attempts[1].items[0].modifiers, ["less-sugar"]);
  cleanup();
});

test("C2 an explicit rejected checkout releases the basket for correction", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "Guest required" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.endsWith("/orders"))
      return Response.json(
        { error: "The menu changed. Review your basket." },
        { status: 409 },
      );
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Less sugar" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to collection" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), {
    target: { value: "Ada" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByRole("alert");
  assert.equal(
    screen.queryByRole("button", { name: "Retry original order" }),
    null,
  );
  assert.equal(
    screen.getByRole("textbox", { name: "Your name" }).disabled,
    false,
  );
  assert.equal(
    screen.getByRole("button", { name: "Add one Brown Sugar Boba" }).disabled,
    false,
  );
  cleanup();
});
