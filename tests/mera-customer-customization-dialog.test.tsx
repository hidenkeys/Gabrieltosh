import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { brandingStyle, brandingTokens, contrast } from "../src/mera/branding";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
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
const { default: CustomizationDialog } =
  await import("../src/mera/customer/CustomizationDialog");
const product = {
  id: "tea",
  name: "Brown sugar tea",
  description: "Freshly prepared tea",
  available: true,
  variants: [
    { id: "regular", name: "Regular", price: 200000 },
    { id: "large", name: "Large", price: 350000 },
  ],
  modifierGroups: [
    {
      id: "sweetness / original",
      name: "Sweetness",
      min: 1,
      max: 1,
      options: [
        { id: "less", name: "Less sugar", price: 0 },
        { id: "extra", name: "Extra pearls", price: 50000 },
      ],
    },
  ],
  dietary: ["Vegetarian"],
  allergens: ["Milk"],
};
const props = {
  product,
  variantId: "regular",
  modifierIds: [],
  estimate: 200000,
  disabled: false,
  onVariantChange: (_id: string) => {},
  onModifierToggle: (_id: string, _checked: boolean) => {},
  onClose: () => {},
  onAdd: () => {},
};
test.afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});
test("customization contains keyboard focus, preserves active controls on rerender and restores initiating control", () => {
  function Harness() {
    const [open, setOpen] = React.useState(false),
      [variant, setVariant] = React.useState("regular");
    return (
      <>
        <main inert={open}>
          <button onClick={() => setOpen(true)}>Choose tea</button>
        </main>
        {open && (
          <CustomizationDialog
            {...props}
            variantId={variant}
            onVariantChange={setVariant}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }
  document.body.style.overflow = "clip";
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Choose tea" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  assert.equal(
    document.activeElement === dialog,
    true,
    "dialog receives initial focus",
  );
  assert.equal(document.body.style.overflow, "hidden");
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  assert.equal(
    document.activeElement ===
      screen.getByRole("button", { name: "Add to basket" }),
    true,
    "reverse Tab reaches last control",
  );
  fireEvent.keyDown(document, { key: "Tab" });
  assert.equal(
    document.activeElement ===
      screen.getByRole("button", { name: "Close customization" }),
    true,
    "forward Tab wraps to close control",
  );
  const size = screen.getByRole("radio", { name: "Large · ₦3,500.00" });
  size.focus();
  fireEvent.click(size);
  assert.equal(
    document.activeElement === size,
    true,
    "size stays focused after controlled rerender",
  );
  assert.equal((size as HTMLSelectElement).value, "large");
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(
    document.activeElement === trigger,
    true,
    "Escape returns focus to original trigger",
  );
  assert.equal(document.body.style.overflow, "clip");
  assert.equal(document.querySelector("main")?.hasAttribute("inert"), false);
});
test("actual variants, modifier adjustment and dietary information use controlled callbacks and parent estimate", () => {
  const variants: string[] = [],
    options: any[] = [],
    adds: string[] = [];
  render(
    <CustomizationDialog
      {...props}
      estimate={77700}
      onVariantChange={(value) => variants.push(value)}
      onModifierToggle={(id, checked) => options.push({ id, checked })}
      onAdd={() => adds.push("add")}
    />,
  );
  assert(screen.getByRole("radio", { name: "Large · ₦3,500.00" }));
  assert(screen.getByText("+₦500.00"));
  assert(screen.getByText("No extra charge"));
  assert(screen.getByText("₦777.00"));
  assert(screen.getByText("Dietary: Vegetarian"));
  assert(screen.getByText(/Milk/));
  fireEvent.click(screen.getByRole("radio", { name: "Large · ₦3,500.00" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Extra pearls" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  assert.deepEqual(variants, ["large"]);
  assert.deepEqual(options, [{ id: "extra", checked: true }]);
  assert.deepEqual(adds, ["add"]);
});
test("required error remains associated with its group and registers actual focus target without resetting dialog", () => {
  let target: HTMLFieldSetElement | null = null;
  const view = render(
    <CustomizationDialog
      {...props}
      registerGroup={(id, node) => {
        if (id === product.modifierGroups[0].id) target = node;
      }}
    />,
  );
  assert(target);
  const option = screen.getByRole("checkbox", { name: "Less sugar" });
  option.focus();
  view.rerender(
    <CustomizationDialog
      {...props}
      errorGroupId={product.modifierGroups[0].id}
      error="Choose 1 option for Sweetness."
      registerGroup={(id, node) => {
        if (id === product.modifierGroups[0].id) target = node;
      }}
    />,
  );
  const group = screen.getByRole("group", { name: "Sweetness · choose 1" });
  assert.equal(group === target, true, "registered group is actual fieldset");
  assert.equal(group.getAttribute("aria-invalid"), "true");
  assert.match(
    group.getAttribute("aria-describedby") || "",
    /mc-modifier-error/,
  );
  assert(screen.getByRole("alert"));
  assert.equal(
    document.activeElement === option,
    true,
    "error rerender does not reset option focus",
  );
  (target as unknown as HTMLElement).focus();
  assert.equal(
    document.activeElement === group,
    true,
    "registered group can receive error focus",
  );
});
test("known sold-out variant cannot add, but an available chosen variant retains its true price", () => {
  let adds = 0;
  const configured = {
    ...product,
    variants: [
      {
        id: "regular",
        name: "Regular",
        price: 200000,
        stockMode: "counted",
        stock: 0,
      },
      {
        id: "large",
        name: "Large",
        price: 350000,
        stockMode: "counted",
        stock: 2,
      },
    ],
  };
  const view = render(
    <CustomizationDialog
      {...props}
      product={configured}
      onAdd={() => {
        adds++;
      }}
    />,
  );
  assert.equal(
    (
      screen.getByRole("radio", {
        name: "Regular · ₦2,000.00 · Sold out",
      }) as HTMLOptionElement
    ).disabled,
    true,
  );
  assert.equal(
    (screen.getByRole("button", { name: "Add to basket" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  assert.equal(adds, 0);
  view.rerender(
    <CustomizationDialog
      {...props}
      product={configured}
      variantId="large"
      estimate={350000}
      onAdd={() => {
        adds++;
      }}
    />,
  );
  assert.equal(
    (screen.getByRole("button", { name: "Add to basket" }) as HTMLButtonElement)
      .disabled,
    false,
  );
  assert(screen.getByText("₦3,500.00"));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  assert.equal(adds, 1);
});
test("theme and font inherit approved brand variables without calculating a payable total or API write", (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw Error("Customization must not call API");
  });
  for (const primary of ["#ffffff", "#000000", "#ffff00"]) {
    const token = brandingTokens({ primary, accent: primary, font: "serif" });
    assert(contrast(token.primary, token.primaryForeground) >= 4.5);
    const view = render(
      <div
        className="mera-customer"
        style={brandingStyle({ primary, accent: primary, font: "serif" })}
      >
        <CustomizationDialog {...props} />
      </div>,
    );
    assert.equal(
      (
        document.querySelector(".mera-customer") as HTMLElement
      ).style.getPropertyValue("--mc-primary"),
      primary,
    );
    assert.match(
      (document.querySelector(".mera-customer") as HTMLElement).style
        .fontFamily,
      /Georgia/,
    );
    assert(screen.getByText(/charges are checked at checkout/));
    view.unmount();
  }
});
test("removed trigger uses parent fallback focus and invalid estimate never becomes zero-price addition", () => {
  let fallback = 0;
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const view = render(
    <CustomizationDialog
      {...props}
      estimate={NaN}
      fallbackFocus={() => {
        fallback++;
      }}
    />,
  );
  trigger.remove();
  assert(screen.getByText("Unavailable"));
  assert.equal(
    (screen.getByRole("button", { name: "Add to basket" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  view.unmount();
  assert.equal(fallback, 1);
});
