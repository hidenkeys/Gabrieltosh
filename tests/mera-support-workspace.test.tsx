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
const { default: SupportCases } =
  await import("../src/mera/workspace/SupportCases.tsx");
const { WorkspaceError } = await import("../src/mera/workspace/api.ts");
test("merchant support exact uncertain retry preserves actor request and avoids false external delivery", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ cases: [], externalDelivery: false }),
  );
  const calls: any[] = [];
  render(
    React.createElement(SupportCases, {
      organizationId: "org",
      branches: [],
      disabled: false,
      save: async (...args: any[]) => {
        calls.push(args);
        throw new WorkspaceError("Connection interrupted");
      },
    }),
  );
  await screen.findByText("No support cases yet.");
  fireEvent.click(
    screen.getByText("New support request", { selector: "summary" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Support subject" }), {
    target: { value: "Printer integration" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Support message" }), {
    target: { value: "Please review our setup" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create support case" }));
  await screen.findByRole("alert");
  assert(screen.getByText(/original details\s+are locked/));
  assert(
    screen
      .getByRole("textbox", { name: "Support subject" })
      .matches(":disabled"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original support case" }),
  );
  await screen.findByRole("alert");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0][0], "/organizations/org/support-cases");
  assert.equal(calls[0][1], "POST");
  assert(screen.getByText(/Messages and replies stay in this app/));
  cleanup();
});
test("support leaf displays only merchant reply and clears previous organization on scope change", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) =>
    Response.json({
      cases: String(input).includes("/orgA/")
        ? [
            {
              id: "one",
              reference: "S-ONE",
              subject: "Original case",
              topic: "operations",
              message: "Please assist",
              status: "in_progress",
              customerReply: "We are reviewing it",
              internalNotes: [{ text: "Never render this operator note" }],
            },
          ]
        : [],
    }),
  );
  const props = {
    organizationId: "orgA",
    disabled: false,
    save: async () => {},
  };
  const view = render(React.createElement(SupportCases, props));
  fireEvent.click(
    await screen.findByText("View request and replies", {
      selector: "summary",
    }),
  );
  await screen.findByText("Mera reply: We are reviewing it");
  assert.equal(screen.queryByText("Never render this operator note"), null);
  view.rerender(
    React.createElement(SupportCases, { ...props, organizationId: "orgB" }),
  );
  assert.equal(screen.queryByText("Mera reply: We are reviewing it"), null);
  await screen.findByText("No support cases yet.");
  assert.equal(screen.queryByText("Original case"), null);
  cleanup();
});
