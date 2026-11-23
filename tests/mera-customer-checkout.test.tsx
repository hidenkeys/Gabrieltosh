import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mockGuestSessionFetch } from "./mera-customer-session-fixture.js";
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
  await import("../src/mera/customer/CustomerExperience");
const menu = {
  organization: {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Bing Chun",
  },
  branch: { id: "20000000-0000-4000-8000-000000000001", name: "Surulere" },
  version: 1,
  orderingAvailable: true,
  tables: [],
  products: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      name: "Tea",
      code: "A1",
      category: "Tea",
      price: 100000,
      available: true,
      stockMode: "unlimited",
      stock: 0,
      variants: [],
      modifierGroups: [],
    },
  ],
};
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(cleanup);
async function mount() {
  render(<CustomerExperience />);
  await screen.findByRole("heading", { name: "Your basket" });
}
function add() {
  fireEvent.click(screen.getByRole("button", { name: "Choose: Tea" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
}
function api(
  t: any,
  special?: (path: string, init: any) => any,
  value: any = menu,
) {
  const writes: any[] = [];
  mockGuestSessionFetch(t, async (input: any, init: any) => {
    const path = String(input);
    if (init.method !== "GET")
      writes.push({ path, body: JSON.parse(init.body) });
    if (path.endsWith("/menu"))
      return Response.json(typeof value === "function" ? value() : value);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "Guest required" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (special) return special(path, init);
    throw Error("Unexpected request: " + path);
  });
  return writes;
}
test("checkout name is optional and the first exact request uses the friendly Guest default", async (t) => {
  const writes = api(t, (path) =>
    path.endsWith("/orders")
      ? Response.json({
          id: "order-one",
          reference: "M-GUEST",
          status: "submitted",
          paymentStatus: "unpaid",
          paid: 0,
          total: 100000,
          items: [],
          history: [],
        })
      : Response.json({
          orders: [],
          nextCursor: null,
          reservations: [],
          feedback: [],
          marketing: false,
        }),
  );
  await mount();
  add();
  const name = screen.getByRole("textbox", {
    name: "What should we call you?",
  }) as HTMLInputElement;
  assert.equal(name.required, false);
  assert.match(
    name.getAttribute("aria-describedby") || "",
    /mc-order-name-hint/,
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByText("M-GUEST", { selector: "b", exact: true });
  assert.equal(
    writes.find((write) => write.path.endsWith("/orders")).body.displayName,
    "Guest",
  );
  assert.equal(name.getAttribute("aria-invalid"), null);
});
test("direct form submission cannot bypass empty-basket or overlong-name controller guards", async (t) => {
  const writes = api(t);
  await mount();
  fireEvent.submit(screen.getByRole("form", { name: "Review your order" }));
  await screen.findByText(
    /Your basket is empty. Choose something from the menu before submitting/,
  );
  assert.equal(writes.length, 0);
  add();
  fireEvent.change(
    screen.getByRole("textbox", { name: "What should we call you?" }),
    { target: { value: "X".repeat(101) } },
  );
  fireEvent.submit(screen.getByRole("form", { name: "Review your order" }));
  await screen.findByText(/Enter the name we should call/);
  assert.equal(writes.length, 0);
});
test("a paused fresh-order controller rejects programmatic submit even with a retained basket", async (t) => {
  let paused = false;
  const writes = api(
    t,
    (path) => {
      if (path.endsWith("/orders")) {
        paused = true;
        return Response.json(
          { error: "Menu changed", code: "MENU_CHANGED" },
          { status: 409 },
        );
      }
      throw Error("Unexpected request");
    },
    () => ({ ...menu, orderingAvailable: !paused }),
  );
  await mount();
  add();
  fireEvent.change(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    {
      target: { value: "Ada" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByText("Menu changed");
  const count = writes.length;
  fireEvent.submit(screen.getByRole("form", { name: "Review your order" }));
  await screen.findByText(/Ordering is paused. You can keep browsing/);
  assert.equal(writes.length, count);
  assert.equal(writes.filter((row) => row.path.endsWith("/orders")).length, 1);
});
test("checkout failure stays local and original retry ignores mutable fields and stop-reason validation", async (t) => {
  const bodies: any[] = [];
  api(t, (path, init) => {
    if (path.endsWith("/orders")) {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) throw Error("Lost response");
      return Response.json({
        id: "70000000-0000-4000-8000-000000000001",
        reference: "M-ORIGINAL",
        status: "submitted",
        paymentStatus: "unpaid",
        total: 100000,
        paid: 0,
        items: [],
        history: [],
      });
    }
    throw Error("Unexpected request");
  });
  await mount();
  add();
  fireEvent.change(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    {
      target: { value: "Ada" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  const error = await screen.findByRole("alert");
  assert(error.closest("#mc-basket"));
  assert.equal(
    document.activeElement === error,
    true,
    "uncertain error focuses local summary",
  );
  assert.equal(screen.queryByRole("button", { name: "Refresh menu" }), null);
  fireEvent.click(
    screen.getByRole("button", { name: "Stop unconfirmed request…" }),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Why stop this request? details" }),
    { target: { value: "ab" } },
  );
  const name = screen.getByRole("textbox", {
    name: /^(?:Your name|What should we call you\?)$/,
  }) as HTMLInputElement;
  name.value = "";
  fireEvent.click(screen.getByRole("button", { name: "Retry original order" }));
  await screen.findByText("M-ORIGINAL");
  assert.equal(
    document.activeElement ===
      screen.getByRole("heading", { name: "Your order" }),
    true,
    "accepted order focuses its tracking heading",
  );
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(bodies[1].displayName, "Ada");
});
test("expired server review is labelled previous and never silently refreshes or submits", async (t) => {
  let quotes = 0,
    orders = 0;
  api(
    t,
    (path) => {
      if (path.endsWith("/quote")) {
        quotes++;
        return Response.json(
          {
            id: "50000000-0000-4000-8000-000000000001",
            menuVersion: 1,
            currency: "NGN",
            subtotal: 100000,
            discount: 0,
            serviceCharge: 10000,
            tax: 0,
            total: 110000,
            lines: [
              {
                type: "service_charge",
                label: "Service charge",
                amount: 10000,
              },
            ],
            policyVersion: "v1",
            expiresAt: "2026-11-18T12:00:01.150Z",
          },
          { headers: { Date: "Wed, 18 Nov 2026 12:00:00 GMT" } },
        );
      }
      if (path.endsWith("/orders")) orders++;
      throw Error("No order expected");
    },
    { ...menu, pricingPolicy: { enabled: true } },
  );
  await mount();
  add();
  fireEvent.change(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    {
      target: { value: "Ada" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Review total" }));
  await screen.findByRole("heading", { name: "Previous price review" });
  assert(screen.getByText("Previous reviewed total"));
  assert(screen.getByRole("button", { name: "Review latest total" }));
  assert.equal(quotes, 1);
  assert.equal(orders, 0);
  assert.equal(screen.queryByLabelText("Server price review"), null);
});
test("variant catalog entry does not advertise base zero as the item price", async (t) => {
  api(t, undefined, {
    ...menu,
    products: [
      {
        ...menu.products[0],
        price: 0,
        variants: [{ id: "large", name: "Large", price: 350000 }],
      },
    ],
  });
  await mount();
  const card = document.querySelector(".mc-product")!;
  assert.equal(
    card.querySelector(".mc-price")?.textContent,
    "Choose size for price",
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose: Tea" }));
  assert(screen.getByRole("radio", { name: "Large · ₦3,500.00" }));
  assert(screen.getByText("₦3,500.00"));
});

test("tracking and receipt present unpaid truth and branch-labelled activity dates without raw internal states", async (t) => {
  api(
    t,
    (path) => {
      if (path.endsWith("/orders"))
        return Response.json({
          id: "70000000-0000-4000-8000-000000000001",
          reference: "M-READABLE",
          status: "submitted",
          paymentStatus: "unpaid",
          total: 100000,
          paid: 0,
          createdAt: "2026-11-19T12:00:00.000Z",
          items: [],
          history: [{ action: "submitted", at: "2026-11-19T12:00:00.000Z" }],
        });
      throw Error("Unexpected request");
    },
    { ...menu, branch: { ...menu.branch, timezone: "Africa/Lagos" } },
  );
  await mount();
  add();
  fireEvent.change(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    {
      target: { value: "Ada" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByText("M-READABLE");
  assert.deepEqual(
    [...document.querySelectorAll(".mc-tracking-panel .mc-state")].map(
      (element) => element.textContent,
    ),
    ["Sent to the venue", "Payment not yet confirmed"],
  );
  const receipt = screen.getByLabelText("Order details");
  assert.match(receipt.textContent || "", /Order status: Sent to the venue/);
  assert.match(
    receipt.textContent || "",
    /Payment status: Payment not yet confirmed/,
  );
  assert.match(
    receipt.textContent || "",
    /Placed 19 Nov 2026, 13:00 · Africa\/Lagos/,
  );
  assert.match(
    document.querySelector(".mc-tracking-panel .mc-history")?.textContent || "",
    /Sent to the venue.*19 Nov 2026, 13:00 · Africa\/Lagos/,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Print payment receipt" }),
    null,
  );
  assert.equal(
    receipt.textContent?.includes("70000000-0000-4000-8000-000000000001"),
    false,
  );
});
