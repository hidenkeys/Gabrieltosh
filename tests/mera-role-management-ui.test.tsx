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
const { default: RoleManager } =
  await import("../src/mera/workspace/RoleManager");
const roles = {
  templates: [{ id: "cashier", name: "Cashier", permissions: ["orders.view"] }],
  custom: [],
};
const props = {
  organizationId: "org-a",
  branchId: "branch-a",
  permissions: ["orders.view"],
  disabled: false,
};
test("O5 roles and invitation read failures have independent retries, never false empty or endless loading", async () => {
  const original = globalThis.fetch;
  let roleReads = 0,
    inviteReads = 0;
  globalThis.fetch = async (input) =>
    String(input).endsWith("/roles")
      ? ++roleReads === 1
        ? Response.json({ error: "Unavailable" }, { status: 503 })
        : Response.json(roles)
      : ++inviteReads === 1
        ? Response.json({ error: "Unavailable" }, { status: 503 })
        : Response.json([]);
  try {
    render(<RoleManager {...props} save={async () => {}} />);
    assert(screen.getByText("Loading organization roles…"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry loading roles" }),
    );
    await screen.findByRole("button", { name: "Create branch invitation" });
    assert.equal(screen.queryByText("Loading organization roles…"), null);
    assert(screen.getByRole("button", { name: "Retry loading invitations" }));
    assert.equal(screen.queryByText("No invitations recorded."), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading invitations" }),
    );
    await screen.findByText("No invitations recorded.");
    assert.equal(screen.queryByRole("alert"), null);
    assert.equal(roleReads, 2);
    assert.equal(inviteReads, 2);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O5 old organization read cannot expose roles after scope switch", async () => {
  const original = globalThis.fetch;
  let release: ((response: Response) => void) | undefined;
  globalThis.fetch = async (input) =>
    String(input).includes("org-a/roles")
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : String(input).endsWith("/roles")
        ? Response.json(roles)
        : Response.json([]);
  try {
    const view = render(<RoleManager {...props} save={async () => {}} />);
    assert(release);
    view.rerender(
      <RoleManager {...props} organizationId="org-b" save={async () => {}} />,
    );
    await screen.findByRole("button", { name: "Create branch invitation" });
    await act(async () => {
      release!(
        Response.json({
          templates: [],
          custom: [
            { id: "private", name: "Private old role", permissions: [] },
          ],
        }),
      );
      await Promise.resolve();
    });
    assert.equal(screen.queryByText("Private old role"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O5 unknown invitation stays frozen after history refresh without resending or assuming delivery", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async (input) =>
    String(input).endsWith("/roles") ? Response.json(roles) : Response.json([]);
  try {
    render(
      <RoleManager
        {...props}
        save={async (...args) => {
          writes.push(args);
          throw Object.assign(new Error("Unknown outcome"), { status: 0 });
        }}
      />,
    );
    await screen.findByRole("button", { name: "Create branch invitation" });
    fireEvent.change(screen.getByLabelText("Staff email"), {
      target: { value: "staff@example.test" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create branch invitation" })
        .closest("form")!,
    );
    await screen.findByText("Invitation outcome unconfirmed");
    assert(
      (
        screen.getByRole("button", {
          name: "Create branch invitation",
        }) as HTMLButtonElement
      ).disabled,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh invitation history" }),
    );
    await screen.findByText("No invitations recorded.");
    assert(
      (
        screen.getByRole("button", {
          name: "Create branch invitation",
        }) as HTMLButtonElement
      ).disabled,
    );
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0][2], {
      email: "staff@example.test",
      role: "cashier",
      branchIds: ["branch-a"],
    });
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O5 role editor is disclosed and retains the existing versioned permission-limited save", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async (input) =>
    String(input).endsWith("/roles")
      ? Response.json({
          ...roles,
          custom: [
            {
              id: "r1",
              name: "Service",
              active: true,
              version: 3,
              permissions: ["orders.view"],
            },
          ],
        })
      : Response.json([]);
  try {
    const { container } = render(
      <RoleManager
        {...props}
        save={async (...args) => {
          writes.push(args);
        }}
      />,
    );
    await screen.findByRole("button", { name: "Edit role" });
    assert.equal(
      (container.querySelector(".mw-staff-role-editor") as HTMLDetailsElement)
        .open,
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit role" }));
    assert(
      (container.querySelector(".mw-staff-role-editor") as HTMLDetailsElement)
        .open,
    );
    fireEvent.change(screen.getByLabelText("Role name"), {
      target: { value: "Updated service" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save custom role" }).closest("form")!,
    );
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0][0], "/organizations/org-a/roles/r1");
    assert.equal(writes[0][1], "PATCH");
    assert.deepEqual(writes[0][2], {
      name: "Updated service",
      permissions: ["orders.view"],
      version: 3,
      active: true,
    });
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
