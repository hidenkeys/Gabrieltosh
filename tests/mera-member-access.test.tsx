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
const { render, screen, fireEvent, waitFor, cleanup, act } =
  await import("@testing-library/react");
const { default: MemberAccess } =
  await import("../src/mera/workspace/MemberAccess");
const member = {
  id: "member-a",
  userId: "staff-a",
  name: "Ada",
  role: "cashier",
  permissions: ["orders.view"],
  branchIds: ["branch-a"],
  active: true,
  organizationWide: false,
};
const props = {
  organizationId: "org-a",
  branchId: "branch-a",
  branches: [{ id: "branch-a", name: "Surulere" }],
  userId: "owner-a",
  canManage: true,
  disabled: false,
};
test("member read failure is recoverable and never displayed as an empty staff list", async () => {
  const original = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () =>
    ++reads === 1
      ? Response.json({ error: "unavailable" }, { status: 503 })
      : Response.json([member]);
  try {
    render(<MemberAccess {...props} save={async () => {}} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry loading staff" }),
    );
    await screen.findByRole("button", { name: "Review Ada" });
    assert.equal(screen.queryByText("No staff records returned."), null);
    assert(screen.getByText("Surulere"));
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("member access uses a reviewed exact target and freezes an unknown write across read refresh", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([member]);
  let calls: any[] = [];
  try {
    render(
      <MemberAccess
        {...props}
        save={async (...args) => {
          calls.push(args);
          throw Error("network");
        }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Review Ada" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm suspend access" }),
    );
    await screen.findByText("Access change outcome unconfirmed");
    assert.equal(calls.length, 1);
    assert.match(calls[0][2].requestKey, /^[a-f0-9-]{36}$/i);
    const { requestKey, ...intent } = calls[0][2];
    assert.deepEqual([calls[0][0], calls[0][1], intent], [
      "/organizations/org-a/members/member-a",
      "PATCH",
      { active: false },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh staff" }));
    await waitFor(() => assert(!screen.queryByText("Loading staff access…")));
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Confirm suspend access",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    assert.equal(calls.length, 1);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("member denial and scope switch cannot expose old staff or allow own access changes", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).includes("org-b")
      ? Response.json({ error: "denied" }, { status: 403 })
      : Response.json([{ ...member, userId: "owner-a" }]);
  try {
    const view = render(
      <MemberAccess
        {...props}
        save={async () => {
          throw Error("must not write");
        }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Review Ada" }));
    assert(screen.getByText("You cannot change your own access here."));
    assert.equal(
      screen.queryByRole("button", { name: "Confirm suspend access" }),
      null,
    );
    view.rerender(
      <MemberAccess {...props} organizationId="org-b" save={async () => {}} />,
    );
    await screen.findByText(
      "Staff access needs checking. Refresh the workspace or sign in again before continuing.",
    );
    assert.equal(screen.queryByText("Ada"), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("member search and unavailable identity/scope never reveal opaque IDs as names", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json([
      {
        ...member,
        name: null,
        role: "opaque-role-id",
        branchIds: ["opaque-branch-id"],
      },
    ]);
  try {
    render(<MemberAccess {...props} save={async () => {}} />);
    await screen.findByRole("button", { name: "Review staff member" });
    assert(screen.getByText("Custom role"));
    assert(screen.getByText("Other branch"));
    assert.equal(document.body.textContent?.includes("opaque-"), false);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find a staff member" }),
      { target: { value: "Ada" } },
    );
    assert(screen.getByText("No staff match this search."));
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});

test("unconfirmed organization membership write survives branch navigation and component remount", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([member]);
  let calls = 0;
  const save = async () => {
    calls++;
    throw Error("connection lost");
  };
  try {
    const first = render(<MemberAccess {...props} save={save} />);
    fireEvent.click(await screen.findByRole("button", { name: "Review Ada" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm suspend access" }),
    );
    await screen.findByText("Access change outcome unconfirmed");
    first.unmount();
    render(<MemberAccess {...props} branchId="branch-b" save={save} />);
    fireEvent.click(await screen.findByRole("button", { name: "Review Ada" }));
    assert(
      (
        screen.getByRole("button", {
          name: "Confirm suspend access",
        }) as HTMLButtonElement
      ).disabled,
    );
    assert.equal(calls, 1);
    assert(!window.sessionStorage.getItem("staff-a"));
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
