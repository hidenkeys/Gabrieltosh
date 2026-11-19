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
const { default: CashMovement } =
  await import("../src/mera/workspace/CashMovement");
const { default: ShiftActions } =
  await import("../src/mera/workspace/ShiftActions");
const { default: Reconciliation } =
  await import("../src/mera/workspace/Reconciliation");
const { WorkspaceError } = await import("../src/mera/workspace/api");

const base = "/organizations/org/branches/branch";
function cashDraft() {
  fireEvent.change(screen.getByLabelText("Movement amount (naira)"), {
    target: { value: "500" },
  });
  fireEvent.change(screen.getByLabelText("Movement reason"), {
    target: { value: "Reviewed petty cash" },
  });
}
test("cash plain-network uncertainty survives409/429 exact retries and auth loss hides the draft", async () => {
  const writes: any[] = [];
  const save = async (path: string, method: string, body: any) => {
    writes.push({ path, method, body: structuredClone(body) });
    if (writes.length === 1) throw Error("Cash response lost");
    throw new WorkspaceError(
      "Cash request needs checking",
      writes.length === 2 ? 409 : writes.length === 3 ? 429 : 403,
    );
  };
  try {
    render(
      <CashMovement base={base} shiftId="shift" disabled={false} save={save} />,
    );
    cashDraft();
    fireEvent.click(
      screen.getByRole("button", { name: "Record cash movement" }),
    );
    await screen.findByText("Cash response lost");
    assert.equal(
      (screen.getByLabelText("Movement reason") as HTMLInputElement).closest(
        "fieldset",
      )?.disabled,
      true,
    );
    for (let i = 0; i < 3; i++) {
      fireEvent.click(
        screen.getByRole("button", { name: "Retry original cash movement" }),
      );
      await waitFor(() => assert.equal(writes.length, i + 2));
      await waitFor(() =>
        assert.equal(
          screen.queryByRole("button", {
            name: "Retry original cash movement",
          }) === null ||
            !(
              screen.getByRole("button", {
                name: "Retry original cash movement",
              }) as HTMLButtonElement
            ).disabled,
          true,
        ),
      );
    }
    assert.ok(
      writes.every((row) => JSON.stringify(row) === JSON.stringify(writes[0])),
    );
    assert.equal(writes[0].body.amount, 50000);
    await screen.findByText(/Shift access needs checking/);
    assert.equal(screen.queryByLabelText("Movement reason"), null);
    assert.equal(
      screen.queryByRole("button", { name: "Retry original cash movement" }),
      null,
    );
  } finally {
    cleanup();
  }
});
test("cash scope change cannot reuse another shift's uncertain amount or key", async () => {
  try {
    const view = render(
      <CashMovement
        base={base}
        shiftId="old"
        disabled={false}
        save={async () => {
          throw Error("Unknown old movement");
        }}
      />,
    );
    cashDraft();
    fireEvent.click(
      screen.getByRole("button", { name: "Record cash movement" }),
    );
    await screen.findByText("Unknown old movement");
    view.rerender(
      <CashMovement
        base="/organizations/other/branches/new"
        shiftId="new"
        disabled={false}
        save={async () => {}}
      />,
    );
    assert.equal(
      screen.queryByRole("button", { name: "Retry original cash movement" }),
      null,
    );
    assert.equal(
      (screen.getByLabelText("Movement amount (naira)") as HTMLInputElement)
        .value,
      "",
    );
  } finally {
    cleanup();
  }
});
test("reconciliation failed reads retry honestly and a successful write followed by failed refresh is not uncertain", async () => {
  let reads = 0;
  const writes: any[] = [];
  globalThis.fetch = (async () => {
    reads++;
    return reads === 1 || reads === 3
      ? Response.json({ error: "Read unavailable" }, { status: 503 })
      : Response.json({ transactions: [] });
  }) as any;
  try {
    render(
      <Reconciliation
        base={base}
        orders={[{ id: "order", reference: "M-1" }]}
        demo
        disabled={false}
        save={async (...args: any[]) => {
          writes.push(args);
          return {};
        }}
      />,
    );
    await screen.findByRole("alert");
    assert.equal(
      screen.queryByText("No provider observations recorded for this branch."),
      null,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry reconciliation" }),
    );
    await screen.findByText(
      "No provider observations recorded for this branch.",
    );
    fireEvent.click(
      screen.getByText("Record a simulator observation", {
        selector: "summary",
      }),
    );
    fireEvent.change(screen.getByLabelText("Simulator transaction ID"), {
      target: { value: "TX-123" },
    });
    fireEvent.change(screen.getByLabelText("Simulator order"), {
      target: { value: "order" },
    });
    fireEvent.change(screen.getByLabelText("Observed amount (naira)"), {
      target: { value: "100" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record test observation" }),
    );
    await screen.findByRole("alert");
    assert.equal(writes.length, 1);
    assert.equal(
      screen.queryByRole("button", { name: "Retry original observation" }),
      null,
    );
    assert.ok(writes[0][0].endsWith("/provider-simulator/events"));
  } finally {
    cleanup();
  }
});
test("reconciliation unknown retries keep eventID/time/body and read refresh does not clear write error", async () => {
  const writes: any[] = [];
  globalThis.fetch = (async () => Response.json({ transactions: [] })) as any;
  try {
    render(
      <Reconciliation
        base={base}
        orders={[{ id: "order", reference: "M-1" }]}
        demo
        disabled={false}
        save={async (path: string, method: string, body: any) => {
          writes.push(structuredClone(body));
          if (writes.length === 1) throw Error("Event response lost");
          throw new WorkspaceError("Event conflict", 409);
        }}
      />,
    );
    await screen.findByText(
      "No provider observations recorded for this branch.",
    );
    fireEvent.click(
      screen.getByText("Record a simulator observation", {
        selector: "summary",
      }),
    );
    fireEvent.change(screen.getByLabelText("Simulator transaction ID"), {
      target: { value: "TX-123" },
    });
    fireEvent.change(screen.getByLabelText("Simulator order"), {
      target: { value: "order" },
    });
    fireEvent.change(screen.getByLabelText("Observed amount (naira)"), {
      target: { value: "100" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record test observation" }),
    );
    await screen.findByText("Event response lost");
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh reconciliation" }),
    );
    await waitFor(() =>
      assert.equal(
        (
          screen.getByRole("button", {
            name: "Refresh reconciliation",
          }) as HTMLButtonElement
        ).disabled,
        false,
      ),
    );
    assert.ok(screen.getByText("Event response lost"));
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original observation" }),
    );
    await screen.findByText("Event conflict");
    assert.deepEqual(writes[0], writes[1]);
    assert.ok(writes[0].eventId);
    assert.ok(writes[0].occurredAt);
  } finally {
    cleanup();
  }
});
test("shift staff read failure retries before showing a genuine empty eligible list", async () => {
  let reads = 0;
  globalThis.fetch = (async () =>
    ++reads === 1
      ? Response.json({ error: "Staff unavailable" }, { status: 503 })
      : Response.json([])) as any;
  try {
    render(
      <ShiftActions
        base={base}
        shift={{ id: "shift", status: "open" }}
        canApprove={false}
        disabled={false}
        save={async () => {}}
      />,
    );
    fireEvent.click(
      screen.getByText("Hand over this open shift", { selector: "summary" }),
    );
    await screen.findByRole("alert");
    assert.equal(
      screen.queryByText(
        "No eligible receiving staff are available for this branch.",
      ),
      null,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry receiving staff" }),
    );
    await screen.findByText(
      "No eligible receiving staff are available for this branch.",
    );
    assert.equal(reads, 2);
  } finally {
    cleanup();
  }
});
test("handover plain-network uncertainty retains original receiver/key through409", async () => {
  const writes: any[] = [];
  globalThis.fetch = (async () =>
    Response.json([{ userId: "receiver", name: "Bola" }])) as any;
  try {
    render(
      <ShiftActions
        base={base}
        shift={{ id: "shift", status: "open" }}
        canApprove={false}
        disabled={false}
        save={async (path: string, method: string, body: any) => {
          writes.push(structuredClone(body));
          if (writes.length === 1) throw Error("Handover response lost");
          throw new WorkspaceError("Handover conflict", 409);
        }}
      />,
    );
    fireEvent.click(
      screen.getByText("Hand over this open shift", { selector: "summary" }),
    );
    await screen.findByRole("option", { name: "Bola" });
    fireEvent.change(screen.getByLabelText("Receiving staff"), {
      target: { value: "receiver" },
    });
    fireEvent.change(screen.getByLabelText("Handover reason"), {
      target: { value: "Evening responsibility" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record shift handover" }),
    );
    await screen.findByText("Handover response lost");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original handover" }),
    );
    await screen.findByText("Handover conflict");
    assert.deepEqual(writes[0], writes[1]);
    assert.equal(
      (screen.getByLabelText("Receiving staff") as HTMLSelectElement).closest(
        "fieldset",
      )?.disabled,
      true,
    );
  } finally {
    cleanup();
  }
});
test("unknown variance approval cannot be blindly resubmitted without refreshing shift state", async () => {
  let writes = 0;
  try {
    render(
      <ShiftActions
        base={base}
        shift={{ id: "shift", status: "pending_approval", variance: 5000 }}
        canApprove
        disabled={false}
        save={async () => {
          writes++;
          throw Error("Approval response lost");
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Variance approval reason"), {
      target: { value: "Count reviewed" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Approve reconciled variance" }),
    );
    await screen.findByText(/Approval was not confirmed/);
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Approve reconciled variance",
        }) as HTMLButtonElement
      ).closest("fieldset")?.disabled,
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Approve reconciled variance" }),
    );
    assert.equal(writes, 1);
  } finally {
    cleanup();
  }
});

test("reconciliation access loss clears private rows and removes simulator entry", async () => {
  let reads = 0;
  globalThis.fetch = (async () =>
    ++reads === 1
      ? Response.json({
          transactions: [
            {
              transactionId: "private-transaction",
              reference: "PRIVATE-REFERENCE",
              status: "matched",
              fee: {},
              missingSequences: [],
            },
          ],
        })
      : Response.json({ error: "Access revoked" }, { status: 403 })) as any;
  try {
    render(
      <Reconciliation
        base={base}
        orders={[]}
        demo
        disabled={false}
        save={async () => {
          throw Error("must not write");
        }}
      />,
    );
    await screen.findByRole("cell", { name: "PRIVATE-REFERENCE" });
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh reconciliation" }),
    );
    await screen.findByText(/Reconciliation access needs checking/);
    assert.equal(screen.queryByText("PRIVATE-REFERENCE"), null);
    assert.equal(screen.queryByText("Record a simulator observation"), null);
  } finally {
    cleanup();
  }
});
test("late reconciliation reads cannot populate another branch", async () => {
  let release: ((value: Response) => void) | undefined;
  globalThis.fetch = (async (input: any) =>
    String(input).includes("branch-old")
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json({ transactions: [] })) as any;
  try {
    const view = render(
      <Reconciliation
        base="/organizations/org/branches/branch-old"
        orders={[]}
        demo={false}
        disabled={false}
        save={async () => {}}
      />,
    );
    await waitFor(() => assert.ok(release));
    view.rerender(
      <Reconciliation
        base="/organizations/org/branches/new"
        orders={[]}
        demo={false}
        disabled={false}
        save={async () => {}}
      />,
    );
    await screen.findByText(
      "No provider observations recorded for this branch.",
    );
    await act(async () => {
      release!(
        Response.json({
          transactions: [
            {
              transactionId: "old-private",
              reference: "OLD-PRIVATE",
              fee: {},
              missingSequences: [],
            },
          ],
        }),
      );
    });
    assert.equal(screen.queryByText("OLD-PRIVATE"), null);
  } finally {
    cleanup();
  }
});
