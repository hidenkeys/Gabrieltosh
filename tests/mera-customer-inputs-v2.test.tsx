import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001",
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
const { default: HelpRequests } =
  await import("../src/mera/customer/HelpRequests");
const { default: ReservationOptions } =
  await import("../src/mera/customer/ReservationOptions");
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(cleanup);
const prefix = "/public/bing-chun/20000000-0000-4000-8000-000000000001";
test("a quick-help tile sends once with the exact topic and optional note through the existing verified journal", async (t) => {
  let creates = 0,
    finish!: (value: Response) => void;
  const bodies: any[] = [];
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/guest"))
      return Response.json({
        sessionRef: "40000000-0000-4000-8000-000000000001",
      });
    if (init.method === "GET") return Response.json({ requests: [] });
    bodies.push(JSON.parse(init.body));
    return new Promise<Response>((done) => {
      finish = done;
    });
  });
  render(
    <HelpRequests
      prefix={prefix}
      displayName=""
      hasGuest={false}
      ensureGuest={async () => {
        creates++;
      }}
      onName={() => {}}
    />,
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "How can staff help?" }),
    { target: { value: "Please bring it outside" } },
  );
  const tile = screen.getByRole("button", { name: /Ask for the bill/ });
  fireEvent.click(tile);
  fireEvent.click(tile);
  await act(async () => {});
  assert.equal(creates, 1);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].category, "payment");
  assert.equal(
    bodies[0].message,
    "Please bring the bill. — Please bring it outside",
  );
  assert.equal(window.sessionStorage.length, 1);
  await act(async () =>
    finish(
      Response.json({
        id: "60000000-0000-4000-8000-000000000001",
        reference: "H-TILE",
        category: "payment",
        message: bodies[0].message,
        status: "open",
      }),
    ),
  );
  await screen.findByText(/Request H-TILE was sent/);
  assert.equal(window.sessionStorage.length, 0);
});
test("guest reservation chips and stepper retain native form values and disclose preference-only time/table choices", () => {
  const tableId = "70000000-0000-4000-8000-000000000001";
  render(
    <form aria-label="Booking options">
      <ReservationOptions
        tables={[{ id: tableId, name: "Window table" }]}
        timeZone="Africa/Lagos"
      />
    </form>,
  );
  fireEvent.click(screen.getByRole("radio", { name: "4", exact: true }));
  assert.equal(
    (screen.getByRole("spinbutton", { name: "Party size" }) as HTMLInputElement)
      .value,
    "4",
  );
  fireEvent.click(screen.getByRole("button", { name: "Increase Party size" }));
  fireEvent.click(screen.getByRole("radio", { name: "2 hours", exact: true }));
  fireEvent.click(
    screen.getByRole("radio", { name: "Window table", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose another date" }));
  fireEvent.change(screen.getByLabelText("Date", { exact: true }), {
    target: { value: "2026-12-10" },
  });
  fireEvent.change(screen.getByLabelText("Preferred time", { exact: true }), {
    target: { value: "12:30" },
  });
  const values = new FormData(
    screen.getByRole("form", { name: "Booking options" }) as HTMLFormElement,
  );
  assert.equal(values.get("partySize"), "5");
  assert.equal(values.get("duration"), "120");
  assert.equal(values.get("tableId"), tableId);
  assert.equal(values.get("startsAt"), "2026-12-10T12:30");
  assert.match(document.body.textContent!, /venue will confirm availability/);
  assert.match(document.body.textContent!, /seating preference/);
  assert.equal(
    screen
      .getByLabelText("Preferred time", { exact: true })
      .getAttribute("aria-describedby"),
    "mc-reservation-timezone",
  );
});
