import { chooseDateTime, readDateTime } from "./mera-input-helpers";
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
const { default: ReservationRequest } =
  await import("../src/mera/workspace/ReservationRequest");
const journal = await import("../src/mera/workspace/staffReservationJournal");
const actor = "10000000-0000-4000-8000-000000000001",
  org = "20000000-0000-4000-8000-000000000001",
  branch = "30000000-0000-4000-8000-000000000001",
  id = "40000000-0000-4000-8000-000000000001";
const scope = { actorId: actor, organizationId: org, branchId: branch };
const props = {
  userId: actor,
  organizationId: org,
  branchId: branch,
  timeZone: "Africa/Lagos",
  reservationsEnabled: true,
  newReservationsAllowed: true,
  canRequest: true,
  disabled: false,
  save: async () => ({}),
};
const original = globalThis.fetch;
const proof = (key: string, status = "not_found", extra = {}) => ({
  ...scope,
  requestKey: key,
  status,
  ...extra,
});
async function fill() {
  fireEvent.click(
    screen.getByText("Request a reservation", { selector: "summary" }),
  );
  for (const [label, value] of [
    ["Guest name", "Test party"],
    ["Contact", "08012345678"],
    ["Party size", "2"],
    ["Starts at (this device’s local time)", "2030-01-02T12:00"],
    ["Ends at (this device’s local time)", "2030-01-02T13:00"],
  ])
    if (label.startsWith("Starts at") || label.startsWith("Ends at"))
      chooseDateTime(screen, fireEvent, within, label, value);
    else fireEvent.change(screen.getByLabelText(label), { target: { value } });
  return screen
    .getByRole("button", { name: "Request reservation" })
    .closest("form")!;
}
test("unknown reservation preserves full intent across branch navigation/reload and policy/time changes, explicit retry reuses key", async () => {
  const writes: any[] = [];
  let key = "";
  globalThis.fetch = async () => Response.json(proof(key));
  try {
    const view = render(
      <ReservationRequest
        {...props}
        save={async (...args: any[]) => {
          writes.push(args);
          key = args[2].requestKey;
          throw Error("Unknown");
        }}
      />,
    );
    const form = await fill();
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByText("Original reservation request");
    assert.equal(writes.length, 1);
    const saved = journal.readStaffReservationJournal(scope)!;
    assert.equal(saved.referenceOnly, false);
    view.unmount();
    render(
      <ReservationRequest
        {...props}
        newReservationsAllowed={false}
        reservationsEnabled={false}
        minimumSpendPolicy={{ enabled: true, version: "changed" }}
        save={async (...args: any[]) => {
          writes.push(args);
          throw Object.assign(Error("Conflict after uncertain write"), {
            status: 409,
          });
        }}
      />,
    );
    await screen.findByText(/has not been recorded yet/);
    fireEvent.click(
      screen.getByText("Check an unconfirmed reservation", {
        selector: "summary",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original reservation" }),
    );
    await waitFor(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0][2], writes[1][2]);
    assert.equal(journal.readStaffReservationJournal(scope)?.requestKey, key);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("authoritative recorded lookup verifies actor/key and clears only original request; mismatched proof remains pending", async () => {
  let key = "",
    body: any;
  globalThis.fetch = async () => Response.json({ ...proof(key), actorId: id });
  try {
    render(
      <ReservationRequest
        {...props}
        save={async (_p, _m, intent) => {
          key = intent.requestKey;
          body = intent;
          throw Error("Unknown");
        }}
      />,
    );
    fireEvent.submit(await fill());
    await screen.findByText("Original reservation request");
    fireEvent.click(
      screen.getByRole("button", { name: "Check original reservation" }),
    );
    await waitFor(() => assert.ok(screen.getByRole("alert")));
    assert.ok(journal.readStaffReservationJournal(scope));
    globalThis.fetch = async () =>
      Response.json(
        proof(key, "recorded", {
          reservation: { ...body, id, createdBy: actor, guestId: null },
        }),
      );
    fireEvent.click(
      screen.getByRole("button", { name: "Check original reservation" }),
    );
    await screen.findByText(/original reservation is recorded/);
    assert.equal(journal.readStaffReservationJournal(scope), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("reference-only recovery never retries private details and explicit confirmed stop clears proven abandoned request", async () => {
  const intent = {
    requestKey: id,
    displayName: "PRIVATE NAME",
    contact: "PRIVATE CONTACT",
    partySize: 2,
    startsAt: "2030-01-02T12:00:00Z",
    endsAt: "2030-01-02T13:00:00Z",
    notes: "",
  };
  journal.saveStaffReservationJournal(
    journal.buildStaffReservationJournal(scope, intent, {
      branchName: null,
      timezone: "Africa/Lagos",
      minimumSpendPolicy: null,
      depositPolicy: null,
      reservationPolicy: null,
    }),
  );
  assert.equal(journal.redactStaffReservationJournals(), true);
  const calls: any[] = [];
  globalThis.fetch = async (input, options) => {
    calls.push([String(input), options]);
    return Response.json(
      String(input).endsWith("/abandon")
        ? proof(id, "abandoned", { resolutionId: id })
        : proof(id),
    );
  };
  try {
    render(<ReservationRequest {...props} />);
    await screen.findByText(/has not been recorded yet/);
    fireEvent.click(
      screen.getByText("Check an unconfirmed reservation", {
        selector: "summary",
      }),
    );
    assert.ok(!screen.queryByText(/PRIVATE NAME/));
    assert.ok(
      !screen.queryByRole("button", { name: "Retry original reservation" }),
    );
    fireEvent.click(screen.getByText("Stop the unconfirmed request"));
    fireEvent.click(screen.getByRole("radio", { name: "Plans changed" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I want to stop this unconfirmed request.",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Stop this unconfirmed request" }),
    );
    await screen.findByText(/unconfirmed request was stopped/);
    assert.equal(journal.readStaffReservationJournal(scope), null);
    assert.equal(calls.filter(([path]) => path.endsWith("/abandon")).length, 1);
    for (const [, options] of calls)
      assert.equal(
        (options.headers as Record<string, string>)["X-Mera-Actor-Id"],
        actor,
      );
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("storage failure prevents POST, permission denial hides guest details without clearing unknown intent", async () => {
  let writes = 0;
  const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get() {
      throw Error("Blocked");
    },
  });
  try {
    render(
      <ReservationRequest
        {...props}
        save={async () => {
          writes++;
          return {};
        }}
      />,
    );
    await screen.findByText(/Saved reservation details could not be verified/);
    assert.equal(writes, 0);
  } finally {
    cleanup();
    Object.defineProperty(window, "sessionStorage", descriptor);
  }
  let key = "";
  globalThis.fetch = async () =>
    Response.json({ error: "Denied" }, { status: 403 });
  try {
    render(
      <ReservationRequest
        {...props}
        save={async (_p, _m, body) => {
          key = body.requestKey;
          throw Error("Unknown");
        }}
      />,
    );
    fireEvent.submit(await fill());
    await screen.findByText("Original reservation request");
    fireEvent.click(
      screen.getByRole("button", { name: "Check original reservation" }),
    );
    await screen.findByText(/Reservation access needs checking/);
    assert.ok(!screen.queryByText("Test party"));
    assert.equal(journal.readStaffReservationJournal(scope)?.requestKey, key);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("local invalid dates never dispatch and explain correction; configured minimum/deposit/timing policies permit valid request", async () => {
  let writes = 0;
  try {
    const view = render(
      <ReservationRequest
        {...props}
        save={async () => {
          writes++;
          throw Error("Unknown");
        }}
      />,
    );
    fireEvent.click(
      screen.getByText("Request a reservation", { selector: "summary" }),
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Request reservation" })
        .closest("form")!,
    );
    await screen.findByText(/Choose valid start and end dates/);
    assert.equal(writes, 0);
    view.unmount();
    const minimum = {
      enabled: true,
      approved: true,
      amount: 50000,
      basis: "net_paid_bill",
      shortfallTreatment: "manager_review",
      disclosure: "Customer accepted minimum booking terms",
      version: id,
      configuredAt: "2026-11-19T10:00:00Z",
      configuredBy: actor,
    };
    render(
      <ReservationRequest
        {...props}
        minimumSpendPolicy={minimum}
        depositPolicy={{
          enabled: true,
          approved: true,
          amount: 50000,
          cancellationCutoffHours: 24,
          refundRule: "refundable_before_cutoff",
        }}
        reservationPolicy={{
          enabled: true,
          approved: true,
          minimumLeadMinutes: 30,
          maximumAdvanceDays: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          cancellationCutoffMinutes: null,
          lateAfterMinutes: null,
          refundHandling: "manual_review",
          noShowHandling: "manual_review",
          version: id,
          reviewedBy: actor,
        }}
        save={async () => {
          writes++;
          throw Error("Unknown");
        }}
      />,
    );
    const form = await fill();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /customer reviewed and accepted/i }),
    );
    fireEvent.submit(form);
    await screen.findByText("Original reservation request");
    assert.equal(writes, 1);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("confirmed creation clears fields and policy acknowledgement so a second synthetic submit cannot dispatch another booking", async () => {
  let writes = 0;
  const minimum = {
    enabled: true,
    approved: true,
    amount: 50000,
    basis: "net_paid_bill",
    shortfallTreatment: "manager_review",
    disclosure: "Customer accepted minimum booking terms",
    version: id,
  };
  try {
    render(
      <ReservationRequest
        {...props}
        minimumSpendPolicy={minimum}
        save={async (_path, _method, body) => {
          writes++;
          return { ...body, id, createdBy: actor, guestId: null };
        }}
      />,
    );
    const form = await fill();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /customer reviewed and accepted/i }),
    );
    fireEvent.submit(form);
    await screen.findByText(/original reservation is recorded/);
    assert.equal(writes, 1);
    assert.equal(journal.readStaffReservationJournal(scope), null);
    for (const label of ["Guest name", "Contact"])
      assert.equal(
        (screen.getByLabelText(label) as HTMLInputElement).value,
        "",
      );
    assert.equal(
      (screen.getByLabelText("Party size") as HTMLInputElement).value,
      "2",
    );
    for (const label of [
      "Starts at (this device’s local time)",
      "Ends at (this device’s local time)",
    ])
      assert.equal(readDateTime(screen, within, label), "");
    assert.equal(
      (
        screen.getByRole("checkbox", {
          name: /customer reviewed and accepted/i,
        }) as HTMLInputElement
      ).checked,
      false,
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Request reservation" })
        .closest("form")!,
    );
    await screen.findByText(/No reservation request was sent/);
    assert.equal(writes, 1);
    assert.equal(journal.readStaffReservationJournal(scope), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});
test("native datetime input-only events populate the exact original UTC booking body and persist for recovery", async () => {
  const writes: any[] = [];
  try {
    render(
      <ReservationRequest
        {...props}
        save={async (...args: any[]) => {
          writes.push(args);
          throw Error("Unknown original");
        }}
      />,
    );
    fireEvent.click(
      screen.getByText("Request a reservation", { selector: "summary" }),
    );
    for (const [label, value] of [
      ["Guest name", "Native input party"],
      ["Contact", "0801234567"],
      ["Party size", "3"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const starts = "2030-02-03T14:15",
      ends = "2030-02-03T15:45";
    chooseDateTime(
      screen,
      fireEvent,
      within,
      "Starts at (this device’s local time)",
      starts,
      true,
    );
    chooseDateTime(
      screen,
      fireEvent,
      within,
      "Ends at (this device’s local time)",
      ends,
      true,
    );
    assert.equal(
      readDateTime(screen, within, "Starts at (this device’s local time)"),
      starts,
    );
    assert.equal(
      readDateTime(screen, within, "Ends at (this device’s local time)"),
      ends,
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Request reservation" })
        .closest("form")!,
    );
    await screen.findByText("Original reservation request");
    assert.equal(writes.length, 1);
    assert.equal(writes[0][2].startsAt, new Date(starts).toISOString());
    assert.equal(writes[0][2].endsAt, new Date(ends).toISOString());
    const stored = journal.readStaffReservationJournal(scope)!;
    assert.equal(stored.referenceOnly, false);
    if (!stored.referenceOnly) assert.deepEqual(stored.intent, writes[0][2]);
    assert.ok(!screen.queryByText(/Choose valid start and end dates/));
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = original;
  }
});

test("staff party quick choices and typed9+ counts preserve actual cumulative party size in the unchanged booking body", async () => {
  const writes: any[] = [];
  try {
    render(
      <ReservationRequest
        {...props}
        save={async (_path, _method, body) => {
          writes.push(body);
          return {
            ...body,
            id,
            createdBy: actor,
            guestId: null,
            status: "requested",
          };
        }}
      />,
    );
    const form = await fill();
    fireEvent.click(screen.getByRole("radio", { name: "9+", exact: true }));
    assert.equal(
      (screen.getByLabelText("Party size") as HTMLInputElement).value,
      "9",
    );
    assert.equal(writes.length, 0);
    fireEvent.change(screen.getByLabelText("Party size"), {
      target: { value: "12" },
    });
    assert.equal(
      (
        screen.getByRole("radio", {
          name: "9+",
          exact: true,
        }) as HTMLInputElement
      ).checked,
      true,
    );
    fireEvent.submit(form);
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0].partySize, 12);
  } finally {
    cleanup();
    globalThis.fetch = original;
    window.sessionStorage.clear();
  }
});
