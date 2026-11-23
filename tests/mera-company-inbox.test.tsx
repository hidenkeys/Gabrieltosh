import { chooseField, choiceValue } from "./choice-field-helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/mera/platform",
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
const { render, screen, fireEvent, cleanup, waitFor, within } =
  await import("@testing-library/react");
const { default: Inbox } =
  await import("../src/mera/company/PlatformCompanyInbox");
const actor = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001";
const key = `mera.company-update.v1.${actor}.consultancy`;
const createDetail = () => ({
  id,
  kind: "consultancy",
  reference: "ENQ-123456ABCDEF",
  createdAt: "2026-11-20T12:00:00.000Z",
  version: 1,
  status: "received",
  assignedHandlerId: null,
  followUp: { stage: "none", dueAt: null, summary: "" },
  data: {
    name: "QA Sender",
    company: "QA Company",
    email: "qa@example.invalid",
    problem: "A synthetic service request",
    budgetRange: "not_sure",
    projectType: "new_build",
  },
  documents: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      filename: "brief.txt",
      byteLength: 100,
    },
  ],
  documentSafety: "Private document. Not malware-scanned.",
  changes: [] as any[],
});
function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function reset() {
  cleanup();
  sessionStorage.clear();
}
function server(patch?: (body: any) => Promise<Response> | Response) {
  let detail = createDetail();
  const requests: { url: string; method: string; body: any; headers: any }[] =
    [];
  globalThis.fetch = async (input, options) => {
    const url = String(input),
      method = options?.method || "GET",
      body = options?.body ? JSON.parse(String(options.body)) : undefined;
    requests.push({ url, method, body, headers: options?.headers });
    if (method === "PATCH") {
      if (patch) return patch(body);
      detail = {
        ...detail,
        version: detail.version + 1,
        status: body.status,
        assignedHandlerId: body.assignedHandlerId,
        followUp: body.followUp,
        changes: [
          ...detail.changes,
          {
            id: "change-one",
            actorName: "QA Operator",
            createdAt: "2026-11-20T13:00:00.000Z",
            data: body,
          },
        ],
      };
      return json({
        id,
        reference: detail.reference,
        version: detail.version,
        status: detail.status,
        assignedHandlerId: detail.assignedHandlerId,
        followUp: detail.followUp,
        externalDelivery: false,
      });
    }
    if (url.endsWith("/handlers"))
      return json({ handlers: [{ id: actor, name: "QA Operator" }] });
    if (url.includes("?"))
      return json({
        items: [{ ...detail, contact: detail.data }],
        total: 1,
        page: 1,
        limit: 20,
      });
    return json(detail);
  };
  return {
    requests,
    get: () => detail,
    set: (next: any) => {
      detail = next;
    },
  };
}
async function open() {
  render(<Inbox kind="consultancy" actorId={actor} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Review ENQ-123456ABCDEF" }),
  );
  await screen.findByRole("heading", { name: "Submitted details" });
}
test("inbox lists actual contact, opens submitted detail and exposes private authenticated document route", async () => {
  reset();
  const mock = server();
  await open();
  assert.ok(screen.getByText("QA Sender"));
  assert.ok(screen.getByText("Not sure yet"));
  assert.equal(
    screen.getByRole("link", { name: "brief.txt" }).getAttribute("href"),
    `/api/mera/v1/platform/company-leads/${id}/documents/30000000-0000-4000-8000-000000000001`,
  );
  assert.equal(mock.requests.filter((r) => r.method === "PATCH").length, 0);
  assert.ok(screen.getByText(/Saving does not contact the sender/));
});
test("successful note/status/handler/follow-up update uses actor guard and refreshes activity", async () => {
  reset();
  const mock = server();
  await open();
  chooseField(screen, fireEvent, "Status", String("discovery"));
  chooseField(screen, fireEvent, "Assigned handler", String(actor));
  chooseField(screen, fireEvent, "Next stage", String("discovery"));
  fireEvent.change(screen.getByLabelText("Follow-up summary"), {
    target: { value: "Arrange synthetic review" },
  });
  fireEvent.change(screen.getByLabelText("Add internal note"), {
    target: { value: "QA internal note" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save update" }));
  await screen.findByText("Update saved. Notes and follow-up remain internal.");
  assert.ok(screen.getByText("QA internal note"));
  const writes = mock.requests.filter((r) => r.method === "PATCH");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].headers["X-Mera-Actor-Id"], actor);
  assert.equal(writes[0].body.expectedVersion, 1);
  assert.equal(writes[0].body.status, "discovery");
  assert.equal(writes[0].body.assignedHandlerId, actor);
  assert.equal(writes[0].body.followUp.stage, "discovery");
  assert.equal(sessionStorage.getItem(key), null);
});
test("unknown update persists across remount, never auto sends, explicitly retries exact body", async () => {
  reset();
  let attempts = 0;
  const bodies: any[] = [];
  const mock = server((body) => {
    attempts++;
    bodies.push(body);
    if (attempts === 1) throw Error("lost response");
    return json({
      id,
      reference: "ENQ-123456ABCDEF",
      version: 2,
      status: body.status,
      assignedHandlerId: body.assignedHandlerId,
      followUp: body.followUp,
      externalDelivery: false,
    });
  });
  await open();
  fireEvent.change(screen.getByLabelText("Add internal note"), {
    target: { value: "Retain original note" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save update" }));
  await screen.findByText(/The outcome is not confirmed/);
  const saved = sessionStorage.getItem(key);
  assert.ok(saved?.includes("Retain original note"));
  cleanup();
  render(<Inbox kind="consultancy" actorId={actor} />);
  await screen.findByRole("heading", { name: "Submitted details" });
  assert.equal(attempts, 1);
  await waitFor(() =>
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Retry saved update",
        }) as HTMLButtonElement
      ).disabled,
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry saved update" }));
  await screen.findByText("Update saved. Notes and follow-up remain internal.");
  assert.equal(attempts, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(sessionStorage.getItem(key), null);
  assert.equal(mock.requests.filter((r) => r.method === "PATCH").length, 2);
});
test("first stale-version conflict exposes refresh recovery without pretending saved", async () => {
  reset();
  let attempts = 0;
  const mock = server((body) => {
    attempts++;
    if (attempts === 1) {
      mock.set({ ...mock.get(), version: 2, status: "reviewing" });
      return json(
        {
          error: "This enquiry changed. Refresh before saving another update.",
          code: "STALE_VERSION",
        },
        409,
      );
    }
    return json({
      id,
      reference: "ENQ-123456ABCDEF",
      version: 3,
      status: body.status,
      assignedHandlerId: body.assignedHandlerId,
      followUp: body.followUp,
      externalDelivery: false,
    });
  });
  await open();
  fireEvent.change(screen.getByLabelText("Add internal note"), {
    target: { value: "Check conflict" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save update" }));
  await screen.findByText(/This enquiry changed/);
  assert.equal(
    screen.queryByText("Update saved. Notes and follow-up remain internal."),
    null,
  );
  assert.equal(sessionStorage.getItem(key), null);
  fireEvent.click(screen.getByRole("button", { name: "Refresh details" }));
  await waitFor(() =>
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Refresh details",
        }) as HTMLButtonElement
      ).disabled,
      false,
    ),
  );
  assert.equal(
    (screen.getByLabelText("Add internal note") as HTMLTextAreaElement).value,
    "Check conflict",
  );
  chooseField(screen, fireEvent, "Status", String("reviewing"));
  fireEvent.change(screen.getByLabelText("Add internal note"), {
    target: { value: "Reviewed fresh version" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save update" }));
  await screen.findByText("Update saved. Notes and follow-up remain internal.");
  assert.equal(
    mock.requests.filter((r) => r.method === "PATCH")[1].body.expectedVersion,
    2,
  );
});
test("denied list access emits session revocation event and does not expose private data", async () => {
  reset();
  let denied = 0;
  const listener = () => denied++;
  window.addEventListener("mera:access-denied", listener);
  globalThis.fetch = async () =>
    json({ error: "Platform access required" }, 403);
  try {
    render(<Inbox kind="consultancy" actorId={actor} />);
    await screen.findByText("Platform access required");
    assert.ok(denied >= 1);
    assert.equal(screen.queryByText("QA Sender"), null);
    assert.equal(screen.queryByRole("button", { name: "Save update" }), null);
  } finally {
    window.removeEventListener("mera:access-denied", listener);
  }
});
test("denied update retains recovery intent and never reports successful save", async () => {
  reset();
  server(() => json({ error: "Platform access required" }, 403));
  await open();
  fireEvent.change(screen.getByLabelText("Add internal note"), {
    target: { value: "Pending operator note" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save update" }));
  await screen.findByText(/Platform access required.*outcome is not confirmed/);
  assert.ok(sessionStorage.getItem(key)?.includes("Pending operator note"));
  assert.equal(
    screen.queryByText("Update saved. Notes and follow-up remain internal."),
    null,
  );
});
test("corrupt update journal fails closed without discarding the saved intent", async () => {
  reset();
  sessionStorage.setItem(key, "{broken-original");
  const mock = server();
  await open();
  assert.ok(screen.getByText(/saved update cannot be read safely/));
  const save = screen.getByRole("button", { name: "Save update" });
  assert.equal(save.closest("fieldset")?.disabled, true);
  fireEvent.click(save);
  assert.equal(mock.requests.filter((r) => r.method === "PATCH").length, 0);
  assert.equal(sessionStorage.getItem(key), "{broken-original");
});
test("malformed successful HTTP response retains exact update rather than reporting saved", async () => {
  reset();
  const mock = server(() => json({ id, status: "received" }));
  await open();
  fireEvent.change(screen.getByLabelText("Add internal note"), {
    target: { value: "Keep until confirmed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save update" }));
  await screen.findByText(/outcome is not confirmed/);
  assert.equal(mock.requests.filter((r) => r.method === "PATCH").length, 1);
  assert.ok(sessionStorage.getItem(key)?.includes("Keep until confirmed"));
  assert.equal(
    screen.queryByText("Update saved. Notes and follow-up remain internal."),
    null,
  );
  assert.equal(
    screen.getByRole("button", { name: "Save update" }).closest("fieldset")
      ?.disabled,
    true,
  );
});
test("409 after uncertain update preserves original journal and exact retry body", async () => {
  reset();
  let attempts = 0;
  const mock = server(() => {
    attempts++;
    if (attempts === 1) throw Error("unknown outcome");
    return json(
      { error: "Retry original update", code: "IDEMPOTENCY_CONFLICT" },
      409,
    );
  });
  await open();
  fireEvent.change(screen.getByLabelText("Add internal note"), {
    target: { value: "Original uncertain update" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save update" }));
  await screen.findByText(/outcome is not confirmed/);
  const before = sessionStorage.getItem(key);
  fireEvent.click(screen.getByRole("button", { name: "Retry saved update" }));
  await screen.findByText(/Retry original update.*outcome is not confirmed/);
  assert.equal(sessionStorage.getItem(key), before);
  const writes = mock.requests.filter((r) => r.method === "PATCH");
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].body, writes[1].body);
});
test("silent storage write failure prevents dispatch instead of losing recovery protection", async () => {
  reset();
  const mock = server();
  await open();
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function () {};
  try {
    fireEvent.change(screen.getByLabelText("Add internal note"), {
      target: { value: "Must be recoverable" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save update" }));
    await screen.findByText(/browser cannot preserve this update/);
    assert.equal(mock.requests.filter((r) => r.method === "PATCH").length, 0);
    assert.equal(sessionStorage.getItem(key), null);
  } finally {
    dom.window.Storage.prototype.setItem = original;
  }
});
test("refresh exposes concurrent saved status, version, handler and follow-up while preserving operator edits", async () => {
  reset();
  const mock = server();
  await open();
  chooseField(screen, fireEvent, "Status", String("reviewing"));
  fireEvent.change(screen.getByLabelText("Add internal note"), {
    target: { value: "Unsaved operator note" },
  });
  mock.set({
    ...mock.get(),
    version: 4,
    status: "proposal",
    assignedHandlerId: actor,
    assignedHandlerName: "QA Operator",
    followUp: {
      stage: "proposal",
      dueAt: "2026-11-25T12:00:00.000Z",
      summary: "Concurrent saved plan",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh details" }));
  await screen.findByText("Version 4");
  const summary = screen.getByRole("region", {
    name: "Latest saved follow-up",
  });
  assert.match(summary.textContent!, /Saved statusproposal/);
  assert.match(summary.textContent!, /Saved handlerQA Operator/);
  assert.match(summary.textContent!, /Saved next stageproposal/);
  assert.match(summary.textContent!, /UTC/);
  assert.match(summary.textContent!, /Concurrent saved plan/);
  assert.match(
    summary.textContent!,
    /Your edits differ from the saved details/,
  );
  assert.equal(choiceValue(screen, "Status"), "reviewing");
  assert.equal(
    (screen.getByLabelText("Add internal note") as HTMLTextAreaElement).value,
    "Unsaved operator note",
  );
  assert.equal(mock.requests.filter((r) => r.method === "PATCH").length, 0);
});

test("UTC follow-up calendar preserves incomplete drafts and serializes only a complete instant", async () => {
  reset();
  const mock = server();
  await open();
  const group = within(
    screen.getByRole("group", { name: "Follow-up date (UTC)", exact: true }),
  );
  fireEvent.click(group.getByRole("button", { name: "Choose another date" }));
  fireEvent.change(group.getByLabelText("Date", { exact: true }), {
    target: { value: "2026-12-02" },
  });
  assert.equal(
    (
      group.getByLabelText("Preferred time", {
        exact: true,
      }) as HTMLInputElement
    ).checkValidity(),
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save update" }));
  assert.equal(
    mock.requests.filter((request) => request.method === "PATCH").length,
    0,
  );
  fireEvent.change(group.getByLabelText("Preferred time", { exact: true }), {
    target: { value: "14:30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save update" }));
  await screen.findByText("Update saved. Notes and follow-up remain internal.");
  const writes = mock.requests.filter((request) => request.method === "PATCH");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.followUp.dueAt, "2026-12-02T14:30:00.000Z");
  assert.equal(writes[0].headers["X-Mera-Actor-Id"], actor);
});
