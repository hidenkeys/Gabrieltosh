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
      prefix: "/api/mera/v1/public/old/branch",
    }),
  );
  await screen.findByText("Old private feedback");
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh your activity" }),
  );
  view.rerender(
    React.createElement(GuestActivity, {
      prefix: "/api/mera/v1/public/new/branch",
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
      prefix: "/api/mera/v1/public/venue/branch",
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
    return Response.json({ status: "cancelled", refundConfirmed: false });
  });
  render(
    React.createElement(GuestActivity, { prefix: "/public/venue/branch" }),
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
  const reason = screen.getByRole("textbox", {
    name: "Cancellation reason",
  }) as HTMLTextAreaElement;
  assert.equal(reason.readOnly, false);
  fireEvent.change(reason, { target: { value: originalReason } });
  assert.equal(bodies.length, 0);
  fireEvent.click(
    screen.getByRole("button", { name: "Send cancellation request" }),
  );
  await screen.findByRole("alert");
  assert.equal(reason.readOnly, true);
  assert.equal(reason.value, originalReason);
  assert(screen.getByText(/A retry sends the same request/));
  fireEvent.click(
    screen.getByRole("button", { name: "Retry cancellation request" }),
  );
  await screen.findByText("Please try later");
  assert.equal(reason.readOnly, true);
  assert.equal(reason.value, originalReason);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.match(bodies[0].requestKey, /^[a-f0-9-]{36}$/);
  // Even a programmatic attempt to change a readonly field cannot silently
  // create a replacement cancellation with a different reason or key.
  reason.value = "Changed reason after uncertainty";
  fireEvent.submit(details.querySelector("form")!);
  await screen.findByText(/before changing its reason/);
  assert.equal(bodies.length, 2);
  reason.value = originalReason;
  fireEvent.click(
    screen.getByRole("button", { name: "Retry cancellation request" }),
  );
  await screen.findByText("Reservation cancelled");
  assert.equal(bodies.length, 3);
  assert.deepEqual(bodies[0], bodies[2]);
  assert.equal(
    screen.queryByRole("textbox", { name: "Cancellation reason" }),
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
