import { mockGuestSessionFetch } from "./mera-customer-session-fixture.js";
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
const { render, screen, fireEvent, cleanup, waitFor } =
  await import("@testing-library/react");
const { default: CustomerExperience } =
  await import("../src/mera/customer/CustomerExperience.tsx");
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(() => cleanup());

const product = {
  id: "30000000-0000-4000-8000-000000000001",
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
  organization: {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Bing Chun",
  },
  branch: { id: "20000000-0000-4000-8000-000000000001", name: "Surulere" },
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
  mockGuestSessionFetch(t, async (input: any, init: any) => {
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
  await screen.findByRole("heading", { name: "Your basket" });
  assert.match(
    document.querySelector(".mc-note")?.textContent || "",
    /Online payment is not available\. Please pay at the counter; staff will confirm your payment\./,
  );
  assert.match(
    document.querySelector(".mc-footer")?.textContent || "",
    /Track your order here after submitting\./,
  );
  assert.equal(screen.queryByText("Something lovely,"), null);
  assert.equal(writes.length, 0);
  assert.equal(
    screen.getByRole("button", { name: "Sold out: Seasonal smoothie" })
      .disabled,
    true,
  );
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
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(
    screen.getByRole("button", { name: "Choose: Brown Sugar Boba" }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Less sugar" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  assert(screen.getByText("Regular · Less sugar"));
  fireEvent.click(
    screen.getByRole("button", { name: "View basket, 1 item, ₦3,800" }),
  );
  assert.equal(
    document.activeElement,
    screen.getByRole("heading", { name: "Your basket" }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Add one Brown Sugar Boba (Regular · Less sugar)",
    }),
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
  await screen.findByRole("heading", { name: "Your basket" });
  assert(screen.getByRole("heading", { name: "The menu is on its way" }));
  assert.equal(
    screen.getByRole("button", { name: "Submit order" }).disabled,
    true,
  );
  cleanup();
});

test("C1 menu load failure offers a working retry without opening checkout", async (t) => {
  let attempts = 0;
  mockGuestSessionFetch(t, async (input: any) => {
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
  await screen.findByRole("heading", { name: "Your basket" });
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
  mockGuestSessionFetch(t, async (input: any, init: any) => {
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
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(
    screen.getByRole("button", { name: "Choose: Brown Sugar Boba" }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Less sugar" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
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
    screen.getByRole("button", {
      name: "Add one Brown Sugar Boba (Regular · Less sugar)",
    }).disabled,
    true,
  );
  assert.equal(
    screen.getByRole("button", { name: "Choose: Brown Sugar Boba" }).disabled,
    true,
  );
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
    screen.getByRole("button", {
      name: "Add one Brown Sugar Boba (Regular · Less sugar)",
    }),
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
  mockGuestSessionFetch(t, async (input: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "Guest required" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.endsWith("/orders"))
      return Response.json(
        {
          error: "The menu changed. Review your basket.",
          code: "MENU_CHANGED",
        },
        { status: 409 },
      );
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(
    screen.getByRole("button", { name: "Choose: Brown Sugar Boba" }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Less sugar" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
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
    screen.getByRole("button", {
      name: "Add one Brown Sugar Boba (Regular · Less sugar)",
    }).disabled,
    false,
  );
  cleanup();
});

test("C1/C5 required customization focuses the invalid group and isolates the dialog", async (t) => {
  mockMenu(t);
  const originalOverflow = document.body.style.overflow;
  document.body.style.overflow = "clip";
  t.after(() => {
    cleanup();
    document.body.style.overflow = originalOverflow;
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  const trigger = screen.getByRole("button", {
    name: "Choose: Brown Sugar Boba",
  });
  await waitFor(() => assert.equal(trigger.disabled, false));
  trigger.focus();
  fireEvent.click(trigger);
  assert.equal(document.querySelector("main")?.hasAttribute("inert"), true);
  assert.equal(screen.queryByRole("main"), null);
  assert.equal(document.body.style.overflow, "hidden");
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  const group = screen.getByRole("group", { name: "Sweetness · choose 1" });
  assert.equal(document.activeElement, group);
  assert.equal(group.getAttribute("aria-invalid"), "true");
  assert.match(
    group.getAttribute("aria-describedby") || "",
    /mc-modifier-error/,
  );
  assert.equal(screen.getAllByRole("alert").length, 1);
  assert.match(
    screen.getByRole("alert").textContent || "",
    /Choose 1 option for Sweetness/,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Less sugar" }));
  assert.equal(screen.queryByRole("alert"), null);
  assert.equal(group.getAttribute("aria-invalid"), null);
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.querySelector("main")?.hasAttribute("inert"), false);
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, "clip");
});

test("C1/C5 long customization labels remain named and its action sits outside the scrolling options", async (t) => {
  const longName =
    "BlackcurrantAndStrawberryMilkTeaWithExtraLongProductDescriptionForSmallScreenCustomers";
  const longOption =
    "LessSugarWithAnExtraLongPreparationPreferenceThatMustRemainReadable";
  mockMenu(t, {
    ...menu,
    products: [
      {
        ...product,
        name: longName,
        modifierGroups: [
          {
            id: "sweetness",
            name: "Sweetness preference",
            min: 1,
            max: 1,
            options: [{ id: "less-sugar", name: longOption, price: 0 }],
          },
        ],
      },
    ],
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText(longName);
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(screen.getByRole("button", { name: "Choose: " + longName }));
  const dialog = screen.getByRole("dialog", { name: longName }),
    option = screen.getByRole("checkbox", { name: longOption }),
    add = screen.getByRole("button", { name: "Add to basket" });
  assert(dialog.querySelector(".mc-modal-content")?.contains(option));
  assert.equal(dialog.querySelector(".mc-modal-content")?.contains(add), false);
  assert(dialog.querySelector(".mc-modal-actions")?.contains(add));
  const search = document.querySelector<HTMLInputElement>(".mc-search")!;
  search.focus();
  fireEvent.keyDown(document, { key: "Tab" });
  assert.equal(
    document.activeElement,
    screen.getByRole("button", { name: "Close customization" }),
  );
  fireEvent.click(option);
  fireEvent.click(add);
  assert.equal(screen.queryByRole("dialog"), null);
  assert(
    screen.getByRole("button", {
      name: `Add one ${longName} (Regular · ${longOption})`,
    }),
  );
  cleanup();
});

test("C2 an uncertain order survives auth and rate-limit rejections until original success", async (t) => {
  const attempts: any[] = [];
  mockGuestSessionFetch(t, async (input: any, init: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "Guest required" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.endsWith("/orders")) {
      attempts.push(JSON.parse(init.body));
      if (attempts.length === 1) throw new TypeError("Failed to fetch");
      const status = [401, 403, 429][attempts.length - 2];
      if (status)
        return Response.json(
          { error: "Retry not resolved", code: "FORBIDDEN" },
          { status },
        );
      return Response.json({
        id: "order-one",
        reference: "M-UNCHANGED",
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
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(
    screen.getByRole("button", { name: "Choose: Brown Sugar Boba" }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Less sugar" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), {
    target: { value: "Ada" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  for (let i = 0; i < 4; i++) {
    await screen.findByRole("button", { name: "Retry original order" });
    assert.equal(
      screen.getByRole("textbox", { name: "Your name" }).disabled,
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original order" }),
    );
  }
  await screen.findByText("M-UNCHANGED");
  assert.equal(attempts.length, 5);
  for (const body of attempts) assert.deepEqual(body, attempts[0]);
  cleanup();
});

test("C2 feedback confirmation resets when another completed order is selected", async (t) => {
  const orders = [
    {
      id: "order-two",
      reference: "M-SECOND",
      createdAt: "2026-11-18T11:00:00Z",
    },
    {
      id: "order-one",
      reference: "M-FIRST",
      createdAt: "2026-11-18T12:00:00Z",
    },
  ];
  mockGuestSessionFetch(t, async (input: any, init: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ displayName: "Ada", orders });
    if (path.includes("/guest-orders?"))
      return Response.json({
        orders: orders.map((order) => ({
          ...order,
          status: "completed",
          paymentStatus: "paid",
        })),
        nextCursor: null,
      });
    if (path.endsWith("/feedback"))
      return Response.json({ id: "feedback-one" });
    if (path.includes("/public/orders/")) {
      const first = path.endsWith("/order-one");
      return Response.json({
        id: first ? "order-one" : "order-two",
        reference: first ? "M-FIRST" : "M-SECOND",
        status: "completed",
        paymentStatus: "paid",
        paid: 380000,
        total: 380000,
        items: [],
        history: [],
      });
    }
    if (path.endsWith("/activity"))
      return Response.json({ reservations: [], feedback: [] });
    if (path.endsWith("/consent")) return Response.json({ marketing: false });
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  fireEvent.click(screen.getByRole("button", { name: "Your order" }));
  await screen.findByText("M-FIRST");
  fireEvent.change(screen.getByRole("combobox", { name: "Rating" }), {
    target: { value: "4" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Tell the venue" }), {
    target: { value: "Good service" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Send private feedback" }),
  );
  await screen.findByText("Feedback received. Thank you.");
  fireEvent.click(screen.getByRole("button", { name: "Open order M-SECOND" }));
  await screen.findByText("M-SECOND");
  assert.equal(screen.queryByText("Feedback received. Thank you."), null);
  assert.equal(screen.getByRole("combobox", { name: "Rating" }).value, "");
  assert.equal(
    screen.getByRole("textbox", { name: "Tell the venue" }).value,
    "",
  );
  cleanup();
});
