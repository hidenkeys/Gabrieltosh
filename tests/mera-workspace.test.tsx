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
