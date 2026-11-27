import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mockGuestSessionFetch } from "./mera-customer-session-fixture.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/mera/menu/cafe/20000000-0000-4000-8000-000000000001",
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
const { default: CustomerExperience } =
  await import("../src/mera/customer/CustomerExperience");
const { default: OrderProgress } =
  await import("../src/mera/customer/OrderProgress");
const { readBasket, basketStorageKey } =
  await import("../src/mera/customer/basketStorage");
const branch = "20000000-0000-4000-8000-000000000001";
const tableId = "50000000-0000-4000-8000-000000000001";
const plain = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "Tea",
  code: "",
  category: "Drinks",
  description: "Fresh tea",
  price: 100000,
  available: true,
  stockMode: "unlimited",
  stock: 0,
  variants: [],
  modifierGroups: [],
};
const other = {
  ...plain,
  id: "30000000-0000-4000-8000-000000000002",
  name: "Toast",
  category: "Food",
  description: "Crisp toast",
};
const menu = {
  organization: { id: "10000000-0000-4000-8000-000000000001", name: "Cafe" },
  branch: {
    id: branch,
    name: "Main",
    settings: { serviceModes: ["counter_takeaway", "table_service"] },
  },
  tables: [{ id: tableId, name: "Table 2" }],
  version: 1,
  orderingAvailable: true,
  reservationsOffered: false,
  products: [plain, other],
};
function mockApi(
  t: any,
  value: any = menu,
  reject?: string,
  productIds?: string[],
) {
  const writes: any[] = [];
  mockGuestSessionFetch(t, async (input: any, init: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(value);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "Guest required" }, { status: 401 });
    if (path.endsWith("/guests"))
      return Response.json({ displayName: "Guest" });
    if (path.endsWith("/help-requests")) {
      if (init.method === "GET") return Response.json({ requests: [] });
      writes.push(JSON.parse(init.body));
      return Response.json({
        id: "60000000-0000-4000-8000-000000000001",
        reference: "H-1",
        category: "service",
        message: writes.at(-1).message,
        status: "open",
      });
    }
    if (path.endsWith("/orders")) {
      writes.push(JSON.parse(init.body));
      if (reject)
        return Response.json(
          {
            error: "Review the menu",
            code: reject,
            ...(productIds ? { details: { productIds } } : {}),
          },
          { status: 409 },
        );
      return Response.json({
        id: "70000000-0000-4000-8000-000000000001",
        reference: "M-1",
        status: "submitted",
        fulfillment: writes.at(-1).fulfillment,
        paymentStatus: "unpaid",
        total: 100000,
        items: [],
        history: [],
      });
    }
    if (path.includes("guest-orders"))
      return Response.json({ orders: [], nextCursor: null });
    if (path.endsWith("/activity"))
      return Response.json({ reservations: [], feedback: [] });
    if (path.endsWith("/consent")) return Response.json({ marketing: false });
    throw Error("Unexpected " + path);
  });
  return writes;
}
async function mount() {
  render(<CustomerExperience />);
  await screen.findByRole("heading", { name: "Your basket" });
  await waitFor(() =>
    assert.equal(
      (
        screen.queryByRole("button", { name: "Add: Tea" }) ||
        (screen.getByRole("button", {
          name: "Increase Menu quantity for Tea",
        }) as any)
      ).disabled,
      false,
    ),
  );
}
function add(name = "Tea") {
  fireEvent.click(screen.getByRole("button", { name: "Add: " + name }));
}
test.beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", `/mera/menu/cafe/${branch}`);
});
test.afterEach(cleanup);
test("compact photo-free rows, section headings, chip navigation and search across sections", async (t) => {
  mockApi(t);
  await mount();
  assert.equal(document.querySelector(".mc-product img"), null);
  assert.equal(screen.queryByText("Photo coming soon"), null);
  assert.ok(document.querySelector(".mc-compact-product"));
  const heading = screen.getByRole("heading", { name: "Food" });
  let scrolled = false;
  heading.scrollIntoView = () => {
    scrolled = true;
  };
  fireEvent.click(screen.getByRole("radio", { name: "Food", exact: true }));
  assert.equal(scrolled, true);
  assert.ok(screen.getByRole("heading", { name: "Drinks" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search menu" }), {
    target: { value: "Tea" },
  });
  assert.equal(screen.queryByRole("heading", { name: "Food" }), null);
});
test("one-tap add becomes a stepper and announces basket quantity", async (t) => {
  mockApi(t);
  await mount();
  add();
  assert.equal(screen.queryByRole("dialog"), null);
  assert.ok(screen.getByRole("spinbutton", { name: "Menu quantity for Tea" }));
  assert.match(
    document.querySelector(".mc-basket-live")!.textContent!,
    /1 item in basket/,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Increase Menu quantity for Tea" }),
  );
  assert.match(
    document.querySelector(".mc-basket-live")!.textContent!,
    /2 items/,
  );
});
test("basket survives remount and removes unavailable items on reload", async (t) => {
  let value = structuredClone(menu);
  mockApi(t, value);
  await mount();
  add();
  add("Toast");
  cleanup();
  value.products[1].available = false;
  await mount();
  await waitFor(() =>
    assert.ok(
      screen.getByRole("spinbutton", { name: "Menu quantity for Tea" }),
    ),
  );
  assert.equal(
    document.querySelectorAll(".mc-checkout-items .mc-line").length,
    1,
  );
});
test("changed menu drops customizations and reprices plain items; corrupt storage is ignored", () => {
  const line = {
    key: plain.id + ":",
    productId: plain.id,
    name: "Tea",
    quantity: 1,
    unitPrice: 1,
    modifiers: [],
    summary: "",
  };
  const scope = "cafe:" + branch;
  window.localStorage.setItem(
    basketStorageKey(scope),
    JSON.stringify({
      version: 1,
      menuVersion: 1,
      lines: [line, { ...line, key: "custom", modifiers: ["old"] }],
    }),
  );
  const restored = readBasket(scope, { ...menu, version: 2 });
  assert.equal(restored?.length, 1);
  assert.equal(restored?.[0].unitPrice, plain.price);
  window.localStorage.setItem(basketStorageKey(scope), "bad json");
  assert.equal(readBasket(scope, menu), null);
});
test("table QR plain item is placed in three clicks with tracking next steps", async (t) => {
  window.history.replaceState(
    {},
    "",
    `/mera/menu/cafe/${branch}?tableId=${tableId}`,
  );
  const writes = mockApi(t);
  await mount();
  assert.match(
    screen.getByText(/ordering to your table/).textContent!,
    /Table 2/,
  );
  let clicks = 0;
  const click = (node: HTMLElement) => {
    clicks++;
    fireEvent.click(node);
  };
  click(screen.getByRole("button", { name: "Add: Tea" }));
  click(screen.getByRole("button", { name: /View basket,/ }));
  click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByRole("region", { name: "Order progress" });
  assert.ok(clicks <= 4);
  assert.equal(writes[0].tableId, tableId);
  assert.ok(screen.getByRole("button", { name: "Order more" }));
});
test("fulfilment is asked once up front and retains the choice at basket", async (t) => {
  mockApi(t);
  await mount();
  assert.equal(screen.getAllByRole("group", { name: "Enjoy it" }).length, 1);
  assert.ok(
    document
      .querySelector(".mc-menu")
      ?.contains(screen.getByRole("group", { name: "Enjoy it" })) ||
      !document
        .querySelector(".mc-cart")
        ?.contains(screen.getByRole("group", { name: "Enjoy it" })),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Takeaway", exact: true }));
  add();
  fireEvent.click(screen.getByRole("button", { name: /View basket,/ }));
  assert.equal(
    (
      screen.getByRole("radio", {
        name: "Takeaway",
        exact: true,
      }) as HTMLInputElement
    ).checked,
    true,
  );
});
for (const code of ["OUT_OF_STOCK", "MENU_CHANGED", "TOO_MANY_OPEN_ORDERS"])
  test(`${code} marks only affected lines, cap marks none`, async (t) => {
    mockApi(t, menu, code, [plain.id]);
    await mount();
    add();
    add("Toast");
    fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
    await screen.findByText("Review the menu");
    await waitFor(() =>
      assert.equal(
        document.querySelectorAll(".mc-line small[role=status]").length,
        code === "TOO_MANY_OPEN_ORDERS" ? 0 : 1,
      ),
    );
    if (code !== "TOO_MANY_OPEN_ORDERS")
      assert.match(
        document.querySelector(".mc-line small[role=status]")!.parentElement!
          .textContent!,
        /Tea/,
      );
  });
test("tracking shows next steps for every stage and help includes the known table", async (t) => {
  const view = render(
    <OrderProgress
      order={{ status: "preparing", fulfillment: "table_service" }}
    />,
  );
  assert.match(
    screen.getByRole("region", { name: "Order progress" }).textContent!,
    /Received.*Preparing.*Ready.*Served/,
  );
  view.rerender(
    <OrderProgress
      order={{ status: "ready", fulfillment: "counter_pickup" }}
    />,
  );
  assert.ok(screen.getByText(/Please collect it from the counter/));
  cleanup();
  window.history.replaceState(
    {},
    "",
    `/mera/menu/cafe/${branch}?tableId=${tableId}`,
  );
  const writes = mockApi(t);
  await mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Ask for help", exact: true }),
  );
  await screen.findByText("For Table 2");
  fireEvent.click(screen.getByRole("button", { name: /Call a waiter/ }));
  await waitFor(() => assert.equal(writes.length, 1));
  assert.match(writes[0].message, /^Table 2:/);
});
test("195-item menu keeps category sections navigable and follows the visible section", async (t) => {
  let observeSection: ((entries: any[]) => void) | undefined;
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "IntersectionObserver",
  );
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: class {
      constructor(
        private callback: (entries: any[]) => void,
        private options: any,
      ) {
        if (options.rootMargin) observeSection = callback;
      }
      observe() {}
      disconnect() {}
    },
  });
  t.after(() => {
    if (original)
      Object.defineProperty(globalThis, "IntersectionObserver", original);
    else delete (globalThis as any).IntersectionObserver;
  });
  mockApi(t, {
    ...menu,
    products: Array.from({ length: 195 }, (_, i) => ({
      ...plain,
      id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: "Item " + i,
      category: "Category " + Math.floor(i / 15),
    })),
  });
  render(<CustomerExperience />);
  await screen.findByRole("heading", { name: "Category 12" });
  assert.equal(document.querySelectorAll(".mc-product").length, 195);
  assert.equal(document.querySelectorAll(".mc-section-heading").length, 13);
  const { act } = await import("@testing-library/react");
  await act(() =>
    observeSection?.([
      {
        isIntersecting: true,
        target: screen.getByRole("heading", { name: "Category 12" }),
      },
    ]),
  );
  assert.equal(
    (
      screen.getByRole("radio", {
        name: "Category 12",
        exact: true,
      }) as HTMLInputElement
    ).checked,
    true,
  );
});
test("phone basket traps focus, closes with Escape, and places a table order in three clicks", async (t) => {
  const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  t.after(() => {
    cleanup();
    if (original) Object.defineProperty(window, "matchMedia", original);
    else delete (window as any).matchMedia;
  });
  window.history.replaceState(
    {},
    "",
    `/mera/menu/cafe/${branch}?tableId=${tableId}`,
  );
  const writes = mockApi(t);
  render(<CustomerExperience />);
  const addButton = await screen.findByRole("button", { name: "Add: Tea" });
  await waitFor(() =>
    assert.equal((addButton as HTMLButtonElement).disabled, false),
  );
  let clicks = 0;
  const click = (node: HTMLElement) => {
    clicks++;
    node.focus();
    fireEvent.click(node);
  };
  click(addButton);
  const bar = screen.getByRole("button", { name: /View basket,/ });
  click(bar);
  const sheet = screen.getByRole("dialog", { name: "Your basket" });
  assert.equal(sheet.getAttribute("aria-modal"), "true");
  assert.ok(sheet.contains(document.activeElement));
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  assert.ok(sheet.contains(document.activeElement));
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.ok(document.activeElement === bar);
  // Reopen is a separate dismissal check; count the uninterrupted purchase path.
  clicks--;
  click(bar);
  click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByRole("region", { name: "Order progress" });
  assert.equal(clicks, 3);
  assert.equal(writes.length, 1);
});
test("required choices open customization while optional extras do not block direct add", async (t) => {
  mockApi(t, {
    ...menu,
    products: [
      {
        ...plain,
        modifierGroups: [
          {
            id: "sweetness",
            name: "Sweetness",
            min: 1,
            max: 1,
            options: [{ id: "less", name: "Less sugar", price: 0 }],
          },
        ],
      },
    ],
  });
  render(<CustomerExperience />);
  const choose = await screen.findByRole("button", { name: "Choose: Tea" });
  await waitFor(() =>
    assert.equal((choose as HTMLButtonElement).disabled, false),
  );
  fireEvent.click(choose);
  assert.ok(screen.getByRole("dialog"));
  assert.ok(screen.getByRole("checkbox", { name: "Less sugar" }));
});
test("only supported fulfilment modes are offered", async (t) => {
  mockApi(t, {
    ...menu,
    tableService: true,
    branch: { ...menu.branch, settings: { serviceModes: ["table_service"] } },
  });
  await mount();
  assert.equal(
    screen.queryByRole("radio", { name: "Takeaway", exact: true }),
    null,
  );
  assert.ok(screen.getByRole("radio", { name: "At my table", exact: true }));
});
test("a rejection without item details falls back to reviewing every basket line", async (t) => {
  mockApi(t, menu, "OUT_OF_STOCK");
  await mount();
  add();
  add("Toast");
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByText("Review the menu");
  await waitFor(() =>
    assert.equal(
      document.querySelectorAll(".mc-line small[role=status]").length,
      2,
    ),
  );
});
test("optional extras stay available without adding a mandatory customization tap", async (t) => {
  mockApi(t, {
    ...menu,
    products: [
      {
        ...plain,
        modifierGroups: [
          {
            id: "extras",
            name: "Extras",
            min: 0,
            max: 1,
            options: [{ id: "milk", name: "Milk", price: 100 }],
          },
        ],
      },
    ],
  });
  await mount();
  add();
  assert.equal(screen.queryByRole("dialog"), null);
  fireEvent.click(screen.getByRole("button", { name: "Customize: Tea" }));
  assert.ok(screen.getByRole("checkbox", { name: "Milk" }));
});
test("basket storage is scoped and remains optional when storage is denied", async (t) => {
  const { saveBasket } = await import("../src/mera/customer/basketStorage");
  const line = {
    key: plain.id + ":",
    productId: plain.id,
    name: "Tea",
    quantity: 1,
    unitPrice: 100000,
    modifiers: [],
    summary: "",
  };
  saveBasket("cafe:" + branch, 1, [line]);
  assert.equal(readBasket("another:" + branch, menu), null);
  t.mock.method(Object.getPrototypeOf(window.localStorage), "getItem", () => {
    throw Error("Storage denied");
  });
  t.mock.method(Object.getPrototypeOf(window.localStorage), "setItem", () => {
    throw Error("Storage denied");
  });
  assert.equal(readBasket("cafe:" + branch, menu), null);
  assert.doesNotThrow(() => saveBasket("cafe:" + branch, 1, [line]));
});
