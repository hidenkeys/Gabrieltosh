import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/mera/workspace",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "FormData",
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
const { default: Workspace } =
  await import("../src/mera/workspace/OrganizationWorkspace");
const { default: AllLocations } =
  await import("../src/mera/workspace/AllLocations");
const { TransferReceipt } =
  await import("../src/mera/workspace/StockTransfers");
const { default: RoleManager } =
  await import("../src/mera/workspace/RoleManager");
const { default: Bills } = await import("../src/mera/workspace/Bills");
const user = { id: "actor", name: "Manager" };
const originalFetch = globalThis.fetch;
const basePermissions = [
  "orders.view",
  "tables.manage",
  "reservations.manage",
  "door.manage",
  "payments.record",
  "room_charge.post",
];
function workspaceFetch(branches: any[], permissions = basePermissions) {
  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path.endsWith("/context"))
      return Response.json({
        user,
        organizations: [
          {
            id: "org",
            name: "Test venues",
            permissions,
            branches,
            organizationWide: true,
            role: "branch_manager",
          },
        ],
      });
    if (path.endsWith("/workspace"))
      return Response.json({
        branch: branches.find((b) => path.includes(b.id)),
        products: [],
        counterProducts: [],
        orders: [],
        visits: [],
        reservations: [],
        payments: [],
        shifts: [],
        tables: [],
        refunds: [],
        serverTime: new Date().toISOString(),
      });
    if (path.includes("guest-list")) return Response.json([]);
    return Response.json({});
  };
}
test("venue navigation hides tables/reservations for quick service and exposes Door for club", async () => {
  try {
    const quick = {
      id: "quick",
      name: "Counter",
      permissions: basePermissions,
      settings: {
        venueType: "quick_service",
        capabilities: ["counter_ordering"],
      },
    };
    const club = {
      id: "club",
      name: "Nightclub",
      permissions: basePermissions,
      settings: {
        venueType: "club",
        capabilities: ["table_service", "reservations", "guest_list"],
      },
    };
    workspaceFetch([quick, club]);
    render(<Workspace user={user} notify={() => {}} onLogout={() => {}} />);
    await screen.findByRole("tab", { name: "Orders" });
    assert.equal(screen.queryByRole("tab", { name: "Tables & visits" }), null);
    assert.equal(screen.queryByRole("tab", { name: "Reservations" }), null);
    assert.equal(
      screen.queryByRole("tab", { name: "Door & guest list" }),
      null,
    );
    fireEvent.focus(screen.getByRole("combobox", { name: "Branch" }));
    fireEvent.click(screen.getByRole("option", { name: /Nightclub/ }));
    await screen.findByRole("tab", { name: "Door & guest list" });
    assert(screen.getByRole("tab", { name: "Tables & visits" }));
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
test("selected branch permissions override membership grants including explicit empty grants", async () => {
  try {
    workspaceFetch([
      {
        id: "limited",
        name: "Limited",
        permissions: ["orders.view"],
        settings: { capabilities: ["table_service", "guest_list"] },
      },
      {
        id: "empty",
        name: "No access",
        permissions: [],
        settings: { capabilities: ["table_service"] },
      },
    ]);
    render(<Workspace user={user} notify={() => {}} onLogout={() => {}} />);
    await screen.findByRole("tab", { name: "Orders" });
    assert.equal(screen.queryByRole("tab", { name: "Tables & visits" }), null);
    assert.equal(
      screen.queryByRole("tab", { name: "Door & guest list" }),
      null,
    );
    assert.equal(screen.queryByRole("tab", { name: "Transactions" }), null);
    fireEvent.focus(screen.getByRole("combobox", { name: "Branch" }));
    fireEvent.click(screen.getByRole("option", { name: /No access/ }));
    await screen.findByText("No tasks assigned");
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
test("all locations renders kobo totals, comparison, null valuation and row destination", async () => {
  let destination = "";
  globalThis.fetch = async () =>
    Response.json({
      totals: {
        revenue: 120000,
        orders: 3,
        averageOrder: 40000,
        refunds: 10000,
        roomCharges: 20000,
        covers: 7,
      },
      paymentMix: [{ method: "cash", amount: 100000 }],
      branches: [
        {
          id: "club",
          name: "Nightclub",
          code: "CLB",
          colorTag: "plum",
          revenue: 120000,
          orders: 3,
          averageOrder: 40000,
          refunds: 10000,
          openVisits: 2,
          onShift: 4,
        },
      ],
      stock: {
        lowStock: [],
        valueByBranch: [{ branchId: "club", value: null }],
        inTransit: [],
      },
    });
  try {
    render(
      <AllLocations
        organizationId="org"
        branchBase="/organizations/org/branches/club"
        onLocation={(id) => (destination = id)}
      />,
    );
    await screen.findByText("Add item costs to see stock value", {
      exact: false,
    });
    const table = screen.getByRole("table");
    assert(within(table).getByText("₦1,200.00"));
    assert(screen.getByText("Covers"));
    fireEvent.click(
      within(table).getByRole("button", { name: /CLB Nightclub/ }),
    );
    assert.equal(destination, "club");
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
test("receive fewer units shows explicit transfer loss and submits received quantity", () => {
  let submitted: any;
  try {
    render(
      <TransferReceipt
        transfer={{ lines: [{ code: "WTR", name: "Water", quantity: 5 }] }}
        onReceive={(lines) => (submitted = lines)}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Decrease Received Water" }),
    );
    assert(screen.getByText(/Loss: 1 units/));
    fireEvent.click(screen.getByRole("button", { name: "Receive transfer" }));
    assert.deepEqual(submitted, [
      { code: "WTR", variantName: null, receivedQuantity: 4 },
    ]);
  } finally {
    cleanup();
  }
});
test("room charge option requires both capability and branch permission", async () => {
  try {
    const branch = {
      id: "hotel",
      name: "Hotel",
      permissions: basePermissions.filter((p) => p !== "room_charge.post"),
      settings: { capabilities: ["room_charge"] },
    };
    workspaceFetch([branch]);
    const view = render(
      <Workspace user={user} notify={() => {}} onLogout={() => {}} />,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Transactions" }));
    assert.equal(screen.queryByRole("radio", { name: "Charge to room" }), null);
    cleanup();
    branch.permissions = basePermissions;
    workspaceFetch([branch]);
    render(<Workspace user={user} notify={() => {}} onLogout={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Transactions" }));
    fireEvent.click(screen.getByRole("radio", { name: "Charge to room" }));
    assert(
      screen
        .getByRole("textbox", { name: "Room number" })
        .hasAttribute("required"),
    );
    assert(
      screen
        .getByRole("textbox", { name: "Guest surname" })
        .hasAttribute("required"),
    );
    cleanup();
    branch.settings.capabilities = [];
    workspaceFetch([branch]);
    render(<Workspace user={user} notify={() => {}} onLogout={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Transactions" }));
    assert.equal(screen.queryByRole("radio", { name: "Charge to room" }), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
test("invite sends selected locations and a role per location", async () => {
  let sent: any;
  const roles = {
    templates: [
      { id: "cashier", name: "Cashier", permissions: ["orders.view"] },
      { id: "finance", name: "Finance", permissions: ["reports.view"] },
    ],
    custom: [],
  };
  const opId = "11111111-1111-4111-8111-111111111111";
  globalThis.fetch = async (input) =>
    String(input).endsWith("/roles")
      ? Response.json(roles)
      : String(input).includes("create-attempts")
        ? Response.json({
            status: "recorded",
            resultBasis: "recorded_operation_snapshot",
            operation: {
              id: opId,
              actorId: "actor",
              operation: "invitation_create",
              targetId: null,
              requestKey: sent.requestKey,
              intent: sent,
            },
            result: {
              id: "invite",
              email: sent.email,
              role: sent.role,
              branchIds: sent.branchIds,
              delivery: "not_sent",
              developmentTokenRecoverable: false,
            },
          })
        : Response.json([]);
  try {
    render(
      <RoleManager
        organizationId="org"
        branchId="a"
        userId="actor"
        branches={[
          { id: "a", name: "Counter" },
          { id: "b", name: "Hotel" },
        ]}
        permissions={["members.manage", "orders.view", "reports.view"]}
        disabled={false}
        save={async (_, __, body) => {
          sent = body;
          return { id: "invite" };
        }}
      />,
    );
    await screen.findByRole("button", { name: "Create branch invitation" });
    fireEvent.change(screen.getByRole("textbox", { name: "Staff email" }), {
      target: { value: "staff@example.test" },
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Which locations?" })).getByRole(
        "button",
        { name: "Hotel" },
      ),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Same role everywhere" }),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Role at Hotel" })).getByRole(
        "radio",
        { name: "Finance" },
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create branch invitation" }),
    );
    await waitFor(() => assert(sent));
    assert.deepEqual(sent.branchIds, ["a", "b"]);
    assert.deepEqual(sent.branch_roles, {
      a: { role: "cashier" },
      b: { role: "finance" },
    });
    assert.match(sent.requestKey, /^[a-f0-9-]{36}$/);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});

test("turned-off table service with open visits stays reachable under More", async () => {
  try {
    const branch = {
      id: "quick",
      name: "Counter",
      permissions: basePermissions,
      settings: { capabilities: ["counter_ordering"] },
    };
    workspaceFetch([branch]);
    const fetchBase = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/workspace"))
        return Response.json({
          branch,
          orders: [],
          tables: [],
          visits: [{ id: "visit", status: "open" }],
          reservations: [],
          payments: [],
          shifts: [],
        });
      return fetchBase(input, init);
    };
    render(<Workspace user={user} notify={() => {}} onLogout={() => {}} />);
    await screen.findByRole("tab", { name: "Orders" });
    assert.equal(screen.queryByRole("tab", { name: /Tables & visits/ }), null);
    await screen.findByText("Turned off");
    fireEvent.click(screen.getByRole("button", { name: "More", exact: true }));
    assert(
      await screen.findByRole("tab", { name: /Tables & visits.*Turned off/ }),
    );
    assert.equal(screen.queryByRole("tab", { name: "Reservations" }), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
test("room charge records the room and surname with one durable request key", async () => {
  const branch = {
    id: "hotel",
    name: "Hotel",
    permissions: basePermissions,
    settings: { capabilities: ["room_charge"] },
  };
  let sent: any,
    posts = 0;
  try {
    workspaceFetch([branch]);
    const fetchBase = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/workspace"))
        return Response.json({
          branch,
          products: [],
          orders: [
            {
              id: "order",
              reference: "ORDER 1",
              total: 10000,
              paid: 0,
              status: "submitted",
            },
          ],
          payments: [],
          refunds: [],
          tables: [],
          visits: [],
          reservations: [],
          shifts: [],
        });
      if (String(input).endsWith("/payments") && init?.method === "POST") {
        posts++;
        sent = JSON.parse(String(init.body));
        return Response.json({ id: "payment" });
      }
      return fetchBase(input, init);
    };
    render(<Workspace user={user} notify={() => {}} onLogout={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Transactions" }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Order" }));
    fireEvent.click(screen.getByRole("option", { name: /ORDER 1/ }));
    fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Charge to room" }));
    fireEvent.change(screen.getByLabelText("Room number"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Guest surname"), {
      target: { value: "Kofi" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record verified collection" }),
    );
    await waitFor(() => assert.equal(posts, 1));
    assert.equal(sent.method, "room_charge");
    assert.equal(sent.reference, "12 Kofi");
    assert.equal(sent.amount, 10000);
    assert.match(sent.requestKey, /^[a-f0-9-]{36}$/);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
test("unknown venue write survives remount and explicit retry sends the exact original body", async () => {
  const { useVenueWrite } =
    await import("../src/mera/workspace/StockTransfers");
  const attempts: any[] = [];
  function Writer() {
    const request = useVenueWrite(
      "actor",
      "/organizations/org/stock-transfers",
    );
    return (
      <>
        <p>{request.pending ? "Original request saved" : "Ready"}</p>
        <button
          disabled={request.busy}
          onClick={() =>
            void request
              .write(
                request.pending?.path || "/organizations/org/stock-transfers",
                "POST",
                request.pending?.body || {
                  fromBranchId: "a",
                  toBranchId: "b",
                  lines: [{ code: "WTR", quantity: 2 }],
                },
              )
              .catch(() => {})
          }
        >
          {request.pending ? "Retry original" : "Send"}
        </button>
      </>
    );
  }
  globalThis.fetch = async (_, init) => {
    attempts.push(JSON.parse(String(init?.body)));
    if (attempts.length === 1) throw Error("Lost response");
    return Response.json({ transfer: { id: "sent" } });
  };
  try {
    const view = render(<Writer />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Original request saved");
    await waitFor(() =>
      assert.equal(
        (
          screen.getByRole("button", {
            name: "Retry original",
          }) as HTMLButtonElement
        ).disabled,
        false,
      ),
    );
    view.unmount();
    render(<Writer />);
    assert.equal(attempts.length, 1);
    fireEvent.click(screen.getByRole("button", { name: "Retry original" }));
    await screen.findByText("Ready");
    assert.deepEqual(attempts[1], attempts[0]);
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});

test("Door-only staff can use the guest list without requesting forbidden operational data", async () => {
  const branch = {
    id: "club",
    name: "Club",
    permissions: ["door.manage"],
    settings: { capabilities: ["guest_list"] },
  };
  let workspaceReads = 0;
  try {
    workspaceFetch([branch], ["door.manage"]);
    const fetchBase = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/workspace")) {
        workspaceReads++;
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      return fetchBase(input, init);
    };
    render(<Workspace user={user} notify={() => {}} onLogout={() => {}} />);
    await screen.findByRole("heading", { name: "Door & guest list" });
    assert.equal(workspaceReads, 0);
    assert(await screen.findByText(/Tonight’s list/));
  } finally {
    cleanup();
    window.sessionStorage.clear();
    globalThis.fetch = originalFetch;
  }
});
