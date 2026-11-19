import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003",
});
for (const key of ["window", "document", "HTMLElement", "Event", "MouseEvent"])
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = await import("react");
const { render, screen, fireEvent, cleanup, waitFor, act } =
  await import("@testing-library/react");
const { default: Responsibility } =
  await import("../src/mera/workspace/OrderResponsibility");
const { WorkspaceError } = await import("../src/mera/workspace/api");
const order = {
  id: "order",
  version: 3,
  handlerId: "a",
  handlerName: "Stale other name",
  history: [
    {
      action: "assigned",
      from: "unknown-private-id",
      to: "a",
      actorName: "Manager",
      at: "2026-11-19T10:00:00Z",
    },
  ],
};
const originalFetch = globalThis.fetch;
const response = (value: any, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const candidates = {
  staff: [
    { id: "a", name: "Ada" },
    { id: "b", name: "Bola" },
  ],
  truncated: false,
};
const props = () => ({
  base: "/organizations/org/branches/branch",
  order,
  disabled: false,
  canAssign: true,
  onRefresh: async () => {},
  save: async () => ({ handlerId: "b", version: 4 }),
});
async function open() {
  fireEvent.click(screen.getByText("Order responsibility"));
  await screen.findByRole("combobox", { name: "Assign order to" });
}
test("scoped staff names override stale handler names, history hides IDs and assignment captures exact version with duplicate guard", async () => {
  let writes: any[] = [],
    resolve: any;
  globalThis.fetch = async () => response({ ...candidates, truncated: true });
  try {
    render(
      React.createElement(Responsibility, {
        ...props(),
        save: async (...args: any[]) => {
          writes.push(args);
          return await new Promise((r) => (resolve = r));
        },
      }),
    );
    await open();
    assert.match(screen.getByText("Current handler:").textContent || "", /Ada/);
    assert.equal(screen.queryByText(/Stale other/), null);
    assert.equal(screen.queryByText(/unknown-private-id/), null);
    assert.ok(screen.getByText(/first 500/));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    const form = screen.getByRole("combobox").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0][2], { userId: "b", version: 3 });
    await act(async () => resolve({ handlerId: "b", version: 4 }));
    assert.ok(screen.getByText(/responsibility updated. Preparation/));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
test("unknown non-idempotent assignment remains frozen after canonical refresh without retry", async () => {
  let writes = 0,
    reads = 0;
  globalThis.fetch = async () => response(candidates);
  try {
    render(
      React.createElement(Responsibility, {
        ...props(),
        onRefresh: async () => {
          reads++;
        },
        save: async () => {
          writes++;
          throw Error("Network outcome unknown");
        },
      }),
    );
    await open();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    fireEvent.submit(screen.getByRole("combobox").closest("form")!);
    await screen.findByRole("alert");
    assert.ok(
      (screen.getByRole("combobox") as HTMLSelectElement).closest("fieldset")
        ?.disabled,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh order responsibility" }),
    );
    await waitFor(() => assert.equal(reads, 1));
    await waitFor(() =>
      assert.equal(screen.queryByText("Loading branch staff…"), null),
    );
    assert.equal(writes, 1);
    assert.ok(
      (screen.getByRole("combobox") as HTMLSelectElement).closest("fieldset")
        ?.disabled,
    );
    assert.equal(
      screen.queryByRole("button", { name: /Retry.*assignment/ }),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
test("candidate read denial hides private results and permission loss starts no candidate read", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response({ error: "Forbidden" }, 403);
  };
  try {
    const view = render(React.createElement(Responsibility, props()));
    fireEvent.click(screen.getByText("Order responsibility"));
    await screen.findByText(/access needs checking/);
    assert.equal(screen.queryByText(/Current handler/), null);
    assert.equal(screen.queryByRole("combobox"), null);
    view.rerender(
      React.createElement(Responsibility, { ...props(), canAssign: false }),
    );
    assert.equal(calls, 1);
    assert.equal(screen.queryByRole("combobox"), null);
    assert.equal(screen.queryByText("Ada"), null);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
test("failed candidate read retries honestly and changed order requires review; late old-scope write is fenced", async () => {
  let calls = 0,
    resolve: any;
  globalThis.fetch = async () => {
    if (++calls === 1) throw Error("offline");
    return response(candidates);
  };
  try {
    const p = {
      ...props(),
      save: async () => await new Promise((r) => (resolve = r)),
    };
    const view = render(React.createElement(Responsibility, p));
    fireEvent.click(screen.getByText("Order responsibility"));
    await screen.findByRole("button", { name: "Retry loading branch staff" });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading branch staff" }),
    );
    await screen.findByRole("combobox");
    view.rerender(
      React.createElement(Responsibility, {
        ...p,
        order: { ...order, version: 4 },
      }),
    );
    assert.ok(screen.getByText(/This order changed/));
    fireEvent.click(
      screen.getByRole("button", { name: "Review current responsibility" }),
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    fireEvent.submit(screen.getByRole("combobox").closest("form")!);
    view.rerender(
      React.createElement(Responsibility, {
        ...p,
        base: "/organizations/org/branches/another",
      }),
    );
    await act(async () => resolve({ handlerId: "b", version: 5 }));
    assert.equal(
      screen.queryByText(/responsibility updated. Preparation/),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
test("read-only current handler uses supplied name without staff read; assignment history names stay scoped and times identify branch or device", async () => {
  let reads = 0;
  globalThis.fetch = async () => {
    reads++;
    return response(candidates);
  };
  try {
    const p = {
      ...props(),
      canAssign: false,
      order: { ...order, handlerName: "Verified current handler" },
      timeZone: "Africa/Lagos",
    };
    const view = render(React.createElement(Responsibility, p));
    fireEvent.click(screen.getByText("Order responsibility"));
    assert.match(
      screen.getByText("Current handler:").textContent || "",
      /Verified current handler/,
    );
    fireEvent.click(screen.getByText("Assignment history"));
    assert.ok(
      screen.getByText("Staff name unavailable → Staff name unavailable"),
    );
    assert.match(
      screen.getByText(/19 Nov 2026/).textContent || "",
      /11:00 · Africa\/Lagos/,
    );
    assert.equal(reads, 0);
    view.rerender(
      React.createElement(Responsibility, { ...p, timeZone: "Invalid/Zone" }),
    );
    assert.match(
      screen.getByText(/19 Nov 2026/).textContent || "",
      /Device time/,
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
