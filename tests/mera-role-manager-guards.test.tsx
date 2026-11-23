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
const original = globalThis.fetch;
const custom = {
  id: "r1",
  name: "Role one",
  permissions: ["orders.view"],
  active: true,
  version: 4,
};
const roles = {
  templates: [{ id: "cashier", name: "Cashier", permissions: ["orders.view"] }],
  custom: [custom, { ...custom, id: "r2", name: "Role two" }],
};
const props = {
  organizationId: "org",
  branchId: "branch",
  permissions: ["members.manage", "orders.view"],
  disabled: false,
  save: async () => ({}),
};
const fetchRows = () => {
  globalThis.fetch = async (input) =>
    Response.json(String(input).endsWith("/roles") ? roles : []);
};
async function startRole() {
  await screen.findAllByRole("button", { name: "Edit role" });
  fireEvent.click(screen.getAllByRole("button", { name: "Edit role" })[0]);
  fireEvent.change(screen.getByLabelText("Role name"), {
    target: { value: "Local role draft" },
  });
  return screen
    .getByRole("button", { name: "Save custom role" })
    .closest("form")!;
}
test("role writes lock synchronously and uncertain versioned save stays frozen after canonical read", async () => {
  fetchRows();
  let calls: any[] = [],
    reject: any;
  try {
    render(
      <RoleManager
        {...props}
        save={async (...args: any[]) => {
          calls.push(args);
          return await new Promise((_r, r) => (reject = r));
        }}
      />,
    );
    const form = await startRole();
    fireEvent.submit(form);
    fireEvent.submit(form);
    assert.equal(calls.length, 1);
    assert.match(calls[0][2].requestKey, /^[a-f0-9-]{36}$/i);
    const { requestKey, ...intent } = calls[0][2];
    assert.deepEqual(intent, {
      name: "Local role draft",
      permissions: ["orders.view"],
      version: 4,
      active: true,
    });
    await act(async () => reject(Error("Unknown role save")));
    await screen.findByText("Role save unconfirmed");
    fireEvent.click(screen.getByRole("button", { name: "Read current roles" }));
    await waitFor(() =>
      assert(!screen.queryByText("Refreshing organization roles…")),
    );
    assert.equal(
      (screen.getByLabelText("Role name") as HTMLInputElement).value,
      "Local role draft",
    );
    assert.equal(
      (screen.getByLabelText("Role name") as HTMLInputElement).closest(
        "fieldset",
      )!.disabled,
      true,
    );
    assert.equal(calls.length, 1);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("dirty editor blocks replacement until explicit discard; permission reduction prevents stale draft writes", async () => {
  fetchRows();
  let writes = 0;
  try {
    const view = render(
      <RoleManager
        {...props}
        save={async () => {
          writes++;
          return {};
        }}
      />,
    );
    await startRole();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit role" })[1]);
    assert.ok(screen.getByText(/explicitly discard the current role draft/));
    assert.equal(
      (screen.getByLabelText("Role name") as HTMLInputElement).value,
      "Local role draft",
    );
    view.rerender(
      <RoleManager
        {...props}
        permissions={["members.manage"]}
        save={async () => {
          writes++;
          return {};
        }}
      />,
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Save custom role", hidden: true })
        .closest("form")!,
    );
    assert.equal(writes, 0);
    fireEvent.click(screen.getByRole("button", { name: "Discard role draft" }));
    assert.equal(
      (screen.getByLabelText("Role name") as HTMLInputElement).value,
      "",
    );
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("development token starts concealed, reveals deliberately and vanishes immediately on authority loss", async () => {
  let invitationBody: any;
  const token = "a".repeat(64);
  globalThis.fetch = async (input) => {
    if (String(input).includes("/create-attempts/")) {
      const { requestKey, ...intent } = invitationBody;
      return Response.json({
        status: "recorded",
        requestKey,
        actorId: "current-session",
        organizationId: "org",
        operation: "invitation_create",
        targetId: null,
        resultBasis: "recorded_operation_snapshot",
        operationRecord: {
          id: "op-inv",
          requestKey,
          actorId: "current-session",
          operation: "invitation_create",
          targetId: null,
          intent,
        },
        result: {
          id: "inv",
          ...intent,
          delivery: "not_sent",
          developmentTokenRecoverable: false,
        },
      });
    }
    return Response.json(String(input).endsWith("/roles") ? roles : []);
  };
  try {
    const view = render(
      <RoleManager
        {...props}
        save={async (_path, _method, body) => {
          invitationBody = body;
          return { id: "inv", delivery: "not_sent", developmentToken: token };
        }}
      />,
    );
    await screen.findByRole("button", { name: "Create branch invitation" });
    fireEvent.change(screen.getByLabelText("Staff email"), {
      target: { value: "test@example.invalid" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create branch invitation" })
        .closest("form")!,
    );
    await screen.findByRole("button", {
      name: "Show development invitation token",
    });
    assert.equal(screen.queryByDisplayValue(token), null);
    assert.ok(screen.getByText("Delivery: Not sent"));
    fireEvent.click(
      screen.getByRole("button", { name: "Show development invitation token" }),
    );
    assert.ok(screen.getByDisplayValue(token));
    view.rerender(<RoleManager {...props} permissions={["orders.view"]} />);
    assert.equal(screen.queryByDisplayValue(token), null);
    assert.ok(screen.getByText(/People access needs checking/));
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
for (const status of [401, 403, 404])
  test(`people read ${status} hides private cached editor and token`, async () => {
    let reads = 0;
    globalThis.fetch = async (input) =>
      String(input).endsWith("/roles")
        ? ++reads === 1
          ? Response.json(roles)
          : Response.json({ error: "Denied" }, { status })
        : Response.json([]);
    try {
      render(
        <RoleManager
          {...props}
          save={async () => {
            throw Error("Unknown role");
          }}
        />,
      );
      const form = await startRole();
      fireEvent.submit(form);
      await screen.findByText("Role save unconfirmed");
      fireEvent.click(
        screen.getByRole("button", { name: "Read current roles" }),
      );
      await screen.findByText(/People access needs checking/);
      assert.equal(screen.queryByLabelText("Role name"), null);
      assert(!screen.queryByRole("button", { name: "Save custom role" }));
      assert(
        !screen.queryByRole("button", { name: "Retry original access change" }),
      );
    } finally {
      cleanup();
      window.sessionStorage.clear();
      globalThis.fetch = original;
    }
  });
test("unknown revocation stays frozen on history refresh; invalid expiry is not pending and write denial hides all", async () => {
  let writes = 0,
    reject: any;
  globalThis.fetch = async (input) =>
    Response.json(
      String(input).endsWith("/roles")
        ? roles
        : [
            {
              id: "invite",
              email: "test@example.invalid",
              expiresAt: "bad-date",
              delivery: "not_sent",
            },
          ],
    );
  try {
    render(
      <RoleManager
        {...props}
        save={async () => {
          writes++;
          return await new Promise((_r, r) => (reject = r));
        }}
      />,
    );
    await screen.findByRole("button", { name: "Revoke invitation" });
    assert.ok(screen.getByText(/Expiry unavailable/));
    const button = screen.getByRole("button", { name: "Revoke invitation" });
    fireEvent.click(button);
    fireEvent.click(button);
    assert.equal(writes, 1);
    await act(async () => reject(Error("Unknown revoke")));
    assert.equal(
      (
        (await screen.findByRole("button", {
          name: "Revocation unconfirmed",
        })) as HTMLButtonElement
      ).disabled,
      true,
    );
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("unknown role create cannot be repeated and write denial is sticky", async () => {
  fetchRows();
  let calls = 0;
  try {
    const view = render(
      <RoleManager
        {...props}
        save={async () => {
          calls++;
          throw Error("Unknown create");
        }}
      />,
    );
    await screen.findByRole("button", { name: "Create branch invitation" });
    fireEvent.click(
      screen.getByText("Create custom role", { selector: "summary" }),
    );
    fireEvent.change(screen.getByLabelText("Role name"), {
      target: { value: "New custom role" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "View orders" }));
    fireEvent.submit(
      screen.getByRole("button", { name: "Save custom role" }).closest("form")!,
    );
    await screen.findByText("Role save unconfirmed");
    assert.equal(calls, 1);
    view.rerender(
      <RoleManager
        {...props}
        branchId="new"
        organizationId="separate-org"
        save={async () => {
          throw Object.assign(Error("Denied"), { status: 403 });
        }}
      />,
    );
    await startRole();
    fireEvent.submit(
      screen.getByRole("button", { name: "Save custom role" }).closest("form")!,
    );
    await screen.findByText(/People access needs checking/);
    assert.equal(screen.queryByLabelText("Role name"), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
const { beginAccessWrite, finishAccessWrite, hasAccessWrite } =
  await import("../src/mera/workspace/accessWriteJournal");
test("unknown access writes survive branch and navigation remounts, scoped only to actor and organization without private payload", async () => {
  fetchRows();
  let writes = 0;
  try {
    const p = {
      ...props,
      userId: "actor-one",
      save: async () => {
        writes++;
        throw Error("Unknown create");
      },
    };
    const view = render(<RoleManager {...p} />);
    await startRole();
    fireEvent.submit(
      screen.getByRole("button", { name: "Save custom role" }).closest("form")!,
    );
    await screen.findByText("Role save unconfirmed");
    assert.equal(hasAccessWrite("actor-one", "org"), true);
    assert.equal(hasAccessWrite("actor-two", "org"), false);
    assert.equal(hasAccessWrite("actor-one", "other-org"), false);
    assert.equal(beginAccessWrite("actor-one", "org", "another"), false);
    assert.ok(screen.getByText("Review selected role access"));
    const storage = Object.keys(window.sessionStorage)
      .map((key) => window.sessionStorage.getItem(key))
      .join("");
    assert.ok(!storage.includes("Local role draft"));
    assert.ok(!storage.includes("orders.view"));
    view.rerender(<RoleManager {...p} branchId="other-branch" />);
    await screen.findByText(/paused across.*pages and branches/);
    await screen.findAllByRole("button", { name: "Edit role" });
    fireEvent.click(screen.getAllByRole("button", { name: "Edit role" })[0]);
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Save custom role", hidden: true })
        .closest("form")!,
    );
    assert.equal(writes, 1);
    view.unmount();
    render(<RoleManager {...p} />);
    await screen.findByText(/paused across.*pages and branches/);
    assert.equal(writes, 1);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("late acknowledgement without scoped proof retains recovery after unmount while storage failure prevents dispatch", async () => {
  fetchRows();
  let resolve: any;
  try {
    const view = render(
      <RoleManager
        {...props}
        userId="late-actor"
        save={async () => await new Promise((r) => (resolve = r))}
      />,
    );
    await startRole();
    fireEvent.submit(
      screen.getByRole("button", { name: "Save custom role" }).closest("form")!,
    );
    assert.ok(hasAccessWrite("late-actor", "org"));
    view.unmount();
    await act(async () => resolve(custom));
    assert.equal(hasAccessWrite("late-actor", "org"), true);
    const marker = JSON.parse(
      window.sessionStorage.getItem("mera:access-operation:v1:late-actor:org")!,
    );
    let proofReads = 0;
    globalThis.fetch = async (input) => {
      if (String(input).includes("/update-attempts/")) {
        proofReads++;
        const intent = {
          name: "Local role draft",
          permissions: ["orders.view"],
          active: true,
          version: 4,
        };
        return Response.json({
          ...marker,
          status: "recorded",
          resultBasis: "recorded_operation_snapshot",
          operationRecord: {
            id: "recorded-update",
            requestKey: marker.requestKey,
            actorId: marker.actorId,
            operation: marker.operation,
            targetId: marker.targetId,
            intent,
          },
          result: { ...custom, ...intent, version: 5 },
        });
      }
      return Response.json(String(input).endsWith("/roles") ? roles : []);
    };
    render(<RoleManager {...props} userId="late-actor" />);
    await screen.findByRole("button", { name: "Check access change outcome" });
    assert.equal(
      proofReads,
      0,
      "restoring a reference must not automatically check or write",
    );
    assert.equal(hasAccessWrite("late-actor", "org"), true);
    fireEvent.click(
      screen.getByRole("button", { name: "Check access change outcome" }),
    );
    await waitFor(() =>
      assert.equal(hasAccessWrite("late-actor", "org"), false),
    );
    assert.equal(
      proofReads,
      1,
      "only exact scoped recorded proof clears the marker",
    );
    const descriptor = Object.getOwnPropertyDescriptor(
      window,
      "sessionStorage",
    )!;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw Error("Storage blocked");
      },
    });
    try {
      assert.equal(beginAccessWrite("blocked", "org", "role_create"), false);
      assert.equal(hasAccessWrite("blocked", "org"), true);
      finishAccessWrite("blocked", "org");
    } finally {
      Object.defineProperty(window, "sessionStorage", descriptor);
    }
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
