import { chooseDateTime } from "./mera-input-helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/workspace",
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
const { render, screen, fireEvent, waitFor, cleanup, within } =
  await import("@testing-library/react");
const { default: Workspace } =
  await import("../src/mera/workspace/OrganizationWorkspace");
const journal = await import("../src/mera/workspace/staffReservationJournal");
const actor = "10000000-0000-4000-8000-000000000001",
  org = "20000000-0000-4000-8000-000000000001",
  branch = "30000000-0000-4000-8000-000000000001",
  requestKey = "40000000-0000-4000-8000-000000000001";
const scope = { actorId: actor, organizationId: org, branchId: branch },
  user = { id: actor, name: "Teni" },
  base = `/organizations/${org}/branches/${branch}`;
const context = {
  user,
  demo: true,
  organizations: [
    {
      id: org,
      name: "Test venue",
      slug: "test-venue",
      role: "front_desk",
      organizationWide: true,
      permissions: ["orders.view", "tables.manage", "reservations.manage"],
      branchIds: [branch],
      branches: [
        {
          id: branch,
          name: "Surulere",
          timezone: "Africa/Lagos",
          currency: "NGN",
        },
      ],
    },
  ],
};
const snapshot = {
  branch: {
    id: branch,
    name: "Surulere",
    timezone: "Africa/Lagos",
    currency: "NGN",
    settings: { reservationsEnabled: true },
  },
  serverTime: "2026-11-19T10:00:00Z",
  products: [],
  counterProducts: [],
  orders: [],
  tickets: [],
  tables: [],
  visits: [],
  reservations: [],
  shifts: [],
  payments: [],
  refunds: [],
  complaints: [],
  audit: [],
  features: { flags: { new_reservations: true } },
};
const originalFetch = globalThis.fetch;
function mockApi(
  post?: (body: any, init: any) => Promise<Response> | Response,
) {
  let posts = 0,
    lookups = 0;
  const bodies: any[] = [],
    headers: string[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const path = new URL(String(input), "http://localhost:3003").pathname;
    if (path.endsWith("/context")) return Response.json(context);
    if (path.endsWith("/workspace")) return Response.json(snapshot);
    if (path.includes("/reservation-attempts/")) {
      lookups++;
      const key = path.split("/").at(-1)!;
      return Response.json({ ...scope, requestKey: key, status: "not_found" });
    }
    if (path.endsWith("/reservations") && init.method === "POST") {
      posts++;
      const body = JSON.parse(init.body);
      bodies.push(body);
      headers.push(new Headers(init.headers).get("X-Mera-Actor-Id") || "");
      return post
        ? post(body, init)
        : Promise.reject(new TypeError("Connection lost after submission"));
    }
    return Response.json([]);
  }) as any;
  return {
    get posts() {
      return posts;
    },
    get lookups() {
      return lookups;
    },
    bodies,
    headers,
  };
}
async function openAndFill() {
  await screen.findByText("Request a reservation", { selector: "summary" });
  fireEvent.click(
    screen.getByText("Request a reservation", { selector: "summary" }),
  );
  for (const [label, value] of [
    ["Guest name", "Private Guest"],
    ["Contact", "08012345678"],
    ["Party size", "3"],
    ["Starts at (this device’s local time)", "2030-01-02T12:00"],
    ["Ends at (this device’s local time)", "2030-01-02T13:00"],
  ])
    if (label.startsWith("Starts at") || label.startsWith("Ends at"))
      chooseDateTime(screen, fireEvent, within, label, value);
    else fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.change(screen.getByLabelText("Notes (optional)"), {
    target: { value: "Private guest request" },
  });
  return screen
    .getByRole("button", { name: "Request reservation" })
    .closest("form")!;
}
function seed() {
  return journal.saveStaffReservationJournal(
    journal.buildStaffReservationJournal(
      scope,
      {
        requestKey,
        displayName: "Private Guest",
        contact: "08012345678",
        partySize: 3,
        startsAt: "2030-01-02T12:00:00Z",
        endsAt: "2030-01-02T13:00:00Z",
        notes: "Private guest request",
      },
      {
        branchName: "Surulere",
        timezone: "Africa/Lagos",
        minimumSpendPolicy: null,
        depositPolicy: null,
        reservationPolicy: null,
      },
    ),
  );
}
async function requestLogout() {
  fireEvent.click(screen.getByLabelText("Account for Teni"));
  fireEvent.click(
    screen.getByRole("button", { name: "Sign out", exact: true }),
  );
  await screen.findByRole("alertdialog");
  fireEvent.click(
    screen.getByRole("button", { name: "Sign out and clear private details" }),
  );
}
test("staff reservation first POST keeps the stored UUID and actor header; global recovery survives navigation and reload without automatic POST", async () => {
  sessionStorage.clear();
  let storedAtWrite: any;
  const api = mockApi(async (body) => {
    storedAtWrite = journal.readStaffReservationJournal(scope);
    assert(storedAtWrite && !storedAtWrite.referenceOnly);
    assert.equal(storedAtWrite.requestKey, body.requestKey);
    assert.deepEqual(storedAtWrite.intent, body);
    throw new TypeError("Unknown reservation result");
  });
  try {
    const view = render(<Workspace user={user} notify={() => {}} />);
    fireEvent.submit(await openAndFill());
    await screen.findByRole("status", { name: "Reservation recovery" });
    assert.equal(api.posts, 1);
    assert.match(
      api.bodies[0].requestKey,
      /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i,
    );
    assert.deepEqual(api.headers, [actor]);
    assert.equal(storedAtWrite.actorId, actor);
    assert.equal(storedAtWrite.intent.displayName, "Private Guest");
    fireEvent.click(screen.getByRole("tab", { name: "Orders" }));
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole("tab", { name: "Orders" })
          .getAttribute("aria-selected"),
        "true",
      ),
    );
    assert(screen.getByRole("status", { name: "Reservation recovery" }));
    fireEvent.click(screen.getByRole("tab", { name: "Reservations" }));
    await screen.findByText("Check an unconfirmed reservation", {
      selector: "summary",
    });
    await waitFor(() => assert(api.lookups > 0));
    assert.equal(api.posts, 1);
    view.unmount();
    render(<Workspace user={user} notify={() => {}} />);
    await screen.findByRole("status", { name: "Reservation recovery" });
    await screen.findByText("Check an unconfirmed reservation", {
      selector: "summary",
    });
    assert.equal(api.posts, 1);
    const restored = journal.readStaffReservationJournal(scope);
    assert(restored && !restored.referenceOnly);
    assert.equal(restored.requestKey, api.bodies[0].requestKey);
    assert.deepEqual(restored.intent, api.bodies[0]);
  } finally {
    cleanup();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
test("staff reservation logout redacts guest PII and keeps its request marker before onLogout executes", async () => {
  sessionStorage.clear();
  seed();
  mockApi();
  let calls = 0;
  try {
    render(
      <Workspace
        user={user}
        notify={() => {}}
        onLogout={async () => {
          calls++;
          const saved = journal.readStaffReservationJournal(scope);
          assert(saved && saved.referenceOnly);
          assert.equal(saved.requestKey, requestKey);
          const raw = JSON.stringify(saved);
          assert(!raw.includes("Private Guest"));
          assert(!raw.includes("08012345678"));
          assert(!raw.includes("Private guest request"));
          assert(!Object.hasOwn(saved, "intent"));
        }}
      />,
    );
    await screen.findByText("Check an unconfirmed reservation", {
      selector: "summary",
    });
    await requestLogout();
    await waitFor(() => assert.equal(calls, 1));
    const saved = journal.readStaffReservationJournal(scope);
    assert(saved && saved.referenceOnly);
    assert.equal(saved.requestKey, requestKey);
  } finally {
    cleanup();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
test("failed reservation redaction prevents onLogout and retains the open session for safe recovery", async () => {
  sessionStorage.clear();
  seed();
  mockApi();
  let calls = 0;
  const originalSet = dom.window.Storage.prototype.setItem;
  try {
    render(
      <Workspace
        user={user}
        notify={() => {}}
        onLogout={async () => {
          calls++;
        }}
      />,
    );
    await screen.findByText("Check an unconfirmed reservation", {
      selector: "summary",
    });
    dom.window.Storage.prototype.setItem = function (
      key: string,
      value: string,
    ) {
      if (key.startsWith("mera:staff-reservation:v1:"))
        throw new Error("Storage unavailable");
      return originalSet.call(this, key, value);
    };
    await requestLogout();
    await screen.findByText(
      "Guest details could not be cleared safely. Keep this session open and retry signing out after reviewing reservation recovery.",
    );
    assert.equal(calls, 0);
    const saved = journal.readStaffReservationJournal(scope);
    assert(saved && !saved.referenceOnly);
  } finally {
    dom.window.Storage.prototype.setItem = originalSet;
    cleanup();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
test("a changed cookie actor is rejected on the first staff reservation attempt using the expected-actor header", async () => {
  sessionStorage.clear();
  let committed = 0;
  const api = mockApi(async (_body, init) => {
    assert.equal(new Headers(init.headers).get("X-Mera-Actor-Id"), actor);
    const cookieActor = "10000000-0000-4000-8000-000000000002";
    if (cookieActor !== actor)
      return Response.json(
        { error: "Staff identity changed", code: "ACTOR_MISMATCH" },
        { status: 403 },
      );
    committed++;
    return Response.json({});
  });
  try {
    render(<Workspace user={user} notify={() => {}} />);
    fireEvent.submit(await openAndFill());
    await waitFor(() => assert.equal(api.posts, 1));
    await waitFor(() => {
      const saved = journal.readStaffReservationJournal(scope);
      assert(saved && saved.referenceOnly);
    });
    assert.equal(committed, 0);
    assert.deepEqual(api.headers, [actor]);
    assert.equal(screen.queryByDisplayValue("Private Guest"), null);
  } finally {
    cleanup();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
