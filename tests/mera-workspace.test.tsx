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
const { render, screen, fireEvent, waitFor, cleanup, act } =
  await import("@testing-library/react");
const { default: Workspace } =
  await import("../src/mera/workspace/OrganizationWorkspace");
const user = { id: "user-1", name: "Teni" };
const context = {
  organizations: [
    {
      id: "org-1",
      name: "Bing Chun",
      role: "cashier",
      permissions: ["orders.view", "payments.record"],
      branchIds: ["branch-1", "branch-2"],
      branches: [
        { id: "branch-1", name: "Surulere" },
        { id: "branch-2", name: "Ikeja" },
      ],
    },
  ],
};
const snapshot = (branch: string) => ({
  branch: { name: branch === "branch-1" ? "Surulere" : "Ikeja" },
  products: [],
  orders: [
    {
      id: "order-" + branch,
      displayName:
        branch === "branch-1" ? "Surulere customer" : "Ikeja customer",
      total: 100000,
      paid: 0,
      status: "submitted",
      paymentStatus: "unpaid",
      version: 1,
    },
  ],
  tables: [],
  visits: [],
  reservations: [],
  shifts: [],
  payments: [],
  providers: { rubies: "blocked" },
});
let attempts: any[] = [];
let failPayment = true;
let submittedPolicy: any = null;
let submittedRefund: any = null;
let deferOldRefresh = false;
let resolveOldRefresh: ((value: Response) => void) | null = null;
globalThis.fetch = (async (input: any, init: any = {}) => {
  const path = String(input);
  if (path.endsWith("/refunds")) {
    submittedRefund = JSON.parse(init.body);
    return Response.json({ id: "refund-1" });
  }
  if (path.endsWith("/policy")) {
    submittedPolicy = JSON.parse(init.body);
    return Response.json({
      ...submittedPolicy,
      liveBillingEnabled: false,
      status: "proposed",
    });
  }
  if (path.endsWith("/context")) return Response.json(context);
  if (
    path.endsWith("/workspace") &&
    path.includes("branch-1") &&
    deferOldRefresh
  )
    return new Promise<Response>((resolve) => {
      resolveOldRefresh = resolve;
    });
  if (path.endsWith("/workspace"))
    return Response.json(
      snapshot(path.includes("branch-2") ? "branch-2" : "branch-1"),
    );
  if (path.endsWith("/payments")) {
    attempts.push(JSON.parse(init.body));
    if (failPayment) throw new TypeError("Failed to fetch");
    return Response.json({ id: "payment-1" });
  }
  return Response.json({});
}) as any;
test("workspace scopes visible navigation and discards the previous branch records on switch", async () => {
  render(React.createElement(Workspace, { user, notify: () => {} }));
  await screen.findByText("Surulere customer", { exact: false });
  assert.equal(screen.queryByRole("tab", { name: "People" }), null);
  assert.equal(screen.queryByRole("tab", { name: "Subscription" }), null);
  fireEvent.change(screen.getByLabelText("Branch"), {
    target: { value: "branch-2" },
  });
  await screen.findByText("Ikeja customer", { exact: false });
  assert.equal(screen.queryByText("Surulere customer", { exact: false }), null);
  cleanup();
});
test("uncertain manual collection retries retain one request key and are never shown as confirmed", async () => {
  attempts = [];
  failPayment = true;
  const notices: string[] = [];
  render(
    React.createElement(Workspace, {
      user,
      notify: (message: string) => notices.push(message),
    }),
  );
  await screen.findByText("Surulere customer", { exact: false });
  fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
  fireEvent.change(screen.getByLabelText("Order", { exact: true }), {
    target: { value: "order-branch-1" },
  });
  fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
    target: { value: "1000" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Record verified collection" }),
  );
  await screen.findByRole("alert");
  assert.equal(notices.length, 0);
  failPayment = false;
  await waitFor(() =>
    assert.equal(
      screen
        .getByRole("button", { name: "Record verified collection" })
        .hasAttribute("disabled"),
      false,
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Record verified collection" }),
  );
  await waitFor(() => assert.equal(notices.length, 1));
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].requestKey, attempts[1].requestKey);
  assert.equal(attempts[0].amount, 100000);
  cleanup();
});

test("pricing editor preserves unresolved choices and never requests live billing", async () => {
  const previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("billing.manage");
  submittedPolicy = null;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.click(screen.getByRole("tab", { name: "Subscription" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save pricing proposal" }),
    );
    await waitFor(() => assert(submittedPolicy));
    assert.equal(submittedPolicy.monthlyPrice, 1350000);
    assert.equal(submittedPolicy.integratedFeeBps, 10);
    assert.equal(submittedPolicy.additionalBranchPrice, null);
    assert.equal(submittedPolicy.feePayer, null);
    assert.equal(submittedPolicy.feeBasis, null);
    assert.equal(submittedPolicy.refundTreatment, null);
    assert.equal(submittedPolicy.trialDays, null);
    assert.equal(submittedPolicy.graceDays, null);
    assert(!Object.hasOwn(submittedPolicy, "liveBillingEnabled"));
  } finally {
    context.organizations[0].permissions = previous;
    cleanup();
  }
});

test("refund payout method is explicitly chosen and sent rather than assumed cash", async () => {
  const previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("refunds.approve");
  submittedRefund = null;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    const method = screen.getByLabelText(
      "Refund payout method",
    ) as HTMLSelectElement;
    assert.equal(method.value, "");
    assert.equal(method.required, true);
    fireEvent.change(screen.getByLabelText("Refund order"), {
      target: { value: "order-branch-1" },
    });
    fireEvent.change(screen.getByLabelText("Amount returned (naira)"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Refund reason"), {
      target: { value: "Returned via bank" },
    });
    fireEvent.change(method, { target: { value: "external_transfer" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Record authorized refund" }),
    );
    await waitFor(() => assert(submittedRefund));
    assert.equal(submittedRefund.method, "external_transfer");
    assert.equal(submittedRefund.amount, 10000);
  } finally {
    context.organizations[0].permissions = previous;
    cleanup();
  }
});
test("table-only staff cannot access financial bill actions", async () => {
  const { default: Bills } = await import("../src/mera/workspace/Bills");
  render(
    React.createElement(Bills, {
      bills: [
        {
          id: "bill-1",
          status: "open",
          name: "Table bill",
          visitId: "visit-1",
          charges: [],
          allocations: [],
          total: 10000,
          paid: 0,
          balance: 10000,
        },
      ],
      base: "/organizations/org/branches/branch",
      disabled: false,
      canPay: false,
      save: async () => ({}),
    }),
  );
  fireEvent.change(screen.getByLabelText("Bill to manage"), {
    target: { value: "bill-1" },
  });
  assert.equal(screen.queryByRole("button", { name: "Split bill" }), null);
  assert.equal(
    screen.queryByRole("button", { name: "Merge into selected bill" }),
    null,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Record bill collection" }),
    null,
  );
  cleanup();
});
test("table coordinate editor follows the backend zero-to-one-hundred bounds", async () => {
  const { default: TableEditor } =
    await import("../src/mera/workspace/TableEditor");
  render(
    React.createElement(TableEditor, {
      table: {
        id: "table-1",
        name: "T1",
        capacity: 4,
        zone: "Main",
        x: 0,
        y: 0,
      },
      base: "/branch",
      disabled: false,
      save: async () => ({}),
    }),
  );
  for (const label of ["X position", "Y position"]) {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    assert.equal(input.min, "0");
    assert.equal(input.max, "100");
  }
  cleanup();
});

test("slow manual refresh cannot overwrite the new branch after switching", async () => {
  deferOldRefresh = false;
  resolveOldRefresh = null;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    deferOldRefresh = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh workspace" }));
    await waitFor(() => assert(resolveOldRefresh));
    fireEvent.change(screen.getByLabelText("Branch"), {
      target: { value: "branch-2" },
    });
    await screen.findByText("Ikeja customer", { exact: false });
    await act(async () => {
      resolveOldRefresh!(Response.json(snapshot("branch-1")));
      await Promise.resolve();
    });
    assert(screen.getByText("Ikeja customer", { exact: false }));
    assert.equal(
      screen.queryByText("Surulere customer", { exact: false }),
      null,
    );
  } finally {
    deferOldRefresh = false;
    resolveOldRefresh = null;
    cleanup();
  }
});
test("unused reservation deposit is labeled credit held rather than negative debt", async () => {
  const { default: Bills } = await import("../src/mera/workspace/Bills");
  render(
    React.createElement(Bills, {
      bills: [
        {
          id: "credit-bill",
          status: "open",
          visitId: "visit-1",
          name: "Deposit credit",
          charges: [],
          allocations: [],
          total: 0,
          paid: 100000,
          balance: -100000,
        },
      ],
      base: "/branch",
      disabled: false,
      canPay: false,
      save: async () => ({}),
    }),
  );
  assert(screen.getByText(/Credit held ₦1,000/));
  assert.equal(screen.queryByText(/Due.*-/), null);
  cleanup();
});

test("staff table orders freeze uncertain intent and retry the same request without duplicates", async () => {
  const originalFetch = globalThis.fetch;
  const previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("orders.create", "tables.manage");
  const submitted: any[] = [];
  let fail = true;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        menuVersion: 1,
        products: [
          { id: "tea", name: "Milk tea", available: true, price: 150000 },
        ],
        tables: [{ id: "table-1", name: "Window table" }],
        visits: [
          {
            id: "visit-1",
            tableId: "table-1",
            status: "open",
            displayName: "Family",
          },
        ],
      });
    if (String(input).endsWith("/orders") && init.method === "POST") {
      submitted.push(JSON.parse(init.body));
      if (fail) throw new TypeError("Network lost");
      return Response.json({ id: "created" });
    }
    return originalFetch(input, init);
  }) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.change(screen.getByLabelText("Customer display name"), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByLabelText("Fulfillment"), {
      target: { value: "table_service" },
    });
    fireEvent.change(screen.getByLabelText("Open table visit"), {
      target: { value: "visit-1" },
    });
    fireEvent.change(screen.getByLabelText("Quantity of Milk tea"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Order note"), {
      target: { value: "Less ice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
    await screen.findByText("Submission not confirmed");
    assert.equal(
      (
        screen.getByLabelText("Customer display name") as HTMLInputElement
      ).closest("fieldset")?.disabled,
      true,
    );
    assert.equal(submitted[0].visitId, "visit-1");
    assert.equal(submitted[0].fulfillment, "table_service");
    fail = false;
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Retry original submission" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(screen.queryByText("Submission not confirmed"), null);
    assert.equal(submitted.length, 2);
    assert.deepEqual(submitted[0], submitted[1]);
  } finally {
    cleanup();
    context.organizations[0].permissions = previous;
    globalThis.fetch = originalFetch;
  }
});

test("QR administration exports scoped real codes and clearly labels preview reachability", async () => {
  const { default: QrCodes } = await import("../src/mera/workspace/QrCodes");
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    calls.push({
      path: String(input),
      body: init.body && JSON.parse(init.body),
    });
    return Response.json(
      init.method === "POST"
        ? {
            id: "qr-1",
            kind: "branch",
            url: "http://localhost:3003/api/mera/v1/public/qr/qr-1",
          }
        : { codes: [] },
    );
  }) as any;
  try {
    render(
      React.createElement(QrCodes, {
        base: "/organizations/org/branches/branch",
        tables: [],
        demo: true,
      }),
    );
    await screen.findByText("No menu codes have been created for this branch.");
    assert(screen.getByText(/not guaranteed to be publicly reachable/));
    fireEvent.click(screen.getByRole("button", { name: "Create menu code" }));
    const download = await screen.findByRole("link", { name: "Export SVG" });
    assert.equal(
      download.getAttribute("href"),
      "/api/mera/v1/organizations/org/branches/branch/qr-codes/qr-1/image.svg",
    );
    assert.deepEqual(calls[1].body, { kind: "branch" });
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("integration credentials are explicitly simulated, scoped and revocable", async () => {
  const { default: Integrations } =
    await import("../src/mera/workspace/Integrations");
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  let created = false;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    calls.push({
      path: String(input),
      method: init.method,
      body: init.body && JSON.parse(init.body),
    });
    if (init.method === "POST") {
      created = true;
      return Response.json({ id: "credential", token: "development-secret" });
    }
    if (init.method === "DELETE") return Response.json({ revoked: true });
    return Response.json(
      created
        ? [
            {
              id: "credential",
              name: "Test adapter",
              active: true,
              scopes: ["published_menu.read"],
            },
          ]
        : [],
    );
  }) as any;
  try {
    render(
      React.createElement(Integrations, {
        base: "/organizations/org/branches/branch",
        demo: true,
      }),
    );
    await screen.findByText("No integration credentials for this branch.");
    assert(screen.getByText("Development simulator"));
    fireEvent.change(screen.getByLabelText("Credential name"), {
      target: { value: "Test adapter" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create simulator credential" }),
    );
    await screen.findByDisplayValue("development-secret");
    assert.deepEqual(calls.find((call) => call.method === "POST").body, {
      name: "Test adapter",
      scopes: ["published_menu.read"],
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(screen.queryByDisplayValue("development-secret"), null);
    assert(
      calls.some(
        (call) =>
          call.method === "DELETE" &&
          call.path.endsWith("/integration-credentials/credential"),
      ),
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("complaint resolution requires an explicit private resolution and uses branch-scoped updates", async () => {
  const { Complaints } = await import("../src/mera/workspace/Operations");
  const calls: any[] = [];
  try {
    render(
      React.createElement(Complaints, {
        base: "/organizations/org/branches/branch",
        complaints: [
          {
            id: "care",
            category: "service",
            rating: 2,
            text: "Long wait",
            status: "open",
            orderId: "order",
            createdAt: "2026-11-18T12:00:00Z",
          },
        ],
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    fireEvent.change(screen.getByLabelText("Case status"), {
      target: { value: "resolved" },
    });
    assert.equal(
      (screen.getByLabelText("Resolution") as HTMLTextAreaElement).required,
      true,
    );
    fireEvent.change(screen.getByLabelText("Resolution"), {
      target: { value: "Contacted customer and explained delay" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Update care record" }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/complaints/care",
    );
    assert.equal(calls[0][1], "PATCH");
    assert.deepEqual(calls[0][2], {
      status: "resolved",
      resolution: "Contacted customer and explained delay",
    });
  } finally {
    cleanup();
  }
});

test("exports stay queued until a canonical completed artifact is available", async () => {
  const { default: ExportJobs } =
    await import("../src/mera/workspace/ExportJobs");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json([
      {
        id: "queued",
        type: "report_export",
        status: "queued",
        artifactId: "unready",
        createdAt: "2026-11-18T12:00:00Z",
      },
      {
        id: "done",
        type: "report_export",
        status: "complete",
        artifactId: "ready",
        createdAt: "2026-11-18T12:00:00Z",
      },
    ])) as any;
  try {
    render(
      React.createElement(ExportJobs, {
        base: "/organizations/org/branches/branch",
        disabled: false,
        save: async () => ({}),
      }),
    );
    const link = await screen.findByRole("link", {
      name: "Download report CSV",
    });
    assert.equal(
      link.getAttribute("href"),
      "/api/mera/v1/organizations/org/branches/branch/exports/ready/download",
    );
    assert.equal(screen.getAllByRole("link").length, 1);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("station partial fulfillment sends a versioned SET quantity and never bypasses another station", async () => {
  const { default: Tickets } = await import("../src/mera/workspace/Tickets");
  const calls: any[] = [];
  try {
    render(
      React.createElement(Tickets, {
        base: "/organizations/org/branches/branch",
        tickets: [
          {
            id: "bar-ticket",
            orderId: "order",
            station: "bar",
            status: "preparing",
            version: 7,
            items: [
              {
                orderLineId: "tea-line",
                name: "Milk tea",
                quantity: 3,
                preparedQuantity: 1,
              },
            ],
          },
        ],
        orders: [
          {
            id: "order",
            reference: "BC001",
            displayName: "Ada",
            status: "preparing",
          },
        ],
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    fireEvent.change(
      screen.getByLabelText("Prepared quantity for Milk tea on bar"),
      { target: { value: "2" } },
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Save prepared quantity" }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/tickets/bar-ticket/items/tea-line",
    );
    assert.deepEqual(calls[0][2], { preparedQuantity: 2, version: 7 });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Mark station ready" }),
      ),
    );
    assert.equal(
      calls[1][0],
      "/organizations/org/branches/branch/tickets/bar-ticket/status",
    );
    assert.deepEqual(calls[1][2], { status: "ready", version: 7 });
    assert.equal(
      calls.some((call) => call[0].includes("/orders/")),
      false,
    );
  } finally {
    cleanup();
  }
});

test("returning to the same branch still rejects a response from its earlier scope generation", async () => {
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    deferOldRefresh = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh workspace" }));
    await waitFor(() => assert(resolveOldRefresh));
    const staleResolver = resolveOldRefresh!;
    fireEvent.change(screen.getByLabelText("Branch"), {
      target: { value: "branch-2" },
    });
    await screen.findByText("Ikeja customer", { exact: false });
    deferOldRefresh = false;
    fireEvent.change(screen.getByLabelText("Branch"), {
      target: { value: "branch-1" },
    });
    await screen.findByText("Surulere customer", { exact: false });
    await act(async () => {
      const stale = snapshot("branch-1");
      stale.orders[0].displayName = "Stale earlier generation";
      staleResolver(Response.json(stale));
      await Promise.resolve();
    });
    assert.equal(
      screen.queryByText("Stale earlier generation", { exact: false }),
      null,
    );
    assert(screen.getByText("Surulere customer", { exact: false }));
  } finally {
    deferOldRefresh = false;
    resolveOldRefresh = null;
    cleanup();
  }
});

test("workspace navigation exposes all pages and supports roving keyboard focus", async () => {
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    const ordersTab = screen.getByRole("tab", { name: "Orders" });
    assert.equal(ordersTab.tabIndex, 0);
    fireEvent.keyDown(ordersTab, { key: "End" });
    const transactions = screen.getByRole("tab", { name: "Transactions" });
    assert.equal(transactions.getAttribute("aria-selected"), "true");
    assert.equal(transactions.tabIndex, 0);
    assert.equal(document.activeElement, transactions);
    fireEvent.change(screen.getByLabelText("Workspace page"), {
      target: { value: "orders" },
    });
    assert.equal(ordersTab.getAttribute("aria-selected"), "true");
    assert.equal(
      screen.getByRole("tabpanel").getAttribute("aria-labelledby"),
      ordersTab.id,
    );
  } finally {
    cleanup();
  }
});

test("custom roles expose only actor-grantable permissions and invite using a scoped custom role id", async () => {
  const { default: RoleManager } =
    await import("../src/mera/workspace/RoleManager");
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = (async (input: any) =>
    Response.json(
      String(input).endsWith("/roles")
        ? {
            templates: [
              { id: "owner", name: "Owner", permissions: ["billing.manage"] },
              { id: "cashier", name: "Cashier", permissions: ["orders.view"] },
            ],
            custom: [
              {
                id: "custom-role",
                name: "Host",
                permissions: ["orders.view"],
                version: 2,
                active: true,
              },
            ],
          }
        : [],
    )) as any;
  try {
    render(
      React.createElement(RoleManager, {
        organizationId: "org",
        branchId: "branch",
        permissions: ["orders.view", "members.manage"],
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return { delivery: "not_sent", reason: "Provider unavailable" };
        },
      }),
    );
    await screen.findByRole("option", { name: "Host" });
    assert.equal(screen.queryByRole("option", { name: "Owner" }), null);
    assert.equal(screen.queryByText("billing · manage"), null);
    fireEvent.change(screen.getByLabelText("Staff email"), {
      target: { value: "staff@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Invitation role"), {
      target: { value: "custom-role" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Create branch invitation" }),
      ),
    );
    assert.deepEqual(calls[0][2], {
      email: "staff@example.com",
      role: "custom-role",
      branchIds: ["branch"],
    });
    assert(screen.getByText("Delivery: not_sent"));
    fireEvent.click(screen.getByRole("button", { name: "Edit role" }));
    fireEvent.change(screen.getByLabelText("Role name"), {
      target: { value: "Evening host" },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Save custom role" })),
    );
    assert.equal(calls[1][0], "/organizations/org/roles/custom-role");
    assert.deepEqual(calls[1][2], {
      name: "Evening host",
      permissions: ["orders.view"],
      active: true,
      version: 2,
    });
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("branch service windows save local timezone and trading cutoff without assuming overnight hours", async () => {
  const { default: BranchSettings } =
    await import("../src/mera/workspace/BranchSettings");
  const calls: any[] = [];
  try {
    render(
      React.createElement(BranchSettings, {
        branch: { timezone: "Africa/Lagos", cutoff: 240, settings: {} },
        organization: { id: "org", name: "Bing Chun", branding: {} },
        base: "/organizations/org/branches/branch",
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    fireEvent.change(screen.getByLabelText("Trading day starts"), {
      target: { value: "05:30" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add availability window" }),
    );
    fireEvent.change(screen.getByLabelText("Window 1 starts"), {
      target: { value: "10:00" },
    });
    fireEvent.change(screen.getByLabelText("Window 1 ends"), {
      target: { value: "22:00" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Save branch policies" }),
      ),
    );
    assert.equal(calls[0][2].timezone, "Africa/Lagos");
    assert.equal(calls[0][2].cutoff, 330);
    assert.deepEqual(calls[0][2].serviceHours, [
      { days: [0, 1, 2, 3, 4, 5, 6], start: "10:00", end: "22:00" },
    ]);
  } finally {
    cleanup();
  }
});

test("authorization denial clears protected records immediately and stale successes cannot restore them", async () => {
  const originalFetch = globalThis.fetch;
  let reads = 0;
  let release: ((value: Response) => void) | undefined;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/workspace")) {
      reads++;
      if (reads === 2)
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      if (reads >= 3)
        return Response.json(
          { error: "Membership suspended" },
          { status: 403 },
        );
    }
    return originalFetch(input, init);
  }) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Refresh workspace" }));
    await waitFor(() => assert(release));
    fireEvent.click(screen.getByRole("button", { name: "Refresh workspace" }));
    await screen.findByText("Membership suspended", { exact: false });
    assert.equal(
      screen.queryByText("Surulere customer", { exact: false }),
      null,
    );
    await act(async () => {
      release!(Response.json(snapshot("branch-1")));
      await Promise.resolve();
    });
    assert.equal(
      screen.queryByText("Surulere customer", { exact: false }),
      null,
    );
    const afterDenial = reads;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2600));
    });
    assert.equal(reads, afterDenial);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("launch readiness remains blocked and reservation cutoffs stay unresolved until explicit review", async () => {
  const { default: LaunchReadiness } =
    await import("../src/mera/workspace/LaunchReadiness");
  const { default: ReservationPolicy } =
    await import("../src/mera/workspace/ReservationPolicy");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({
      checks: [{ id: "owner", label: "Verified owner", status: "blocked" }],
      canPublish: false,
      launchState: "draft",
      paymentProviderState: "blocked",
      simulation: true,
      publicHostingVerified: false,
    })) as any;
  try {
    render(
      React.createElement(LaunchReadiness, {
        base: "/organizations/org/branches/branch",
        settings: {},
        disabled: false,
        save: async () => ({}),
      }),
    );
    await screen.findByText("Verified owner · blocked");
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Publish branch menu",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    assert(
      screen.getByText(/No website deployment or live payment activation/),
    );
    cleanup();
    const calls: any[] = [];
    render(
      React.createElement(ReservationPolicy, {
        base: "/organizations/org/branches/branch",
        policy: {},
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Save reviewed reservation policy",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    fireEvent.click(
      screen.getByLabelText(
        "I reviewed this timing policy and its unresolved cutoffs.",
      ),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Save reviewed reservation policy",
        }),
      ),
    );
    assert.equal(calls[0][2].cancellationCutoffMinutes, null);
    assert.equal(calls[0][2].lateAfterMinutes, null);
    assert.equal(calls[0][2].approved, true);
    assert.equal(calls[0][2].refundHandling, "manual_review");
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("shared menu publication sends explicit branch overrides and a canonical template version", async () => {
  const { default: SharedMenus } =
    await import("../src/mera/workspace/SharedMenus");
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = (async () =>
    Response.json([
      {
        id: "shared",
        name: "Curated menu",
        version: 4,
        items: [
          { code: "TEA", name: "Milk tea", price: 150000, category: "Tea" },
        ],
      },
    ])) as any;
  try {
    render(
      React.createElement(SharedMenus, {
        organizationId: "org",
        base: "/organizations/org/branches/branch",
        products: [],
        disabled: false,
        canPublish: true,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    await screen.findByRole("option", { name: "Curated menu · version 4" });
    fireEvent.change(screen.getByLabelText("Shared template"), {
      target: { value: "shared" },
    });
    fireEvent.change(
      screen.getByLabelText("Override price for Milk tea (naira)"),
      { target: { value: "1750" } },
    );
    fireEvent.change(screen.getByLabelText("Availability for Milk tea"), {
      target: { value: "false" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Apply & publish to this branch" }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/menu/shared-use",
    );
    assert.deepEqual(calls[0][2], {
      menuId: "shared",
      version: 4,
      overrides: [{ code: "TEA", price: 175000, available: false }],
    });
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("a held staff write times out as uncertain and retry preserves its original request key", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  const previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("orders.create");
  let latestDeadline: (() => void) | undefined;
  let heldDeadline: (() => void) | undefined;
  let hold = true;
  const writes: any[] = [];
  globalThis.setTimeout = ((callback: any, delay: any, ...args: any[]) => {
    if (delay === 15000) latestDeadline = () => callback(...args);
    return originalTimeout(callback, delay, ...args);
  }) as any;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        menuVersion: 1,
        products: [
          { id: "tea", name: "Milk tea", price: 150000, available: true },
        ],
      });
    if (String(input).endsWith("/orders") && init.method === "POST") {
      writes.push(JSON.parse(init.body));
      if (hold) {
        heldDeadline = latestDeadline;
        return new Promise<Response>(() => {});
      }
      return Response.json({ id: "order-created" });
    }
    return originalFetch(input, init);
  }) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.change(screen.getByLabelText("Customer display name"), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByLabelText("Quantity of Milk tea"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
    assert(heldDeadline);
    await act(async () => {
      heldDeadline!();
      await Promise.resolve();
    });
    assert(screen.getByText("Submission not confirmed"));
    assert(screen.getByText(/Connection timed out/, { exact: false }));
    hold = false;
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Retry original submission" }),
      );
      await new Promise((resolve) => originalTimeout(resolve, 0));
    });
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0], writes[1]);
    assert.equal(screen.queryByText("Submission not confirmed"), null);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimeout;
    context.organizations[0].permissions = previous;
  }
});

test("scope aborts remain AbortError while a stalled response body receives the full response timeout", async () => {
  const { workspaceApi, WorkspaceError } =
    await import("../src/mera/workspace/api");
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  let deadline: (() => void) | undefined;
  globalThis.setTimeout = ((callback: any, delay: any, ...args: any[]) => {
    if (delay === 15000) deadline = () => callback(...args);
    return originalTimeout(callback, delay, ...args);
  }) as any;
  globalThis.fetch = (async () => ({
    ok: true,
    json: () => new Promise(() => {}),
  })) as any;
  try {
    const controller = new AbortController();
    const externallyAborted = workspaceApi(
      "/held-read",
      "GET",
      undefined,
      controller.signal,
    );
    controller.abort();
    await assert.rejects(
      externallyAborted,
      (error: any) => error.name === "AbortError",
    );
    const stalledBody = workspaceApi("/held-write", "POST", {
      requestKey: "original-key",
    });
    deadline!();
    await assert.rejects(
      stalledBody,
      (error: any) =>
        error instanceof WorkspaceError &&
        error.status === 0 &&
        /timed out/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimeout;
  }
});
