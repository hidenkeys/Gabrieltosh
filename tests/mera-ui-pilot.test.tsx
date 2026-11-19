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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: StaffPos } = await import("../src/mera/workspace/StaffPos");
const { default: WorkspaceNavigation } =
  await import("../src/mera/workspace/WorkspaceNavigation");
test("POS search preserves selected customization and totals while unavailable selections remain removable", () => {
  const products = [
    {
      id: "tea",
      name: "Milk tea",
      category: "Drinks",
      code: "T",
      available: true,
      price: 10000,
      variants: [{ id: "large", name: "Large", price: 15000 }],
      modifierGroups: [
        {
          id: "topping",
          name: "Toppings",
          min: 1,
          max: 1,
          options: [{ id: "boba", name: "Boba", price: 5000 }],
        },
      ],
    },
    {
      id: "cake",
      name: "Cake",
      code: "C",
      category: "Food",
      available: false,
      price: 7000,
    },
  ];
  function Harness() {
    const [lines, setLines] = React.useState<any[]>([
      { productId: "cake", quantity: 1, modifiers: [] },
    ]);
    return (
      <StaffPos
        products={products}
        lines={lines}
        onChange={setLines}
        disabled={false}
        details={
          <label>
            Guest
            <input />
          </label>
        }
        staffName="Staff"
      >
        <button type="button">Review total</button>
      </StaffPos>
    );
  }
  try {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add Milk tea to order" }),
    );
    fireEvent.change(screen.getByLabelText("Size for Milk tea"), {
      target: { value: "large" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Boba +₦50.00" }));
    assert.ok(screen.getByText("Complete selections"));
    assert.equal(screen.queryByText("₦270.00"), null);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search counter menu" }),
      { target: { value: "nothing matches" } },
    );
    assert.ok(
      screen.getByText("No items match. Try another name or category."),
    );
    assert.equal(
      (screen.getByLabelText("Size for Milk tea") as HTMLSelectElement).value,
      "large",
    );
    assert.equal(
      (
        screen.getByRole("checkbox", {
          name: "Boba +₦50.00",
        }) as HTMLInputElement
      ).checked,
      true,
    );
    fireEvent.change(screen.getByLabelText("Quantity of Cake"), {
      target: { value: "0" },
    });
    assert.equal(screen.queryByLabelText("Quantity of Cake"), null);
    assert.ok(screen.getByText("₦200.00"));
  } finally {
    cleanup();
  }
});
test("grouped workspace navigation supports explicit keyboard selection without a duplicate picker", () => {
  const selected: string[] = [];
  try {
    render(
      <WorkspaceNavigation
        organization="Venue"
        branch="Branch"
        active="overview"
        sections={[
          ["overview", "Your branch", "reports.view"],
          ["counter", "Point of sale", "orders.create"],
          ["orders", "Orders", "orders.view"],
        ]}
        onSelect={(id) => selected.push(id)}
      />,
    );
    assert.equal(screen.queryByLabelText("Workspace page"), null);
    const counter = screen.getByRole("tab", { name: "Point of sale" });
    counter.focus();
    fireEvent.keyDown(counter, { key: "ArrowDown" });
    assert.equal(
      document.activeElement,
      screen.getByRole("tab", { name: "Orders" }),
    );
    assert.deepEqual(selected, []);
    fireEvent.click(screen.getByRole("tab", { name: "Orders" }));
    assert.deepEqual(selected, ["orders"]);
    fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
    assert.equal(
      screen
        .getByRole("button", { name: "Workspace menu" })
        .getAttribute("aria-expanded"),
      "true",
    );
    fireEvent.keyDown(screen.getByRole("navigation"), { key: "Escape" });
    assert.equal(
      screen
        .getByRole("button", { name: "Workspace menu" })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(
      document.activeElement,
      screen.getByRole("button", { name: "Workspace menu" }),
    );
  } finally {
    cleanup();
  }
});

test("account popup closes by Escape or outside pointer, retaining workspace sign-out ownership", async () => {
  const { default: WorkspaceAccount } =
    await import("../src/mera/workspace/WorkspaceAccount");
  let signOuts = 0;
  try {
    const { rerender } = render(
      <WorkspaceAccount
        name="Mera Owner"
        role="Owner"
        disabled={false}
        signingOut={false}
        onSignOut={() => signOuts++}
      />,
    );
    const details = document.querySelector("details")!;
    const summary = document.querySelector("summary")!;
    details.open = true;
    fireEvent.keyDown(summary, { key: "Escape" });
    assert.equal(details.open, false);
    assert.equal(document.activeElement, summary);
    details.open = true;
    fireEvent.pointerDown(document.body);
    assert.equal(details.open, false);
    details.open = true;
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    assert.equal(signOuts, 1);
    assert.equal(details.open, false);
    rerender(
      <WorkspaceAccount
        name="Mera Owner"
        role="Owner"
        disabled={true}
        signingOut={false}
        onSignOut={() => signOuts++}
      />,
    );
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Sign out",
          hidden: true,
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    assert.equal(signOuts, 1);
  } finally {
    cleanup();
  }
});

test("overview attention distinguishes unavailable alerts, scopes actions and uses actual service records", async () => {
  const { default: OverviewAttention } =
    await import("../src/mera/workspace/OverviewAttention");
  const actions: string[] = [];
  try {
    const { rerender } = render(
      <OverviewAttention
        data={{}}
        canNavigate={(id) => ["orders", "menu"].includes(id)}
        onNavigate={(id) => actions.push(id)}
      />,
    );
    assert.ok(screen.getByText("Waiting-time alerts are unavailable."));
    assert.ok(screen.getByText("Stock alerts are unavailable."));
    assert.equal(screen.queryByText("Shift status"), null);
    fireEvent.click(screen.getByRole("button", { name: "Review stock" }));
    assert.deepEqual(actions, ["menu"]);
    rerender(
      <OverviewAttention
        data={{
          serverTime: "2026-11-18T12:00:00Z",
          delayedOrders: [{ id: "order", reference: "M-001", ageMinutes: 21 }],
          lowStockAlerts: [{ productId: "tea", name: "Milk tea", stock: 2 }],
          shifts: [
            { id: "shift", status: "pending_approval", variance: 15000 },
          ],
          reservations: [
            {
              id: "past",
              displayName: "Past guest",
              status: "confirmed",
              startsAt: "2026-11-17T12:00:00Z",
              endsAt: "2026-11-17T13:00:00Z",
            },
            {
              id: "next",
              displayName: "Next guest",
              status: "confirmed",
              startsAt: "2026-11-18T13:00:00Z",
              endsAt: "2026-11-18T14:00:00Z",
            },
          ],
        }}
        canNavigate={() => true}
        onNavigate={(id) => actions.push(id)}
      />,
    );
    assert.ok(screen.getByText("21 min"));
    assert.ok(screen.getByText("2 left"));
    assert.ok(screen.getByText("Next guest"));
    assert.equal(screen.queryByText("Past guest"), null);
    assert.ok(screen.getByText("Variance ₦150.00"));
    fireEvent.click(screen.getByRole("button", { name: "Review arrivals" }));
    assert.deepEqual(actions, ["menu", "reservations"]);
  } finally {
    cleanup();
  }
});

test("date reports reject a different business date and recover without relabeling its totals", async () => {
  const { default: ReportExplorer } =
    await import("../src/mera/workspace/ReportExplorer");
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () =>
    Response.json({
      report: {
        date: ++calls === 1 ? "2026-11-18" : "2026-11-17",
        products: [],
      },
    });
  try {
    render(
      <ReportExplorer
        base="/organizations/org/branches/branch"
        disabled={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Business date"), {
      target: { value: "2026-11-17" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Load date report" }).closest("form")!,
    );
    const error = await screen.findByRole("alert");
    assert.match(error.textContent || "", /different trading day/);
    assert.equal(
      screen.queryByRole("heading", {
        name: "Trading day detail · 18 Nov 2026",
      }),
      null,
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Load date report" }).closest("form")!,
    );
    await screen.findByRole("heading", {
      name: "Trading day detail · 17 Nov 2026",
    });
    assert.equal(screen.queryByRole("alert"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("workspace navigation uses the current organization branding and a truthful connection state", () => {
  try {
    const { container, rerender } = render(
      <WorkspaceNavigation
        sections={[["counter", "Counter"]]}
        active="counter"
        onSelect={() => {}}
        organization="Bing Chun"
        branch="Surulere"
        logo="/brand/brand-logo.png"
        connectionState="offline"
      />,
    );
    assert.equal(
      container.querySelector("img")?.getAttribute("src"),
      "/brand/brand-logo.png",
    );
    assert.ok(screen.getByText("Connection interrupted"));
    assert.equal(screen.queryByText("Service connected"), null);
    fireEvent.error(container.querySelector("img")!);
    assert.equal(container.querySelector("img"), null);
    rerender(
      <WorkspaceNavigation
        sections={[["counter", "Counter"]]}
        active="counter"
        onSelect={() => {}}
        organization="Another venue"
        branch="Main"
        logo="/uploads/another-venue.png"
        connectionState="connected"
      />,
    );
    assert.equal(
      container.querySelector("img")?.getAttribute("src"),
      "/uploads/another-venue.png",
    );
    assert.ok(screen.getByText("Service connected"));
    assert.equal(screen.queryByText("Bing Chun"), null);
  } finally {
    cleanup();
  }
});

test("account setup notice stays actionable and respects a busy workspace", async () => {
  const { default: WorkspaceAccount } =
    await import("../src/mera/workspace/WorkspaceAccount");
  let reviews = 0;
  const notice = {
    message: "Trial end date needs review.",
    label: "Review subscription",
    onReview: () => reviews++,
  };
  try {
    const { rerender } = render(
      <WorkspaceAccount
        name="Owner"
        role="owner"
        disabled={true}
        signingOut={false}
        notice={notice}
      />,
    );
    const details = document.querySelector("details")!;
    details.open = true;
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Review subscription",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    assert.equal(
      document.querySelector("summary")?.getAttribute("aria-describedby"),
      "mw-account-notice",
    );
    rerender(
      <WorkspaceAccount
        name="Owner"
        role="owner"
        disabled={false}
        signingOut={false}
        notice={notice}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review subscription" }),
    );
    assert.equal(reviews, 1);
    assert.equal(details.open, false);
  } finally {
    cleanup();
  }
});

test("mobile navigation selection requests destination focus and every dismissal restores its own toggle", () => {
  const selected: any[] = [];
  try {
    render(
      <WorkspaceNavigation
        organization="Venue"
        branch="Branch"
        active="overview"
        sections={[
          ["overview", "Overview"],
          ["orders", "Orders"],
        ]}
        onSelect={(...args) => selected.push(args)}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Workspace menu" });
    const orders = screen.getByRole("tab", { name: "Orders", exact: true });
    orders.focus();
    fireEvent.click(orders);
    assert.deepEqual(selected.at(-1), ["orders", { focusDestination: false }]);
    assert(document.activeElement === orders);
    fireEvent.click(toggle);
    fireEvent.click(orders);
    assert.deepEqual(selected.at(-1), ["orders", { focusDestination: true }]);
    assert(document.activeElement === toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    for (const dismissal of ["close", "backdrop", "escape"]) {
      fireEvent.click(toggle);
      if (dismissal === "escape")
        fireEvent.keyDown(screen.getByRole("navigation"), { key: "Escape" });
      else {
        const controls = screen.getAllByRole("button", {
          name: "Close workspace menu",
        });
        fireEvent.click(controls[dismissal === "backdrop" ? 0 : 1]);
      }
      assert(document.activeElement === toggle);
      assert.equal(toggle.getAttribute("aria-expanded"), "false");
    }
  } finally {
    cleanup();
  }
});

test("mobile drawer contains Tab after roving focus moves beyond the selected tab", () => {
  try {
    render(
      <WorkspaceNavigation
        organization="Venue"
        branch="Branch"
        active="counter"
        sections={[
          ["counter", "Counter"],
          ["overview", "Overview"],
          ["support", "Support"],
        ]}
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
    const firstTab = screen.getByRole("tab", { name: "Point of sale" });
    fireEvent.keyDown(firstTab, { key: "End" });
    const last = screen.getByRole("tab", { name: "Support" });
    assert(document.activeElement === last);
    fireEvent.keyDown(last, { key: "Tab" });
    assert(
      document.activeElement ===
        screen.getByRole("navigation").querySelector(".mw-close-nav"),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    assert(document.activeElement === firstTab);
  } finally {
    cleanup();
  }
});
