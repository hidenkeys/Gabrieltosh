import { chooseField, choiceValue } from "./choice-field-helpers";
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
const { render, screen, fireEvent, waitFor, cleanup, act, within } =
  await import("@testing-library/react");
function chooseReference(label: string) {
  const input = screen.getByRole("combobox", { name: label, hidden: true });
  fireEvent.focus(input);
  const list = screen.getByRole("listbox", {
    name: `${label} options`,
    hidden: true,
  });
  fireEvent.click(
    list.querySelector('[role="option"]:not([aria-disabled="true"])')!,
  );
}

function fillPresetDetails(label: string, value: string) {
  fireEvent.click(
    within(screen.getByRole("group", { name: label, hidden: true })).getByRole(
      "radio",
      { name: "Other", hidden: true },
    ),
  );
  fireEvent.change(screen.getByLabelText(`${label} details`), {
    target: { value },
  });
}

function revealWorkspaceMore() {
  const more = screen.queryByRole("button", { name: "More", exact: true });
  if (more?.getAttribute("aria-expanded") === "false") fireEvent.click(more);
}
async function findRareWorkspaceTab(name: string) {
  await screen.findByRole("button", { name: "More", exact: true });
  revealWorkspaceMore();
  return screen.findByRole("tab", { name, exact: true });
}
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
        {
          id: "branch-1",
          name: "Surulere",
          settings: { capabilities: ["table_service", "reservations"] },
        },
        {
          id: "branch-2",
          name: "Ikeja",
          settings: { capabilities: ["table_service", "reservations"] },
        },
      ],
    },
  ],
};
const snapshot = (branch: string) => ({
  branch: { name: branch === "branch-1" ? "Surulere" : "Ikeja" },
  products: [],
  counterProducts: [],
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
  if (path.endsWith("/support-cases"))
    return Response.json({ cases: [], externalDelivery: false });
  if (path.endsWith("/readiness"))
    return Response.json({
      checks: [],
      canPublish: false,
      launchState: "draft",
      paymentProviderState: "blocked",
      simulation: true,
      publicHostingVerified: false,
    });
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
  chooseField(screen, fireEvent, "Location", "branch-2");
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
  fireEvent.focus(screen.getByRole("combobox", { name: "Order", exact: true }));
  fireEvent.change(
    screen.getByRole("combobox", { name: "Order", exact: true }),
    { target: { value: "Surulere" } },
  );
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Order", exact: true }),
    { key: "Enter" },
  );
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
    revealWorkspaceMore();
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
    fireEvent.click(screen.getByText("Record money returned", { exact: true }));
    const method = screen.getByRole("radio", {
      name: "External transfer returned",
    }) as HTMLInputElement;
    assert.equal(method.checked, false);
    assert.ok(
      screen
        .getByRole("group", { name: "Refund payout method" })
        .querySelector("input:required"),
    );
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Refund order", exact: true }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Refund order", exact: true }),
      { target: { value: "Surulere" } },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Refund order", exact: true }),
      { key: "Enter" },
    );
    fireEvent.change(screen.getByLabelText("Amount returned (naira)"), {
      target: { value: "100" },
    });
    fireEvent.click(
      screen
        .getByRole("group", { name: "Refund reason" })
        .querySelector('input[value="__other"]')!,
    );
    fireEvent.change(screen.getByLabelText("Refund reason details"), {
      target: { value: "Returned via bank" },
    });
    fireEvent.click(method);
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
  chooseReference("Bill to manage");
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
    chooseField(screen, fireEvent, "Location", "branch-2");
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
  fireEvent.focus(screen.getByRole("combobox", { name: "Bill to manage" }));
  assert(screen.getByRole("option", { name: /Credit held ₦1,000/ }));
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
        counterProducts: [
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
      if (submitted.length === 2)
        return Response.json(
          { error: "Please wait before retrying." },
          { status: 429 },
        );
      return Response.json({ id: "created" });
    }
    return originalFetch(input, init);
  }) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByRole("tab", { name: "Point of sale" });
    fireEvent.click(screen.getByRole("tab", { name: "Point of sale" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Milk tea to order" }),
    );
    fireEvent.click(screen.getByText("Customer & order note", { exact: true }));
    fireEvent.change(screen.getByLabelText("Customer name (optional)"), {
      target: { value: "Ada" },
    });
    fireEvent.click(
      screen.getByRole("radio", { name: "Table service", exact: true }),
    );
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Open table visit", exact: true }),
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Open table visit", exact: true }),
      { key: "ArrowDown" },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Open table visit", exact: true }),
      { key: "Enter" },
    );
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
        screen.getByLabelText("Customer name (optional)") as HTMLInputElement
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
    assert.ok(screen.getByText("Submission not confirmed"));
    assert.equal(
      (
        screen.getByLabelText("Customer name (optional)") as HTMLInputElement
      ).closest("fieldset")?.disabled,
      true,
    );
    assert.equal(submitted.length, 2);
    assert.deepEqual(submitted[0], submitted[1]);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Retry original submission" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(screen.queryByText("Submission not confirmed"), null);
    assert.equal(submitted.length, 3);
    assert.deepEqual(submitted[0], submitted[2]);
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
    assert.deepEqual(calls.find((call) => call.body)?.body, { kind: "branch" });
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
    chooseField(screen, fireEvent, "Case status", "resolved");
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
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Prepare one more Milk tea on bar",
        }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/tickets/bar-ticket/items/tea-line",
    );
    assert.deepEqual(calls[0][2], { preparedQuantity: 2, version: 7 });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Mark ready" })),
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
    chooseField(screen, fireEvent, "Location", "branch-2");
    await screen.findByText("Ikeja customer", { exact: false });
    deferOldRefresh = false;
    chooseField(screen, fireEvent, "Location", "branch-1");
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
    ordersTab.focus();
    fireEvent.keyDown(ordersTab, { key: "End" });
    const transactions = screen.getByRole("tab", { name: "Transactions" });
    assert.equal(document.activeElement, transactions);
    fireEvent.click(transactions);
    assert.equal(transactions.getAttribute("aria-selected"), "true");
    fireEvent.keyDown(transactions, { key: "Home" });
    assert.equal(document.activeElement, ordersTab);
    fireEvent.click(ordersTab);
    fireEvent.keyDown(ordersTab, { key: "ArrowDown" });
    const customerRequests = screen.getByRole("tab", {
      name: "Customer requests",
    });
    assert.equal(document.activeElement, customerRequests);
    assert.equal(ordersTab.getAttribute("aria-selected"), "true");
    fireEvent.click(customerRequests);
    assert.equal(customerRequests.getAttribute("aria-selected"), "true");
    fireEvent.keyDown(customerRequests, { key: "ArrowDown" });
    assert.equal(document.activeElement, transactions);
    fireEvent.click(transactions);
    assert.equal(transactions.getAttribute("aria-selected"), "true");
    assert.equal(transactions.tabIndex, 0);
    assert.equal(document.activeElement, transactions);
    fireEvent.click(ordersTab);
    assert.equal(ordersTab.getAttribute("aria-selected"), "true");
    assert.equal(screen.queryByLabelText("Workspace page"), null);
    assert.equal(
      screen.getAllByRole("navigation", { name: "Organization workspace" })
        .length,
      1,
    );
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
  globalThis.fetch = (async (input: any) => {
    const path = String(input);
    if (path.includes("-attempts/")) {
      const call = calls.at(-1),
        { requestKey, ...intent } = call[2];
      const invitation = path.includes("/invitations/");
      const operation = invitation ? "invitation_create" : "role_update";
      const targetId = invitation ? null : "custom-role";
      return Response.json({
        status: "recorded",
        requestKey,
        actorId: "current-session",
        organizationId: "org",
        operation,
        targetId,
        resultBasis: "recorded_operation_snapshot",
        operationRecord: {
          id: "operation-" + calls.length,
          requestKey,
          actorId: "current-session",
          operation,
          targetId,
          intent,
        },
        result: invitation
          ? {
              id: "invitation",
              ...intent,
              delivery: "not_sent",
              developmentTokenRecoverable: false,
            }
          : { id: targetId, ...intent, version: intent.version + 1 },
      });
    }
    return Response.json(
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
    );
  }) as any;
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
    await screen.findByRole("radio", { name: "Host" });
    assert.equal(screen.queryByRole("radio", { name: "Owner" }), null);
    assert.equal(
      screen.queryByRole("switch", { name: "Manage subscription billing" }),
      null,
    );
    fireEvent.change(screen.getByLabelText("Staff email"), {
      target: { value: "staff@example.com" },
    });
    chooseField(screen, fireEvent, "Invitation role", "custom-role");
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Create branch invitation" }),
      ),
    );
    assert.match(calls[0][2].requestKey, /^[a-f0-9-]{36}$/i);
    const { requestKey: invitationKey, ...invitationIntent } = calls[0][2];
    assert.deepEqual(invitationIntent, {
      email: "staff@example.com",
      role: "custom-role",
      branchIds: ["branch"],
    });
    assert(screen.getByText("Delivery: Not sent"));
    fireEvent.click(screen.getByRole("button", { name: "Edit role" }));
    assert(
      (
        screen
          .getByRole("button", { name: "Save custom role" })
          .closest("details") as HTMLDetailsElement
      ).open,
    );
    fireEvent.change(screen.getByLabelText("Role name"), {
      target: { value: "Evening host" },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Save custom role" })),
    );
    assert.equal(calls[1][0], "/organizations/org/roles/custom-role");
    assert.match(calls[1][2].requestKey, /^[a-f0-9-]{36}$/i);
    assert.notEqual(calls[1][2].requestKey, invitationKey);
    const { requestKey: roleKey, ...roleIntent } = calls[1][2];
    assert.deepEqual(roleIntent, {
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
    fireEvent.click(screen.getByRole("button", { name: "3. Hours" }));
    assert.equal(
      (screen.getByLabelText("Window 1 starts") as HTMLInputElement).value,
      "08:00",
    );
    assert.equal(
      (screen.getByLabelText("Window 1 ends") as HTMLInputElement).value,
      "22:00",
    );
    fireEvent.change(screen.getByLabelText("Window 1 starts"), {
      target: { value: "10:00" },
    });
    fireEvent.change(screen.getByLabelText("Window 1 ends"), {
      target: { value: "22:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "6. Review" }));
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
        "I reviewed this timing policy and any cutoffs not yet set.",
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
        categories: [
          {
            id: "destination-category",
            name: "Local tea",
            parentId: null,
            active: true,
          },
        ],
        disabled: false,
        canPublish: true,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    await screen.findByRole("combobox", { name: "Shared template" });
    await waitFor(() => {
      fireEvent.focus(
        screen.getByRole("combobox", { name: "Shared template" }),
      );
      assert(screen.getByRole("option", { name: "Curated menu · version 4" }));
    });
    chooseField(screen, fireEvent, "Shared template", "shared");
    fireEvent.change(
      screen.getByLabelText("Override price for Milk tea (naira)"),
      { target: { value: "1750" } },
    );
    chooseField(screen, fireEvent, "Availability for Milk tea", "false");
    chooseField(
      screen,
      fireEvent,
      "Destination category for Milk tea",
      "destination-category",
    );
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
      overrides: [
        {
          code: "TEA",
          price: 175000,
          available: false,
          categoryId: "destination-category",
        },
      ],
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
        counterProducts: [
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
    await screen.findByRole("tab", { name: "Point of sale" });
    fireEvent.click(screen.getByRole("tab", { name: "Point of sale" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Milk tea to order" }),
    );
    fireEvent.click(screen.getByText("Customer & order note", { exact: true }));
    fireEvent.change(screen.getByLabelText("Customer name (optional)"), {
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
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Item to cancel", hidden: true }),
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Item to cancel", hidden: true }),
      { key: "ArrowDown" },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Item to cancel", hidden: true }),
      { key: "Enter" },
    );
    assert.equal(
      (screen.getByLabelText("Quantity to cancel") as HTMLInputElement).max,
      "2",
    );
    fillPresetDetails("Cancellation reason", "Customer changed their order");
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
        screen
          .getByRole("group", { name: "Cancellation reason", hidden: true })
          .closest("form")
          ?.querySelector("fieldset") as HTMLFieldSetElement
      )?.disabled,
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
    chooseReference("Simulator order");
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
    fillPresetDetails("Movement reason", "Petty cash supplies");
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Record cash movement" }),
      ),
    );
    assert.equal(
      (
        screen
          .getByLabelText("Movement reason details")
          .closest("form")
          ?.querySelector("fieldset") as HTMLFieldSetElement
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
        screen.getByRole("checkbox", {
          name: /Occupied elsewhere.*4 seats.*Another party/,
        }) as HTMLInputElement
      ).disabled,
      true,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Garden.*4 seats.*Available/ }),
    );
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
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Item to cancel", hidden: true }),
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Item to cancel", hidden: true }),
      { key: "ArrowDown" },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Item to cancel", hidden: true }),
      { key: "Enter" },
    );
    fillPresetDetails("Cancellation reason", "Refund approved for this item");
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
        counterProducts: [
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
    await screen.findByRole("tab", { name: "Point of sale" });
    fireEvent.click(screen.getByRole("tab", { name: "Point of sale" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Milk tea to order" }),
    );
    fireEvent.click(screen.getByText("Customer & order note", { exact: true }));
    fireEvent.change(screen.getByLabelText("Customer name (optional)"), {
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
        screen.getByLabelText("Customer name (optional)") as HTMLInputElement
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
    fillPresetDetails(
      "Variance approval reason",
      "Count verified against till audit",
    );
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
    await waitFor(() =>
      assert.equal(!!screen.queryByText("Loading receiving staff…"), false),
    );
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Receiving staff", hidden: true }),
    );
    await screen.findByRole("option", { name: "Bola", hidden: true });
    chooseReference("Receiving staff");
    fillPresetDetails("Handover reason", "Evening shift responsibility");
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
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Order", exact: true }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { target: { value: "Surulere" } },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { key: "Enter" },
    );
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
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Order", exact: true }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { target: { value: "Surulere" } },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { key: "Enter" },
    );
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
    assert(screen.getByLabelText("Account for Teni"));
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Order", exact: true }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { target: { value: "Surulere" } },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { key: "Enter" },
    );
    fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
      target: { value: "1000" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Record verified collection" }),
      ),
    );
    await screen.findByText("Financial submission not confirmed");
    fireEvent.click(screen.getByLabelText("Account for Teni"));
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
    fireEvent.click(screen.getByLabelText("Account for Teni"));
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out", exact: true }),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Sign out and clear private details",
        }),
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
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Order", exact: true }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { target: { value: "Surulere" } },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { key: "Enter" },
    );
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
          name: "Resolve original request",
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
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Order", exact: true }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { target: { value: "Surulere" } },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { key: "Enter" },
    );
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
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Item to cancel", hidden: true }),
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Item to cancel", hidden: true }),
      { key: "ArrowDown" },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Item to cancel", hidden: true }),
      { key: "Enter" },
    );
    fillPresetDetails(
      "Cancellation reason",
      "Customer cancelled one unprepared drink",
    );
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
    fireEvent.click(
      screen.getByRole("radio", { name: "Cash returned", hidden: true }),
    );
    fillPresetDetails(
      "Reviewed cancellation refund reason",
      "Cash already returned and verified",
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

test("structured customization edits preserve stable IDs and convert extra prices from naira", async () => {
  const { default: ModifierGroupsEditor } =
    await import("../src/mera/workspace/ModifierGroupsEditor");
  let latest: any[] = [];
  function Editor() {
    const [groups, setGroups] = React.useState([
      {
        id: "toppings",
        name: "Toppings",
        min: 0,
        max: 3,
        options: [{ id: "pearls", name: "Pearls", price: 50000 }],
      },
    ]);
    return React.createElement(ModifierGroupsEditor, {
      value: groups,
      onChange: (next: any[]) => {
        latest = next;
        setGroups(next);
      },
    });
  }
  try {
    render(React.createElement(Editor));
    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "Extras" },
    });
    fireEvent.change(screen.getByLabelText("Option name"), {
      target: { value: "Brown sugar pearls" },
    });
    fireEvent.change(screen.getByLabelText("Option extra price (naira)"), {
      target: { value: "650.50" },
    });
    assert.equal(latest[0].id, "toppings");
    assert.equal(latest[0].options[0].id, "pearls");
    assert.equal(latest[0].options[0].price, 65050);
    assert.equal(
      (
        screen.getByLabelText("Maximum choices") as HTMLInputElement
      ).checkValidity(),
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add option to Extras" }),
    );
    assert.equal(latest[0].options.length, 2);
    assert.notEqual(latest[0].options[1].id, "pearls");
    assert.match(latest[0].options[1].id, /^[a-f0-9-]{36}$/);
    fireEvent.change(screen.getByLabelText("Maximum choices"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove choice 1" }));
    assert.equal(latest[0].options.length, 1);
    assert.equal(latest[0].max, 1);
    assert.notEqual(latest[0].options[0].id, "pearls");
  } finally {
    cleanup();
  }
});

test("imported orders are fetched from bounded history and remain outside preparation and financial pickers", async () => {
  const originalFetch = globalThis.fetch;
  const previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push(
    "orders.prepare",
    "orders.fulfill",
    "orders.assign",
  );
  const historyQueries: string[] = [];
  const imported = {
    id: "old",
    displayName: "Old source order",
    status: "submitted",
    legacyStatus: "packed",
    historicalReadOnly: true,
    historicalTaxStatus: "unresolved",
    version: 1,
    total: 100000,
    items: [],
  };
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = new URL(String(input), "http://localhost:3003");
    if (url.pathname.endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        history: { bounded: true, recentOrderLimit: 200 },
        tickets: [],
      });
    if (url.pathname.endsWith("/orders")) {
      historyQueries.push(url.search);
      return Response.json({
        orders:
          url.searchParams.get("historical") === "only"
            ? [imported]
            : snapshot("branch-1").orders,
        hasMore: false,
        nextCursor: null,
        pageSize: 50,
      });
    }
    if (url.pathname.endsWith("/orders/old")) return Response.json(imported);
    return originalFetch(input, init);
  }) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    assert.equal(
      screen.queryByText("Old source order", { exact: false }),
      null,
    );
    assert(screen.getByText(/Active and recent orders appear here/));
    fireEvent.click(screen.getByText("Browse full order history"));
    const history = await screen.findByRole("region", {
      name: "Order history",
    });
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole("group", { name: "History records" })
          .querySelector("input")!
          .matches(":disabled"),
        false,
      ),
    );
    chooseField(screen, fireEvent, "History records", "only");
    fireEvent.click(
      screen.getByRole("button", { name: "Apply history filters" }),
    );
    await within(history).findByText("Old source order", { exact: false });
    assert(historyQueries.some((query) => query.includes("historical=only")));
    assert(within(history).getByText("Imported source history · read only"));
    assert.equal(
      within(history).queryByRole("button", { name: "Assign to me" }),
      null,
    );
    assert.equal(
      within(history).queryByRole("button", { name: "Mark accepted" }),
      null,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Preparation" }));
    assert.equal(
      screen.queryByText("Old source order", { exact: false }),
      null,
    );
    const preparation = screen.getByRole("region", {
      name: "Station preparation",
    });
    assert(
      within(preparation).getByText("No preparation tickets for this branch."),
    );
    assert.equal(
      screen.queryByText("Surulere customer", { exact: false }),
      null,
    );
    assert.equal(
      screen.queryByRole("heading", {
        name: "Every order, with responsibility",
      }),
      null,
    );
    assert.equal(
      screen.queryByRole("heading", { name: "Kitchen & bar handoffs" }),
      null,
    );
    assert.equal(
      screen.queryByRole("button", { name: "Record verified collection" }),
      null,
    );
    assert.equal(
      screen.queryByRole("button", { name: "Record authorized refund" }),
      null,
    );
    assert.equal(screen.queryByLabelText("Amount received (naira)"), null);
    assert.equal(screen.queryByText("Browse full order history"), null);
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    assert.equal(
      screen.queryByRole("option", { name: /Old source order/ }),
      null,
    );
  } finally {
    cleanup();
    context.organizations[0].permissions = previous;
    globalThis.fetch = originalFetch;
  }
});

test("initial access denial stops loading without showing an unauthenticated organization-creation form", async () => {
  const originalFetch = globalThis.fetch;
  let contextReads = 0;
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("/context")) {
      contextReads++;
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    }
    return Response.json({});
  }) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Workspace access unavailable");
    assert.equal(
      screen.queryByRole("button", { name: "Create organization" }),
      null,
    );
    assert.equal(
      screen.queryByText("Opening your organization workspace…"),
      null,
    );
    assert(contextReads <= 2);
    assert(screen.getByRole("button", { name: "Refresh workspace access" }));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("debt write-offs are explicit non-cash actions with canonical balance bounds", async () => {
  const { default: WriteOff } = await import("../src/mera/workspace/WriteOff");
  const calls: any[] = [];
  try {
    render(
      React.createElement(WriteOff, {
        base: "/organizations/org/branches/branch",
        order: {
          id: "order",
          status: "collected",
          version: 3,
          total: 200000,
          paid: 50000,
          outstandingBalance: 150000,
          writtenOff: 0,
        },
        disabled: false,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    fireEvent.change(screen.getByLabelText("Debt write-off amount (naira)"), {
      target: { value: "1500.01" },
    });
    assert.match(
      (
        screen.getByLabelText(
          "Debt write-off amount (naira)",
        ) as HTMLInputElement
      ).validationMessage,
      /no more than 1500/,
    );
    fireEvent.change(screen.getByLabelText("Debt write-off amount (naira)"), {
      target: { value: "1500" },
    });
    fillPresetDetails(
      "Debt write-off reason",
      "Manager reviewed uncollectible balance",
    );
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Record approved debt write-off",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    fireEvent.click(
      screen.getByLabelText(
        "I approve recording this amount as a non-cash debt expense.",
      ),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Record approved debt write-off",
          hidden: true,
        }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/orders/order/writeoffs",
    );
    assert.equal(calls[0][2].amount, 150000);
    assert.equal(calls[0][2].version, 3);
    assert.equal(
      calls.some((call) => /\/(payments|refunds)$/.test(call[0])),
      false,
    );
    cleanup();
    render(
      React.createElement(WriteOff, {
        base: "/organizations/org/branches/branch",
        order: { id: "old", status: "collected", historicalReadOnly: true },
        disabled: false,
        save: async () => ({}),
      }),
    );
    assert.equal(screen.queryByText("Review outstanding debt"), null);
  } finally {
    cleanup();
  }
});

test("Seat party expands the collapsed visit form, preselects its table, focuses the name and submits the party size and terms", async () => {
  const originalFetch = globalThis.fetch;
  const previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("tables.manage");
  const opened: any[] = [];
  let visit: any = null;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        branch: {
          name: "Surulere",
          settings: {
            minimumSpendPolicy: {
              enabled: true,
              version: "minimum-1",
              amount: 100000,
              disclosure:
                "This party commits to a net paid bill of at least one thousand naira.",
            },
          },
        },
        tables: [
          {
            id: "table-1",
            name: "Window",
            capacity: 4,
            status: visit ? "occupied" : "available",
          },
        ],
        visits: visit ? [visit] : [{ id: "another-visit", tableId: "another-table", displayName: "Existing party", status: "open" }],
      });
    if (String(input).endsWith("/visits") && init.method === "POST") {
      opened.push(JSON.parse(init.body));
      visit = {
        id: "visit-new",
        displayName: "Ada",
        tableId: "table-1",
        status: "open",
        version: 1,
      };
      return Response.json({ ...visit, joiningCode: "PRIVATE123" });
    }
    return originalFetch(input, init);
  }) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.click(screen.getByRole("tab", { name: "Tables & visits" }));
    const visitForm = screen.getByRole("form", { name: "Open table visit", hidden: true });
    const disclosure = visitForm.closest("details") as HTMLDetailsElement;
    assert.equal(disclosure.open, false);
    fireEvent.click(screen.getByRole("button", { name: "Seat party", exact: true }));
    assert.equal(disclosure.open, true);
    assert.equal((screen.getByRole("combobox", { name: "Table", exact: true }) as HTMLInputElement).value, "Window");
    assert.equal(document.activeElement, screen.getByLabelText("Guest display name"));
    assert.equal(opened.length, 0, "Choosing a table must not create a visit before submission");
    assert.equal((screen.getByRole("spinbutton", { name: "Party size" }) as HTMLInputElement).value, "2");
    fireEvent.click(screen.getByRole("button", { name: "Increase Party size" }));
    assert.equal((screen.getByRole("spinbutton", { name: "Party size" }) as HTMLInputElement).value, "3");
    fireEvent.change(screen.getByLabelText("Guest display name"), {
      target: { value: "Ada" },
    });
    assert.equal(
      (
        screen.getByLabelText(
          "The customer reviewed and accepted these disclosed minimum-spend terms.",
        ) as HTMLInputElement
      ).checked,
      false,
    );
    fireEvent.click(
      screen.getByLabelText(
        "The customer reviewed and accepted these disclosed minimum-spend terms.",
      ),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Open visit" })),
    );
    assert.equal(opened[0].partySize, 3);
    assert.equal(opened[0].minimumSpendAcknowledged, true);
    assert.equal(opened[0].minimumSpendPolicyVersion, "minimum-1");
    assert(screen.getByText("Private access · Ada"));
    assert.equal(screen.queryByText("PRIVATE123"), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Show private joining code" }),
    );
    assert(screen.getByText("PRIVATE123"));
    for (let index = 0; index < sessionStorage.length; index++) {
      assert(
        !String(sessionStorage.getItem(sessionStorage.key(index)!)).includes(
          "PRIVATE123",
        ),
      );
    }
    chooseField(screen, fireEvent, "Location", "branch-2");
    await waitFor(() => assert.equal(screen.queryByText("PRIVATE123"), null));
    assert.equal(screen.queryByText("Private access · Ada"), null);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    context.organizations[0].permissions = previous;
  }
});

test("reservation seating passes the fresh joining code to the scoped private-panel callback", async () => {
  const { default: ReservationSettlement } =
    await import("../src/mera/workspace/ReservationSettlement");
  const captured: any[] = [];
  try {
    render(
      React.createElement(ReservationSettlement, {
        reservation: {
          id: "reservation",
          status: "confirmed",
          displayName: "Ada",
          depositAmount: 0,
        },
        tables: [{ id: "window", name: "Window", capacity: 4 }],
        base: "/organizations/org/branches/branch",
        disabled: false,
        canPay: false,
        onVisitOpened: (visit) => captured.push(visit),
        save: async () => ({
          visit: {
            id: "visit",
            displayName: "Ada",
            tableId: "window",
            joiningCode: "PRIVATE456",
          },
        }),
      }),
    );
    chooseReference("Seat at table");
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Seat reservation", hidden: true }),
      ),
    );
    assert.equal(captured[0].id, "visit");
    assert.equal(captured[0].joiningCode, "PRIVATE456");
    assert.equal(screen.queryByText("PRIVATE456"), null);
  } finally {
    cleanup();
  }
});

test("minimum-spend waiver reviews a canonical commitment shortfall without creating a payment or fee", async () => {
  const { default: VisitMinimumSpend } =
    await import("../src/mera/workspace/VisitMinimumSpend");
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  let waived = false;
  globalThis.fetch = (async () =>
    Response.json({
      version: 3,
      policy: { version: "original-policy" },
      summary: {
        enabled: true,
        target: 100000,
        netPaid: 40000,
        waived: waived ? 60000 : 0,
        shortfall: waived ? 0 : 60000,
        basis: "net_paid_bill",
        policyVersion: "original-policy",
        disclosure: "Original disclosed visit terms",
      },
    })) as any;
  try {
    render(
      React.createElement(VisitMinimumSpend, {
        base: "/organizations/org/branches/branch",
        visitId: "visit",
        updatedKey: "1",
        disabled: false,
        canWaive: true,
        save: async (...args: any[]) => {
          calls.push(args);
          waived = true;
          return {};
        },
      }),
    );
    await screen.findByText("Commitment shortfall: ₦600.00");
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Waive current commitment shortfall",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    fireEvent.change(screen.getByLabelText("Minimum-spend waiver reason"), {
      target: { value: "Manager approved the party exception" },
    });
    fireEvent.click(
      screen.getByLabelText(
        "I approve waiving the current disclosed commitment shortfall.",
      ),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Waive current commitment shortfall",
          hidden: true,
        }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/visits/visit/minimum-spend/waive",
    );
    assert.equal(calls[0][2].version, 3);
    assert.equal(calls[0][2].expectedShortfall, 60000);
    assert.match(calls[0][2].requestKey, /^[a-f0-9-]{36}$/);
    assert.equal(
      calls.some((call) => /\/(payments|refunds|writeoffs)$/.test(call[0])),
      false,
    );
    assert(screen.getByText("Commitment shortfall: ₦0.00"));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("private code recovery clears an old displayed code before an uncertain rotation and never journals it", async () => {
  const originalFetch = globalThis.fetch;
  const previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("tables.manage");
  const requests: any[] = [];
  let version = 1;
  let complete: ((response: Response) => void) | undefined;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        tables: [
          { id: "table", name: "Window", status: "occupied", capacity: 4 },
        ],
        visits: [
          {
            id: "visit",
            tableId: "table",
            displayName: "Ada",
            status: "open",
            version,
          },
        ],
      });
    if (String(input).endsWith("/joining-code")) {
      requests.push(JSON.parse(init.body));
      version++;
      if (requests.length === 1)
        return new Promise<Response>((resolve) => {
          complete = resolve;
        });
      throw new TypeError("Network lost after server rotation");
    }
    return originalFetch(input, init);
  }) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.click(screen.getByRole("tab", { name: "Tables & visits" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Private access for this party" }),
    );
    fireEvent.change(screen.getByLabelText("Joining-code replacement reason"), {
      target: { value: "Recover private party access" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Generate replacement private code",
        hidden: true,
      }),
    );
    assert(complete);
    await act(async () =>
      complete!(
        Response.json({
          visitId: "visit",
          version: 2,
          joiningCode: "CURRENT123",
          existingGuestSessionsRetained: true,
        }),
      ),
    );
    assert.equal(screen.queryByText("CURRENT123"), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Show private joining code" }),
    );
    assert(screen.getByText("CURRENT123"));
    fireEvent.change(screen.getByLabelText("Joining-code replacement reason"), {
      target: { value: "Rotate after party sharing review" },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Generate replacement private code",
          hidden: true,
        }),
      ),
    );
    assert.equal(screen.queryByText("CURRENT123"), null);
    assert(screen.getByText(/No current joining code is confirmed/));
    assert.deepEqual(
      requests.map((request) => request.version),
      [1, 2],
    );
    assert.equal(requests.length, 2);
    for (let index = 0; index < sessionStorage.length; index++) {
      assert(
        !String(sessionStorage.getItem(sessionStorage.key(index)!)).includes(
          "CURRENT123",
        ),
      );
    }
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    context.organizations[0].permissions = previous;
  }
});

test("merchant support is visible only to explicitly organization-wide administrators", async () => {
  const organization = context.organizations[0] as any;
  const previous = [...organization.permissions];
  const previousWide = organization.organizationWide;
  organization.permissions.push("organization.manage");
  try {
    organization.organizationWide = false;
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await findRareWorkspaceTab("Getting started");
    assert.equal(screen.queryByRole("tab", { name: "Mera support" }), null);
    cleanup();
    organization.organizationWide = true;
    render(React.createElement(Workspace, { user, notify: () => {} }));
    const support = await findRareWorkspaceTab("Mera support");
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.click(support);
    await screen.findByText("Contact Mera support", { exact: false });
  } finally {
    cleanup();
    organization.permissions = previous;
    if (previousWide === undefined) delete organization.organizationWide;
    else organization.organizationWide = previousWide;
  }
});

test("new-service flags pause new visits and bookings while staff orders and existing service remain usable", async () => {
  const originalFetch = globalThis.fetch;
  const previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push(
    "tables.manage",
    "reservations.manage",
    "orders.create",
  );
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        menuVersion: 1,
        products: [
          { id: "tea", name: "Milk tea", price: 150000, available: true },
        ],
        counterProducts: [
          { id: "tea", name: "Milk tea", price: 150000, available: true },
        ],
        tables: [
          { id: "table", name: "Window", capacity: 4, status: "occupied" },
        ],
        visits: [
          {
            id: "visit",
            tableId: "table",
            displayName: "Current party",
            status: "open",
          },
        ],
        reservations: [
          {
            id: "reservation",
            status: "confirmed",
            displayName: "Booked party",
            partySize: 2,
            depositAmount: 0,
          },
        ],
        features: {
          version: 2,
          flags: {
            customer_ordering: false,
            new_reservations: false,
            new_table_visits: false,
            zidi: false,
          },
        },
      });
    return originalFetch(input, init);
  }) as any;
  try {
    render(React.createElement(Workspace, { user, notify: () => {} }));
    await screen.findByRole("tab", { name: "Point of sale" });
    assert(await screen.findByText("Some new services are paused"));
    fireEvent.click(screen.getByRole("tab", { name: "Point of sale" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Milk tea to order" }),
    );
    fireEvent.click(screen.getByText("Customer & order note", { exact: true }));
    fireEvent.change(screen.getByLabelText("Customer name (optional)"), {
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
      false,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tables & visits" }));
    assert.equal(
      (screen.getByRole("button", { name: "Open visit" }) as HTMLButtonElement)
        .disabled,
      true,
    );
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Private access for this party",
        }) as HTMLButtonElement
      ).disabled,
      false,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Reservations" }));
    fireEvent.click(screen.getByText("Request a reservation", { exact: true }));
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Request reservation",
        }) as HTMLButtonElement
      ).matches(":disabled"),
      true,
    );
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Seat reservation",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
      false,
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    context.organizations[0].permissions = previous;
  }
});

test("tax-dependent revenue remains explicitly unresolved when historical tax evidence is missing", async () => {
  const { default: ReportDetails } =
    await import("../src/mera/workspace/ReportDetails");
  try {
    render(
      React.createElement(ReportDetails, {
        report: {
          grossSales: 100000,
          netSales: 100000,
          netRevenueExTax: null,
          netTaxLiability: null,
          products: [],
          paymentMethods: {},
        },
      }),
    );
    assert.equal(screen.getAllByText("Not available").length, 2);
  } finally {
    cleanup();
  }
});

test("deposit forfeiture requires explicit policy and tax review and preserves unknown tax as null", async () => {
  const { default: DepositOutcomes } =
    await import("../src/mera/workspace/DepositOutcomes");
  const calls: any[] = [];
  try {
    render(
      React.createElement(DepositOutcomes, {
        base: "/organizations/org/branches/branch",
        reservation: { id: "reservation", status: "cancelled" },
        deposits: [
          {
            id: "deposit",
            reservationId: "reservation",
            amount: 100000,
            unallocatedBalance: 100000,
            policySnapshot: { refundRule: "non_refundable" },
          },
        ],
        disabled: false,
        canManage: true,
        save: async (...args: any[]) => {
          calls.push(args);
          return {};
        },
      }),
    );
    chooseReference("Deposit under review");
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Eligible booked-policy forfeiture",
        hidden: true,
        exact: true,
      }),
    );
    fireEvent.change(screen.getByLabelText("Deposit outcome amount (naira)"), {
      target: { value: "1000" },
    });
    fillPresetDetails(
      "Deposit outcome reason",
      "Reviewed the booked non-refundable cancellation policy",
    );
    fireEvent.click(
      screen.getByLabelText(
        "I reviewed the booked policy and verified this outcome.",
      ),
    );
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Record reviewed deposit outcome",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Tax amount remains unknown",
        hidden: true,
        exact: true,
      }),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Record reviewed deposit outcome",
          hidden: true,
        }),
      ),
    );
    assert.equal(
      calls[0][0],
      "/organizations/org/branches/branch/reservations/reservation/deposits/deposit/outcomes",
    );
    assert.equal(calls[0][2].amount, 100000);
    assert.equal(calls[0][2].expectedRemaining, 100000);
    assert.equal(calls[0][2].taxAmount, null);
    assert.equal(calls[0][2].policyReviewed, true);
    assert.equal(calls[0][2].outcome, "forfeit");
    assert.equal(calls[0][2].method, undefined);
  } finally {
    cleanup();
  }
});

test("deposit return recovery uses a separately permissioned fenced kind and rejects malformed optional fields", async () => {
  const journal = await import("../src/mera/workspace/financialJournal");
  const actor = "00000001-0000-4000-8000-000000000001",
    org = "10000000-0000-4000-8000-000000000001",
    branch = "20000000-0000-4000-8000-000000000001";
  const path = `/organizations/${org}/branches/${branch}/reservations/30000000-0000-4000-8000-000000000001/deposits/50000000-0000-4000-8000-000000000001/outcomes`;
  const body = {
    requestKey: "40000000-0000-4000-8000-000000000001",
    outcome: "manual_return",
    expectedRemaining: 100000,
    amount: 40000,
    method: "external_transfer",
    reference: "RETURN-REF",
    reason: "Manual deposit transfer return verified",
    policyReviewed: true,
  };
  try {
    journal.clearFinancialJournals();
    assert.equal(journal.financialKind(path, body), "deposit_refund");
    assert.equal(
      journal.storeFinancialIntent(actor, org, branch, {
        path,
        method: "POST",
        body,
        signature: "ignored",
      }),
      true,
    );
    assert.deepEqual(
      journal.restoreFinancialIntent(actor, org, branch)?.body,
      body,
    );
    assert.equal(
      journal.storeFinancialIntent(actor, org, branch, {
        path,
        method: "POST",
        body: {
          ...body,
          outcome: "held",
          amount: 0,
          taxAmount: { token: "reject" },
        },
        signature: "ignored",
      }),
      false,
    );
    assert.equal(
      journal.storeFinancialIntent(actor, org, branch, {
        path,
        method: "POST",
        body: { ...body, method: "arbitrary" },
        signature: "ignored",
      }),
      false,
    );
  } finally {
    journal.clearFinancialJournals();
  }
});

test("history cursor pages reset when applied filters change and details use the canonical permitted endpoint", async () => {
  const { default: OrderHistory } =
    await import("../src/mera/workspace/OrderHistory");
  const originalFetch = globalThis.fetch;
  const calls: URL[] = [];
  const row = (id: string, name: string) => ({
    id,
    reference: id,
    displayName: name,
    status: "completed",
    paymentStatus: "paid",
    total: 100000,
    createdAt: "2026-11-18T12:00:00Z",
  });
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input), "http://localhost:3003");
    calls.push(url);
    if (url.pathname.endsWith("/orders/Q1"))
      return Response.json({
        ...row("Q1", "Ada"),
        note: "Canonical archived instruction",
        items: [
          {
            name: "Milk tea",
            quantity: 1,
            total: 100000,
            modifiers: [{ name: "Pearls" }],
          },
        ],
        history: [],
      });
    const filtered = url.searchParams.has("q");
    const second = url.searchParams.has("cursor");
    return Response.json({
      orders: [
        filtered
          ? row("Q1", "Ada")
          : second
            ? row("P2", "Second page")
            : row("P1", "First page"),
      ],
      hasMore: !filtered && !second,
      nextCursor: !filtered && !second ? "cursor-one" : null,
      pageSize: Number(url.searchParams.get("take")),
    });
  }) as any;
  try {
    render(
      React.createElement(OrderHistory, {
        base: "/organizations/org/branches/branch",
      }),
    );
    await screen.findByText("P1 · First page");
    assert.equal(calls[0].searchParams.get("take"), "50");
    assert.equal(calls[0].searchParams.has("q"), false);
    assert.equal(calls[0].searchParams.has("from"), false);
    fireEvent.click(screen.getByRole("button", { name: "Next history page" }));
    await screen.findByText("P2 · Second page");
    assert.equal(calls[1].searchParams.get("cursor"), "cursor-one");
    fireEvent.change(screen.getByLabelText("Search order history"), {
      target: { value: "  Ada  " },
    });
    chooseField(screen, fireEvent, "History records", "only");
    chooseField(screen, fireEvent, "Orders per page", "25");
    fireEvent.click(
      screen.getByRole("button", { name: "Apply history filters" }),
    );
    await screen.findByText("Q1 · Ada");
    assert.equal(calls[2].searchParams.has("cursor"), false);
    assert.equal(calls[2].searchParams.get("q"), "Ada");
    assert.equal(calls[2].searchParams.get("historical"), "only");
    assert.equal(calls[2].searchParams.get("take"), "25");
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Previous history page",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "View Q1" }));
    await screen.findByText("Canonical archived instruction");
    assert(calls.some((url) => url.pathname.endsWith("/orders/Q1")));
    assert(screen.getByText("Pearls", { exact: false }));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("history scope switches never reuse another branch cursor or show its late response", async () => {
  const { default: OrderHistory } =
    await import("../src/mera/workspace/OrderHistory");
  const originalFetch = globalThis.fetch;
  let release: ((response: Response) => void) | undefined;
  const urls: URL[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input), "http://localhost:3003");
    urls.push(url);
    if (url.pathname.includes("branch-a") && url.searchParams.has("cursor"))
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    return Response.json({
      orders: [
        {
          id: url.pathname.includes("branch-a") ? "A" : "B",
          reference: url.pathname.includes("branch-a") ? "A" : "B",
          displayName: "Scoped record",
          total: 100000,
        },
      ],
      hasMore: url.pathname.includes("branch-a"),
      nextCursor: url.pathname.includes("branch-a") ? "A-only-cursor" : null,
      pageSize: 50,
    });
  }) as any;
  try {
    const rendered = render(
      React.createElement(OrderHistory, {
        base: "/organizations/org/branches/branch-a",
      }),
    );
    await screen.findByText("A · Scoped record");
    fireEvent.click(screen.getByRole("button", { name: "Next history page" }));
    assert(release);
    rendered.rerender(
      React.createElement(OrderHistory, {
        base: "/organizations/org/branches/branch-b",
      }),
    );
    await screen.findByText("B · Scoped record");
    const branchRequest = urls.find((url) =>
      url.pathname.includes("branch-b"),
    )!;
    assert.equal(branchRequest.searchParams.has("cursor"), false);
    await act(async () => {
      release!(
        Response.json({
          orders: [
            {
              id: "stale",
              reference: "STALE",
              displayName: "Earlier branch",
              total: 100000,
            },
          ],
          hasMore: false,
          nextCursor: null,
          pageSize: 50,
        }),
      );
      await Promise.resolve();
    });
    assert.equal(screen.queryByText("STALE · Earlier branch"), null);
    assert(screen.getByText("B · Scoped record"));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("preparation instructions preserve canonical selections and escaped notes without inventing dietary claims", async () => {
  const { default: Tickets } = await import("../src/mera/workspace/Tickets");
  const note = "Less ice <script>alert('not executable')</script>";
  try {
    render(
      React.createElement(Tickets, {
        base: "/branch",
        tickets: [
          {
            id: "ticket",
            orderId: "order",
            station: "bar",
            status: "preparing",
            version: 1,
            items: [
              {
                orderLineId: "line",
                name: "Milk tea",
                quantity: 1,
                preparedQuantity: 0,
                modifiers: [{ name: "Brown sugar pearls" }],
                allergens: ["Milk"],
              },
            ],
          },
        ],
        orders: [{ id: "order", status: "preparing", note }],
        disabled: false,
        save: async () => ({}),
      }),
    );
    assert(screen.getByText(note));
    assert(screen.getByText("Brown sugar pearls", { exact: false }));
    assert(
      screen
        .getByText("Recorded allergens:")
        .parentElement?.textContent?.includes("Milk"),
    );
    assert.equal(document.querySelector("script"), null);
    assert.equal(screen.queryByText("Recorded dietary labels:"), null);
  } finally {
    cleanup();
  }
});

test("a late history detail cannot replace the newly selected canonical order", async () => {
  const { default: OrderHistory } =
    await import("../src/mera/workspace/OrderHistory");
  const originalFetch = globalThis.fetch;
  let oldDetail: ((response: Response) => void) | undefined;
  const row = (id: string) => ({
    id,
    reference: id,
    displayName: "Customer " + id,
    total: 100000,
    status: "completed",
  });
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input), "http://localhost:3003");
    if (url.pathname.endsWith("/orders/A"))
      return new Promise<Response>((resolve) => {
        oldDetail = resolve;
      });
    if (url.pathname.endsWith("/orders/B"))
      return Response.json({
        ...row("B"),
        note: "Current canonical instruction",
        items: [],
        history: [],
      });
    return Response.json({
      orders: [row("A"), row("B")],
      hasMore: false,
      nextCursor: null,
      pageSize: 50,
    });
  }) as any;
  try {
    render(
      React.createElement(OrderHistory, {
        base: "/organizations/org/branches/branch",
      }),
    );
    await screen.findByText("A · Customer A");
    fireEvent.click(screen.getByRole("button", { name: "View A" }));
    assert(oldDetail);
    fireEvent.click(screen.getByRole("button", { name: "View B" }));
    await screen.findByText("Current canonical instruction");
    await act(async () => {
      oldDetail!(
        Response.json({
          ...row("A"),
          note: "Stale earlier instruction",
          items: [],
          history: [],
        }),
      );
      await Promise.resolve();
    });
    assert.equal(screen.queryByText("Stale earlier instruction"), null);
    assert(screen.getByText("Current canonical instruction"));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("branch service modes save canonical settings without conflating reservation approval", async () => {
  const { default: BranchSettings } =
    await import("../src/mera/workspace/BranchSettings");
  const calls: any[] = [];
  try {
    render(
      <BranchSettings
        branch={{
          settings: {
            serviceModes: ["counter_takeaway"],
            reservationsEnabled: false,
          },
        }}
        organization={{ id: "org-1", name: "Store" }}
        base="/organizations/org-1/branches/branch-1"
        disabled={false}
        save={async (...args) => {
          calls.push(args);
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "2. Service modes" }));
    fireEvent.click(screen.getByRole("switch", { name: "Table service" }));
    fireEvent.click(screen.getByRole("switch", { name: "Lounge & club" }));
    fireEvent.click(screen.getByRole("button", { name: "6. Review" }));
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Save branch policies" })
        .closest("form")!,
    );
    await waitFor(() => assert.equal(calls.length, 1));
    assert.equal(
      calls[0][0],
      "/organizations/org-1/branches/branch-1/settings",
    );
    assert.deepEqual(calls[0][2].serviceModes, [
      "counter_takeaway",
      "table_service",
      "lounge_club",
    ]);
    assert.equal(calls[0][2].reservationsEnabled, false);
  } finally {
    cleanup();
  }
});

test("paid document rendering escapes snapshot instructions and uses recorded sticker dimensions", async () => {
  const { printDocumentHtml } =
    await import("../src/mera/workspace/PrintDocument");
  const html = printDocumentHtml({
    kind: "label",
    duplicate: true,
    documentSnapshot: {
      template: { width: 50, height: 40 },
      businessName: "Venue",
      reference: "A1",
      name: "<script>bad()</script>",
      quantity: 1,
      unitIndex: 1,
      unitCount: 2,
      modifiers: [{ name: "Less sugar" }],
      note: "<img onerror=bad()>",
      allergens: ["Milk"],
    },
  });
  assert(html.includes("size:50mm 40mm"));
  assert(html.includes("&lt;script&gt;"));
  assert(!html.includes("<script>"));
  assert(html.includes("Less sugar"));
  assert(html.includes("DUPLICATE"));
  assert.throws(
    () =>
      printDocumentHtml({
        kind: "label",
        documentSnapshot: { template: { width: 0, height: 40 } },
      }),
    /dimensions/,
  );
});

test("refund request review separates actors and requires completed manual return evidence", async () => {
  const { default: RefundRequests } =
    await import("../src/mera/workspace/RefundRequests");
  const original = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = async () =>
    Response.json({
      requests: [
        {
          id: "r1",
          orderId: "o1",
          amount: 25000,
          version: 1,
          status: "pending",
          requestedBy: "another",
          requestedByName: "Ada",
          reason: "Customer requested return",
        },
        {
          id: "r2",
          orderId: "o2",
          amount: 10000,
          version: 1,
          status: "pending",
          requestedBy: "me",
          requestedByName: "Me",
          reason: "Original requester",
        },
      ],
    });
  try {
    render(
      <RefundRequests
        base="/organizations/org-1/branches/branch-1"
        userId="me"
        orders={[]}
        canRequest={false}
        canApprove
        disabled={false}
        save={async (...args) => {
          calls.push(args);
        }}
      />,
    );
    await screen.findByText("Ada · ₦250.00");
    assert.equal(
      screen.getAllByRole("button", { name: "Record completed return" }).length,
      1,
    );
    const button = screen.getByRole("button", {
      name: "Record completed return",
    }) as HTMLButtonElement;
    assert(button.disabled);
    fillPresetDetails("Review reason", "Verified completed return");
    fireEvent.click(screen.getByRole("radio", { name: "Cash", exact: true }));
    assert(button.disabled);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    await waitFor(() => assert.equal(calls.length, 1));
    assert.equal(calls[0][2].refundRequestId, "r1");
    assert.equal(calls[0][2].amount, 25000);
    assert.equal(calls[0][2].method, "cash");
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("typed stock loss preserves the exact original key and expected balance after uncertainty", async () => {
  const { default: StockMovements } =
    await import("../src/mera/workspace/StockMovements");
  const original = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = async () =>
    Response.json({ movements: [], hasOlder: false });
  try {
    render(
      <StockMovements
        base="/organizations/org-1/branches/branch-1"
        products={[{ id: "p1", name: "Tea", stockMode: "counted", stock: 12 }]}
        disabled={false}
        save={async (...args) => {
          calls.push(args);
          throw Object.assign(new Error("Connection lost"), { status: 0 });
        }}
      />,
    );
    fireEvent.focus(screen.getByLabelText("Stock product"));
    fireEvent.click(screen.getByRole("option", { name: "Tea 12 in stock" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Adjust stock for Tea" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Loss", exact: true }));
    fireEvent.change(screen.getByLabelText("Stock change for Tea"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
    fireEvent.change(screen.getByLabelText("Stock reason for Tea details"), {
      target: { value: "Two sealed cartons missing" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Save stock change" })
        .closest("form")!,
    );
    await screen.findByRole("button", {
      name: "Retry original stock movement",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original stock movement" }),
    );
    await waitFor(() => assert.equal(calls.length, 2));
    assert.deepEqual(calls[0][2], calls[1][2]);
    assert.equal(calls[0][2].expectedStock, 12);
    assert.equal(calls[0][2].quantity, 2);
    assert.equal(calls[0][2].type, "loss");
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("date report reads canonical business date independently from the active order snapshot", async () => {
  const { default: ReportExplorer } =
    await import("../src/mera/workspace/ReportExplorer");
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    paths.push(String(input));
    return Response.json({
      report: {
        date: "2026-11-17",
        products: [],
        netRevenueExTax: null,
        netTaxLiability: null,
      },
      reportWindow: { timezone: "Africa/Lagos" },
    });
  };
  try {
    render(
      <ReportExplorer
        base="/organizations/org-1/branches/branch-1"
        disabled={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Business date"), {
      target: { value: "2026-11-17" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Load date report" }).closest("form")!,
    );
    await screen.findByRole("heading", {
      name: "Trading day detail · 17 Nov 2026",
    });
    assert(paths[0].endsWith("/workspace?date=2026-11-17"));
    assert(
      screen.getByText("Branch timezone: Africa/Lagos.", { exact: false }),
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("refund-request financial recovery retains only a validated request reference", async () => {
  const journal = await import("../src/mera/workspace/financialJournal");
  const actor = "00000001-0000-4000-8000-000000000001",
    org = "10000000-0000-4000-8000-000000000001",
    branch = "20000000-0000-4000-8000-000000000001";
  const body = {
    requestKey: "40000000-0000-4000-8000-000000000001",
    refundRequestId: "50000000-0000-4000-8000-000000000001",
    amount: 25000,
    method: "cash",
    reason: "Verified actual cash return",
  };
  const intent = {
    path: `/organizations/${org}/branches/${branch}/orders/30000000-0000-4000-8000-000000000001/refunds`,
    method: "POST" as const,
    body,
    signature: "",
  };
  try {
    journal.clearFinancialJournals();
    assert(journal.storeFinancialIntent(actor, org, branch, intent));
    assert.equal(
      journal.restoreFinancialIntent(actor, org, branch)?.body.refundRequestId,
      body.refundRequestId,
    );
    assert.equal(
      journal.storeFinancialIntent(actor, org, branch, {
        ...intent,
        body: { ...body, refundRequestId: "customer name" },
      }),
      false,
    );
  } finally {
    journal.clearFinancialJournals();
  }
});

test("F5 integrated first landing follows actual role grants and uses one navigation", async () => {
  const original = globalThis.fetch;
  const { rolePermissions } = await import("../shared/mera-contracts.js");
  const landings: Record<string, string> = {
    owner: "Overview",
    organization_admin: "Overview",
    branch_manager: "Overview",
    cashier: "Point of sale",
    kitchen: "Preparation",
    bar: "Preparation",
    waiter: "Tables & visits",
    front_desk: "Reservations",
    stock_controller: "Menu & stock",
    reports_only: "Overview",
  };
  const cases: [string, string[], string][] = Object.entries(landings).map(
    ([role, landing]) => [
      role,
      [...rolePermissions[role as keyof typeof rolePermissions]],
      landing,
    ],
  );
  try {
    for (const [role, permissions, landing] of cases) {
      globalThis.fetch = (async (input: any, init: any) =>
        String(input).endsWith("/context")
          ? Response.json({
              ...context,
              organizations: [
                { ...context.organizations[0], role, permissions },
              ],
            })
          : original(input, init)) as any;
      render(<Workspace user={user} notify={() => {}} />);
      await waitFor(() =>
        assert.equal(
          screen
            .getByRole("tab", { name: landing })
            .getAttribute("aria-selected"),
          "true",
        ),
      );
      assert.equal(
        screen.getAllByRole("navigation", { name: "Organization workspace" })
          .length,
        1,
      );
      assert.equal(screen.queryByLabelText("Workspace page"), null);
      cleanup();
    }
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("F5 integrated selection resets at branch switch and falls back promptly after revocation", async () => {
  const original = globalThis.fetch;
  let permissions = ["orders.view", "orders.create"];
  globalThis.fetch = (async (input: any, init: any) =>
    String(input).endsWith("/context")
      ? Response.json({
          ...context,
          organizations: [
            { ...context.organizations[0], role: "cashier", permissions },
          ],
        })
      : original(input, init)) as any;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole("tab", { name: "Point of sale" })
          .getAttribute("aria-selected"),
        "true",
      ),
    );
    await screen.findByRole("heading", { name: "The whole collection" });
    fireEvent.click(screen.getByRole("tab", { name: "Orders" }));
    await screen.findByText("Surulere customer", { exact: false });
    chooseField(screen, fireEvent, "Location", "branch-2");
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole("tab", { name: "Point of sale" })
          .getAttribute("aria-selected"),
        "true",
      ),
    );
    assert.equal(
      screen.queryByText("Surulere customer", { exact: false }),
      null,
    );
    await screen.findByRole("heading", { name: "The whole collection" });
    permissions = ["orders.view"];
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Refresh workspace" }),
      ),
    );
    await waitFor(() =>
      assert.equal(screen.queryByRole("tab", { name: "Point of sale" }), null),
    );
    assert.equal(
      screen.getByRole("tab", { name: "Orders" }).getAttribute("aria-selected"),
      "true",
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Refresh workspace" }),
      ),
    );
    await screen.findByText("Ikeja customer", { exact: false });
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("F5 integrated no-access state never falls back to an owner or stock-edit screen", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: any) =>
    String(input).endsWith("/context")
      ? Response.json({
          ...context,
          organizations: [
            {
              ...context.organizations[0],
              role: "custom-role-without-grants",
              permissions: [],
            },
          ],
        })
      : original(input, init)) as any;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    await screen.findByRole("heading", { name: "No tasks assigned" });
    assert.equal(screen.queryByRole("tab"), null);
    assert.equal(screen.queryByRole("button", { name: "Save product" }), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("refund request load failure offers retry and is never presented as an empty list", async () => {
  const { default: RefundRequests } =
    await import("../src/mera/workspace/RefundRequests");
  const original = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () =>
    ++reads === 1
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : Response.json({ requests: [] });
  try {
    render(
      <RefundRequests
        base="/organizations/org-1/branches/branch-1"
        userId="me"
        orders={[]}
        canRequest={false}
        canApprove
        disabled={false}
        save={async () => {
          throw new Error("No writes expected");
        }}
      />,
    );
    assert(screen.getByRole("status"));
    assert.equal(screen.queryByText("No visible refund requests."), null);
    const retry = await screen.findByRole("button", {
      name: "Retry loading requests",
    });
    assert.equal(screen.queryByText("No visible refund requests."), null);
    fireEvent.click(retry);
    await screen.findByText("No visible refund requests.");
    assert.equal(screen.queryByRole("alert"), null);
    assert.equal(reads, 2);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("menu management keeps an unsaved product across local views and restores the editor trigger focus", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: any) => {
    const path = String(input);
    if (path.endsWith("/context"))
      return Response.json({
        ...context,
        organizations: [
          {
            ...context.organizations[0],
            role: "stock_controller",
            permissions: ["menu.edit"],
          },
        ],
      });
    if (path.endsWith("/categories")) return Response.json({ categories: [] });
    return original(input, init);
  }) as any;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    await screen.findByRole("heading", {
      name: "Product catalog",
    });
    const open = screen.getByRole("button", { name: "New product" });
    open.focus();
    fireEvent.click(open);
    const name = screen.getByRole("textbox", {
      name: "Product name",
      exact: true,
    });
    await waitFor(() => assert.equal(document.activeElement, name));
    fireEvent.change(name, { target: { value: "Unsaved UI draft" } });
    fireEvent.click(
      screen.getByRole("tab", { name: "Stock & availability", exact: true }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Products", exact: true }));
    assert.equal(
      (
        screen.getByRole("textbox", {
          name: "Product name",
          exact: true,
        }) as HTMLInputElement
      ).value,
      "Unsaved UI draft",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    await waitFor(() => assert.equal(document.activeElement, open));
    assert.equal(
      screen.queryByRole("region", { name: "Product editor" }),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("P1 counter uses published variant prices and blocks incomplete or expired optional review", async () => {
  const original = globalThis.fetch,
    previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("orders.create");
  let expired = false;
  const quotes: any[] = [];
  const published = {
    id: "qa",
    name: "QA drink",
    available: true,
    price: 0,
    variants: [{ id: "large", name: "Large", price: 350000 }],
    modifierGroups: [
      {
        id: "topping",
        name: "Toppings",
        min: 1,
        max: 1,
        options: [{ id: "pearls", name: "Pearls", price: 50000 }],
      },
    ],
  };
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        menuVersion: 1,
        products: [
          {
            ...published,
            variants: [{ id: "large", name: "Large", price: 360000 }],
          },
        ],
        counterProducts: [published],
      });
    if (String(input).endsWith("/quote")) {
      quotes.push(JSON.parse(init.body));
      return Response.json({
        id: "published-quote",
        expiresAt: new Date(
          Date.now() + (expired ? -1000 : 300000),
        ).toISOString(),
        subtotal: 800000,
        total: 800000,
        lines: [],
        policyVersion: null,
      });
    }
    return original(input, init);
  }) as any;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add QA drink to order" }),
    );
    assert(
      (
        screen.getByRole("button", {
          name: "Review current order total",
        }) as HTMLButtonElement
      ).disabled,
    );
    assert(
      (
        screen.getByRole("button", {
          name: "Submit order",
        }) as HTMLButtonElement
      ).disabled,
    );
    assert.equal(
      screen.getByText("Items estimate").parentElement?.textContent,
      "Items estimateComplete selections",
    );
    fireEvent.change(screen.getByLabelText("Quantity of QA drink"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /^Large ·/ }));
    assert(
      (
        screen.getByRole("button", {
          name: "Submit order",
        }) as HTMLButtonElement
      ).disabled,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Pearls/ }));
    assert(
      screen
        .getByText("Items estimate")
        .parentElement?.textContent?.includes("8,000"),
    );
    assert(
      !screen
        .getByText("Items estimate")
        .parentElement?.textContent?.includes("8,200"),
    );
    assert(
      !(
        screen.getByRole("button", {
          name: "Submit order",
        }) as HTMLButtonElement
      ).disabled,
    );
    expired = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Review current order total" }),
    );
    await screen.findByText("Quote changed or expired · review again");
    assert.equal(quotes.length, 1);
    assert(
      (
        screen.getByRole("button", {
          name: "Submit order",
        }) as HTMLButtonElement
      ).disabled,
    );
    expired = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Review current order total" }),
    );
    await screen.findByText("Reviewed order total");
    assert(
      !(
        screen.getByRole("button", {
          name: "Submit order",
        }) as HTMLButtonElement
      ).disabled,
    );
  } finally {
    cleanup();
    context.organizations[0].permissions = previous;
    globalThis.fetch = original;
  }
});

test("P1 missing published counter projection never falls back to working catalog and supports read retry", async () => {
  const original = globalThis.fetch,
    previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("orders.create");
  let ready = false;
  const product = {
    id: "draft",
    name: "Draft-only item",
    price: 100000,
    available: true,
  };
  globalThis.fetch = (async (input: any, init: any) => {
    if (String(input).endsWith("/workspace")) {
      const value: any = {
        ...snapshot("branch-1"),
        menuVersion: 1,
        products: [product],
      };
      if (ready)
        value.counterProducts = [{ ...product, name: "Published item" }];
      else delete value.counterProducts;
      return Response.json(value);
    }
    return original(input, init);
  }) as any;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    await screen.findByText(
      "The counter menu is unavailable. Refresh it before building a new order.",
    );
    assert.equal(
      screen.queryByRole("button", { name: "Add Draft-only item to order" }),
      null,
    );
    assert(
      (
        screen.getByRole("button", {
          name: "Submit order",
        }) as HTMLButtonElement
      ).disabled,
    );
    ready = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh counter menu" }),
    );
    await screen.findByRole("button", { name: "Add Published item to order" });
    assert.equal(
      screen.queryByText(
        "The counter menu is unavailable. Refresh it before building a new order.",
      ),
      null,
    );
  } finally {
    cleanup();
    context.organizations[0].permissions = previous;
    globalThis.fetch = original;
  }
});
test("write validation errors survive a successful background refresh while read errors recover independently", async () => {
  const original = globalThis.fetch,
    oldInterval = globalThis.setInterval;
  const hidden = Object.getOwnPropertyDescriptor(document, "hidden");
  let poll: (() => void) | undefined,
    failRead = false;
  const invokePoll = () => {
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    try {
      poll!();
    } finally {
      if (hidden) Object.defineProperty(document, "hidden", hidden);
      else delete (document as any).hidden;
    }
  };
  globalThis.setInterval = ((handler: any, delay: any, ...args: any[]) => {
    if (delay === 2500) poll = () => handler(...args);
    return oldInterval(handler, delay, ...args);
  }) as any;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/payments"))
      return Response.json(
        { error: "Check the payment reference" },
        { status: 400 },
      );
    if (String(input).endsWith("/workspace") && failRead)
      return Response.json(
        { error: "Records are temporarily unavailable" },
        { status: 503 },
      );
    return original(input, init);
  }) as any;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    await screen.findByRole("tab", { name: "Transactions", exact: true });
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Order", exact: true }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { target: { value: "Surulere" } },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { key: "Enter" },
    );
    fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
      target: { value: "1000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record verified collection" }),
    );
    await screen.findByText("Check the payment reference");
    assert(poll);
    await act(async () => {
      invokePoll();
      await Promise.resolve();
    });
    assert(screen.getByText("Check the payment reference"));
    failRead = true;
    await act(async () => {
      invokePoll();
      await Promise.resolve();
    });
    await screen.findByText(
      "Records could not be refreshed: Records are temporarily unavailable",
    );
    assert(screen.getByText("Check the payment reference"));
    failRead = false;
    fireEvent.click(screen.getByRole("button", { name: "Refresh records" }));
    await waitFor(() =>
      assert(
        !screen.queryByText(
          "Records could not be refreshed: Records are temporarily unavailable",
        ),
      ),
    );
    assert(screen.getByText("Check the payment reference"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    assert.equal(screen.queryByText("Check the payment reference"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
    globalThis.setInterval = oldInterval;
    if (hidden) Object.defineProperty(document, "hidden", hidden);
    else delete (document as any).hidden;
  }
});

test("a new explicit write clears the previous validation message before its result", async () => {
  const original = globalThis.fetch;
  let writes = 0,
    release: ((response: Response) => void) | undefined;
  globalThis.fetch = (async (input: any, init: any) => {
    if (String(input).endsWith("/payments")) {
      writes++;
      return writes === 1
        ? Response.json({ error: "Original write validation" }, { status: 400 })
        : new Promise<Response>((resolve) => {
            release = resolve;
          });
    }
    return original(input, init);
  }) as any;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    await screen.findByText("Surulere customer", { exact: false });
    fireEvent.click(screen.getByRole("tab", { name: "Transactions" }));
    fireEvent.focus(
      screen.getByRole("combobox", { name: "Order", exact: true }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { target: { value: "Surulere" } },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Order", exact: true }),
      { key: "Enter" },
    );
    fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
      target: { value: "1000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record verified collection" }),
    );
    await screen.findByText("Original write validation");
    fireEvent.click(
      screen.getByRole("button", { name: "Record verified collection" }),
    );
    await waitFor(() => assert(release));
    assert(!screen.queryByText("Original write validation"));
    await act(async () => release!(Response.json({ id: "received" })));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("an uncertain original staff submission remains retryable after the published menu changes", async () => {
  const original = globalThis.fetch,
    previous = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("orders.create");
  let changed = false;
  const writes: any[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        menuVersion: changed ? 2 : 1,
        products: [],
        counterProducts: changed
          ? []
          : [{ id: "tea", name: "Milk tea", price: 150000, available: true }],
      });
    if (String(input).endsWith("/orders") && init.method === "POST") {
      writes.push(JSON.parse(init.body));
      if (writes.length === 1) throw new TypeError("Connection lost");
      return Response.json({ id: "created-original" });
    }
    return original(input, init);
  }) as any;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Milk tea to order" }),
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Submit order" }).closest("form")!,
    );
    await screen.findByText("Submission not confirmed");
    changed = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh workspace" }));
    await screen.findByRole("button", { name: "Remove unavailable item 1" });
    assert(
      (
        screen.getByRole("button", {
          name: "Submit order",
        }) as HTMLButtonElement
      ).disabled,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original submission" }),
    );
    await waitFor(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[1], writes[0]);
    assert.equal(writes[1].menuVersion, 1);
  } finally {
    cleanup();
    context.organizations[0].permissions = previous;
    globalThis.fetch = original;
  }
});

test("service queues resolve the signed-in handler and ready orders without mixing branch scope", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const path = String(input);
    if (path.endsWith("/context")) return Response.json(context);
    if (path.endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        orders: [
          {
            id: "mine",
            reference: "MY-ROUND",
            handlerId: user.id,
            status: "preparing",
            history: [],
            items: [],
            version: 1,
          },
          {
            id: "other",
            reference: "OTHER-ROUND",
            handlerId: "other-user",
            status: "ready",
            history: [],
            items: [],
            version: 1,
          },
          {
            id: "unassigned",
            reference: "UNASSIGNED-ROUND",
            status: "submitted",
            history: [],
            items: [],
            version: 1,
          },
        ],
      });
    return Response.json({});
  }) as typeof fetch;
  try {
    render(React.createElement(Workspace, { user }));
    await waitFor(() =>
      assert.ok(screen.getByRole("tab", { name: "Orders", exact: true })),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Orders", exact: true }));
    await waitFor(() =>
      assert.ok(screen.getByRole("article", { name: "Order MY-ROUND" })),
    );
    const originalCard = screen.getByRole("article", {
      name: "Order MY-ROUND",
    });
    chooseField(screen, fireEvent, "Show orders", "mine");
    assert.ok(screen.getByRole("article", { name: "Order MY-ROUND" }));
    assert.equal(
      screen.queryByRole("article", { name: "Order OTHER-ROUND" }),
      null,
    );
    chooseField(screen, fireEvent, "Show orders", "ready");
    assert.ok(screen.getByRole("article", { name: "Order OTHER-ROUND" }));
    assert.equal(
      screen.queryByRole("article", { name: "Order MY-ROUND" }),
      null,
    );
    chooseField(screen, fireEvent, "Show orders", "unassigned");
    assert.ok(screen.getByRole("article", { name: "Order UNASSIGNED-ROUND" }));
    assert.equal(
      screen.queryByRole("article", { name: "Order OTHER-ROUND" }),
      null,
    );
    chooseField(screen, fireEvent, "Show orders", "mine");
    assert.equal(
      screen.getByRole("article", { name: "Order MY-ROUND" }),
      originalCard,
    );
  } finally {
    cleanup();
    globalThis.fetch = oldFetch;
  }
});

test("reviewed trading day carries its date to the permitted export form without changing today's report", async () => {
  const previousFetch = globalThis.fetch;
  const previousScroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = () => {};
  const calls: any[] = [];
  const reportContext = {
    ...context,
    organizations: context.organizations.map((org) => ({
      ...org,
      permissions: ["reports.view", "reports.export"],
    })),
  };
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const path = String(input);
    if (path.endsWith("/context")) return Response.json(reportContext);
    if (path.includes("/workspace")) {
      const date = path.includes("?date=") ? "2026-11-18" : "2026-11-19";
      return Response.json({
        ...snapshot("branch-1"),
        report: {
          date,
          orders: 0,
          netSales: 0,
          collections: 0,
          outstanding: 0,
          products: [],
          paymentMethods: {},
        },
        reportWindow: {
          from: date + "T00:00:00.000Z",
          to:
            date === "2026-11-18"
              ? "2026-11-19T00:00:00.000Z"
              : "2026-11-20T00:00:00.000Z",
          timezone: "UTC",
        },
        branch: { timezone: "UTC" },
      });
    }
    if (path.endsWith("/jobs")) return Response.json({ jobs: [] });
    if (path.endsWith("/exports") && init.method === "POST") {
      calls.push(JSON.parse(init.body));
      return Response.json({ id: "local-job", status: "queued" });
    }
    return Response.json({});
  }) as typeof fetch;
  try {
    render(<Workspace user={user} />);
    await screen.findByRole("button", { name: "Reports by date", exact: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Reports by date", exact: true }),
    );
    const date = screen.getByLabelText("Business date");
    fireEvent.input(date, { target: { value: "2026-11-18" } });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Load date report", exact: true })
        .closest("form")!,
    );
    const exportButton = await screen.findByRole("button", {
      name: "Export this trading day",
      exact: true,
    });
    fireEvent.click(exportButton);
    const exportDate = await screen.findByLabelText("Business date");
    assert.equal((exportDate as HTMLInputElement).value, "2026-11-18");
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Queue report export", exact: true })
        .closest("form")!,
    );
    await waitFor(() => assert.equal(calls.length, 1));
    assert.equal(calls[0].date, "2026-11-18");
    assert.equal(typeof calls[0].requestKey, "string");
  } finally {
    cleanup();
    globalThis.fetch = previousFetch;
    HTMLElement.prototype.scrollIntoView = previousScroll;
  }
});

test("overview drilldowns reset stale filters and select only current active or delayed orders", async () => {
  const previousFetch = globalThis.fetch;
  const operationalContext = {
    ...context,
    organizations: context.organizations.map((org) => ({
      ...org,
      permissions: ["reports.view", "orders.view"],
    })),
  };
  const active = {
    ...snapshot("branch-1").orders[0],
    reference: "QA-A",
    stockHeld: false,
    createdAt: "2026-11-19T11:30:00Z",
  };
  const expired = {
    ...active,
    id: "expired-order",
    reference: "QA-EXPIRED",
    holdExpired: true,
    paymentStatus: "expired",
  };
  globalThis.fetch = (async (input: any) =>
    String(input).endsWith("/context")
      ? Response.json(operationalContext)
      : String(input).includes("/workspace")
        ? Response.json({
            ...snapshot("branch-1"),
            orders: [active, expired],
            serverTime: "2026-11-19T12:00:00Z",
            branch: { timezone: "UTC" },
            report: {
              date: "2026-11-19",
              orders: 2,
              collections: 0,
              netSales: 0,
              outstanding: 100000,
              paymentMethods: {},
            },
            delayedOrders: [
              { id: active.id, reference: active.reference, ageMinutes: 30 },
            ],
            lowStockAlerts: [],
          })
        : Response.json({})) as typeof fetch;
  try {
    render(<Workspace user={user} />);
    fireEvent.click(
      await screen.findByRole("tab", { name: "Overview", exact: true }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "View active orders",
        exact: true,
      }),
    );
    assert.equal(choiceValue(screen, "Show orders"), "active");
    assert(screen.getByRole("article", { name: "Order QA-A", exact: true }));
    assert(
      !screen.queryByRole("article", { name: "Order QA-EXPIRED", exact: true }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Overview", exact: true }));
    fireEvent.click(
      within(
        await screen.findByRole("region", { name: "Needs your attention" }),
      ).getByRole("button", { name: "Review order QA-A", exact: true }),
    );
    assert.equal(choiceValue(screen, "Show orders"), "delayed");
    assert.equal(
      (
        screen.getByRole("searchbox", {
          name: "Find orders",
        }) as HTMLInputElement
      ).value,
      "QA-A",
    );
    assert(screen.getByRole("article", { name: "Order QA-A", exact: true }));
    fireEvent.click(screen.getByRole("tab", { name: "Overview", exact: true }));
    fireEvent.click(
      await screen.findByRole("button", { name: "View orders", exact: true }),
    );
    assert.equal(choiceValue(screen, "Show orders"), "all");
    assert.equal(
      (
        screen.getByRole("searchbox", {
          name: "Find orders",
        }) as HTMLInputElement
      ).value,
      "",
    );
    assert(
      screen.getByRole("article", { name: "Order QA-EXPIRED", exact: true }),
    );
  } finally {
    cleanup();
    globalThis.fetch = previousFetch;
    window.sessionStorage.clear();
  }
});

test("stock-only staff can open overview stock tools without mounting menu-editing reads or availability writes", async () => {
  const previousFetch = globalThis.fetch;
  const reads: string[] = [];
  const scoped = {
    ...context,
    organizations: context.organizations.map((org) => ({
      ...org,
      permissions: ["reports.view", "stock.adjust"],
    })),
  };
  globalThis.fetch = (async (input: any) => {
    const path = String(input);
    reads.push(path);
    if (path.endsWith("/context")) return Response.json(scoped);
    if (path.includes("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        orders: [],
        serverTime: "2026-11-19T12:00:00Z",
        products: [],
        report: {
          date: "2026-11-19",
          orders: 0,
          netSales: 0,
          collections: 0,
          outstanding: 0,
          paymentMethods: {},
        },
        lowStockAlerts: [],
        delayedOrders: [],
      });
    if (path.endsWith("/stock-movements"))
      return Response.json({ movements: [] });
    return Response.json({});
  }) as typeof fetch;
  try {
    render(<Workspace user={user} />);
    fireEvent.click(
      await screen.findByRole("tab", { name: "Overview", exact: true }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Review stock", exact: true }),
    );
    assert(
      document.activeElement ===
        screen.getByRole("heading", {
          name: "Menu & stock",
          level: 1,
          exact: true,
        }),
    );
    assert(
      screen.getByRole("tab", { name: "Stock & availability", selected: true }),
    );
    assert(!screen.queryByRole("tab", { name: "Products", exact: true }));
    assert(!screen.queryByText("Change availability for several products"));
    assert(!screen.queryByRole("button", { name: "New product" }));
    assert(
      !reads.some(
        (path) =>
          path.endsWith("/categories") || path.includes("/shared-menus"),
      ),
    );
  } finally {
    cleanup();
    globalThis.fetch = previousFetch;
    window.sessionStorage.clear();
  }
});

test("overview arrival and shift links select the relevant records, and normal navigation clears presets", async () => {
  const previousFetch = globalThis.fetch;
  const scoped = {
    ...context,
    organizations: context.organizations.map((org) => ({
      ...org,
      permissions: ["reports.view", "reservations.manage", "shifts.manage"],
    })),
  };
  const reservation = {
    id: "private-booking",
    displayName: "Local arrival",
    partySize: 2,
    status: "confirmed",
    startsAt: "2026-11-19T12:30:00Z",
    endsAt: "2026-11-19T13:30:00Z",
    depositRequired: 0,
    depositAmount: 0,
  };
  const shift = {
    id: "private-shift",
    status: "open",
    openingFloat: 0,
    openedAt: "2026-11-19T10:00:00Z",
  };
  globalThis.fetch = (async (input: any) =>
    String(input).endsWith("/context")
      ? Response.json(scoped)
      : String(input).includes("/workspace")
        ? Response.json({
            ...snapshot("branch-1"),
            orders: [],
            serverTime: "2026-11-19T12:00:00Z",
            branch: { timezone: "UTC" },
            report: {
              date: "2026-11-19",
              orders: 0,
              collections: 0,
              netSales: 0,
              outstanding: 0,
              paymentMethods: {},
            },
            delayedOrders: [],
            lowStockAlerts: [],
            reservations: [
              reservation,
              {
                ...reservation,
                id: "requested-booking",
                displayName: "Requested party",
                status: "requested",
              },
            ],
            shifts: [
              shift,
              {
                ...shift,
                id: "closed-shift",
                status: "closed",
                expectedCash: 0,
                countedCash: 0,
              },
            ],
          })
        : Response.json({})) as typeof fetch;
  try {
    render(<Workspace user={user} />);
    fireEvent.click(
      await screen.findByRole("tab", { name: "Overview", exact: true }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review reservation Local arrival",
        exact: true,
      }),
    );
    assert(
      document.activeElement ===
        screen.getByRole("heading", {
          name: "Reservations",
          level: 1,
          exact: true,
        }),
    );
    assert(screen.getByText("Showing the selected reservation."));
    assert(screen.getByRole("heading", { name: "Local arrival", exact: true }));
    assert(
      !screen.queryByRole("heading", { name: "Requested party", exact: true }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Overview", exact: true }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review this shift",
        exact: true,
      }),
    );
    assert.equal(choiceValue(screen, "Show shifts"), "attention");
    assert(screen.getByRole("heading", { name: "Open shift", exact: true }));
    assert(
      !screen.queryByRole("heading", { name: "Closed shift", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("tab", { name: "Reservations", exact: true }),
    );
    assert(
      screen.getByRole("button", { name: "All", exact: true, pressed: true }),
    );
    assert(
      screen.getByRole("heading", { name: "Requested party", exact: true }),
    );
  } finally {
    cleanup();
    globalThis.fetch = previousFetch;
    window.sessionStorage.clear();
  }
});

test("mobile workspace selection focuses destination heading without changing desktop manual-tab focus", async () => {
  try {
    render(<Workspace user={user} />);
    const orders = await screen.findByRole("tab", {
      name: "Orders",
      exact: true,
    });
    orders.focus();
    fireEvent.click(orders);
    assert(document.activeElement === orders);
    const toggle = screen.getByRole("button", {
      name: "Workspace menu",
      exact: true,
    });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("tab", { name: "Orders", exact: true }));
    await waitFor(() =>
      assert(
        document.activeElement ===
          screen.getByRole("heading", {
            name: "Orders",
            level: 1,
            exact: true,
          }),
      ),
    );
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    fireEvent.change(screen.getByRole("searchbox", { name: "Find orders" }), {
      target: { value: "customer" },
    });
    const search = screen.getByRole("searchbox", { name: "Find orders" });
    search.focus();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh workspace", exact: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(document.activeElement === search);
  } finally {
    cleanup();
  }
});

for (const role of ["stock_controller", "branch_manager"])
  test(`branch-scoped ${role} catalog never mounts forbidden organization menu reads or loses its filter on refresh`, async () => {
    const previous = globalThis.fetch;
    const reads: string[] = [];
    const scopedUser = { ...user, id: "10000000-0000-4000-8000-000000000001" };
    const organizationId = "20000000-0000-4000-8000-000000000001";
    const branchId = "30000000-0000-4000-8000-000000000001";
    const { rolePermissions } = await import("../shared/mera-contracts.js");
    globalThis.fetch = (async (input: any) => {
      const path = String(input);
      reads.push(path);
      if (path.endsWith("/context"))
        return Response.json({
          ...context,
          user: scopedUser,
          organizations: [
            {
              ...context.organizations[0],
              id: organizationId,
              branches: [
                {
                  id: branchId,
                  name: "Surulere",
                  settings: { capabilities: ["table_service", "reservations"] },
                },
              ],
              branchIds: [branchId],
              role,
              organizationWide: false,
              permissions: rolePermissions[
                role as keyof typeof rolePermissions
              ].filter((permission) => permission !== "reports.view"),
            },
          ],
        });
      if (path.endsWith("/workspace"))
        return Response.json({
          ...snapshot("branch-1"),
          products: [
            {
              id: "tea",
              name: "Fresh Lemonade",
              code: "TEA",
              category: "Tea",
              price: 150000,
            },
          ],
          orders: [],
          tickets: [],
        });
      if (path.endsWith("/menus"))
        return Response.json(
          { error: "Organization scope denied" },
          { status: 403 },
        );
      if (path.endsWith("/categories"))
        return Response.json({ categories: [] });
      return Response.json({ movements: [] });
    }) as any;
    try {
      render(<Workspace user={scopedUser} notify={() => {}} />);

      const input = await screen.findByRole("searchbox", {
        name: "Find a product",
      });
      fireEvent.change(input, { target: { value: "Fresh Lemonade" } });
      assert(!screen.queryByRole("tab", { name: "Shared menus" }));
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "Refresh workspace" }),
        ),
      );
      await waitFor(() =>
        assert(!screen.queryByText("Loading branch records…")),
      );
      assert.equal(
        (
          screen.getByRole("searchbox", {
            name: "Find a product",
          }) as HTMLInputElement
        ).value,
        "Fresh Lemonade",
      );
      assert(
        !reads.some((path) => path.endsWith("/menus")),
        "hidden organization menu tools must not send forbidden reads",
      );
      assert(!screen.queryByRole("alert"));
    } finally {
      cleanup();
      globalThis.fetch = previous;
      window.sessionStorage.clear();
    }
  });

test("creating a table submits the visible default one seat without requiring a quantity edit", async () => {
  const originalFetch = globalThis.fetch;
  const permissions = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("tables.manage");
  let body: any;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/tables") && init.method === "POST") {
      body = JSON.parse(init.body);
      return Response.json({ id: "new-table", ...body });
    }
    return originalFetch(input, init);
  }) as any;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    fireEvent.click(
      await screen.findByRole("tab", { name: "Tables & visits" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Floor layout" }));
    assert.equal(
      (screen.getByLabelText("Seats") as HTMLInputElement).value,
      "1",
    );
    fireEvent.change(screen.getByLabelText("Table label"), {
      target: { value: "Table one" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create table", exact: true }),
    );
    await waitFor(() => assert.ok(body));
    assert.equal(body.capacity, 1);
    assert.equal(body.name, "Table one");
    assert.equal(body.zone, "Main floor");
  } finally {
    cleanup();
    context.organizations[0].permissions = permissions;
    globalThis.fetch = originalFetch;
  }
});

test("seated POS package review carries the table context into quote and order", async () => {
  const originalFetch = globalThis.fetch;
  const permissions = [...context.organizations[0].permissions];
  context.organizations[0].permissions.push("orders.create", "tables.manage");
  const products = [
    {
      id: "tea",
      name: "Bottle package",
      kind: "package",
      requiresTable: true,
      components: [{ productId: "soda", quantity: 1 }],
      available: true,
      price: 150000,
    },
    { id: "soda", name: "Orange soda", available: true, price: 120000 },
  ];
  const posts: any[] = [];
  const quotes: any[] = [];
  let submitEvents = 0;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const path = String(input);
    if (path.endsWith("/workspace"))
      return Response.json({
        ...snapshot("branch-1"),
        branch: {
          name: "Surulere",
          settings: { pricingPolicy: { enabled: true, version: "p1" } },
        },
        menuVersion: 1,
        products,
        counterProducts: products,
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
    if (path.endsWith("/quote")) {
      quotes.push(JSON.parse(init.body));
      return Response.json({
        id: "reviewed-quote",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        subtotal: 270000,
        total: 270000,
        lines: [],
        policyVersion: "p1",
      });
    }
    if (path.endsWith("/orders") && init.method === "POST") {
      posts.push(JSON.parse(init.body));
      return Response.json({ id: "created" });
    }
    return originalFetch(input, init);
  }) as any;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Point of sale" }));
    const packageButton = (await screen.findByRole("button", {
      name: "Add Bottle package to order",
    })) as HTMLButtonElement;
    assert.equal(
      packageButton.disabled,
      true,
      "Counter POS must block table-only packages",
    );
    chooseField(screen, fireEvent, "Fulfillment", "table_service");
    chooseField(screen, fireEvent, "Open table visit", "visit-1");
    assert.equal(packageButton.disabled, false);
    fireEvent.click(packageButton);
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add Orange soda to order" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review current order total" }),
    );
    await screen.findByText("Reviewed order total");
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0].fulfillment, "table_service");
    assert.equal(quotes[0].visitId, "visit-1");
    assert.equal(quotes[0].items[0].productId, "tea");
    const submit = screen.getByRole("button", {
      name: "Submit order",
    }) as HTMLButtonElement;
    const form = submit.form!;
    assert.equal(form, submit.closest("form"));
    assert.equal(form.checkValidity(), true);
    assert.equal(submit.matches(":disabled"), false);
    form.addEventListener("submit", () => {
      submitEvents++;
    });
    fireEvent.click(submit);
    await waitFor(() => assert.equal(posts.length, 1));
    assert.equal(submitEvents, 1);
    assert.equal(posts[0].fulfillment, "table_service");
    assert.equal(posts[0].visitId, "visit-1");
    assert.equal(posts[0].quoteId, "reviewed-quote");
    assert.equal(posts[0].items.length, 2);
    await waitFor(() =>
      assert.equal(
        (
          screen.getByRole("button", {
            name: "Submit order",
          }) as HTMLButtonElement
        ).disabled,
        true,
      ),
    );
  } finally {
    cleanup();
    context.organizations[0].permissions = permissions;
    globalThis.fetch = originalFetch;
  }
});
