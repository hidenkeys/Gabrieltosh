import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  buildReservationJournal,
  readReservationJournal,
  reservationJournalKey,
  saveReservationJournal,
} from "../src/mera/customer/reservationRecovery";
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
const { default: CustomerExperience } =
  await import("../src/mera/customer/CustomerExperience");
const scope = {
    organizationId: "10000000-0000-4000-8000-000000000001",
    branchId: "20000000-0000-4000-8000-000000000001",
  },
  sessionRef = "40000000-0000-4000-8000-000000000001";
const intent = {
  requestKey: "60000000-0000-4000-8000-000000000001",
  displayName: "Original guest",
  contact: "original@example.invalid",
  partySize: 3,
  startsAt: "2026-12-10T12:00:00.000Z",
  endsAt: "2026-12-10T13:00:00.000Z",
  notes: "Original quiet table",
  minimumSpendAcknowledged: true,
  minimumSpendPolicyVersion: "original-v1",
};
const policy = {
  minimumSpendPolicy: {
    enabled: true,
    approved: true,
    amount: 1000000,
    basis: "net_paid_bill",
    shortfallTreatment: "manager_review",
    disclosure: "Original agreed booking terms",
    version: "original-v1",
  },
};
const record = () =>
  buildReservationJournal(scope, sessionRef, intent, policy, "Africa/Lagos");
const accepted = {
  id: "70000000-0000-4000-8000-000000000001",
  displayName: intent.displayName,
  partySize: 3,
  startsAt: intent.startsAt,
  endsAt: intent.endsAt,
  status: "requested",
  depositAmount: 0,
  depositRequired: 0,
};
const proof = { ...scope, sessionRef };
const menu = {
  organization: { id: scope.organizationId, name: "Bing Chun" },
  branch: { id: scope.branchId, name: "Surulere", timezone: "Africa/Lagos" },
  version: 9,
  products: [],
  tables: [],
  orderingAvailable: true,
  reservationPolicy: { enabled: false, minimumSpendPolicy: null },
};
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(cleanup);
function handler(
  t: any,
  special: (path: string, init: any) => any,
  ref = sessionRef,
) {
  return t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({
        displayName: "Current cookie",
        sessionRef: ref,
        orders: [],
        reservations: [],
        openVisits: [],
      });
    return special(path, init);
  });
}
async function open() {
  render(React.createElement(CustomerExperience));
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(screen.getByRole("button", { name: "Reserve a table" }));
}
test("reservation journal rejects untrusted private fields and oversized data without erasing the unresolved record", () => {
  saveReservationJournal(record());
  assert.deepEqual(readReservationJournal(scope)?.intent, intent);
  const key = reservationJournalKey(scope);
  window.sessionStorage.setItem(
    key,
    JSON.stringify({ ...record(), joiningCode: "secret" }),
  );
  assert.throws(() => readReservationJournal(scope));
  assert(window.sessionStorage.getItem(key));
  window.sessionStorage.setItem(key, "x".repeat(65537));
  assert.throws(() => readReservationJournal(scope));
  assert.equal(window.sessionStorage.getItem(key)?.length, 65537);
});
test("reservation refresh restores original body and terms despite changed current policy; no automatic writes or newguest", async (t) => {
  saveReservationJournal(record());
  const writes: any[] = [];
  handler(t, (path, init) => {
    if (path.includes("/reservation-attempts/"))
      return Response.json({ ...proof, status: "not_found" });
    if (init.method === "POST") {
      writes.push({ path, body: JSON.parse(init.body) });
      assert.deepEqual(readReservationJournal(scope)?.intent, intent);
      if (writes.length === 1) throw Error("lost response");
      if (writes.length === 2)
        return Response.json({ error: "Try later" }, { status: 429 });
      return Response.json(accepted);
    }
    throw Error("Unexpected request");
  });
  await open();
  await screen.findByText("Original agreed booking terms");
  assert(screen.getByText("Contact: original@example.invalid"));
  assert.equal(writes.length, 0);
  for (let i = 0; i < 2; i++) {
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original reservation" }),
    );
    await screen.findByRole("alert");
    assert(readReservationJournal(scope));
  }
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original reservation" }),
  );
  await screen.findByText("Awaiting venue confirmation");
  assert.equal(writes.length, 3);
  for (const write of writes) {
    assert(write.path.endsWith("/reservations"));
    assert.deepEqual(write.body, intent);
  }
  assert.equal(readReservationJournal(scope), null);
});
test("wrong guest proof hides saved booking details and blocks every write", async (t) => {
  saveReservationJournal(record());
  const writes: string[] = [];
  handler(
    t,
    (path, init) => {
      if (init.method === "POST") writes.push(path);
      throw Error("No private action expected");
    },
    "40000000-0000-4000-8000-000000000002",
  );
  await open();
  await screen.findByText(/saved reservation could not be verified/);
  assert.equal(screen.queryByText("Contact: original@example.invalid"), null);
  assert.equal(
    screen.queryByRole("button", { name: "Retry original reservation" }),
    null,
  );
  assert.equal(writes.length, 0);
  assert(readReservationJournal(scope));
});
test("not_found stays locked and explicit stop requires authoritative abandonment", async (t) => {
  saveReservationJournal(record());
  const posts: string[] = [];
  handler(t, (path, init) => {
    if (init.method === "POST") {
      posts.push(path);
      return Response.json({
        ...proof,
        status: "abandoned",
        resolutionId: "80000000-0000-4000-8000-000000000001",
      });
    }
    return Response.json({ ...proof, status: "not_found" });
  });
  await open();
  await screen.findByText("Original agreed booking terms");
  fireEvent.click(
    screen.getByRole("button", { name: "Check original reservation" }),
  );
  await screen.findByText(/venue has not recorded this request yet/);
  assert(readReservationJournal(scope));
  fireEvent.click(
    screen.getByRole("button", { name: "Stop unconfirmed reservation…" }),
  );
  assert.equal(posts.length, 0);
  fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Reason for stopping details" }),
    { target: { value: "Please stop this unconfirmed request" } },
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Stop unconfirmed reservation request",
    }),
  );
  await screen.findByText(/unconfirmed reservation request is stopped/);
  assert.equal(readReservationJournal(scope), null);
  assert.equal(posts.length, 1);
  assert(posts[0].endsWith("/abandon"));
});
test("stop discovering recorded booking retains reservation without cancellation or refund", async (t) => {
  saveReservationJournal(record());
  const posts: string[] = [];
  handler(t, (path, init) => {
    if (init.method === "POST") posts.push(path);
    return Response.json({
      ...proof,
      status: "recorded",
      reservation: accepted,
    });
  });
  await open();
  await screen.findByText("Original agreed booking terms");
  fireEvent.click(
    screen.getByRole("button", { name: "Check original reservation" }),
  );
  await screen.findByText("Awaiting venue confirmation");
  assert.equal(posts.length, 0);
  assert.equal(readReservationJournal(scope), null);
});

test("delayed initial guest response preserves explicit reservation tab and short datetime label", async (t) => {
  let resolve!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", async (input: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return new Promise<Response>((done) => {
        resolve = done;
      });
    throw Error("Unexpected request");
  });
  await open();
  await screen.findByRole("heading", { name: "A table for your plans" });
  const date = screen.getByRole("group", { name: "Date & time", exact: true });
  assert.equal(
    date.getAttribute("aria-describedby"),
    "mc-reservation-timezone",
  );
  await act(async () => {
    resolve(
      Response.json({
        sessionRef,
        displayName: "Guest",
        orders: [],
        reservations: [],
        openVisits: [],
      }),
    );
  });
  assert.equal(
    screen
      .getByRole("button", { name: "Reserve a table" })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert(screen.getByRole("heading", { name: "A table for your plans" }));
});

test("expired guest access during original booking check hides private details without clearing journal", async (t) => {
  saveReservationJournal(record());
  handler(t, () =>
    Response.json({ error: "Guest session expired" }, { status: 401 }),
  );
  await open();
  await screen.findByText("Contact: original@example.invalid");
  fireEvent.click(
    screen.getByRole("button", { name: "Check original reservation" }),
  );
  await screen.findByText(/Booking is paused/);
  assert.equal(screen.queryByText("Contact: original@example.invalid"), null);
  assert(readReservationJournal(scope));
});
