import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/workspace",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "sessionStorage",
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
const { render, screen, fireEvent, waitFor, cleanup } =
  await import("@testing-library/react");
const { default: Workspace } =
  await import("../src/mera/workspace/OrganizationWorkspace");
const journal = await import("../src/mera/workspace/shiftOperationJournal");
const actor = "10000000-0000-4000-8000-000000000001",
  org = "20000000-0000-4000-8000-000000000001",
  branch = "30000000-0000-4000-8000-000000000001",
  shiftId = "50000000-0000-4000-8000-000000000001",
  requestKey = "40000000-0000-4000-8000-000000000001";
const scope = { actorId: actor, organizationId: org, branchId: branch },
  user = { id: actor, name: "Teni" };
const context = {
  user,
  organizations: [
    {
      id: org,
      name: "Bing Chun",
      role: "manager",
      permissions: ["shifts.manage", "orders.view"],
      branchIds: [branch],
      branches: [{ id: branch, name: "Surulere" }],
    },
  ],
};
const originalFetch = globalThis.fetch;
function api(initial: any[] = []) {
  let shifts = initial,
    posts: any[] = [],
    reads = 0;
  globalThis.fetch = async (input: any, init: any = {}) => {
    const path = String(input);
    if (path.endsWith("/context")) return Response.json(context);
    if (path.endsWith("/workspace"))
      return Response.json({
        branch: { id: branch, name: "Surulere" },
        shifts,
        orders: [],
        payments: [],
        tables: [],
        visits: [],
        audit: [],
      });
    if (path.includes("-attempts/")) {
      reads++;
      return Response.json({
        ...scope,
        requestKey: path.split("/").at(-1),
        operation: "open",
        shiftId: null,
        status: "not_found",
      });
    }
    if (init.method === "POST" && /\/shifts(?:\/[^/]+\/close)?$/.test(path)) {
      const body = JSON.parse(init.body),
        stored = journal.readShiftOperationJournal(scope);
      assert(stored && !stored.referenceOnly);
      assert.deepEqual(stored.body, body);
      assert.equal(new Headers(init.headers).get("X-Mera-Actor-Id"), actor);
      posts.push({ path, body });
      throw new TypeError("response lost");
    }
    return Response.json([]);
  };
  return {
    posts,
    get reads() {
      return reads;
    },
    setShifts(value: any[]) {
      shifts = value;
    },
  };
}
async function openPage() {
  await screen.findByRole("tab", { name: "Shifts & cash" });
  fireEvent.click(screen.getByRole("tab", { name: "Shifts & cash" }));
}
function seed() {
  return journal.saveShiftOperationJournal({
    ...scope,
    version: 1,
    referenceOnly: false,
    operation: "close",
    shiftId,
    requestKey,
    body: { requestKey, countedCash: 12345, reason: "Private variance detail" },
  });
}
async function logout() {
  fireEvent.click(screen.getByLabelText("Account for Teni"));
  fireEvent.click(
    screen.getByRole("button", { name: "Sign out", exact: true }),
  );
  await screen.findByRole("alertdialog");
  fireEvent.click(
    screen.getByRole("button", { name: "Sign out and clear private details" }),
  );
}
test("shift opening preserves the exact persisted key and actor; global recovery survives navigation/reload even after lifecycle changes", async () => {
  sessionStorage.clear();
  const mock = api();
  try {
    const view = render(<Workspace user={user} notify={() => {}} />);
    await openPage();
    fireEvent.click(
      await screen.findByText("Open a shift", { selector: "summary" }),
    );
    fireEvent.change(screen.getByLabelText("Opening float (naira)"), {
      target: { value: "12.34" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Open shift", exact: true })
        .closest("form")!,
    );
    await screen.findByRole("status", { name: "Shift recovery" });
    assert.equal(mock.posts.length, 1);
    assert.equal(mock.posts[0].body.openingFloat, 1234);
    const saved = journal.readShiftOperationJournal(scope);
    assert(saved && !saved.referenceOnly);
    assert.equal(saved.requestKey, mock.posts[0].body.requestKey);
    fireEvent.click(screen.getByRole("tab", { name: "Orders", exact: true }));
    assert(screen.getByRole("status", { name: "Shift recovery" }));
    mock.setShifts([{ id: shiftId, status: "closed", openingFloat: 1234 }]);
    view.unmount();
    render(<Workspace user={user} notify={() => {}} />);
    await screen.findByRole("status", { name: "Shift recovery" });
    fireEvent.click(
      screen.getByRole("button", { name: "Review original shift submission" }),
    );
    await screen.findByText("Check an unconfirmed shift operation", {
      selector: "summary",
    });
    await waitFor(() => assert(mock.reads > 0));
    assert.equal(mock.posts.length, 1);
    assert.deepEqual(journal.readShiftOperationJournal(scope), saved);
  } finally {
    cleanup();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
test("shift sign-out removes amounts and reasons before logout while preserving the original reference", async () => {
  sessionStorage.clear();
  seed();
  api();
  let calls = 0;
  try {
    render(
      <Workspace
        user={user}
        notify={() => {}}
        onLogout={async () => {
          calls++;
          const marker = journal.readShiftOperationJournal(scope);
          assert(marker && marker.referenceOnly);
          assert.equal(marker.requestKey, requestKey);
          assert(!JSON.stringify(marker).includes("Private variance"));
          assert(!Object.hasOwn(marker, "body"));
        }}
      />,
    );
    await screen.findByRole("status", { name: "Shift recovery" });
    await logout();
    await waitFor(() => assert.equal(calls, 1));
  } finally {
    cleanup();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
test("failed shift private-data redaction prevents the logout callback", async () => {
  sessionStorage.clear();
  seed();
  api();
  let calls = 0;
  const proto = Object.getPrototypeOf(sessionStorage),
    set = proto.setItem;
  try {
    render(
      <Workspace
        user={user}
        notify={() => {}}
        onLogout={async () => {
          calls++;
        }}
      />,
    );
    await screen.findByRole("status", { name: "Shift recovery" });
    proto.setItem = function (key: string, value: string) {
      if (key.startsWith("mera:shift-operation:"))
        throw Error("storage unavailable");
      return set.call(this, key, value);
    };
    await logout();
    await screen.findByText(
      "Shift details could not be cleared safely. Keep this session open and review shift recovery before signing out.",
    );
    assert.equal(calls, 0);
    const saved = journal.readShiftOperationJournal(scope);
    assert(saved && !saved.referenceOnly);
  } finally {
    proto.setItem = set;
    cleanup();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});

test("sign-out review isolates workspace, traps keys and returns to the visible account trigger on safe dismissal", async () => {
  sessionStorage.clear();
  seed();
  api();
  let calls = 0;
  try {
    render(
      <Workspace
        user={user}
        notify={() => {}}
        onLogout={async () => {
          calls++;
        }}
      />,
    );
    await screen.findByRole("status", { name: "Shift recovery" });
    const account = screen.getByLabelText("Account for Teni");
    account.focus();
    fireEvent.click(account);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out", exact: true }),
    );
    const review = await screen.findByRole("alertdialog");
    const keep = screen.getByRole("button", { name: "Keep this session open" });
    const leave = screen.getByRole("button", {
      name: "Sign out and clear private details",
    });
    assert(document.activeElement === keep);
    assert(account.closest("[inert]"));
    fireEvent.keyDown(keep, { key: "Tab", shiftKey: true, cancelable: true });
    assert(document.activeElement === leave);
    fireEvent.keyDown(leave, { key: "Tab", cancelable: true });
    assert(document.activeElement === keep);
    fireEvent.keyDown(review, { key: "Escape", cancelable: true });
    await waitFor(() => assert(!screen.queryByRole("alertdialog")));
    assert(document.activeElement === account);
    assert(!account.closest("[inert]"));
    assert.equal(calls, 0);
    assert(journal.readShiftOperationJournal(scope));
  } finally {
    cleanup();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
