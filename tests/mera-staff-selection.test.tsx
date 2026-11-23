import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { validateStaffSelection } from "../src/mera/workspace/staffSelection";
import { formatMoney } from "../src/mera/workspace/api";
const product = {
  id: "tea",
  name: "Tea",
  available: true,
  price: 0,
  category: "Drinks",
  variants: [{ id: "large", name: "Large", price: 360000 }],
  modifierGroups: [
    {
      id: "toppings",
      name: "Toppings",
      min: 1,
      max: 1,
      options: [
        { id: "pearls", name: "Pearls", price: 50000 },
        { id: "jelly", name: "Jelly", price: 40000 },
      ],
    },
  ],
};
const line = { productId: "tea", quantity: 2, modifiers: [] };
test("P1 required size and toppings never produce a misleading zero estimate", () => {
  const missing = validateStaffSelection([product], [line]);
  assert.equal(missing.complete, false);
  assert.equal(missing.estimate, null);
  assert(missing.lines[0].needsVariant);
  assert(
    missing.lines[0].messages.some((message) => message.includes("Toppings")),
  );
  const sizeOnly = validateStaffSelection(
    [product],
    [{ ...line, variantId: "large" }],
  );
  assert.equal(sizeOnly.complete, false);
  assert.equal(sizeOnly.estimate, null);
  const complete = validateStaffSelection(
    [product],
    [{ ...line, variantId: "large", modifiers: ["pearls"] }],
  );
  assert.equal(complete.complete, true);
  assert.equal(complete.estimate, 820000);
  assert.equal(complete.lines[0].baseEstimate, 360000);
  assert.equal(complete.lines[0].extrasEstimate, 50000);
  assert.equal(complete.lines[0].unitEstimate, 410000);
});
test("P1 quantities, unknown choices, duplicate modifiers and group bounds fail local completeness", () => {
  for (const patch of [
    { quantity: 0 },
    { quantity: 101 },
    { quantity: 1.5 },
    { variantId: "gone" },
    { modifiers: ["pearls", "pearls"] },
    { modifiers: ["unknown"] },
    { modifiers: ["pearls", "jelly"] },
  ]) {
    const value = validateStaffSelection(
      [product],
      [{ ...line, variantId: "large", modifiers: ["pearls"], ...patch }],
    );
    assert.equal(value.complete, false, JSON.stringify(patch));
    assert.equal(value.estimate, null);
  }
  assert.equal(
    validateStaffSelection([], [{ ...line, variantId: "large" }]).complete,
    false,
  );
  assert.equal(
    validateStaffSelection(
      [{ ...product, available: false }],
      [{ ...line, variantId: "large", modifiers: ["pearls"] }],
    ).complete,
    false,
  );
});
test("P1 legitimate free items and optional modifiers stay valid without mutating original retry intent", () => {
  const free = {
    id: "free",
    name: "Water",
    available: true,
    price: 0,
    variants: [],
    modifierGroups: [],
  };
  assert.deepEqual(
    validateStaffSelection(
      [free],
      [{ productId: "free", quantity: 1, modifiers: [] }],
    ).estimate,
    0,
  );
  assert(
    validateStaffSelection(
      [free],
      [{ productId: "free", quantity: 1, modifiers: [] }],
    ).complete,
  );
  assert.equal(validateStaffSelection([product], []).complete, false);
  const original = { ...line, variantId: "large", modifiers: ["pearls"] },
    before = JSON.stringify(original);
  validateStaffSelection([], [original]);
  assert.equal(JSON.stringify(original), before);
});
const dom = new JSDOM("<!doctype html><html><body></body></html>");
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
test("P1 basket prompts for choices then displays actual selected base, extras and item estimate", () => {
  function Harness() {
    const [lines, setLines] = React.useState<any[]>([line]);
    return (
      <StaffPos
        products={[product]}
        lines={lines}
        onChange={setLines}
        disabled={false}
        details={null}
        staffName="Ada"
      >
        {null}
      </StaffPos>
    );
  }
  try {
    render(<Harness />);
    assert(screen.getByText("Tea · Choose size"));
    assert.equal(
      screen.getByText("Items estimate").parentElement?.textContent,
      "Items estimateComplete selections",
    );
    fireEvent.change(screen.getByLabelText("Search counter menu"), {
      target: { value: "not found" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /^Large ·/ }));
    assert(screen.getByText("Tea · Complete selections"));
    fireEvent.click(screen.getByRole("checkbox", { name: /Pearls/ }));
    assert(
      screen.getByText(
        `Tea · ${formatMoney(360000)} + ${formatMoney(50000)} add-ons per item`,
      ),
    );
    assert.equal(
      screen.getByText("Items estimate").parentElement?.textContent,
      "Items estimate" + formatMoney(820000),
    );
    assert.equal(
      (screen.getByLabelText("Search counter menu") as HTMLInputElement).value,
      "not found",
    );
    assert.equal(
      (screen.getByLabelText("Quantity of Tea") as HTMLInputElement).value,
      "2",
    );
  } finally {
    cleanup();
  }
});

test("P1 a removed catalog item remains explicitly removable without rewriting other choices", () => {
  const changed: any[] = [];
  try {
    render(
      <StaffPos
        products={[]}
        lines={[{ productId: "gone", quantity: 1, modifiers: ["old"] }]}
        onChange={(value) => changed.push(value)}
        disabled={false}
        details={null}
        staffName="Ada"
      >
        {null}
      </StaffPos>,
    );
    assert.equal(
      screen.getByText("Items estimate").parentElement?.textContent,
      "Items estimateComplete selections",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove unavailable item 1" }),
    );
    assert.deepEqual(changed, [[]]);
  } finally {
    cleanup();
  }
});
