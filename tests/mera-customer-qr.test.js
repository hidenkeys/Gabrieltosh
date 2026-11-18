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
test("table QR context never fetches a private bill before code validation", async (t) => {
  window.history.replaceState({}, "", "?tableId=table-one");
  const calls = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const path = String(input);
    calls.push({ path, body: init?.body });
    if (path.endsWith("/menu"))
      return Response.json({
        ...menu,
        tables: [{ id: "table-one", name: "Window table" }],
      });
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "guest" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.endsWith("/visits/join"))
      return Response.json({ error: "Invalid joining code" }, { status: 403 });
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  assert.equal(
    calls.some((c) => /public\/visits\//.test(c.path)),
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Join a table" }));
  assert.equal(
    screen.getByRole("combobox", { name: "Table" }).value,
    "table-one",
  );
  assert.equal(
    screen.queryByRole("textbox", { name: "Visit reference" }),
    null,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), {
    target: { value: "Ada" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Joining code" }), {
    target: { value: "invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join current visit" }));
  await screen.findByRole("alert");
  const joined = calls.find((c) => c.path.endsWith("/visits/join"));
  assert.deepEqual(JSON.parse(joined.body), {
    tableId: "table-one",
    code: "invalid",
  });
  assert.equal(
    calls.some((c) => /public\/visits\//.test(c.path)),
    false,
  );
  cleanup();
  window.history.replaceState(
    {},
    "",
    "/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001",
  );
});

test("deposit cancellation shows pending review without claiming refund", async (t) => {
  let requested = false;
  const { default: GuestActivity } =
    await import("../src/mera/customer/GuestActivity.tsx");
  t.mock.method(globalThis, "fetch", async (input, init) => {
    if (String(input).endsWith("/activity"))
      return Response.json({
        reservations: [
          {
            id: "reservation-one",
            startsAt: "2026-12-01T12:00:00Z",
            partySize: 2,
            status: "confirmed",
            depositAmount: 50000,
            depositRequired: 50000,
            cancellationRequestedAt: requested ? "2026-11-18T12:00:00Z" : null,
          },
        ],
        feedback: [
          {
            id: "feedback-one",
            category: "service",
            rating: 2,
            text: "Please review service timing",
            status: "open",
            createdAt: "2026-11-18T10:00:00Z",
          },
        ],
      });
    if (String(input).endsWith("/cancellation")) {
      assert.equal(JSON.parse(init.body).reason, "Plans changed");
      requested = true;
      return Response.json({
        depositReviewRequired: true,
        refundConfirmed: false,
      });
    }
    throw Error("Unexpected request");
  });
  render(React.createElement(GuestActivity, { prefix: "/public/org/branch" }));
  await screen.findByText("Please review service timing");
  fireEvent.change(
    screen.getByRole("textbox", { name: "Cancellation reason" }),
    { target: { value: "Plans changed" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Request cancellation" }));
  await screen.findByRole("status");
  assert.match(
    screen.getByRole("status").textContent,
    /no refund is confirmed/,
  );
  assert(screen.getByText("Status: confirmed"));
  assert.equal(
    screen.queryByRole("button", { name: "Request cancellation" }),
    null,
  );
  cleanup();
});
