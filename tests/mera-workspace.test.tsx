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
  if (path.endsWith("/help-requests"))
    return Response.json({ requests: [], externalDelivery: false });
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
    const finalPage = screen.getByRole("tab", { name: "Customer requests" });
    assert.equal(finalPage.getAttribute("aria-selected"), "true");
    fireEvent.keyDown(finalPage, { key: "Home" });
    fireEvent.keyDown(ordersTab, { key: "ArrowRight" });
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

test("unpaid item cancellation respects prepared quantities and paid orders stay under review", async () => {
  const { default: ItemCancellation } =
    await import("../src/mera/workspace/ItemCancellation");
  const calls: any[] = [];
  const order = {
    id: "order",
    version: 5,
    status: "preparing",
    paid: 0,
    items: [{ orderLineId: "line", name: "Milk tea", quantity: 3 }],
  };
  try {
    render(
      React.createElement(ItemCancellation, {
        base: "/organizations/org/branches/branch",
        order,
        tickets: [
          {
            orderId: "order",
            items: [{ orderLineId: "line", preparedQuantity: 1 }],
          },
        ],
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    fireEvent.change(screen.getByLabelText("Item to cancel"), {
      target: { value: "line" },
    });
    assert.equal(
      (screen.getByLabelText("Quantity to cancel") as HTMLInputElement).max,
      "2",
    );
    fireEvent.change(screen.getByLabelText("Cancellation reason"), {
      target: { value: "Customer changed their order" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Cancel selected quantity",
          hidden: true,
        }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/orders/order/items/line/cancel",
    );
    assert.equal(calls[0][2].quantity, 1);
    assert.equal(calls[0][2].version, 5);
    assert.match(calls[0][2].requestKey, /^[a-f0-9-]{36}$/);
    cleanup();
    render(
      React.createElement(ItemCancellation, {
        base: "/organizations/org/branches/branch",
        order: { ...order, paid: 1000 },
        tickets: [],
        disabled: false,
        save: async () => {
          throw new Error("Must not submit");
        },
      }),
    );
    assert.equal(
      (
        screen.getByLabelText("Cancellation reason") as HTMLInputElement
      ).closest("fieldset")?.disabled,
      true,
    );
    assert(
      screen.getByText(
        "This order requires financial review or is beyond the supported cancellation stage.",
      ),
    );
  } finally {
    cleanup();
  }
});

test("reconciliation records explicit simulator observations without claiming settlement or confirming orders", async () => {
  const { default: Reconciliation } =
    await import("../src/mera/workspace/Reconciliation");
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = (async () =>
    Response.json({
      simulation: true,
      fundsMoved: false,
      transactions: [],
    })) as any;
  try {
    render(
      React.createElement(Reconciliation, {
        base: "/organizations/org/branches/branch",
        orders: [{ id: "order", reference: "BC1", displayName: "Ada" }],
        demo: true,
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return { event: {}, replayed: false };
        },
      }),
    );
    await screen.findByText(
      "No provider observations recorded for this branch.",
    );
    fireEvent.change(screen.getByLabelText("Simulator transaction ID"), {
      target: { value: "TX-123" },
    });
    fireEvent.change(screen.getByLabelText("Simulator order"), {
      target: { value: "order" },
    });
    fireEvent.change(screen.getByLabelText("Observed amount (naira)"), {
      target: { value: "1500" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Record test observation",
          hidden: true,
        }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/provider-simulator/events",
    );
    assert.equal(calls[0][2].amount, 150000);
    assert.equal(calls[0][2].transactionId, "TX-123");
    assert.equal(calls[0][2].type, "collection_reported");
    assert(calls[0][3].includes("No funds moved"));
    assert.equal(
      calls.some((call) => call[0].includes("/payments")),
      false,
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("cash movement uncertainty locks intent and retries the original idempotency key", async () => {
  const { default: CashMovement } =
    await import("../src/mera/workspace/CashMovement");
  const { WorkspaceError } = await import("../src/mera/workspace/api");
  const calls: any[] = [];
  let fail = true;
  try {
    render(
      React.createElement(CashMovement, {
        base: "/organizations/org/branches/branch",
        shiftId: "shift",
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          if (fail) throw new WorkspaceError("Connection timed out");
          return {};
        },
      }),
    );
    fireEvent.change(screen.getByLabelText("Movement amount (naira)"), {
      target: { value: "500" },
    });
    fireEvent.change(screen.getByLabelText("Movement reason"), {
      target: { value: "Petty cash supplies" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Record cash movement" }),
      ),
    );
    assert.equal(
      (screen.getByLabelText("Movement reason") as HTMLInputElement).closest(
        "fieldset",
      )?.disabled,
      true,
    );
    fail = false;
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Retry original cash movement" }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/shifts/shift/movements",
    );
    assert.deepEqual(calls[0][2], calls[1][2]);
    assert.equal(calls[0][2].amount, 50000);
    assert.match(calls[0][2].requestKey, /^[a-f0-9-]{36}$/);
  } finally {
    cleanup();
  }
});

test("visit table moves cannot select another party and preserve the canonical visit version", async () => {
  const { default: VisitTables } =
    await import("../src/mera/workspace/VisitTables");
  const calls: any[] = [];
  const visit = { id: "visit", tableId: "one", status: "open", version: 4 };
  try {
    render(
      React.createElement(VisitTables, {
        base: "/organizations/org/branches/branch",
        visit,
        tables: [
          { id: "one", name: "Window", capacity: 2, status: "occupied" },
          { id: "two", name: "Garden", capacity: 4, status: "available" },
          {
            id: "three",
            name: "Occupied elsewhere",
            capacity: 4,
            status: "occupied",
          },
        ],
        visits: [visit, { id: "another", tableId: "three", status: "open" }],
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return { tableIds: ["one", "two"], tableId: "one" };
        },
      }),
    );
    assert.equal(
      (
        screen.getByLabelText(
          "Occupied elsewhere · 4 seats · occupied",
        ) as HTMLInputElement
      ).disabled,
      true,
    );
    fireEvent.click(screen.getByLabelText("Garden · 4 seats · available"));
    fireEvent.change(screen.getByLabelText("Table change reason"), {
      target: { value: "Party needs more seats" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Save this party’s tables",
          hidden: true,
        }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/visits/visit/tables",
    );
    assert.deepEqual(calls[0][2].tableIds, ["one", "two"]);
    assert.equal(calls[0][2].version, 4);
    assert.equal(calls[0][2].primaryTableId, "one");
  } finally {
    cleanup();
  }
});

test("paid item cancellation allocates existing approved refund credit without initiating another payout", async () => {
  const { default: ItemCancellation } =
    await import("../src/mera/workspace/ItemCancellation");
  const calls: any[] = [];
  try {
    render(
      React.createElement(ItemCancellation, {
        base: "/organizations/org/branches/branch",
        order: {
          id: "order",
          version: 4,
          status: "accepted",
          paid: 300000,
          items: [
            {
              orderLineId: "line",
              name: "Milk tea",
              quantity: 2,
              unitPrice: 150000,
            },
          ],
        },
        tickets: [],
        refunds: [
          {
            id: "refund",
            orderId: "order",
            reference: "REF1",
            amount: 200000,
            cancellationAppliedAmount: 50000,
          },
        ],
        canRefund: true,
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    fireEvent.change(screen.getByLabelText("Item to cancel"), {
      target: { value: "line" },
    });
    fireEvent.change(screen.getByLabelText("Cancellation reason"), {
      target: { value: "Refund approved for this item" },
    });
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Cancel selected quantity",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    fireEvent.change(
      screen.getByLabelText("Allocate refund REF1 · ₦1,500.00 unused"),
      { target: { value: "1500" } },
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Cancel selected quantity",
          hidden: true,
        }),
      ),
    );
    assert.deepEqual(calls[0][2].refundAllocations, [
      { refundId: "refund", amount: 150000 },
    ]);
    assert.equal(
      calls.some((call) => call[0].endsWith("/refunds")),
      false,
    );
  } finally {
    cleanup();
  }
});

test("configured pricing requires canonical quote review and expired quotes permit a fresh review", async () => {
  const originalFetch = globalThis.fetch;
  const previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("orders.create");
  const writes: any[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        branch: {
          name: "Surulere",
          settings: { pricingPolicy: { enabled: true, version: "p1" } },
        },
        menuVersion: 1,
        products: [
          { id: "tea", name: "Milk tea", price: 150000, available: true },
        ],
      });
    if (String(input).endsWith("/quote"))
      return Response.json({
        id: "canonical-quote",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        subtotal: 150000,
        discount: 0,
        serviceCharge: 15000,
        tax: 12375,
        total: 177375,
        lines: [
          { label: "Service", amount: 15000 },
          { label: "Tax", amount: 12375 },
        ],
        policyVersion: "p1",
      });
    if (String(input).endsWith("/orders") && init.method === "POST") {
      writes.push(JSON.parse(init.body));
      return Response.json(
        { error: "Quote expired; review again", code: "QUOTE_CHANGED" },
        { status: 409 },
      );
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
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Submit order",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Review current order total" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert(screen.getByText("₦1,773.75"));
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Submit order",
        }) as HTMLButtonElement
      ).disabled,
      false,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Submit order" })),
    );
    assert.equal(writes[0].quoteId, "canonical-quote");
    assert.equal(screen.queryByText("Submission not confirmed"), null);
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Submit order",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    assert.equal(
      (
        screen.getByLabelText("Customer display name") as HTMLInputElement
      ).closest("fieldset")?.disabled,
      false,
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    context.organizations[0].permissions = previous;
  }
});

test("shift variance approval is restricted to managers and handover uses authorized branch staff", async () => {
  const { default: ShiftActions } =
    await import("../src/mera/workspace/ShiftActions");
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = (async () =>
    Response.json([{ userId: "receiver", name: "Bola" }])) as any;
  try {
    render(
      React.createElement(ShiftActions, {
        base: "/organizations/org/branches/branch",
        shift: { id: "shift", status: "pending_approval", variance: 5000 },
        canApprove: false,
        disabled: false,
        save: async () => ({}),
      }),
    );
    assert.equal(
      screen.queryByRole("button", { name: "Approve reconciled variance" }),
      null,
    );
    cleanup();
    render(
      React.createElement(ShiftActions, {
        base: "/organizations/org/branches/branch",
        shift: { id: "shift", status: "pending_approval", variance: 5000 },
        canApprove: true,
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    fireEvent.change(screen.getByLabelText("Variance approval reason"), {
      target: { value: "Count verified against till audit" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Approve reconciled variance" }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/shifts/shift/approve",
    );
    cleanup();
    render(
      React.createElement(ShiftActions, {
        base: "/organizations/org/branches/branch",
        shift: { id: "shift", status: "open" },
        canApprove: false,
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    await screen.findByRole("option", { name: "Bola", hidden: true });
    fireEvent.change(screen.getByLabelText("Receiving staff"), {
      target: { value: "receiver" },
    });
    fireEvent.change(screen.getByLabelText("Handover reason"), {
      target: { value: "Evening shift responsibility" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Record shift handover",
          hidden: true,
        }),
      ),
    );
    assert.equal(
      calls[1][0],
      "/organizations/org/branches/branch/shifts/shift/handover",
    );
    assert.equal(calls[1][2].toUserId, "receiver");
    assert.match(calls[1][2].requestKey, /^[a-f0-9-]{36}$/);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("an uncertain financial record blocks edited amounts and other targets until its original retry resolves", async () => {
  attempts = [];
  failPayment = true;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    fireEvent.change(screen.getByLabelText("Order", { exact: true }), {
      target: { value: "order-branch-1" },
    });
    fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
      target: { value: "1000" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Record verified collection" }),
      ),
    );
    await screen.findByText("Financial submission not confirmed");
    assert.equal(attempts.length, 1);
    fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
      target: { value: "500" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Record verified collection" }),
      ),
    );
    assert.equal(attempts.length, 1);
    assert(
      screen.getByText(/Resolve the original uncertain financial submission/, {
        exact: false,
      }),
    );
    failPayment = false;
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Retry original financial submission",
        }),
      ),
    );
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    assert.equal(attempts[1].amount, 100000);
    assert.equal(
      screen.queryByText("Financial submission not confirmed"),
      null,
    );
  } finally {
    cleanup();
    failPayment = true;
  }
});

test("absence from canonical lookup never abandons financial uncertainty; a recorded result resolves without another write", async () => {
  const originalFetch = globalThis.fetch;
  let recorded = false;
  attempts = [];
  failPayment = true;
  globalThis.fetch = (async (input: any, init: any = {}) =>
    String(input).includes("/financial-requests/")
      ? Response.json({
          status: recorded ? "recorded" : "not_found",
          kind: "payment",
          id: recorded ? "payment" : undefined,
        })
      : originalFetch(input, init)) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    fireEvent.change(screen.getByLabelText("Order", { exact: true }), {
      target: { value: "order-branch-1" },
    });
    fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
      target: { value: "1000" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Record verified collection" }),
      ),
    );
    await screen.findByText("Financial submission not confirmed");
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Check original financial record" }),
      ),
    );
    assert(screen.getByText("Financial submission not confirmed"));
    assert(
      screen.getByText(/does not prove it was rejected/, { exact: false }),
    );
    recorded = true;
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Check original financial record" }),
      ),
    );
    assert.equal(
      screen.queryByText("Financial submission not confirmed"),
      null,
    );
    assert.equal(attempts.length, 1);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    failPayment = true;
  }
});

test("financial session recovery validates actor, branch, route and payload allowlist", async () => {
  const journal = await import("../src/mera/workspace/financialJournal");
  const actor = "00000001-0000-4000-8000-000000000001",
    other = "00000002-0000-4000-8000-000000000001",
    org = "10000000-0000-4000-8000-000000000001",
    branch = "20000000-0000-4000-8000-000000000001";
  const intent: any = {
    path: `/organizations/${org}/branches/${branch}/orders/30000000-0000-4000-8000-000000000001/payments`,
    method: "POST",
    body: {
      requestKey: "40000000-0000-4000-8000-000000000001",
      amount: 150000,
      method: "cash",
      reference: "TILL-1",
    },
    signature: "ignored",
  };
  try {
    journal.clearFinancialJournals();
    assert.equal(
      journal.storeFinancialIntent(actor, org, branch, intent),
      true,
    );
    assert.equal(
      journal.restoreFinancialIntent(actor, org, branch)?.restored,
      true,
    );
    assert.deepEqual(
      journal.restoreFinancialIntent(actor, org, branch)?.body,
      intent.body,
    );
    assert.equal(journal.restoreFinancialIntent(other, org, branch), null);
    assert.equal(
      journal.storeFinancialIntent(actor, org, branch, {
        ...intent,
        body: { ...intent.body, token: "do-not-store" },
      }),
      false,
    );
    assert.equal(
      journal.storeFinancialIntent(actor, org, branch, {
        ...intent,
        path: "https://outside.example/payments",
      }),
      false,
    );
    assert.equal(
      journal.storeFinancialIntent(other, org, branch, intent),
      true,
    );
    journal.clearFinancialJournals(actor);
    assert.equal(journal.restoreFinancialIntent(other, org, branch), null);
    assert(journal.restoreFinancialIntent(actor, org, branch));
  } finally {
    journal.clearFinancialJournals();
  }
});

test("sign out warns about unresolved requests and only clears recovery after explicit successful logout", async () => {
  const journal = await import("../src/mera/workspace/financialJournal");
  attempts = [];
  failPayment = true;
  let signedOut = 0;
  try {
    render(
      React.createElement(Workspace, {
        user,
        notify: () => {},
        onLogout: async () => {
          signedOut++;
        },
      }),
    );
    await screen.findByText("Surulere customer", { exact: false });
    assert(screen.getByText("Teni", { exact: true }));
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    fireEvent.change(screen.getByLabelText("Order", { exact: true }), {
      target: { value: "order-branch-1" },
    });
    fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
      target: { value: "1000" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Record verified collection" }),
      ),
    );
    await screen.findByText("Financial submission not confirmed");
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out", exact: true }),
    );
    assert(screen.getByRole("alertdialog"));
    assert.equal(signedOut, 0);
    fireEvent.click(
      screen.getByRole("button", { name: "Keep this session open" }),
    );
    assert.equal(screen.queryByRole("alertdialog"), null);
    assert(screen.getByText("Financial submission not confirmed"));
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out", exact: true }),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Sign out and clear tab recovery" }),
      ),
    );
    assert.equal(signedOut, 1);
    assert.equal(screen.queryByRole("alertdialog"), null);
    assert.equal(
      screen.queryByText("Financial submission not confirmed"),
      null,
    );
  } finally {
    cleanup();
    journal.clearFinancialJournals();
    failPayment = true;
  }
});

test("category reparenting excludes descendants and saves a versioned branch-scoped edit", async () => {
  const { default: Categories } =
    await import("../src/mera/workspace/Categories");
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  const rows = [
    {
      id: "root",
      name: "Drinks",
      parentId: null,
      sortOrder: 0,
      active: true,
      version: 3,
    },
    {
      id: "tea",
      name: "Tea",
      parentId: "root",
      sortOrder: 1,
      active: true,
      version: 1,
    },
  ];
  globalThis.fetch = (async () => Response.json({ categories: rows })) as any;
  try {
    render(
      React.createElement(Categories, {
        base: "/organizations/org/branches/branch",
        disabled: false,
        onCategories: () => {},
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    await screen.findByRole("button", { name: "Edit Tea" });
    fireEvent.click(screen.getByRole("button", { name: "Edit Drinks" }));
    assert.equal(screen.queryByRole("option", { name: "Drinks / Tea" }), null);
    fireEvent.change(screen.getByLabelText("Category name"), {
      target: { value: "Beverages" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Save category changes" }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/categories/root",
    );
    assert.deepEqual(calls[0][2], {
      name: "Beverages",
      parentId: null,
      sortOrder: 0,
      active: true,
      version: 3,
    });
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("only a canonical abandoned fence releases uncertainty and a new explicit entry gets a fresh key", async () => {
  const originalFetch = globalThis.fetch;
  attempts = [];
  failPayment = true;
  const fences: any[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/abandon")) {
      fences.push(JSON.parse(init.body));
      return Response.json({
        status: "abandoned",
        kind: "payment",
        id: "fence",
      });
    }
    return originalFetch(input, init);
  }) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    fireEvent.change(screen.getByLabelText("Order", { exact: true }), {
      target: { value: "order-branch-1" },
    });
    fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
      target: { value: "1000" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Record verified collection" }),
      ),
    );
    await screen.findByText("Financial submission not confirmed");
    fireEvent.change(screen.getByLabelText("Resolution reason"), {
      target: { value: "Till verified no payment was collected" },
    });
    fireEvent.click(
      screen.getByLabelText(
        "I want to prevent the unresolved original request from posting if it is not already recorded.",
      ),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Fence original request or confirm its recorded result",
          hidden: true,
        }),
      ),
    );
    assert.deepEqual(fences, [
      { kind: "payment", reason: "Till verified no payment was collected" },
    ]);
    assert.equal(
      screen.queryByText("Financial submission not confirmed"),
      null,
    );
    failPayment = false;
    fireEvent.change(screen.getByLabelText("Order", { exact: true }), {
      target: { value: "order-branch-1" },
    });
    fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
      target: { value: "1000" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Record verified collection" }),
      ),
    );
    assert.equal(attempts.length, 2);
    assert.notEqual(attempts[0].requestKey, attempts[1].requestKey);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    failPayment = true;
  }
});

test("a tab restores scoped recovery only after the current principal is authenticated and never autosubmits", async () => {
  const journal = await import("../src/mera/workspace/financialJournal");
  const originalFetch = globalThis.fetch;
  const actor = "00000001-0000-4000-8000-000000000001",
    org = "10000000-0000-4000-8000-000000000001",
    branch = "20000000-0000-4000-8000-000000000001";
  let confirm: ((response: Response) => void) | undefined;
  let writes = 0;
  const intent: any = {
    path: `/organizations/${org}/branches/${branch}/orders/30000000-0000-4000-8000-000000000001/payments`,
    method: "POST",
    body: {
      requestKey: "40000000-0000-4000-8000-000000000001",
      amount: 150000,
      method: "cash",
      reference: "AUTH-RECOVERY",
    },
    signature: "ignored",
  };
  journal.clearFinancialJournals();
  assert.equal(journal.storeFinancialIntent(actor, org, branch, intent), true);
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (init.method === "POST") writes++;
    if (String(input).endsWith("/context"))
      return new Promise<Response>((resolve) => {
        confirm = resolve;
      });
    if (String(input).endsWith("/workspace"))
      return Response.json(snapshot("branch-1"));
    return Response.json({});
  }) as any;
  try {
    render(
      React.createElement(Workspace, {
        user: { id: actor, name: "Verified staff" },
        notify: () => {},
      }),
    );
    assert.equal(screen.queryByText("AUTH-RECOVERY"), null);
    assert.equal(
      screen.queryByText("Restored unconfirmed financial submission"),
      null,
    );
    assert(confirm);
    await act(async () =>
      confirm!(
        Response.json({
          user: { id: actor, name: "Verified staff" },
          organizations: [
            {
              id: org,
              name: "Bing Chun",
              role: "cashier",
              permissions: ["orders.view", "payments.record"],
              branchIds: [branch],
              branches: [{ id: branch, name: "Surulere" }],
            },
          ],
        }),
      ),
    );
    await screen.findByText("Restored unconfirmed financial submission");
    assert(screen.getByText("AUTH-RECOVERY"));
    assert.equal(writes, 0);
    window.dispatchEvent(new window.Event("mera:logout"));
    assert.equal(journal.restoreFinancialIntent(actor, org, branch), null);
  } finally {
    cleanup();
    journal.clearFinancialJournals();
    globalThis.fetch = originalFetch;
  }
});

test("bulk availability uses one audited scoped operation and alerts remain canonical", async () => {
  const { default: CatalogOperations } =
    await import("../src/mera/workspace/CatalogOperations");
  const calls: any[] = [];
  try {
    render(
      React.createElement(CatalogOperations, {
        base: "/organizations/org/branches/branch",
        products: [{ id: "tea", name: "Milk tea", available: true }],
        alerts: [
          {
            productId: "tea",
            variantId: "large",
            name: "Milk tea",
            size: "Large",
            stock: 2,
            threshold: 3,
          },
        ],
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    assert(screen.getByText("2 left · threshold 3"));
    fireEvent.click(screen.getByLabelText("Milk tea · available"));
    fireEvent.change(screen.getByLabelText("Bulk availability reason"), {
      target: { value: "Milk unavailable during restocking" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Update selected availability",
          hidden: true,
        }),
      ),
    );
    assert.deepEqual(calls[0].slice(0, 3), [
      "/organizations/org/branches/branch/products/availability",
      "POST",
      {
        productIds: ["tea"],
        available: false,
        reason: "Milk unavailable during restocking",
      },
    ]);
    assert.equal(calls.length, 1);
  } finally {
    cleanup();
  }
});

test("priced item cancellation reviews original-policy totals then records only an explicitly verified manual refund", async () => {
  const { default: ItemCancellation } =
    await import("../src/mera/workspace/ItemCancellation");
  const calls: any[] = [];
  const quote = {
    id: "review",
    previousTotal: 360000,
    newTotal: 180000,
    creditRequired: 180000,
    refundTaxAmount: 30000,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  };
  try {
    render(
      React.createElement(ItemCancellation, {
        base: "/organizations/org/branches/branch",
        order: {
          id: "order",
          version: 4,
          status: "accepted",
          paid: 360000,
          total: 360000,
          pricing: { policyVersion: "p1", policySnapshot: { enabled: true } },
          items: [
            {
              orderLineId: "line",
              name: "Milk tea",
              quantity: 2,
              unitPrice: 150000,
            },
          ],
        },
        tickets: [],
        refunds: [],
        canRefund: true,
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return args[0].endsWith("cancel-quote")
            ? quote
            : args[0].endsWith("/refunds")
              ? { id: "refund", amount: 180000 }
              : {};
        },
      }),
    );
    fireEvent.change(screen.getByLabelText("Item to cancel"), {
      target: { value: "line" },
    });
    fireEvent.change(screen.getByLabelText("Cancellation reason"), {
      target: { value: "Customer cancelled one unprepared drink" },
    });
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Cancel selected quantity",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Review cancellation total",
          hidden: true,
        }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/orders/order/items/line/cancel-quote",
    );
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Record verified refund for this cancellation",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    fireEvent.change(
      screen.getByLabelText("Reviewed cancellation refund method"),
      { target: { value: "cash" } },
    );
    fireEvent.change(
      screen.getByLabelText("Reviewed cancellation refund reason"),
      { target: { value: "Cash already returned and verified" } },
    );
    fireEvent.click(
      screen.getByLabelText(
        "I verified this refund was already paid manually.",
      ),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Record verified refund for this cancellation",
          hidden: true,
        }),
      ),
    );
    assert.equal(calls[1][2].amount, 180000);
    assert.equal(calls[1][2].cancellationQuoteId, "review");
    assert.equal(calls[1][2].method, "cash");
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Cancel selected quantity",
          hidden: true,
        }),
      ),
    );
    assert.equal(calls[2][2].cancellationQuoteId, "review");
    assert.deepEqual(calls[2][2].refundAllocations, [
      { refundId: "refund", amount: 180000 },
    ]);
  } finally {
    cleanup();
  }
});
