import { chooseField, choiceValue } from "./choice-field-helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/workspace",
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
const { default: HelpRequests } =
  await import("../src/mera/workspace/HelpRequests");
const { readHelpUpdateMarker } =
  await import("../src/mera/workspace/helpUpdateJournal");
const base = "/organizations/org/branches/branch",
  actorId = "actor";
const service = {
  id: "help-service",
  reference: "H-1",
  category: "service",
  message: "Water please",
  status: "open",
  createdAt: "2026-11-19T10:00:00Z",
  internalNotes: [],
};
const payment = {
  id: "help-payment",
  reference: "H-2",
  category: "payment",
  message: "Payment question",
  status: "open",
  createdAt: "2026-11-19T10:00:00Z",
  internalNotes: [],
};
const props = {
  base,
  actorId,
  timeZone: "Africa/Lagos",
  disabled: false,
  permissions: ["orders.fulfill", "payments.record"],
  save: async () => ({}),
};
const original = globalThis.fetch;
const proof = (status = "not_found", extra = {}) => {
  const marker = readHelpUpdateMarker(actorId, base)!;
  return {
    actorId,
    organizationId: "org",
    branchId: "branch",
    requestKey: marker.requestKey,
    helpRequestId: marker.helpRequestId,
    status,
    ...extra,
  };
};
const ready = () => screen.findByRole("heading", { name: "H-1 · Service" });
const firstForm = () =>
  screen
    .getByRole("heading", { name: "H-1 · Service" })
    .closest("article")!
    .querySelector("form")!;
test.afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  globalThis.fetch = original;
});
test("reply and private-note drafts remain mounted across category hides and refreshed request metadata", async () => {
  let reads = 0;
  globalThis.fetch = async () =>
    Response.json({
      requests: [
        {
          ...service,
          updatedAt: ++reads === 1 ? undefined : "2026-11-19T11:00:00Z",
        },
        payment,
      ],
    });
  const { container } = render(<HelpRequests {...props} />);
  await ready();
  const reply = screen.getAllByLabelText("Customer-visible reply")[0],
    note = screen.getAllByLabelText("Private staff note")[0];
  fireEvent.change(reply, { target: { value: "Draft reply" } });
  fireEvent.change(note, { target: { value: "Private draft note" } });
  chooseField(screen, fireEvent, "Help category", String("payment"));
  assert.equal(container.querySelectorAll("article").length, 2);
  assert.equal(reply.isConnected, true);
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh help requests" }),
  );
  await waitFor(() => assert.equal(reads, 2));
  await waitFor(() => assert(!screen.queryByText("Loading help requests…")));
  chooseField(screen, fireEvent, "Help category", String("all"));
  assert(screen.getAllByLabelText("Customer-visible reply")[0] === reply);
  assert.equal((reply as HTMLTextAreaElement).value, "Draft reply");
  assert.equal((note as HTMLTextAreaElement).value, "Private draft note");
});
test("unknown update keeps nonsecret marker and exact memory retry after refresh without duplicate dispatch", async () => {
  const writes: any[] = [];
  let reject: any;
  globalThis.fetch = async (input) =>
    Response.json(
      String(input).includes("update-attempts")
        ? proof()
        : { requests: [service] },
    );
  render(
    <HelpRequests
      {...props}
      save={async (...args: any[]) => {
        writes.push(args);
        if (writes.length === 1)
          return await new Promise((_r, r) => (reject = r));
        throw Object.assign(Error("Later conflict"), { status: 409 });
      }}
    />,
  );
  await ready();
  fireEvent.change(screen.getByLabelText("Private staff note"), {
    target: { value: "PRIVATE NOTE BODY" },
  });
  fireEvent.submit(firstForm());
  fireEvent.submit(firstForm());
  assert.equal(writes.length, 1);
  await act(async () => reject(Error("Network unknown")));
  await screen.findByRole("button", { name: "Retry original update" });
  const marker = readHelpUpdateMarker(actorId, base)!;
  assert.ok(marker);
  assert.ok(!JSON.stringify(marker).includes("PRIVATE NOTE BODY"));
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh help requests" }),
  );
  await waitFor(() => assert(!screen.queryByText("Loading help requests…")));
  assert.equal(
    (firstForm().querySelector("fieldset") as HTMLFieldSetElement).disabled,
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Check update outcome" }));
  await screen.findByText(/No completed update was found/);
  assert.ok(readHelpUpdateMarker(actorId, base));
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original update" }),
  );
  await waitFor(() => assert.equal(writes.length, 2));
  assert.deepEqual(writes[0][2], writes[1][2]);
  assert.ok(readHelpUpdateMarker(actorId, base));
});
test("remount cannot retry private memory; explicit stop needs scoped proof and never sends another help PATCH", async () => {
  let writes = 0,
    abandoned = false;
  const paths: string[] = [];
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    paths.push(path);
    if (path.includes("update-attempts"))
      return Response.json(
        path.endsWith("/abandon")
          ? ((abandoned = true),
            proof("abandoned", { resolutionId: "resolution" }))
          : abandoned
            ? proof("abandoned", { resolutionId: "resolution" })
            : proof(),
      );
    return Response.json({ requests: [service] });
  };
  const p = {
    ...props,
    save: async () => {
      writes++;
      throw Error("Unknown");
    },
  };
  const view = render(<HelpRequests {...p} />);
  await ready();
  fireEvent.submit(firstForm());
  await screen.findByRole("button", { name: "Retry original update" });
  view.unmount();
  render(<HelpRequests {...p} />);
  await ready();
  assert.ok(!screen.queryByRole("button", { name: "Retry original update" }));
  assert.ok(readHelpUpdateMarker(actorId, base));
  fireEvent.click(screen.getByRole("button", { name: "Stop original update" }));
  await screen.findByText(/original update is stopped/);
  assert.equal(readHelpUpdateMarker(actorId, base), null);
  assert.equal(writes, 1);
  assert.equal(paths.filter((path) => path.endsWith("/abandon")).length, 1);
});
test("only valid operation proof clears marker; malformed list is error rather than empty", async () => {
  let valid = false;
  globalThis.fetch = async (input) => {
    if (String(input).includes("update-attempts")) {
      const marker = readHelpUpdateMarker(actorId, base)!;
      return Response.json(
        proof("recorded", {
          request: service,
          resultBasis: "recorded_operation_snapshot",
          operationRecord: {
            id: "op",
            requestKey: valid ? marker.requestKey : "wrong-key",
            actorId,
            helpRequestId: service.id,
            intent: {
              status: "acknowledged",
              customerReply: "",
              internalNote: "",
            },
          },
        }),
      );
    }
    return Response.json({ requests: [service] });
  };
  render(<HelpRequests {...props} />);
  await ready();
  fireEvent.submit(firstForm());
  await screen.findByText(/recorded update could not be verified/);
  assert.ok(readHelpUpdateMarker(actorId, base));
  valid = true;
  fireEvent.click(screen.getByRole("button", { name: "Check update outcome" }));
  await screen.findByText(/original help response was recorded/);
  assert.equal(readHelpUpdateMarker(actorId, base), null);
  cleanup();
  globalThis.fetch = async () => Response.json({ requests: [null] });
  render(<HelpRequests {...props} />);
  await screen.findByRole("alert");
  assert.ok(!screen.queryByText("No help requests in this view."));
});
test("permission/scope changes fence late reads and storage denial prevents writes", async () => {
  let release: any;
  globalThis.fetch = async (input) =>
    String(input).includes("/org/branches/branch/")
      ? await new Promise((r) => (release = r))
      : Response.json({ requests: [] });
  const view = render(<HelpRequests {...props} />);
  view.rerender(
    <HelpRequests
      {...props}
      base="/organizations/other/branches/other"
      permissions={[]}
    />,
  );
  await act(async () => release(Response.json({ requests: [service] })));
  assert.ok(!screen.queryByText("Water please"));
  assert.ok(screen.getByText(/cannot view customer help requests/));
  view.unmount();
  let writes = 0;
  const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get() {
      throw Error("Storage blocked");
    },
  });
  globalThis.fetch = async () => Response.json({ requests: [service] });
  try {
    render(
      <HelpRequests
        {...props}
        save={async () => {
          writes++;
          return {};
        }}
      />,
    );
    await ready();
    fireEvent.submit(firstForm());
    assert.equal(writes, 0);
    assert.ok(screen.getByText(/Saved update details could not be read/));
  } finally {
    Object.defineProperty(window, "sessionStorage", descriptor);
  }
});
test("pre-dispatch storage write failure sends no PATCH and reports no update sent", async () => {
  let writes = 0;
  globalThis.fetch = async () => Response.json({ requests: [service] });
  render(
    <HelpRequests
      {...props}
      save={async () => {
        writes++;
        return {};
      }}
    />,
  );
  await ready();
  const proto = Object.getPrototypeOf(window.sessionStorage),
    old = proto.setItem;
  proto.setItem = () => {
    throw Error("Write blocked");
  };
  try {
    fireEvent.submit(firstForm());
    await screen.findByRole("alert");
    assert.equal(writes, 0);
    assert.equal(readHelpUpdateMarker(actorId, base), null);
    assert.equal(
      (firstForm().querySelector("fieldset") as HTMLFieldSetElement).disabled,
      true,
    );
  } finally {
    proto.setItem = old;
  }
});
test("authorization denial during outcome check hides private draft and keeps only nonsecret unresolved reference", async () => {
  globalThis.fetch = async (input) =>
    String(input).includes("update-attempts")
      ? Response.json({ error: "Forbidden" }, { status: 403 })
      : Response.json({ requests: [service] });
  render(
    <HelpRequests
      {...props}
      save={async () => {
        throw Error("Unknown");
      }}
    />,
  );
  await ready();
  fireEvent.change(screen.getByLabelText("Private staff note"), {
    target: { value: "PRIVATE UNCONFIRMED NOTE" },
  });
  fireEvent.submit(firstForm());
  await screen.findByRole("button", { name: "Check update outcome" });
  fireEvent.click(screen.getByRole("button", { name: "Check update outcome" }));
  await screen.findByText(/Access to these requests is no longer available/);
  assert.ok(!screen.queryByDisplayValue("PRIVATE UNCONFIRMED NOTE"));
  assert.ok(!screen.queryByRole("button", { name: "Retry original update" }));
  const marker = readHelpUpdateMarker(actorId, base)!;
  assert.ok(marker);
  assert.ok(!JSON.stringify(marker).includes("PRIVATE UNCONFIRMED NOTE"));
});
