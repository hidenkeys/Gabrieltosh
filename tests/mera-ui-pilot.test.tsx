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
    assert.ok(screen.getByText("₦270.00"));
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
