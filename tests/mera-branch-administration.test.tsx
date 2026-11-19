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
const { render, screen, fireEvent, waitFor, cleanup, act } =
  await import("@testing-library/react");
const { default: BranchAdministration } =
  await import("../src/mera/workspace/BranchAdministration");
const base = {
  actorId: "actor-a",
  organizationId: "org-a",
  branches: [
    { id: "b1", name: "Surulere" },
    { id: "b2", name: "Ikeja" },
  ],
  activeBranchId: "b1",
  canManage: true,
  organizationWide: true,
  creationIdempotencyReady: true,
  onChoose: () => {},
  onRefresh: async () => {},
};
const fill = () => {
  fireEvent.click(screen.getByText("Create a draft branch", { exact: true }));
  fireEvent.change(screen.getByLabelText("Branch name"), {
    target: { value: "Lekki" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Create draft branch" })
      .closest("form")!,
  );
};
test("O3 branch list selection and creation controls honor explicit scope permissions", () => {
  const chosen: string[] = [];
  try {
    const { rerender } = render(
      <BranchAdministration
        {...base}
        onChoose={(id) => chosen.push(id)}
        canManage={false}
        save={async () => {}}
      />,
    );
    assert(screen.getByText("Current branch"));
    fireEvent.click(screen.getByRole("button", { name: "Open Ikeja" }));
    assert.deepEqual(chosen, ["b2"]);
    assert.equal(screen.queryByText("Create a draft branch"), null);
    rerender(
      <BranchAdministration
        {...base}
        organizationWide={false}
        save={async () => {}}
      />,
    );
    assert.equal(screen.queryByText("Create a draft branch"), null);
  } finally {
    cleanup();
    sessionStorage.clear();
  }
});
test("O3 uncertain create restores exact actor/org intent after remount and retains it after later4xx", async () => {
  const calls: any[] = [];
  const save = async (...args: any[]) => {
    calls.push(args);
    throw Object.assign(
      new Error(
        calls.length === 1 ? "Connection lost" : "Review still required",
      ),
      { status: calls.length === 1 ? 0 : 400 },
    );
  };
  try {
    const view = render(<BranchAdministration {...base} save={save} />);
    fill();
    await screen.findByText("Branch creation is unconfirmed");
    const first = calls[0][2];
    assert.equal(first.name, "Lekki");
    assert.equal(first.currency, "NGN");
    view.unmount();
    render(<BranchAdministration {...base} save={save} />);
    assert.equal(calls.length, 1);
    fireEvent.click(screen.getByText("Create a draft branch", { exact: true }));
    assert(
      (
        screen
          .getByLabelText("Branch name")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original branch creation" }),
    );
    await waitFor(() => assert.equal(calls.length, 2));
    assert.deepEqual(calls[1][2], first);
    assert(screen.getByText("Branch creation is unconfirmed"));
    assert(
      (
        screen
          .getByLabelText("Branch name")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    );
    assert(sessionStorage.length > 0);
  } finally {
    cleanup();
    sessionStorage.clear();
  }
});
test("O3 other actors and organizations cannot restore or expose an original draft", async () => {
  try {
    const view = render(
      <BranchAdministration
        {...base}
        save={async () => {
          throw Object.assign(new Error("Unknown"), { status: 0 });
        }}
      />,
    );
    fill();
    await screen.findByText("Branch creation is unconfirmed");
    view.rerender(
      <BranchAdministration
        {...base}
        actorId="actor-b"
        save={async () => {}}
      />,
    );
    assert.equal(screen.queryByText("Branch creation is unconfirmed"), null);
    assert.equal(
      (screen.getByLabelText("Branch name") as HTMLInputElement).value,
      "",
    );
    view.rerender(
      <BranchAdministration
        {...base}
        organizationId="org-b"
        save={async () => {}}
      />,
    );
    assert.equal(
      (screen.getByLabelText("Branch name") as HTMLInputElement).value,
      "",
    );
  } finally {
    cleanup();
    sessionStorage.clear();
  }
});
test("O3 storage failure prevents POST and confirmed success clears recovery without publishing", async () => {
  let calls = 0;
  const original = globalThis.sessionStorage;
  try {
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("Unavailable");
        },
      },
      configurable: true,
    });
    render(
      <BranchAdministration
        {...base}
        save={async () => {
          calls++;
        }}
      />,
    );
    fill();
    await screen.findByText(/No request was sent/);
    assert.equal(calls, 0);
    cleanup();
    Object.defineProperty(globalThis, "sessionStorage", {
      value: original,
      configurable: true,
    });
    render(
      <BranchAdministration
        {...base}
        save={async (_path, _method, body) => ({
          id: "new",
          name: body.name,
          organizationId: "org-a",
          requestKey: body.requestKey,
          published: false,
        })}
      />,
    );
    fill();
    await screen.findByText("Draft branch “Lekki” was created.");
    assert.equal(sessionStorage.length, 0);
    assert.equal(screen.queryByRole("button", { name: /Publish/ }), null);
  } finally {
    cleanup();
    Object.defineProperty(globalThis, "sessionStorage", {
      value: original,
      configurable: true,
    });
    sessionStorage.clear();
  }
});
test("O3 list failure and loading do not masquerade as an empty branch list", () => {
  try {
    const { rerender } = render(
      <BranchAdministration
        {...base}
        branches={null}
        loading
        save={async () => {}}
      />,
    );
    assert(screen.getByRole("status"));
    assert.equal(
      screen.queryByText("No branches are available to this account."),
      null,
    );
    rerender(
      <BranchAdministration
        {...base}
        branches={null}
        listError="Unable to load branches"
        save={async () => {}}
      />,
    );
    assert(screen.getByRole("alert"));
    assert.equal(
      screen.queryByText("No branches are available to this account."),
      null,
    );
  } finally {
    cleanup();
    sessionStorage.clear();
  }
});

test("O3 confirmed logout clears creation journals and corrupt recovery fails closed", async () => {
  try {
    render(
      <BranchAdministration
        {...base}
        save={async () => {
          throw Object.assign(new Error("Unknown"), { status: 0 });
        }}
      />,
    );
    fill();
    await screen.findByText("Branch creation is unconfirmed");
    assert(sessionStorage.length > 0);
    fireEvent(window, new Event("mera:logout"));
    assert.equal(sessionStorage.length, 0);
    cleanup();
    sessionStorage.setItem(
      "mera:branch-create:v1:" + JSON.stringify(["actor-a", "org-a"]),
      '{"requestKey":"bad","customer":"private"}',
    );
    let writes = 0;
    render(
      <BranchAdministration
        {...base}
        save={async () => {
          writes++;
        }}
      />,
    );
    fireEvent.click(screen.getByText("Create a draft branch", { exact: true }));
    assert(
      screen.getByText(/saved submission details cannot be safely restored/),
    );
    assert.equal(
      screen.queryByRole("button", { name: "Create draft branch" }),
      null,
    );
    assert.equal(writes, 0);
  } finally {
    cleanup();
    sessionStorage.clear();
  }
});

for (const transition of ["unmount", "revoke", "logout"] as const)
  test(`branch create ignores late result after ${transition} without refreshing old scope`, async () => {
    let resolve: any,
      refreshes = 0,
      body: any;
    const props = {
      ...base,
      onRefresh: async () => {
        refreshes++;
      },
      save: async (_p: string, _m: string, value: any) => {
        body = value;
        return new Promise((r) => {
          resolve = r;
        });
      },
    };
    try {
      const view = render(<BranchAdministration {...props} />);
      fill();
      const key =
        "mera:branch-create:v1:" +
        JSON.stringify([base.actorId, base.organizationId]);
      assert(sessionStorage.getItem(key));
      if (transition === "unmount") view.unmount();
      else if (transition === "revoke")
        view.rerender(<BranchAdministration {...props} canManage={false} />);
      else act(() => window.dispatchEvent(new Event("mera:logout")));
      await act(async () =>
        resolve({
          id: "new-branch",
          name: "Lekki",
          organizationId: base.organizationId,
          requestKey: body.requestKey,
        }),
      );
      assert.equal(refreshes, 0);
      assert(!screen.queryByText("Draft branch “Lekki” was created."));
      assert.equal(
        sessionStorage.getItem(key) !== null,
        transition !== "logout",
      );
      if (transition === "revoke") {
        view.rerender(<BranchAdministration {...props} />);
        fireEvent.click(
          screen.getByText("Create a draft branch", { exact: true }),
        );
        assert(
          screen.getByRole("button", {
            name: "Retry original branch creation",
          }),
        );
        assert(
          (screen.getByLabelText("Branch name") as HTMLInputElement).matches(
            ":disabled",
          ),
        );
      }
    } finally {
      cleanup();
      sessionStorage.clear();
    }
  });
