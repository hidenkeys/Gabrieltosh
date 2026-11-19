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
const { default: VisitTables } =
  await import("../src/mera/workspace/VisitTables");
const { default: VisitMinimumSpend } =
  await import("../src/mera/workspace/VisitMinimumSpend");
const { default: PrivateVisitAccess } =
  await import("../src/mera/workspace/PrivateVisitAccess");
const { WorkspaceError } = await import("../src/mera/workspace/api");
const base = "/organizations/org/branches/branch";
const visit = {
  id: "visit",
  tableId: "a",
  tableIds: ["a"],
  version: 3,
  status: "open",
  displayName: "Current party",
};
const tables = [
  { id: "a", name: "Window", capacity: 4, status: "occupied" },
  { id: "b", name: "Garden", capacity: 4, status: "available" },
  { id: "c", name: "Other party", capacity: 4, status: "occupied" },
];
test("table changes preserve exact original version and selection through plain network, conflict and rate-limit errors", async () => {
  const calls: any[] = [];
  let attempt = 0;
  const save = async (...args: any[]) => {
    calls.push(args);
    attempt++;
    throw attempt === 1
      ? Error("Network uncertain")
      : new WorkspaceError("Retry not confirmed", attempt === 2 ? 409 : 429);
  };
  try {
    render(
      <VisitTables
        base={base}
        visit={visit}
        tables={tables}
        visits={[visit, { id: "other", status: "open", tableId: "c" }]}
        disabled={false}
        save={save}
      />,
    );
    fireEvent.click(screen.getByText("Move or combine this party’s tables"));
    assert.equal(
      (
        screen.getByRole("checkbox", {
          name: /Other party/,
        }) as HTMLInputElement
      ).disabled,
      true,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Garden/ }));
    fireEvent.change(screen.getByLabelText("Table change reason"), {
      target: { value: "Move closer to the window" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save this party’s tables" }),
    );
    await screen.findByRole("button", { name: "Retry original table change" });
    for (let i = 0; i < 2; i++) {
      fireEvent.click(
        screen.getByRole("button", { name: "Retry original table change" }),
      );
      await waitFor(() => assert.equal(calls.length, i + 2));
      await waitFor(() =>
        assert.equal(
          (
            screen.getByRole("button", {
              name: "Retry original table change",
            }) as HTMLButtonElement
          ).disabled,
          false,
        ),
      );
    }
    assert.deepEqual(calls[0][2], calls[1][2]);
    assert.deepEqual(calls[0][2], calls[2][2]);
    assert.equal(calls[0][2].version, 3);
    assert.deepEqual(calls[0][2].tableIds, ["a", "b"]);
    assert.match(calls[0][2].requestKey, /^[a-f0-9-]{36}$/);
    assert.equal(
      (
        screen.getByLabelText("Table change reason") as HTMLInputElement
      ).closest("fieldset")?.disabled,
      true,
    );
  } finally {
    cleanup();
  }
});
test("table scope changes cannot expose the old uncertain draft or late result, while a changed version requires deliberate review", async () => {
  let resolve: any;
  const save = async () =>
    new Promise<any>((r) => {
      resolve = r;
    });
  try {
    const view = render(
      <VisitTables
        base={base}
        visit={visit}
        tables={tables}
        visits={[visit]}
        disabled={false}
        save={save}
      />,
    );
    fireEvent.click(screen.getByText("Move or combine this party’s tables"));
    fireEvent.change(screen.getByLabelText("Table change reason"), {
      target: { value: "Private old party note" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save this party’s tables" }),
    );
    view.rerender(
      <VisitTables
        base={base + "other"}
        visit={{ ...visit, id: "new", version: 4 }}
        tables={tables}
        visits={[]}
        disabled={false}
        save={save}
      />,
    );
    await act(async () =>
      resolve({ tableIds: ["b"], tableId: "b", version: 9 }),
    );
    assert(!document.body.textContent?.includes("Private old party note"));
    assert.equal(
      (screen.getByLabelText("Primary table") as HTMLSelectElement).value,
      "a",
    );
    view.rerender(
      <VisitTables
        base={base + "other"}
        visit={{ ...visit, id: "new", version: 5 }}
        tables={tables}
        visits={[]}
        disabled={false}
        save={save}
      />,
    );
    assert(screen.getByText(/changed while you were reviewing/));
    fireEvent.click(
      screen.getByRole("button", { name: "Review current tables" }),
    );
    assert.equal(screen.queryByText(/changed while you were reviewing/), null);
  } finally {
    cleanup();
  }
});
const terms = (shortfall = 60000) => ({
  version: 3,
  summary: {
    enabled: true,
    target: 100000,
    netPaid: 40000,
    waived: 0,
    shortfall,
    disclosure: "Original accepted terms",
  },
});
test("minimum-spend failed reads retry honestly, and successful waiver plus failed refresh is not an uncertain write", async () => {
  const original = globalThis.fetch;
  let reads = 0,
    writes = 0;
  globalThis.fetch = (async () => {
    reads++;
    if (reads === 1 || reads === 3) throw Error("read unavailable");
    return Response.json(terms());
  }) as any;
  try {
    render(
      <VisitMinimumSpend
        base={base}
        visitId="visit"
        updatedKey="1"
        disabled={false}
        canWaive={true}
        save={async () => {
          writes++;
          return {};
        }}
      />,
    );
    fireEvent.click(screen.getByText("Minimum-spend commitment"));
    await screen.findByRole("button", { name: "Retry loading visit terms" });
    assert.equal(
      screen.queryByText("No minimum-spend terms are attached to this visit."),
      null,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading visit terms" }),
    );
    await screen.findByText("Commitment shortfall: ₦600.00");
    fireEvent.change(screen.getByLabelText("Minimum-spend waiver reason"), {
      target: { value: "Manager approved exception" },
    });
    fireEvent.click(
      screen.getByLabelText(
        "I approve waiving the current disclosed commitment shortfall.",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Waive current commitment shortfall",
      }),
    );
    await waitFor(() => assert.equal(writes, 1));
    await screen.findByRole("button", { name: "Retry loading visit terms" });
    assert.equal(
      screen.queryByRole("button", {
        name: "Retry original minimum-spend review",
      }),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("minimum-spend original waiver stays fixed after read refresh and later conflict; read denial fences private results", async () => {
  const original = globalThis.fetch;
  let deny = false;
  globalThis.fetch = (async () =>
    deny
      ? Response.json({ error: "Denied" }, { status: 403 })
      : Response.json(terms())) as any;
  const calls: any[] = [];
  let n = 0;
  try {
    render(
      <VisitMinimumSpend
        base={base}
        visitId="visit"
        updatedKey="1"
        disabled={false}
        canWaive={true}
        save={async (...args: any[]) => {
          calls.push(args);
          n++;
          throw n === 1
            ? Error("Unknown result")
            : new WorkspaceError("Conflict", 409);
        }}
      />,
    );
    fireEvent.click(screen.getByText("Minimum-spend commitment"));
    await screen.findByText("Commitment shortfall: ₦600.00");
    fireEvent.change(screen.getByLabelText("Minimum-spend waiver reason"), {
      target: { value: "Private original waiver reason" },
    });
    fireEvent.click(
      screen.getByLabelText(
        "I approve waiving the current disclosed commitment shortfall.",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Waive current commitment shortfall",
      }),
    );
    await screen.findByRole("button", {
      name: "Retry original minimum-spend review",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh visit commitment" }),
    );
    await screen.findByText("Commitment shortfall: ₦600.00");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry original minimum-spend review",
      }),
    );
    await waitFor(() => assert.equal(calls.length, 2));
    assert.deepEqual(calls[0][2], calls[1][2]);
    deny = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh visit commitment" }),
    );
    await screen.findByText(/Access to this party’s commitment needs checking/);
    assert.equal(screen.queryByText("Original accepted terms"), null);
    assert.equal(screen.queryByLabelText("Minimum-spend waiver reason"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("minimum-spend malformed amounts remain unavailable rather than zero and cannot waive", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({
      ...terms(),
      summary: { ...terms().summary, target: undefined, netPaid: 0 },
    })) as any;
  try {
    render(
      <VisitMinimumSpend
        base={base}
        visitId="visit"
        updatedKey="1"
        disabled={false}
        canWaive={true}
        save={async () => {
          throw Error("must not write");
        }}
      />,
    );
    fireEvent.click(screen.getByText("Minimum-spend commitment"));
    await screen.findByText(/Commitment amounts are incomplete/);
    assert.equal(
      screen.getByText("Original target").nextElementSibling?.textContent,
      "Unavailable",
    );
    assert.equal(
      screen.getByText("Net paid bill").nextElementSibling?.textContent,
      "₦0.00",
    );
    assert.equal(
      (
        screen.getByLabelText("Minimum-spend waiver reason") as HTMLInputElement
      ).closest("fieldset")?.disabled,
      true,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("private code is absent until explicit reveal, hides on version change, and uncertain rotation waits for an explicit refresh", async () => {
  let rotations = 0,
    refreshes = 0;
  try {
    const view = render(
      <PrivateVisitAccess
        visit={visit}
        code="PRIVATE_TEST_CODE"
        disabled={false}
        canRotate={true}
        onClear={() => {}}
        onRotate={async () => {
          rotations++;
          throw Error("Unknown rotation");
        }}
        onRefresh={async () => {
          refreshes++;
        }}
      />,
    );
    assert.equal(screen.queryByText("PRIVATE_TEST_CODE"), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Show private joining code" }),
    );
    assert(screen.getByText("PRIVATE_TEST_CODE"));
    view.rerender(
      <PrivateVisitAccess
        visit={{ ...visit, version: 4 }}
        code="PRIVATE_TEST_CODE"
        disabled={false}
        canRotate={true}
        onClear={() => {}}
        onRotate={async () => {
          rotations++;
          throw Error("Unknown rotation");
        }}
        onRefresh={async () => {
          refreshes++;
        }}
      />,
    );
    assert.equal(screen.queryByText("PRIVATE_TEST_CODE"), null);
    fireEvent.click(screen.getByText("Generate a new code for this party"));
    fireEvent.change(screen.getByLabelText("Joining-code replacement reason"), {
      target: { value: "Explicit replacement" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Generate replacement private code" }),
    );
    await screen.findByText(/Replacement was not confirmed/);
    assert.equal(
      (
        screen.getByLabelText(
          "Joining-code replacement reason",
        ) as HTMLInputElement
      ).closest("fieldset")?.disabled,
      true,
    );
    assert.equal(rotations, 1);
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh current visit" }),
    );
    await waitFor(() => assert.equal(refreshes, 1));
    await waitFor(() =>
      assert.equal(
        (
          screen.getByLabelText(
            "Joining-code replacement reason",
          ) as HTMLInputElement
        ).closest("fieldset")?.disabled,
        false,
      ),
    );
    assert.equal(rotations, 1);
  } finally {
    cleanup();
  }
});
