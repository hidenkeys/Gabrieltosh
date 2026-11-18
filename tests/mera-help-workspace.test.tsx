import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003",
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
const { default: HelpRequests } =
  await import("../src/mera/workspace/HelpRequests.tsx");
const service = {
  id: "help-one",
  reference: "H-ONE",
  category: "service",
  message: "Please bring water",
  status: "open",
  customerReply: "",
  internalNotes: [{ text: "Private service note" }],
};
test("staff help filters by role and separates customer reply from private note", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      requests: [
        service,
        {
          ...service,
          id: "other",
          category: "payment",
          message: "Private payment help",
        },
      ],
    }),
  );
  const calls: any[] = [];
  render(
    React.createElement(HelpRequests, {
      base: "/organizations/org/branches/branch",
      disabled: false,
      permissions: ["orders.fulfill"],
      save: async (...args: any[]) => {
        calls.push(args);
      },
    }),
  );
  await screen.findByText("Please bring water");
  assert.equal(screen.queryByText("Private payment help"), null);
  assert.equal(screen.queryByRole("option", { name: "payment" }), null);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Customer-visible reply" }),
    { target: { value: "A team member is coming" } },
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Private staff note" }),
    { target: { value: "Counter informed" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Save help response" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 3), [
    "/organizations/org/branches/branch/help-requests/help-one",
    "PATCH",
    {
      status: "acknowledged",
      customerReply: "A team member is coming",
      internalNote: "Counter informed",
    },
  ]);
  assert(screen.getByText(/Email, SMS and push delivery are unavailable/));
  cleanup();
});
test("a role with no help permission never fetches help records", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw Error("must not fetch");
  });
  render(
    React.createElement(HelpRequests, {
      base: "/organizations/org/branches/branch",
      disabled: false,
      permissions: ["menu.edit"],
      save: async () => {},
    }),
  );
  assert(screen.getByText("Your role cannot view customer help requests."));
  assert.equal(calls, 0);
  cleanup();
});
