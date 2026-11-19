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
const { render, screen, fireEvent, cleanup, waitFor, act } =
  await import("@testing-library/react");
const { default: SupportCases } =
  await import("../src/mera/workspace/SupportCases.tsx");
const { WorkspaceError } = await import("../src/mera/workspace/api.ts");

const caseRow = {
  id: "case-1",
  reference: "SUP-ONE",
  subject: "Scoped request",
  topic: "operations",
  status: "open",
  message: "Private organization case",
  customerReply: "Visible reply",
  history: [],
};
function openDraft() {
  fireEvent.click(
    screen.getByText("New support request", { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Support subject"), {
    target: { value: "Draft request" },
  });
  fireEvent.change(screen.getByLabelText("Support message"), {
    target: { value: "Original request details" },
  });
}
test("support GET failure has retry and confirmed empty is shown only after success", async () => {
  let reads = 0;
  globalThis.fetch = (async () =>
    ++reads === 1
      ? Response.json({ error: "Support unavailable" }, { status: 503 })
      : Response.json({ cases: [] })) as any;
  try {
    render(
      <SupportCases
        organizationId="org"
        disabled={false}
        save={async () => {
          throw Error("must not write");
        }}
      />,
    );
    await screen.findByRole("alert");
    assert.equal(screen.queryByText("No support cases yet."), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh support cases" }),
    );
    await screen.findByText("No support cases yet.");
    assert.equal(screen.queryByRole("alert"), null);
    assert.equal(reads, 2);
  } finally {
    cleanup();
  }
});
test("unknown support POST keeps identical intent through409/429 and read refresh cannot erase its error", async () => {
  const writes: any[] = [];
  globalThis.fetch = (async () => Response.json({ cases: [] })) as any;
  const save = async (path: string, method: string, body: any) => {
    writes.push({ path, method, body: structuredClone(body) });
    if (writes.length === 1) throw new Error("Response lost after submission");
    if (writes.length === 2)
      throw new WorkspaceError("Conflict still needs checking", 409);
    throw new WorkspaceError("Wait before retrying", 429);
  };
  try {
    render(
      <SupportCases
        organizationId="org"
        branches={[{ id: "branch", name: "Surulere" }]}
        disabled={false}
        save={save}
      />,
    );
    await screen.findByText("No support cases yet.");
    openDraft();
    fireEvent.change(screen.getByLabelText("Related branch"), {
      target: { value: "branch" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create support case" }),
    );
    await screen.findByText("Response lost after submission");
    assert.equal(
      (screen.getByLabelText("Support subject") as HTMLInputElement).closest(
        "fieldset",
      )?.disabled,
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh support cases" }),
    );
    await waitFor(() =>
      assert.equal(
        (
          screen.getByRole("button", {
            name: "Refresh support cases",
          }) as HTMLButtonElement
        ).disabled,
        false,
      ),
    );
    assert.ok(screen.getByText("Response lost after submission"));
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original support case" }),
    );
    await screen.findByText("Conflict still needs checking");
    assert.ok(
      screen.getByRole("button", { name: "Retry original support case" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original support case" }),
    );
    await screen.findByText("Wait before retrying");
    assert.equal(writes.length, 3);
    assert.deepEqual(writes[0], writes[1]);
    assert.deepEqual(writes[1], writes[2]);
    assert.equal(writes[0].path, "/organizations/org/support-cases");
    assert.equal(writes[0].method, "POST");
    assert.equal(writes[0].body.branchId, "branch");
    assert.ok(writes[0].body.requestKey);
    assert.equal(
      (screen.getByLabelText("Support message") as HTMLTextAreaElement).closest(
        "fieldset",
      )?.disabled,
      true,
    );
  } finally {
    cleanup();
  }
});
test("native new-request disclosure retains an unsent draft while closed", async () => {
  globalThis.fetch = (async () => Response.json({ cases: [] })) as any;
  let writes = 0;
  try {
    render(
      <SupportCases
        organizationId="org"
        disabled={false}
        save={async () => {
          writes++;
        }}
      />,
    );
    await screen.findByText("No support cases yet.");
    openDraft();
    const summary = screen.getByText("New support request", {
      selector: "summary",
    });
    const block = summary.closest("details")!;
    assert.equal(block.open, true);
    fireEvent.click(summary);
    assert.equal(block.open, false);
    fireEvent.click(summary);
    assert.equal(block.open, true);
    assert.equal(
      (screen.getByLabelText("Support subject") as HTMLInputElement).value,
      "Draft request",
    );
    assert.equal(
      (screen.getByLabelText("Support message") as HTMLTextAreaElement).value,
      "Original request details",
    );
    assert.equal(writes, 0);
  } finally {
    cleanup();
  }
});
test("organization switch hides old case results even when an earlier GET completes late", async () => {
  let release: ((value: Response) => void) | undefined;
  globalThis.fetch = (async (input: any) =>
    String(input).includes("/org-a/")
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json({
          cases: [
            {
              ...caseRow,
              id: "b",
              reference: "SUP-B",
              subject: "New organization",
            },
          ],
        })) as any;
  try {
    const view = render(
      <SupportCases
        organizationId="org-a"
        disabled={false}
        save={async () => {}}
      />,
    );
    await waitFor(() => assert.ok(release));
    view.rerender(
      <SupportCases
        organizationId="org-b"
        disabled={false}
        save={async () => {}}
      />,
    );
    await screen.findByText("SUP-B · New organization");
    await act(async () => {
      release!(Response.json({ cases: [caseRow] }));
    });
    assert.equal(screen.queryByText("SUP-ONE · Scoped request"), null);
    assert.ok(screen.getByText("SUP-B · New organization"));
  } finally {
    cleanup();
  }
});
for (const status of [401, 403])
  test(`support GET${status} clears private records and form and prevents writes`, async () => {
    let reads = 0,
      writes = 0;
    globalThis.fetch = (async () =>
      ++reads === 1
        ? Response.json({ cases: [caseRow] })
        : Response.json({ error: "Access revoked" }, { status })) as any;
    try {
      render(
        <SupportCases
          organizationId="org"
          disabled={false}
          save={async () => {
            writes++;
          }}
        />,
      );
      await screen.findByText("SUP-ONE · Scoped request");
      openDraft();
      fireEvent.click(
        screen.getByRole("button", { name: "Refresh support cases" }),
      );
      await screen.findByText(/Organization access needs checking/);
      assert.equal(screen.queryByText("Private organization case"), null);
      assert.equal(screen.queryByLabelText("Support subject"), null);
      assert.equal(
        screen.queryByRole("button", { name: "Create support case" }),
        null,
      );
      assert.equal(
        screen.queryByRole("button", { name: "Retry original support case" }),
        null,
      );
      assert.equal(writes, 0);
    } finally {
      cleanup();
    }
  });
for (const status of [401, 403])
  test(`support POST${status} after uncertainty hides protected draft and prevents another retry`, async () => {
    let writes = 0;
    globalThis.fetch = (async () => Response.json({ cases: [caseRow] })) as any;
    try {
      render(
        <SupportCases
          organizationId="org"
          disabled={false}
          save={async () => {
            writes++;
            if (writes === 1) throw Error("Uncertain request");
            throw new WorkspaceError("Access revoked", status);
          }}
        />,
      );
      await screen.findByText("SUP-ONE · Scoped request");
      openDraft();
      fireEvent.click(
        screen.getByRole("button", { name: "Create support case" }),
      );
      await screen.findByText("Uncertain request");
      fireEvent.click(
        screen.getByRole("button", { name: "Retry original support case" }),
      );
      await screen.findByText(/Organization access needs checking/);
      assert.equal(screen.queryByText("Private organization case"), null);
      assert.equal(screen.queryByLabelText("Support subject"), null);
      assert.equal(
        screen.queryByRole("button", { name: "Retry original support case" }),
        null,
      );
      assert.equal(screen.queryByText("Original request details"), null);
      assert.equal(writes, 2);
    } finally {
      cleanup();
    }
  });
