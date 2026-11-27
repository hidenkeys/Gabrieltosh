import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://mera.test/mera/workspace",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
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
const { default: AskMera, canAskMera } =
  await import("../src/mera/workspace/AskMera");
const summary = {
  revenue: 700000,
  orders: 2,
  averageOrder: 350000,
  currency: "NGN",
  range: { from: "2026-11-23", to: "2026-11-27" },
  previous: { revenue: 500000, orders: 1 },
  topItems: [{ name: "Rice", quantity: 2 }],
  slowItems: [],
  busiestHours: [{ hour: "12", orders: 2 }],
  soldOutEvents: 1,
  basis: "Recognized net sales",
};
test("drawer quick summary avoids AI, chat prepares card and confirm executes once", async () => {
  const original = globalThis.fetch,
    calls: string[] = [];
  let changed = 0;
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (String(url).endsWith("weekly-summary")) return Response.json(summary);
    if (String(url).endsWith("/messages")) {
      assert.equal(
        JSON.parse(String(opts?.body)).message,
        "mark Rice sold out",
      );
      return Response.json({
        conversationId: "conversation",
        message: "Review and confirm",
        results: [],
        cards: [
          {
            actionId: "action",
            label: "Mark Rice sold out",
            expiresAt: new Date(Date.now() + 600000).toISOString(),
          },
        ],
      });
    }
    assert.equal(JSON.parse(String(opts?.body)).actionId, "action");
    return Response.json({ status: "executed" });
  };
  try {
    render(
      <AskMera
        base="/branch"
        permissions={["reports.view", "menu.edit", "orders.view"]}
        onClose={() => {}}
        onChanged={() => {
          changed++;
        }}
      />,
    );
    assert.ok(screen.getByRole("dialog", { name: "Ask Mera" }));
    assert.equal(document.activeElement, screen.getByLabelText("Message Mera"));
    fireEvent.click(screen.getByRole("button", { name: "Weekly summary" }));
    await screen.findByText("Recognized net sales");
    assert.equal(calls.length, 1);
    await waitFor(() =>
      assert.equal(
        (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
          .disabled,
        true,
      ),
    );
    fireEvent.change(screen.getByLabelText("Message Mera"), {
      target: { value: "mark Rice sold out" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Mark Rice sold out");
    assert.equal(changed, 0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await screen.findByText("Change confirmed");
    assert.equal(changed, 1);
    assert.equal(screen.queryByRole("button", { name: "Confirm" }), null);
    assert.equal(calls.filter((c) => c.endsWith("/confirm")).length, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("permission visibility, budget errors, Escape, focus trap and focus restoration", async () => {
  const original = globalThis.fetch;
  let closed = 0;
  globalThis.fetch = async () =>
    Response.json(
      {
        error: "Your monthly AI budget has been reached.",
        code: "AI_BUDGET_EXCEEDED",
      },
      { status: 429 },
    );
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  try {
    assert.equal(canAskMera([]), false);
    assert.equal(canAskMera(["orders.view"]), true);
    render(
      <AskMera
        base="/branch"
        permissions={["orders.view"]}
        onClose={() => {
          closed++;
        }}
        onChanged={() => {}}
      />,
    );
    assert.equal(
      screen.queryByRole("button", { name: "Weekly summary" }),
      null,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open orders" }));
    await screen.findByRole("alert");
    assert.match(screen.getByRole("alert").textContent || "", /budget/);
    const first = screen.getByRole("button", { name: "Close Ask Mera" }),
      last = screen.getByLabelText("Message Mera");
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    assert.equal(document.activeElement, last);
    fireEvent.keyDown(document, { key: "Escape" });
    assert.equal(closed, 1);
    cleanup();
    assert.equal(document.activeElement, trigger);
  } finally {
    cleanup();
    trigger.remove();
    globalThis.fetch = original;
  }
});
test("cancel card persists cancellation and never invokes confirm", async () => {
  const original = globalThis.fetch;
  let confirmations = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/messages"))
      return Response.json({
        conversationId: "c",
        message: "Review",
        cards: [
          { actionId: "a", label: "Mark Rice sold out", expiresAt: "future" },
        ],
        results: [],
      });
    if (String(url).endsWith("/confirm")) confirmations++;
    return Response.json({ status: "cancelled" });
  };
  try {
    render(
      <AskMera
        base="/branch"
        permissions={["menu.edit"]}
        onClose={() => {}}
        onChanged={() => {
          throw Error("Must not refresh");
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Message Mera"), {
      target: { value: "mark Rice sold out" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("button", { name: "Cancel" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("Change cancelled");
    assert.equal(confirmations, 0);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("phone More navigation opens Ask Mera and returns to navigation on close", async () => {
  const { default: WorkspaceNavigation } =
    await import("../src/mera/workspace/WorkspaceNavigation");
  const original = window.matchMedia;
  window.matchMedia = (() => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as any;
  function Host() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <WorkspaceNavigation
          role="waiter"
          sections={[["orders", "Orders"]]}
          active="orders"
          organization="Test"
          branch="Main"
          onSelect={() => {}}
          onAsk={() => setOpen(true)}
        />
        {open && (
          <AskMera
            base="/branch"
            permissions={["orders.view"]}
            onClose={() => setOpen(false)}
            onChanged={() => {}}
          />
        )}
      </>
    );
  }
  try {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "More", exact: true }));
    fireEvent.click(
      screen.getByRole("button", { name: "Ask Mera", exact: true }),
    );
    assert.ok(screen.getByRole("dialog", { name: "Ask Mera" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Ask Mera" }));
    assert.equal(screen.queryByRole("dialog"), null);
  } finally {
    cleanup();
    window.matchMedia = original;
  }
});
