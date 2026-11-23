import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001",
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
const { render, screen, fireEvent, cleanup, act, within } =
  await import("@testing-library/react");
const { default: HelpRequests } =
  await import("../src/mera/customer/HelpRequests");
const ref = "40000000-0000-4000-8000-000000000001",
  orderId = "50000000-0000-4000-8000-000000000001";
const own = {
  id: "60000000-0000-4000-8000-000000000001",
  reference: "H-ORIGINAL",
  category: "service",
  message: "Please bring water",
  status: "open",
  customerReply: "",
  createdAt: "2026-11-19T12:00:00.000Z",
};
const props = {
  prefix: "/public/bing-chun/20000000-0000-4000-8000-000000000001",
  displayName: "Ada",
  hasGuest: false,
  onName: () => {},
  ensureGuest: async () => {},
};
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(cleanup);
function fill() {
  fireEvent.change(
    screen.getByRole("textbox", { name: "How can staff help?" }),
    { target: { value: "Please bring water" } },
  );
}
test("help snapshots context before identity creation and verifies current cookie before its first POST", async (t) => {
  let release!: () => void;
  const calls: string[] = [],
    bodies: any[] = [];
  const ensureGuest = () => {
    calls.push("create-guest");
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (path.endsWith("/guest")) {
      calls.push("verify-guest");
      return Response.json({ sessionRef: ref });
    }
    if (init.method === "GET") return Response.json({ requests: [own] });
    calls.push("send-help");
    bodies.push(JSON.parse(init.body));
    return Response.json(own);
  });
  const view = render(
    <HelpRequests {...props} ensureGuest={ensureGuest} orderId={orderId} />,
  );
  fill();
  fireEvent.click(screen.getByRole("radio", { name: "My current order" }));
  fireEvent.click(screen.getByRole("button", { name: "Send help request" }));
  assert.equal(
    (
      screen.getByRole("textbox", {
        name: "How can staff help?",
      }) as HTMLTextAreaElement
    ).matches(":disabled"),
    true,
  );
  view.rerender(
    <HelpRequests
      {...props}
      ensureGuest={ensureGuest}
      orderId="50000000-0000-4000-8000-000000000002"
    />,
  );
  await act(async () => release());
  await screen.findByText(/Request H-ORIGINAL was sent/);
  assert.deepEqual(calls.slice(0, 3), [
    "create-guest",
    "verify-guest",
    "send-help",
  ]);
  assert.equal(bodies[0].orderId, orderId);
  assert.equal("visitId" in bodies[0], false);
});
test("unknown help retries keep original body through auth/rate errors without recreating a guest", async (t) => {
  let creates = 0;
  const bodies: any[] = [];
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({ sessionRef: ref });
    if (init.method === "GET") return Response.json({ requests: [own] });
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) throw Error("lost response");
    if (bodies.length === 2)
      return Response.json(
        { error: "Guest access interrupted" },
        { status: 403 },
      );
    if (bodies.length === 3)
      return Response.json({ error: "Please try later" }, { status: 429 });
    return Response.json(own);
  });
  render(
    <HelpRequests
      {...props}
      ensureGuest={async () => {
        creates++;
      }}
    />,
  );
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Send help request" }));
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original help request" }),
  );
  await screen.findByText("Guest access interrupted");
  assert.equal(
    screen.queryByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    null,
  );
  assert.equal(
    screen.queryByRole("textbox", { name: "How can staff help?" }),
    null,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original help request" }),
  );
  await screen.findByText("Please try later");
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original help request" }),
  );
  await screen.findByText(/Request H-ORIGINAL was sent/);
  assert.equal(creates, 1);
  assert.equal(bodies.length, 4);
  for (const body of bodies) assert.deepEqual(body, bodies[0]);
  assert.equal(
    screen.queryByRole("button", { name: "Retry original help request" }),
    null,
  );
});
for (const mode of ["missing", "changed"] as const)
  test(`${mode} guest proof blocks help replay and hides private view`, async (t) => {
    let creates = 0,
      posts = 0;
    let changed = false;
    t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
      if (String(input).endsWith("/guest"))
        return Response.json(
          mode === "missing"
            ? {}
            : {
                sessionRef: changed
                  ? "40000000-0000-4000-8000-000000000002"
                  : ref,
              },
        );
      if (init.method === "GET") return Response.json({ requests: [own] });
      posts++;
      throw Error("Lost response");
    });
    render(
      <HelpRequests
        {...props}
        ensureGuest={async () => {
          creates++;
        }}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Send help request" }));
    await screen.findByRole("alert");
    changed = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original help request" }),
    );
    await screen.findByText(
      mode === "missing"
        ? /guest session could not be verified/
        : /guest session changed/,
    );
    assert.equal(creates, 1);
    assert.equal(posts, mode === "missing" ? 0 : 1);
    assert.equal(
      screen.queryByRole("textbox", {
        name: /^(?:Your name|What should we call you\?)$/,
      }),
      null,
    );
    assert.equal(
      screen.queryByRole("textbox", { name: "How can staff help?" }),
      null,
    );
    assert.equal(screen.queryByText("H-ORIGINAL"), null);
  });
test("refreshing own requests cannot clear uncertain write error or infer correlation from similar message", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: any, init: any) =>
    String(input).endsWith("/guest")
      ? Response.json({ sessionRef: ref })
      : init.method === "GET"
        ? Response.json({ requests: [own] })
        : Promise.reject(Error("Lost response")),
  );
  render(<HelpRequests {...props} hasGuest={true} />);
  await screen.findByText("H-ORIGINAL");
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Send help request" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Refresh help status" }));
  await act(async () => {});
  assert(screen.getByRole("alert"));
  assert(screen.getByRole("button", { name: "Retry original help request" }));
  assert.equal(
    (
      screen.getByRole("textbox", {
        name: "How can staff help?",
      }) as HTMLTextAreaElement
    ).matches(":disabled"),
    true,
  );
});
test("scope switch immediately discards old private request view and ignores its late read", async (t) => {
  let reads = 0,
    resolve!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", async (input: any) => {
    const path = String(input);
    if (path.endsWith("/guest")) return Response.json({ sessionRef: ref });
    if (path.includes("/old/")) {
      if (++reads === 1) return Response.json({ requests: [own] });
      return new Promise<Response>((done) => {
        resolve = done;
      });
    }
    return Response.json({ requests: [] });
  });
  const view = render(
    <HelpRequests
      {...props}
      prefix="/public/old/20000000-0000-4000-8000-000000000001"
      hasGuest={true}
    />,
  );
  await screen.findByText("H-ORIGINAL");
  fireEvent.click(screen.getByRole("button", { name: "Refresh help status" }));
  await act(async () => {});
  view.rerender(
    <HelpRequests
      {...props}
      prefix="/public/new/20000000-0000-4000-8000-000000000002"
      hasGuest={true}
    />,
  );
  assert.equal(screen.queryByText("H-ORIGINAL"), null);
  await screen.findByText("No help requests in this guest session yet.");
  await act(async () =>
    resolve(Response.json({ requests: [{ ...own, reference: "H-OLD-LATE" }] })),
  );
  assert.equal(screen.queryByText("H-OLD-LATE"), null);
});
test("read loading, authorization error and confirmed empty are distinct; own replies use customer labels", async (t) => {
  let reads = 0,
    resolve!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", async (input: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({ sessionRef: ref });
    if (++reads === 1)
      return new Promise<Response>((done) => {
        resolve = done;
      });
    if (reads === 2)
      return Response.json({ error: "Session unavailable" }, { status: 401 });
    return Response.json({ requests: [] });
  });
  render(<HelpRequests {...props} hasGuest={true} />);
  await screen.findByText("Checking your help requests…");
  assert.equal(
    screen.queryByText("No help requests in this guest session yet."),
    null,
  );
  await act(async () =>
    resolve(
      Response.json({
        requests: [
          {
            ...own,
            status: "acknowledged",
            customerReply: "We are bringing water",
            internalNotes: ["must not display"],
          },
        ],
      }),
    ),
  );
  assert(screen.getByText("Being reviewed"));
  assert(screen.getByRole("heading", { name: "Reply from the team" }));
  assert(screen.getByText("We are bringing water"));
  assert.equal(screen.queryByText("must not display"), null);
  fireEvent.click(screen.getByRole("button", { name: "Refresh help status" }));
  await screen.findByText("Session unavailable");
  assert.equal(screen.queryByText("H-ORIGINAL"), null);
  assert.equal(
    screen.queryByText("No help requests in this guest session yet."),
    null,
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh help status" }));
  await screen.findByText("No help requests in this guest session yet.");
});

test("a delayed history read cannot restore private requests after a concurrent write loses authorization", async (t) => {
  let resolveHistory!: (response: Response) => void;
  let announceHistory!: () => void;
  const historyStarted = new Promise<void>((resolve) => {
    announceHistory = resolve;
  });
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({ sessionRef: ref });
    if (init.method === "GET") {
      announceHistory();
      return new Promise<Response>((resolve) => {
        resolveHistory = resolve;
      });
    }
    return Response.json(
      { error: "Guest authorization expired" },
      { status: 401 },
    );
  });
  render(<HelpRequests {...props} hasGuest={true} />);
  await historyStarted;
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Send help request" }));
  await screen.findByText("Guest authorization expired");
  await act(async () => resolveHistory(Response.json({ requests: [own] })));
  assert.equal(screen.queryByText("H-ORIGINAL"), null);
  assert.equal(
    screen.queryByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    null,
  );
  assert.equal(
    screen.queryByRole("textbox", { name: "How can staff help?" }),
    null,
  );
  assert(screen.getByText(/private request details are hidden/));
});

test("requests shortcut focuses real history without unmounting the compose draft and hides during uncertainty", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: any, init: any) =>
    String(input).endsWith("/guest")
      ? Response.json({ sessionRef: ref })
      : init.method === "GET"
        ? Response.json({ requests: [own] })
        : Promise.reject(Error("Uncertain submission")),
  );
  render(<HelpRequests {...props} hasGuest={true} />);
  await screen.findByText("H-ORIGINAL");
  fill();
  const input = screen.getByRole("textbox", {
    name: "How can staff help?",
  }) as HTMLTextAreaElement;
  fireEvent.click(
    screen.getByRole("link", { name: "View requests and replies" }),
  );
  assert.equal(
    document.activeElement,
    screen.getByRole("heading", { name: "Your requests" }),
  );
  assert.equal(input.isConnected, true);
  assert.equal(input.value, "Please bring water");
  fireEvent.click(screen.getByRole("button", { name: "Send help request" }));
  await screen.findByRole("alert");
  assert.equal(
    screen.queryByRole("link", { name: "View requests and replies" }),
    null,
  );
});

test("refresh restores the original help intent without a POST or guest recreation and explicit retry keeps its exact key/body", async (t) => {
  const bodies: any[] = [];
  let creates = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({ sessionRef: ref });
    if (init.method === "GET") return Response.json({ requests: [] });
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) throw Error("lost acknowledgement");
    return Response.json(own);
  });
  const first = render(
    <HelpRequests
      {...props}
      ensureGuest={async () => {
        creates++;
      }}
      orderId={orderId}
    />,
  );
  fill();
  fireEvent.click(screen.getByRole("radio", { name: "My current order" }));
  fireEvent.click(screen.getByRole("button", { name: "Send help request" }));
  await screen.findByRole("alert");
  assert.equal(bodies.length, 1);
  first.unmount();
  render(
    <HelpRequests
      {...props}
      ensureGuest={async () => {
        creates++;
      }}
      orderId="50000000-0000-4000-8000-000000000099"
    />,
  );
  await screen.findByRole("button", { name: "Retry original help request" });
  await act(async () => {});
  assert.equal(bodies.length, 1, "restore never posts automatically");
  assert.equal(creates, 1, "restore never creates another guest");
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original help request" }),
  );
  await screen.findByText(/Request H-ORIGINAL was sent/);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1], bodies[0]);
  assert.equal(
    window.sessionStorage.length,
    0,
    "only confirmed exact retry clears recovery storage",
  );
});

test("a different guest after refresh cannot read or replay saved private help", async (t) => {
  let session = ref;
  let posts = 0;
  let creates = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({ sessionRef: session });
    if (init.method === "GET") return Response.json({ requests: [] });
    posts++;
    throw Error("unknown outcome");
  });
  const first = render(
    <HelpRequests
      {...props}
      ensureGuest={async () => {
        creates++;
      }}
    />,
  );
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Send help request" }));
  await screen.findByRole("alert");
  first.unmount();
  session = "40000000-0000-4000-8000-000000000099";
  render(
    <HelpRequests
      {...props}
      hasGuest={true}
      ensureGuest={async () => {
        creates++;
      }}
    />,
  );
  await screen.findByText(/Your guest session changed/);
  assert.equal(screen.queryByText("Please bring water"), null);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original help request" }),
  );
  await act(async () => {});
  assert.equal(posts, 1);
  assert.equal(creates, 1);
  assert.ok(window.sessionStorage.length > 0);
});

test("storage refusal prevents any help POST and retains the original unsent intent", async (t) => {
  let posts = 0;
  t.mock.method(window.Storage.prototype, "setItem", () => {
    throw Error("storage unavailable");
  });
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({ sessionRef: ref });
    if (init.method === "POST") posts++;
    return Response.json({ requests: [] });
  });
  render(<HelpRequests {...props} />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Send help request" }));
  await screen.findByRole("alert");
  assert.equal(posts, 0);
  assert(screen.getByRole("button", { name: "Retry original help request" }));
});

test("explicit session ending redacts only matching guest journals and leaves an opaque unresolved marker", async (t) => {
  const { saveHelpJournal, prepareHelpSessionEnd, readHelpJournal } =
    await import("../src/mera/customer/helpRecovery");
  const body = {
    requestKey: "70000000-0000-4000-8000-000000000001",
    category: "service" as const,
    message: "Private original message",
    orderId,
  };
  saveHelpJournal({ version: 1, prefix: props.prefix, sessionRef: ref, body });
  const otherPrefix =
    "/public/other-venue/20000000-0000-4000-8000-000000000002";
  saveHelpJournal({
    version: 1,
    prefix: otherPrefix,
    sessionRef: "40000000-0000-4000-8000-000000000099",
    body,
  });
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ sessionRef: ref }),
  );
  await prepareHelpSessionEnd(props.prefix);
  const marker = readHelpJournal(props.prefix)!;
  assert.ok(!("body" in marker));
  assert.equal((marker as any).requestKey, body.requestKey);
  assert.ok("body" in readHelpJournal(otherPrefix)!);
  render(<HelpRequests {...props} hasGuest={true} />);
  await screen.findByText(/Saved help request details could not be verified/);
  assert.equal(screen.queryByText("Private original message"), null);
  assert.equal(
    screen.queryByRole("button", { name: "Retry original help request" }),
    null,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Send help request" }),
    null,
  );
});

test("malformed stored help is preserved and blocks replacement writes", async (t) => {
  window.sessionStorage.setItem(
    "mera:customer-help:v1:" + props.prefix,
    JSON.stringify({ version: 1, body: { message: "untrusted private" } }),
  );
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (_input: any, init: any) => {
    if (init.method === "POST") posts++;
    return Response.json({ sessionRef: ref, requests: [] });
  });
  render(<HelpRequests {...props} hasGuest={true} />);
  await screen.findByText(/Saved help request details could not be verified/);
  assert.equal(screen.queryByText("untrusted private"), null);
  assert.equal(
    screen.queryByRole("button", { name: "Send help request" }),
    null,
  );
  assert.equal(posts, 0);
  assert.equal(window.sessionStorage.length, 1);
});

test("explicit session end is blocked before its POST if pending-help privacy redaction fails", async (t) => {
  const { saveHelpJournal } = await import("../src/mera/customer/helpRecovery");
  const { default: SessionOrders } =
    await import("../src/mera/customer/SessionOrders");
  saveHelpJournal({
    version: 1,
    prefix: props.prefix,
    sessionRef: ref,
    body: {
      requestKey: "70000000-0000-4000-8000-000000000001",
      category: "service",
      message: "Private pending",
    },
  });
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (init.method === "POST") posts++;
    return Response.json(
      String(input).endsWith("/guest")
        ? { sessionRef: ref }
        : { orders: [], nextCursor: null },
    );
  });
  render(
    <SessionOrders
      prefix={props.prefix}
      onSelect={() => {}}
      onClear={() => {
        throw Error("Session must not end");
      }}
    />,
  );
  await screen.findByText("No orders in this guest session.");
  t.mock.method(window.Storage.prototype, "setItem", () => {
    throw Error("Storage unavailable");
  });
  fireEvent.click(screen.getByRole("button", { name: "End guest session…" }));
  fireEvent.click(
    screen.getByRole("button", { name: "End this guest session", exact: true }),
  );
  await screen.findByRole("alert");
  assert.equal(posts, 0, "failed redaction must prevent the guest/end POST");
});
