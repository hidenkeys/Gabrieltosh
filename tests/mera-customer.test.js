import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3002/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001",
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
    value: dom.window[key],
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
const menu = {
  organization: { name: "Bing Chun" },
  branch: { name: "Surulere" },
  version: 1,
  orderingAvailable: true,
  products: [
    {
      id: "p1",
      code: "C2",
      name: "Brown Sugar Boba",
      category: "Milk tea",
      description: "",
      size: "700 ml",
      price: 380000,
      available: true,
      stockMode: "unlimited",
      variants: [],
      modifierGroups: [],
      allergens: [],
      dietary: [],
    },
  ],
};
test("an uncertain checkout remains visible and retries retain the original idempotency key", async (t) => {
  const keys = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    if (String(input).endsWith("/guest"))
      return Response.json(
        { error: "Guest session required" },
        { status: 401 },
      );
    if (String(input).endsWith("/menu")) return Response.json(menu);
    if (String(input).endsWith("/guests"))
      return Response.json({ displayName: "Ada" });
    if (String(input).endsWith("/orders")) {
      keys.push(JSON.parse(init.body).requestKey);
      throw new TypeError("Failed to fetch");
    }
    throw new Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  fireEvent.click(screen.getByRole("button", { name: "Choose" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to collection" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), {
    target: { value: "Ada" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByRole("alert");
  assert.match(
    screen.getByRole("alert").textContent || "",
    /an order may already have reached/,
  );
  assert.equal(screen.queryByText(/Reference/), null);
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByRole("alert");
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  cleanup();
});

test("an expired table visit removes the previous private bill", async (t) => {
  let closed = false;
  t.mock.method(globalThis, "fetch", async (input) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/guest"))
      return Response.json(
        { error: "Guest session required" },
        { status: 401 },
      );
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.endsWith("/visits/join"))
      return Response.json({ id: "visit-one" });
    if (path.endsWith("/visits/visit-one"))
      return closed
        ? Response.json({ error: "Visit not found." }, { status: 404 })
        : Response.json({
            visit: { id: "visit-one", tableName: "Table one" },
            balance: 10000,
            orders: [
              {
                id: "o1",
                reference: "M-PRIVATE",
                displayName: "Ada",
                status: "ready",
                total: 10000,
                paid: 0,
                items: [
                  { name: "Private table dessert", quantity: 1, total: 10000 },
                ],
              },
            ],
          });
    throw new Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  fireEvent.click(screen.getByRole("button", { name: "Join a table" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), {
    target: { value: "Ada" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Visit reference" }), {
    target: { value: "visit-one" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Joining code" }), {
    target: { value: "1234" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join current visit" }));
  await screen.findByRole("button", { name: "Your order" });
  fireEvent.click(screen.getByRole("button", { name: "Join a table" }));
  await screen.findByText("1 × Private table dessert");
  closed = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh bill" }));
  await screen.findByRole("textbox", { name: "Visit reference" });
  assert.equal(screen.queryByText("1 × Private table dessert"), null);
  cleanup();
});
