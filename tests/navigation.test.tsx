import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3002",
});
for (const key of [
  "window",
  "document",
  "localStorage",
  "HTMLElement",
  "Event",
  "MouseEvent",
])
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
// Newer/instrumented browser APIs can return a promise: effects must never return it as cleanup.
window.scrollTo = (() => Promise.resolve()) as any;
const React = await import("react");
const { render, screen, fireEvent, waitFor, cleanup } =
  await import("@testing-library/react");
const { default: App } = await import("../src/App");
const template = {
  businessName: "BING CHUN",
  subtitle: "A little joy in every cup.",
  address: "Surulere",
  phone: "",
  footer: "Thank you.",
  showStaff: true,
  showOptions: true,
  showPayment: true,
  showCode: true,
  headingSize: "large",
  align: "center",
  paperWidth: 58,
  labelWidth: 50,
  labelHeight: 30,
  labelShowStaff: false,
};
const user = {
  id: "admin-test",
  name: "Test administrator",
  username: "admin",
  role: "admin",
  active: true,
};
let failingReport = false;
globalThis.fetch = (async (input: any) => {
  const path = String(input).replace("/api", "").split("?")[0];
  const data: any = {
    "/me": user,
    "/products": [],
    "/orders": [],
    "/settings": {
      receipt: template,
      business: { name: "Bing Chun", branch: "Surulere" },
    },
    "/printing": { jobs: [], worker: { mode: "simulation" } },
    "/report": {
      date: "2026-10-21",
      transactions: [],
      orders: 0,
      paidOrders: 0,
      net: 0,
      gross: 0,
      discounts: 0,
      refunds: 0,
      average: 0,
      products: [],
      staff: [],
      statuses: {},
      payments: { cash: 0, card: 0, transfer: 0 },
    },
    "/closures": [],
    "/users": [user],
    "/audit": [],
    "/backups": [],
  };
  if (path === "/report" && failingReport)
    return new Response(
      JSON.stringify({ error: "Store report temporarily unavailable" }),
      { status: 503 },
    );
  return new Response(JSON.stringify(data[path] ?? {}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as any;
test("every workspace page renders after leaving and returning to Counter", async () => {
  render(React.createElement(App));
  await screen.findByRole("heading", { name: "The counter." });
  const pages = [
    ["Orders", "Orders."],
    ["Preparation", "Preparation."],
    ["Print queue", "Print queue."],
    ["Overview & EOD", "Store overview."],
    ["Menu library", "Menu library."],
    ["Receipt studio", "Receipt studio."],
    ["Team & access", "Team & access."],
    ["Activity log", "Activity log."],
    ["Store settings", "Store settings."],
  ];
  for (const [nav, title] of pages) {
    fireEvent.click(screen.getByRole("button", { name: nav, exact: true }));
    await screen.findByRole("heading", { name: title, exact: true });
    if (nav === "Overview & EOD")
      await screen.findByText("What the store served");
    if (nav === "Team & access")
      await screen.findByRole("heading", { name: user.name });
    if (nav === "Receipt studio") await screen.findByText("Template settings");
    fireEvent.click(
      screen.getByRole("button", { name: "Counter", exact: true }),
    );
    await screen.findByRole("heading", { name: "The counter." });
  }
  cleanup();
});

test("report fetch failures show a recoverable error instead of a blank report", async () => {
  failingReport = true;
  render(React.createElement(App));
  await screen.findByRole("heading", { name: "The counter." });
  fireEvent.click(
    screen.getByRole("button", { name: "Overview & EOD", exact: true }),
  );
  await screen.findByRole("alert");
  assert(screen.getByText("Store report temporarily unavailable"));
  failingReport = false;
  fireEvent.click(
    screen.getByRole("button", { name: "Try again", exact: true }),
  );
  await screen.findByText("What the store served");
  cleanup();
});
