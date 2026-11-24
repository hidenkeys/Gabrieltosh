import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/menu/venue/branch",
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
const { render, screen, fireEvent, cleanup, act } =
  await import("@testing-library/react");
const { default: GuestActivity } =
  await import("../src/mera/customer/GuestActivity.tsx");
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(cleanup);
const activity = (text: string) => ({
  reservations: [],
  feedback: [
    {
      id: text,
      category: "service",
      rating: 5,
      text,
      status: "open",
      createdAt: "2026-11-18T12:00:00Z",
    },
  ],
});
test("activity scope switch hides previous private content immediately and ignores its late response", async (t) => {
  let resolveOld!: (response: Response) => void;
  let oldCalls = 0;
  t.mock.method(globalThis, "fetch", async (input: any) => {
    if (String(input).includes("/old/")) {
      if (++oldCalls === 1)
        return Response.json(activity("Old private feedback"));
      return new Promise<Response>((resolve) => {
        resolveOld = resolve;
      });
    }
    return Response.json(activity("New venue feedback"));
  });
  const view = render(
    React.createElement(GuestActivity, {
      prefix: "/public/old/20000000-0000-4000-8000-000000000001",
    }),
  );
  await screen.findByText("Old private feedback");
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh your activity" }),
  );
  view.rerender(
    React.createElement(GuestActivity, {
      prefix: "/public/new/20000000-0000-4000-8000-000000000002",
    }),
  );
  assert.equal(screen.queryByText("Old private feedback"), null);
  await screen.findByText("New venue feedback");
  await act(async () => {
    resolveOld(Response.json(activity("Late old private feedback")));
  });
  assert.equal(screen.queryByText("Late old private feedback"), null);
  assert(screen.getByText("New venue feedback"));
});
test("activity authorization loss clears private content and offers a deliberate retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++calls === 1
      ? Response.json(activity("Private guest feedback"))
      : Response.json({ error: "Guest session expired" }, { status: 401 }),
  );
  render(
    React.createElement(GuestActivity, {
      prefix: "/public/venue/20000000-0000-4000-8000-000000000001",
    }),
  );
  await screen.findByText("Private guest feedback");
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh your activity" }),
  );
  await screen.findByRole("alert");
  assert.equal(screen.queryByText("Private guest feedback"), null);
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Refresh your activity",
      }) as HTMLButtonElement
    ).disabled,
    false,
  );
});

test("cancellation disclosure is closed until chosen and uncertain retries preserve original reason and request key", async (t) => {
  const originalReason = "Our plans changed; please cancel this booking";
  const bodies: any[] = [];
  let cancelled = false;
  const reservation = {
    id: "70000000-0000-4000-8000-000000000001",
    startsAt: "2026-12-10T12:00:00Z",
    endsAt: "2026-12-10T13:00:00Z",
    partySize: 2,
    status: "confirmed",
    depositRequired: 0,
    depositAmount: 0,
  };
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (path.endsWith("/guest"))
      return Response.json({
        sessionRef: "40000000-0000-4000-8000-000000000001",
      });
    if (init.method === "GET") {
      assert(path.endsWith("/activity"));
      return Response.json({
        reservations: [
          { ...reservation, status: cancelled ? "cancelled" : "confirmed" },
        ],
        feedback: [],
      });
    }
    assert(path.endsWith(`/reservations/${reservation.id}/cancellation`));
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1)
      throw new TypeError("Connection lost after submission");
    if (bodies.length === 2)
      return Response.json({ error: "Please try later" }, { status: 429 });
    cancelled = true;
    return Response.json({
      id: reservation.id,
      status: "cancelled",
      refundConfirmed: false,
    });
  });
  render(
    React.createElement(GuestActivity, {
      prefix: "/public/venue/20000000-0000-4000-8000-000000000001",
    }),
  );
  await screen.findByText("Reservation confirmed");
  const details = document.querySelector(
    "details.mc-reservation-cancellation",
  ) as HTMLDetailsElement;
  assert(details);
  assert.equal(details.open, false);
  assert.equal(bodies.length, 0);
  fireEvent.click(screen.getByText("Request cancellation"));
  assert.equal(details.open, true);
  assert.equal(bodies.length, 0);
  assert.equal(
    screen.queryByRole("textbox", { name: "Cancellation reason details" }),
    null,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
  const reason = screen.getByRole("textbox", {
    name: "Cancellation reason details",
  }) as HTMLTextAreaElement;
  assert.equal(reason.disabled, false);
  fireEvent.change(reason, { target: { value: originalReason } });
  assert.equal(bodies.length, 0);
  fireEvent.click(
    screen.getByRole("button", { name: "Send cancellation request" }),
  );
  await screen.findByRole("alert");
  assert.equal(reason.disabled, true);
  assert.equal(reason.value, originalReason);
  assert(screen.getByText(/A retry sends the same request/));
  fireEvent.click(
    screen.getByRole("button", { name: "Retry cancellation request" }),
  );
  await screen.findByText("Please try later");
  assert.equal(reason.disabled, true);
  assert.equal(reason.value, originalReason);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.match(bodies[0].requestKey, /^[a-f0-9-]{36}$/);
  // Tampering with the submitted hidden value cannot silently create a
  // replacement cancellation with a different reason or key.
  const submittedReason = details.querySelector(
    'input[name="reason"]',
  ) as HTMLInputElement;
  submittedReason.value = "Changed reason after uncertainty";
  fireEvent.submit(details.querySelector("form")!);
  await screen.findByText(/before changing its reason/);
  assert.equal(bodies.length, 2);
  submittedReason.value = originalReason;
  fireEvent.click(
    screen.getByRole("button", { name: "Retry cancellation request" }),
  );
  await screen.findByText("Reservation cancelled");
  assert.equal(bodies.length, 3);
  assert.deepEqual(bodies[0], bodies[2]);
  assert.equal(
    screen.queryByRole("textbox", { name: "Cancellation reason details" }),
    null,
  );
  assert.equal(
    document.querySelector("details.mc-reservation-cancellation"),
    null,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Retry cancellation request" }),
    null,
  );
});

test("reservation dates use the supplied venue timezone rather than a device assumption", async () => {
  const { reservationDateLabel } =
    await import("../src/mera/customer/reservationPresentation.ts");
  assert.match(
    reservationDateLabel("2026-11-20T23:30:00Z", "Africa/Lagos"),
    /Sat, 21 Nov 2026, 00:30 \(Africa\/Lagos\)/,
  );
  assert.match(
    reservationDateLabel("2026-11-20T23:30:00Z", "America/New_York"),
    /Fri, 20 Nov 2026, 18:30/,
  );
  assert.equal(reservationDateLabel("bad", "Africa/Lagos"), "Time unavailable");
  assert.match(reservationDateLabel("2026-11-20T23:30:00Z", "invalid"), /UTC/);
});

const cancelPrefix = "/public/venue/20000000-0000-4000-8000-000000000001";
const guestRef = "40000000-0000-4000-8000-000000000001";
const booking = {
  id: "70000000-0000-4000-8000-000000000001",
  startsAt: "2026-12-10T12:00:00Z",
  partySize: 2,
  status: "confirmed",
  depositAmount: 0,
};
function submitReason(reason = "Original cancellation reason") {
  fireEvent.click(
    screen.getByText("Request cancellation", { selector: "summary" }),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Cancellation reason details" }),
    { target: { value: reason } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Send cancellation request" }),
  );
}
test("cancellation reload proves original guest, makes no automatic POST and retries original body after canonical booking already changed", async (t) => {
  const bodies: any[] = [];
  let recorded = false;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({ sessionRef: guestRef });
    if (init.method === "GET")
      return Response.json({
        reservations: [
          {
            ...booking,
            status: recorded ? "cancelled" : "confirmed",
            cancellationRequestedAt: recorded ? "2026-11-19T12:00:00Z" : null,
          },
        ],
        feedback: [],
      });
    bodies.push(JSON.parse(init.body));
    recorded = true;
    if (bodies.length === 1) throw Error("lost acknowledgement");
    return Response.json({
      ...booking,
      status: "cancelled",
      refundConfirmed: false,
    });
  });
  const first = render(<GuestActivity prefix={cancelPrefix} />);
  await screen.findByText("Reservation confirmed");
  submitReason();
  await screen.findByRole("alert");
  first.unmount();
  render(<GuestActivity prefix={cancelPrefix} />);
  await screen.findByText("Reservation cancelled");
  assert.equal(bodies.length, 1);
  assert(screen.getByText("Original reason: Original cancellation reason"));
  fireEvent.click(
    screen.getByRole("button", { name: "Retry cancellation request" }),
  );
  await act(async () => {});
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1], bodies[0]);
  assert.equal(window.sessionStorage.length, 0);
  assert.equal(
    screen.queryByRole("button", { name: "Retry cancellation request" }),
    null,
  );
});

test("wrong guest after reload never sees the original reason or sends a cancellation", async (t) => {
  let session = guestRef,
    posts = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({ sessionRef: session });
    if (init.method === "GET")
      return Response.json({ reservations: [booking], feedback: [] });
    posts++;
    throw Error("unknown");
  });
  const first = render(<GuestActivity prefix={cancelPrefix} />);
  await screen.findByText("Reservation confirmed");
  submitReason("Private original reason");
  await screen.findByRole("alert");
  first.unmount();
  session = "40000000-0000-4000-8000-000000000099";
  render(<GuestActivity prefix={cancelPrefix} />);
  await screen.findByText(/Your guest session changed/);
  assert.equal(screen.queryByText(/Private original reason/), null);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry cancellation request" }),
  );
  await act(async () => {});
  assert.equal(posts, 1);
  assert.ok(window.sessionStorage.length > 0);
});

test("storage refusal prevents cancellation POST", async (t) => {
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({ sessionRef: guestRef });
    if (init.method === "POST") posts++;
    return Response.json({ reservations: [booking], feedback: [] });
  });
  render(<GuestActivity prefix={cancelPrefix} />);
  await screen.findByText("Reservation confirmed");
  t.mock.method(window.Storage.prototype, "setItem", () => {
    throw Error("Storage unavailable");
  });
  submitReason();
  await screen.findByRole("alert");
  assert.equal(posts, 0);
});

test("session end cancellation redaction preserves opaque unresolved reference and other guests", async (t) => {
  const {
    saveCancellationJournal,
    prepareCancellationSessionEnd,
    readCancellationJournal,
  } = await import("../src/mera/customer/cancellationRecovery");
  const value = {
    version: 1 as const,
    prefix: cancelPrefix,
    sessionRef: guestRef,
    reservationId: booking.id,
    body: {
      requestKey: "80000000-0000-4000-8000-000000000001",
      reason: "Sensitive reason",
    },
  };
  saveCancellationJournal(value);
  const other = "/public/other/20000000-0000-4000-8000-000000000002";
  saveCancellationJournal({
    ...value,
    prefix: other,
    sessionRef: "40000000-0000-4000-8000-000000000099",
  });
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ sessionRef: guestRef }),
  );
  await prepareCancellationSessionEnd(cancelPrefix);
  const marker = readCancellationJournal(cancelPrefix)!;
  assert.ok(!("body" in marker));
  assert.equal((marker as any).requestKey, value.body.requestKey);
  assert.ok("body" in readCancellationJournal(other)!);
  render(<GuestActivity prefix={cancelPrefix} />);
  await screen.findByText(/Saved cancellation details could not be verified/);
  assert.equal(screen.queryByText(/Sensitive reason/), null);
  assert.equal(
    screen.queryByRole("button", { name: "Retry cancellation request" }),
    null,
  );
});

test("a delayed guest proof after activity scope changes cannot send the old cancellation", async (t) => {
  let resolve!: (value: Response) => void;
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return new Promise<Response>((done) => {
        resolve = done;
      });
    if (init.method === "POST") posts++;
    return Response.json({ reservations: [booking], feedback: [] });
  });
  const view = render(<GuestActivity prefix={cancelPrefix} />);
  await screen.findByText("Reservation confirmed");
  submitReason();
  view.rerender(
    <GuestActivity prefix="/public/new/20000000-0000-4000-8000-000000000002" />,
  );
  await act(async () => {
    resolve(Response.json({ sessionRef: guestRef }));
  });
  assert.equal(posts, 0);
  assert.equal(window.sessionStorage.length, 0);
});

test("invalid stored cancellation blocks replacement without exposing untrusted fields", async (t) => {
  window.sessionStorage.setItem(
    "mera:customer-cancellation:v1:" + cancelPrefix,
    JSON.stringify({
      version: 1,
      body: { reason: "Untrusted private reason" },
    }),
  );
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (_input: any, init: any) => {
    if (init.method === "POST") posts++;
    return Response.json({ reservations: [booking], feedback: [] });
  });
  render(<GuestActivity prefix={cancelPrefix} />);
  await screen.findByText(/Saved cancellation details could not be verified/);
  assert.equal(screen.queryByText(/Untrusted private reason/), null);
  assert.equal(
    screen.queryByRole("button", { name: "Send cancellation request" }),
    null,
  );
  assert.equal(posts, 0);
  assert.equal(window.sessionStorage.length, 1);
});

test("guest cancellation presets submit the same reason body and lock choices after an uncertain result", async (t) => {
  const bodies: any[] = [];
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({ sessionRef: guestRef });
    if (init.method === "GET")
      return Response.json({ reservations: [booking], feedback: [] });
    bodies.push(JSON.parse(init.body));
    throw Error("lost acknowledgement");
  });
  render(<GuestActivity prefix={cancelPrefix} />);
  await screen.findByText("Reservation confirmed");
  fireEvent.click(
    screen.getByText("Request cancellation", { selector: "summary" }),
  );
  assert.equal(screen.queryByRole("textbox"), null);
  const preset = screen.getByRole("radio", {
    name: "Plans changed",
    exact: true,
  }) as HTMLInputElement;
  fireEvent.click(preset);
  assert.equal(preset.checked, true);
  assert.equal(preset.getAttribute("aria-checked"), "true");
  fireEvent.click(
    screen.getByRole("button", { name: "Send cancellation request" }),
  );
  await screen.findByRole("alert");
  assert.equal(preset.matches(":disabled"), true);
  assert.equal(bodies.length, 1);
  assert.deepEqual(Object.keys(bodies[0]).sort(), ["reason", "requestKey"]);
  assert.equal(bodies[0].reason, "Plans changed");
  fireEvent.click(
    screen.getByRole("button", { name: "Retry cancellation request" }),
  );
  await act(async () => {});
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1], bodies[0]);
});
