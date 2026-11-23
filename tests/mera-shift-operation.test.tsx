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
const { render, screen, fireEvent, waitFor, cleanup, act, within } =
  await import("@testing-library/react");
function fillPresetDetails(label: string, value: string) {
  fireEvent.click(
    within(screen.getByRole("group", { name: label, hidden: true })).getByRole(
      "radio",
      { name: "Other", hidden: true },
    ),
  );
  fireEvent.change(screen.getByLabelText(`${label} details`), {
    target: { value },
  });
}

const { default: ShiftOperation } =
  await import("../src/mera/workspace/ShiftOperation");
const j = await import("../src/mera/workspace/shiftOperationJournal");
const actor = "10000000-0000-4000-8000-000000000001",
  org = "20000000-0000-4000-8000-000000000001",
  branch = "30000000-0000-4000-8000-000000000001",
  shiftId = "40000000-0000-4000-8000-000000000001";
const scope = { actorId: actor, organizationId: org, branchId: branch },
  original = globalThis.fetch;
const props = {
  userId: actor,
  organizationId: org,
  branchId: branch,
  disabled: false,
  canManage: true,
  shifts: [],
  save: async () => ({}),
};
function proof(r: any, status = "not_found", extra: any = {}) {
  return {
    ...scope,
    requestKey: r.requestKey,
    operation: r.operation,
    shiftId: r.shiftId,
    status,
    ...extra,
  };
}
function recorded(r: any) {
  return proof(r, "recorded", {
    resultBasis: "recorded_operation_snapshot",
    shift: {
      id: shiftId,
      status: r.operation === "open" ? "open" : "pending_approval",
      openingFloat: 1000,
    },
    operationRecord: {
      id: shiftId,
      actorId: actor,
      requestKey: r.requestKey,
      operation: r.operation,
      shiftId,
      intent:
        r.operation === "open"
          ? { openingFloat: r.body.openingFloat }
          : {
              countedCash: r.body.countedCash,
              reason: r.body.reason,
              shiftId: r.shiftId,
            },
      createdAt: "2026-11-19T10:00:00Z",
    },
  });
}
async function openForm() {
  fireEvent.click(screen.getByText("Open a shift", { selector: "summary" }));
  await screen.findByLabelText("Opening float (naira)");
}
test("unknown opening persists exact minor units/key across remount/current shift change and only explicit retry writes", async () => {
  const writes: any[] = [];
  globalThis.fetch = async () =>
    Response.json(proof(j.readShiftOperationJournal(scope)));
  try {
    const view = render(
      <ShiftOperation
        {...props}
        save={async (...args: any[]) => {
          writes.push(args);
          throw Error("Unknown");
        }}
      />,
    );
    await openForm();
    fireEvent.input(screen.getByLabelText("Opening float (naira)"), {
      target: { value: "12.34" },
    });
    const form = screen
      .getByRole("button", { name: "Open shift" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByText("Original shift opening");
    assert.equal(writes.length, 1);
    assert.equal(writes[0][2].openingFloat, 1234);
    view.unmount();
    render(
      <ShiftOperation
        {...props}
        shifts={[{ id: shiftId, status: "open" }]}
        save={async (...args: any[]) => {
          writes.push(args);
          throw Object.assign(Error("Later conflict"), { status: 409 });
        }}
      />,
    );
    await screen.findByText(/has not been recorded yet/);
    assert.equal(writes.length, 1);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original shift operation" }),
    );
    await waitFor(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0][2], writes[1][2]);
    assert.ok(j.readShiftOperationJournal(scope));
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("POST success requires operation-record proof and resets cash before synthetic duplicate submission", async () => {
  let writes = 0;
  globalThis.fetch = async () =>
    Response.json(recorded(j.readShiftOperationJournal(scope)));
  try {
    render(
      <ShiftOperation
        {...props}
        save={async () => {
          writes++;
          return { id: shiftId, status: "open" };
        }}
      />,
    );
    await openForm();
    fireEvent.change(screen.getByLabelText("Opening float (naira)"), {
      target: { value: "0" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Open shift" }).closest("form")!,
    );
    await screen.findByText(/original shift operation is recorded/);
    assert.equal(j.readShiftOperationJournal(scope), null);
    assert.equal(
      (screen.getByLabelText("Opening float (naira)") as HTMLInputElement)
        .value,
      "",
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Open shift" }).closest("form")!,
    );
    await screen.findByText(/No shift operation was sent/);
    assert.equal(writes, 1);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("close target and original count stay frozen despite new current shift, malformed operation intent never unlocks", async () => {
  let body: any;
  globalThis.fetch = async () => {
    const r = j.readShiftOperationJournal(scope);
    const value = recorded(r);
    value.operationRecord.intent.countedCash = 999;
    return Response.json(value);
  };
  try {
    const view = render(
      <ShiftOperation
        {...props}
        shifts={[{ id: shiftId, status: "open" }]}
        save={async (_p, _m, b) => {
          body = b;
          return { id: shiftId, status: "closed" };
        }}
      />,
    );
    fireEvent.click(screen.getByText("Close and reconcile the open shift"));
    fireEvent.change(screen.getByLabelText("Counted cash (naira)"), {
      target: { value: "10.01" },
    });
    fillPresetDetails("Variance explanation", "Till counted by staff");
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Close & reconcile" })
        .closest("form")!,
    );
    await screen.findByText("Original shift closing");
    assert.equal(body.countedCash, 1001);
    assert.ok(j.readShiftOperationJournal(scope));
    view.rerender(
      <ShiftOperation {...props} shifts={[{ id: actor, status: "open" }]} />,
    );
    assert.ok(screen.getByText(/₦10.01/));
    assert.equal(j.readShiftOperationJournal(scope)?.shiftId, shiftId);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("reference-only marker can stop safely, actor header accompanies proof checks and no private amount/reason can retry", async () => {
  const record = j.saveShiftOperationJournal({
    version: 1,
    ...scope,
    referenceOnly: false,
    requestKey: shiftId,
    operation: "close",
    shiftId,
    body: { requestKey: shiftId, countedCash: 1234, reason: "PRIVATE REASON" },
  });
  assert.equal(j.redactShiftOperationJournals(), true);
  const calls: any[] = [];
  globalThis.fetch = async (input, options) => {
    calls.push([String(input), options]);
    return Response.json(
      String(input).endsWith("/abandon")
        ? proof(record, "abandoned", { resolutionId: shiftId })
        : proof(record),
    );
  };
  try {
    render(<ShiftOperation {...props} />);
    await screen.findByText(/has not been recorded yet/);
    assert.ok(!screen.queryByText(/PRIVATE REASON/));
    assert.ok(
      !screen.queryByRole("button", { name: "Retry original shift operation" }),
    );
    fireEvent.click(screen.getByText("Stop the unconfirmed shift request"));
    fillPresetDetails("Reason for stopping", "Stop original attempt");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I want to stop this unconfirmed shift operation.",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Check and stop original shift operation",
      }),
    );
    await screen.findByText(/unconfirmed operation was stopped/);
    assert.equal(j.readShiftOperationJournal(scope), null);
    for (const [, options] of calls)
      assert.equal(options.headers["X-Mera-Actor-Id"], actor);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("missing/multiple open records and malformed/blank cash never dispatch; storage blocked fails closed", async () => {
  let writes = 0;
  try {
    const view = render(
      <ShiftOperation
        {...props}
        shifts={undefined}
        save={async () => {
          writes++;
          return {};
        }}
      />,
    );
    fireEvent.click(screen.getByText("Open a shift"));
    assert.equal(
      screen.getByRole("button", { name: "Open shift" }).matches(":disabled"),
      true,
    );
    view.rerender(
      <ShiftOperation
        {...props}
        save={async () => {
          writes++;
          return {};
        }}
      />,
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Open shift" }).closest("form")!,
    );
    await screen.findByText(/No shift operation was sent/);
    assert.equal(writes, 0);
    assert.throws(() => j.parseShiftAmount(""));
    assert.throws(() => j.parseShiftAmount("1.001"));
    assert.throws(() => j.parseShiftAmount("-1"));
    assert.equal(j.parseShiftAmount("0.01"), 1);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
  const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get() {
      throw Error("Blocked");
    },
  });
  try {
    render(
      <ShiftOperation
        {...props}
        save={async () => {
          writes++;
          return {};
        }}
      />,
    );
    await screen.findByText(
      /Saved shift recovery details could not be verified/,
    );
    assert.equal(writes, 0);
  } finally {
    cleanup();
    Object.defineProperty(window, "sessionStorage", descriptor);
    globalThis.fetch = original;
  }
});
test("successful close verifies original operation through GET before clearing and resets drafts", async () => {
  let writes = 0,
    reads = 0;
  globalThis.fetch = async () => {
    reads++;
    return Response.json(recorded(j.readShiftOperationJournal(scope)));
  };
  try {
    render(
      <ShiftOperation
        {...props}
        shifts={[
          { id: shiftId, status: "open", openedAt: "2026-11-19T10:00:00Z" },
        ]}
        save={async () => {
          writes++;
          assert.ok(j.readShiftOperationJournal(scope));
          return { id: shiftId, status: "pending_approval" };
        }}
      />,
    );
    fireEvent.click(screen.getByText("Close and reconcile the open shift"));
    fireEvent.change(screen.getByLabelText("Counted cash (naira)"), {
      target: { value: "15" },
    });
    fillPresetDetails("Variance explanation", "Staff counted till");
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Close & reconcile" })
        .closest("form")!,
    );
    await screen.findByText(/original shift operation is recorded/);
    assert.equal(writes, 1);
    assert.equal(reads, 1);
    assert.equal(j.readShiftOperationJournal(scope), null);
    assert.equal(
      (screen.getByLabelText("Counted cash (naira)") as HTMLInputElement).value,
      "",
    );
    assert.equal(screen.queryByLabelText("Variance explanation details"), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("denied recovery hides cash and reason immediately and redacts journal without clearing unresolved reference", async () => {
  globalThis.fetch = async () =>
    Response.json({ error: "Denied" }, { status: 403 });
  try {
    render(
      <ShiftOperation
        {...props}
        shifts={[{ id: shiftId, status: "open" }]}
        save={async () => {
          throw Error("Unknown");
        }}
      />,
    );
    fireEvent.click(screen.getByText("Close and reconcile the open shift"));
    fireEvent.change(screen.getByLabelText("Counted cash (naira)"), {
      target: { value: "18.76" },
    });
    fillPresetDetails("Variance explanation", "PRIVATE CASH EXPLANATION");
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Close & reconcile" })
        .closest("form")!,
    );
    await screen.findByText("Original shift closing");
    fireEvent.click(
      screen.getByRole("button", { name: "Check original shift operation" }),
    );
    await screen.findByText(/Shift access needs checking/);
    assert.ok(!screen.queryByText(/PRIVATE CASH EXPLANATION/));
    assert.ok(!screen.queryByRole("button"));
    const marker = j.readShiftOperationJournal(scope)!;
    assert.equal(marker.referenceOnly, true);
    assert.ok(!JSON.stringify(marker).includes("1876"));
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("fresh close draft is bound to its actual target and resets when another open shift replaces it", async () => {
  let writes = 0;
  try {
    const p = {
      ...props,
      save: async () => {
        writes++;
        throw Error("Unknown");
      },
    };
    const view = render(
      <ShiftOperation {...p} shifts={[{ id: shiftId, status: "open" }]} />,
    );
    fireEvent.click(screen.getByText("Close and reconcile the open shift"));
    fireEvent.change(screen.getByLabelText("Counted cash (naira)"), {
      target: { value: "27.55" },
    });
    fillPresetDetails("Variance explanation", "A count only");
    view.rerender(
      <ShiftOperation {...p} shifts={[{ id: actor, status: "open" }]} />,
    );
    assert.equal(
      (screen.getByLabelText("Counted cash (naira)") as HTMLInputElement).value,
      "",
    );
    assert.equal(
      (
        screen.getByLabelText(
          "Variance explanation details",
        ) as HTMLTextAreaElement
      ).value,
      "",
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Close & reconcile" })
        .closest("form")!,
    );
    await screen.findByText(/No shift operation was sent/);
    assert.equal(writes, 0);
    assert.equal(j.readShiftOperationJournal(scope), null);
    fireEvent.change(screen.getByLabelText("Counted cash (naira)"), {
      target: { value: "3.25" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Close & reconcile" })
        .closest("form")!,
    );
    await screen.findByText("Original shift closing");
    assert.equal(writes, 1);
    assert.equal(j.readShiftOperationJournal(scope)?.shiftId, actor);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
