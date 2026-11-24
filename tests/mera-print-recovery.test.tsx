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

const { default: PrintStudio } =
  await import("../src/mera/workspace/PrintStudio");
const { readPrintStudioMarker } =
  await import("../src/mera/workspace/printStudioJournal");
const base = "/organizations/org/branches/branch",
  actorId = "actor",
  original = globalThis.fetch;
const format = {
  id: "format-id",
  version: 1,
  receipt: {
    businessName: "Venue",
    footer: "Thank you",
    showStaff: true,
    paperWidth: 58,
  },
  label: { width: 50, height: 40 },
};
const job = {
  id: "source-job",
  kind: "receipt",
  status: "queued",
  createdAt: "2026-11-19T10:00:00Z",
};
const props = {
  base,
  actorId,
  disabled: false,
  canViewJobs: true,
  canReprint: true,
  save: async () => ({}),
};
const proof = (status = "not_found", extra: any = {}) => {
  const m = readPrintStudioMarker(actorId, base)!;
  return {
    actorId,
    organizationId: "org",
    branchId: "branch",
    operation: m.operation,
    targetId: m.targetId,
    requestKey: m.requestKey,
    status,
    ...extra,
  };
};
const fetchLists = () => {
  globalThis.fetch = async (input) =>
    Response.json(
      String(input).includes("-attempts/")
        ? proof()
        : String(input).endsWith("/templates")
          ? format
          : [job],
    );
};
async function edit() {
  await screen.findByTitle("Receipt sample preview");
  fireEvent.change(screen.getByLabelText("Business heading"), {
    target: { value: "PRIVATE DRAFT HEADING" },
  });
  return screen
    .getByRole("button", { name: "Save templates" })
    .closest("form")!;
}
test.afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  globalThis.fetch = original;
});
test("sample preview is marker-free; uncertain template globally locks reprints and preserves exact memory retry across read refresh", async () => {
  fetchLists();
  const writes: any[] = [];
  let reject: any;
  render(
    <PrintStudio
      {...props}
      save={async (...args: any[]) => {
        writes.push(args);
        if (writes.length === 1)
          return await new Promise((_r, r) => (reject = r));
        throw Object.assign(Error("Later conflict"), { status: 409 });
      }}
    />,
  );
  await screen.findByTitle("Receipt sample preview");
  assert.equal(readPrintStudioMarker(actorId, base), null);
  assert.match(
    screen.getByTitle("Receipt sample preview").getAttribute("srcdoc") || "",
    /SAMPLE — NOT A SALE/,
  );
  const form = await edit();
  fireEvent.submit(form);
  fireEvent.submit(form);
  assert.equal(writes.length, 1);
  await act(async () => reject(Error("Unknown")));
  await screen.findByRole("button", { name: "Retry original print request" });
  assert.ok(
    !JSON.stringify(readPrintStudioMarker(actorId, base)).includes(
      "PRIVATE DRAFT HEADING",
    ),
  );
  assert.equal(
    screen
      .getByRole("button", { name: "Queue marked duplicate" })
      .matches(":disabled"),
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh print jobs" }));
  await waitFor(() => assert(!screen.queryByText("Loading print jobs…")));
  assert.ok(readPrintStudioMarker(actorId, base));
  fireEvent.click(
    screen.getByRole("button", { name: "Check print request outcome" }),
  );
  await screen.findByText(/No completed request was found/);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original print request" }),
  );
  await waitFor(() => assert.equal(writes.length, 2));
  assert.deepEqual(writes[0][2], writes[1][2]);
  assert.ok(readPrintStudioMarker(actorId, base));
});
test("remount retains only reference, no automatic writes or private retry; explicit fenced stop uses actor header", async () => {
  fetchLists();
  let writes = 0;
  const p = {
    ...props,
    save: async () => {
      writes++;
      throw Error("Unknown");
    },
  };
  const view = render(<PrintStudio {...p} />);
  fireEvent.submit(await edit());
  await screen.findByRole("button", { name: "Retry original print request" });
  view.unmount();
  let stopped = false;
  const checks: any[] = [];
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    if (path.includes("-attempts/")) {
      checks.push([path, options]);
      if (path.endsWith("/abandon")) stopped = true;
      return Response.json(
        stopped ? proof("abandoned", { resolutionId: "resolution" }) : proof(),
      );
    }
    return Response.json(path.endsWith("/templates") ? format : [job]);
  };
  render(<PrintStudio {...p} />);
  await screen.findByRole("button", { name: "Check print request outcome" });
  assert.ok(
    !screen.queryByRole("button", { name: "Retry original print request" }),
  );
  assert.ok(!screen.queryByDisplayValue("PRIVATE DRAFT HEADING"));
  assert.equal(writes, 1);
  fireEvent.click(
    screen.getByRole("button", { name: "Stop original print request" }),
  );
  await screen.findByText(/original print request is stopped/);
  assert.equal(readPrintStudioMarker(actorId, base), null);
  assert.equal(writes, 1);
  for (const [, options] of checks)
    assert.equal(options.headers["X-Mera-Actor-Id"], actorId);
});
test("template recorded proof rejects altered intent before clearing and retains dirty draft during latest-format read", async () => {
  let bad = true,
    body: any;
  globalThis.fetch = async (input) => {
    if (String(input).includes("-attempts/")) {
      const m = readPrintStudioMarker(actorId, base)!;
      return Response.json(
        proof("recorded", {
          resultBasis: "recorded_operation_snapshot",
          result: { ...format, version: 2 },
          operationRecord: {
            id: "op",
            actorId,
            requestKey: m.requestKey,
            operation: m.operation,
            targetId: m.targetId,
            intent: {
              receipt: {
                ...body.receipt,
                businessName: bad ? "WRONG" : body.receipt.businessName,
              },
              label: body.label,
            },
          },
        }),
      );
    }
    return Response.json(String(input).endsWith("/templates") ? format : [job]);
  };
  render(
    <PrintStudio
      {...props}
      save={async (_p, _m, b) => {
        body = b;
        return { ...format, version: 2 };
      }}
    />,
  );
  fireEvent.submit(await edit());
  await screen.findByText(/differs from the original print request/);
  assert.ok(readPrintStudioMarker(actorId, base));
  fireEvent.click(
    screen.getByRole("button", { name: "Read latest saved format" }),
  );
  await screen.findByText(/Latest saved heading: Venue/);
  assert.equal(
    (screen.getByLabelText("Business heading") as HTMLInputElement).value,
    "PRIVATE DRAFT HEADING",
  );
  bad = false;
  fireEvent.click(
    screen.getByRole("button", { name: "Check print request outcome" }),
  );
  await screen.findByText(/original format save was recorded/);
  assert.equal(readPrintStudioMarker(actorId, base), null);
});
test("reprint proof must identify a queued marked duplicate with unconfirmed physical output, then one authoritative result clears recovery", async () => {
  let valid = false,
    body: any;
  globalThis.fetch = async (input) => {
    if (String(input).includes("-attempts/")) {
      const m = readPrintStudioMarker(actorId, base)!;
      return Response.json(
        proof("recorded", {
          resultBasis: "recorded_operation_snapshot",
          result: {
            id: "duplicate",
            originalJobId: job.id,
            status: "queued",
            duplicate: true,
            physicalConfirmed: !valid,
          },
          operationRecord: {
            id: "op",
            actorId,
            operation: "reprint",
            targetId: job.id,
            requestKey: m.requestKey,
            intent: { reason: body.reason.trim() },
          },
        }),
      );
    }
    return Response.json(String(input).endsWith("/templates") ? format : [job]);
  };
  render(
    <PrintStudio
      {...props}
      save={async (_p, _m, b) => {
        body = b;
        return {};
      }}
    />,
  );
  await screen.findByRole("button", { name: "Queue marked duplicate" });
  fillPresetDetails("Reason for reprint", "Paper jam reason");
  fireEvent.click(
    screen.getByRole("button", { name: "Queue marked duplicate" }),
  );
  await screen.findByText(/recorded print request could not be verified/);
  assert.equal(readPrintStudioMarker(actorId, base)?.operation, "reprint");
  valid = true;
  fireEvent.click(
    screen.getByRole("button", { name: "Check print request outcome" }),
  );
  await screen.findByText(/physical printing is still unconfirmed/);
  assert.equal(readPrintStudioMarker(actorId, base), null);
});
test("permission loss hides private original reason and late previous-actor mutation cannot leak errors or reset another scope", async () => {
  fetchLists();
  let reject: any;
  const p = {
    ...props,
    save: async () => await new Promise((_r, r) => (reject = r)),
  };
  const view = render(<PrintStudio {...p} />);
  fireEvent.submit(await edit());
  view.rerender(<PrintStudio {...p} actorId="other-actor" />);
  await act(async () =>
    reject(Object.assign(Error("OLD PRIVATE ERROR"), { status: 403 })),
  );
  await screen.findByTitle("Receipt sample preview");
  assert.ok(!screen.queryByText(/OLD PRIVATE ERROR/));
  assert.ok(!screen.queryByDisplayValue("PRIVATE DRAFT HEADING"));
  assert.ok(readPrintStudioMarker(actorId, base));
  assert.equal(readPrintStudioMarker("other-actor", base), null);
  view.unmount();
  render(<PrintStudio {...props} canViewJobs={false} canReprint={false} />);
  await screen.findByRole("button", { name: "Check print request outcome" });
  assert.ok(!screen.queryByText("source-job"));
  assert.ok(
    !screen.queryByRole("group", { name: "Reason for reprint", hidden: true }),
  );
});
test("predispatch storage write failure prevents template save and exposes recovery error without submitting", async () => {
  fetchLists();
  let writes = 0;
  render(
    <PrintStudio
      {...props}
      save={async () => {
        writes++;
        return {};
      }}
    />,
  );
  const form = await edit(),
    proto = Object.getPrototypeOf(window.sessionStorage),
    old = proto.setItem;
  proto.setItem = () => {
    throw Error("Storage blocked");
  };
  try {
    fireEvent.submit(form);
    await screen.findByText(/No print request was sent/);
    assert.equal(writes, 0);
    assert.equal(readPrintStudioMarker(actorId, base), null);
  } finally {
    proto.setItem = old;
  }
});
test("missing template identity/version cannot clear a recorded proof even when receipt and label match", async () => {
  let body: any;
  globalThis.fetch = async (input) => {
    if (String(input).includes("-attempts/")) {
      const m = readPrintStudioMarker(actorId, base)!;
      return Response.json(
        proof("recorded", {
          resultBasis: "recorded_operation_snapshot",
          result: { receipt: body.receipt, label: body.label },
          operationRecord: {
            id: "op",
            actorId,
            operation: "template_save",
            targetId: null,
            requestKey: m.requestKey,
            intent: { receipt: body.receipt, label: body.label },
          },
        }),
      );
    }
    return Response.json(String(input).endsWith("/templates") ? format : [job]);
  };
  render(
    <PrintStudio
      {...props}
      save={async (_p, _m, b) => {
        body = b;
        return {};
      }}
    />,
  );
  fireEvent.submit(await edit());
  await screen.findByText(/recorded print request could not be verified/);
  assert.ok(readPrintStudioMarker(actorId, base));
  assert.ok(
    screen.getByRole("button", { name: "Retry original print request" }),
  );
});
test("loss of reprint permission drops private reason and delayed error, preserving only reference on regained access", async () => {
  fetchLists();
  let reject: any;
  const p = {
    ...props,
    save: async () => await new Promise((_r, r) => (reject = r)),
  };
  const view = render(<PrintStudio {...p} />);
  await screen.findByRole("button", { name: "Queue marked duplicate" });
  fillPresetDetails("Reason for reprint", "PRIVATE REPRINT REASON");
  fireEvent.click(
    screen.getByRole("button", { name: "Queue marked duplicate" }),
  );
  view.rerender(<PrintStudio {...p} canReprint={false} />);
  await act(async () => reject(Error("PRIVATE PROVIDER ERROR")));
  assert.ok(
    !screen.queryByRole("group", { name: "Reason for reprint", hidden: true }),
  );
  assert.ok(!screen.queryByText(/PRIVATE PROVIDER ERROR/));
  assert.ok(
    !screen.queryByRole("button", { name: "Retry original print request" }),
  );
  assert.ok(readPrintStudioMarker(actorId, base));
  view.rerender(<PrintStudio {...p} />);
  assert.equal(screen.queryByLabelText("Reason for reprint details"), null);
  assert.ok(
    !screen.queryByRole("button", { name: "Retry original print request" }),
  );
  assert.ok(readPrintStudioMarker(actorId, base));
});
