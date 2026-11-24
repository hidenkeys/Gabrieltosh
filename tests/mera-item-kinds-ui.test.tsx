import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
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
const { render, screen, fireEvent, cleanup, waitFor } =
  await import("@testing-library/react");
const { default: ItemKindEditor, itemKindBody } =
  await import("../src/mera/workspace/ItemKindEditor");
const { default: CustomizationDialog } =
  await import("../src/mera/customer/CustomizationDialog");
const { choiceKey } = await import("../src/mera/customer/ItemContents");
const { default: QrLinkPreview } =
  await import("../src/mera/workspace/QrLinkPreview");
const products = [
  {
    id: "spirit",
    name: "Hennessy VS",
    kind: "single",
    available: true,
    stockMode: "counted",
    stock: 0,
  },
];
test.afterEach(cleanup);
test("kind switch reveals package fields and sends kobo with component stock", () => {
  let saved: any;
  function Editor() {
    const [value, setValue] = React.useState<any>({
      kind: "single",
      price: 250000,
      components: [],
    });
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saved = { ...value, ...itemKindBody(value) };
        }}
      >
        <ItemKindEditor value={value} products={products} onChange={setValue} />
        <button>Save product</button>
      </form>
    );
  }
  render(<Editor />);
  assert.equal(
    screen.queryByRole("button", { name: "Add component item" }),
    null,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Package" }));
  fireEvent.click(screen.getByRole("button", { name: "Add component item" }));
  fireEvent.focus(screen.getByRole("combobox", { name: "Component item 1" }));
  fireEvent.click(screen.getByRole("option", { name: "Hennessy VS" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Increase Component quantity 1" }),
  );
  fireEvent.change(screen.getByLabelText("Cost to you"), {
    target: { value: "1200.50" },
  });
  fireEvent.click(
    screen.getByRole("switch", { name: "Only for booked or seated tables" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save product" }));
  assert.equal(saved.unitCost, 120050);
  assert.equal(saved.stockMode, "unlimited");
  assert.equal(saved.requiresTable, true);
  assert.deepEqual(saved.components, [
    { productId: "spirit", variantId: null, quantity: 2 },
  ]);
  assert.match(
    screen.getByText(/Unavailable: Hennessy/).textContent!,
    /out of stock/,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Meal or combo" }));
  assert.equal(
    screen.queryByRole("button", { name: "Add component item" }),
    null,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add choice group" }));
  assert.ok(screen.getByLabelText("Choice group name"));
  fireEvent.click(screen.getByRole("radio", { name: "Single item" }));
  fireEvent.click(screen.getByRole("button", { name: "Save product" }));
  assert.deepEqual(saved.components, []);
  assert.deepEqual(saved.choiceGroups, []);
});
const combo = {
  id: "meal",
  name: "Lunch",
  available: true,
  kind: "combo",
  choiceGroups: [
    {
      id: "drink",
      name: "Drink",
      min: 1,
      max: 1,
      options: [
        { productId: "tea", name: "Tea", priceDelta: 5000 },
        { productId: "water", name: "Water", priceDelta: 0 },
      ],
    },
  ],
};
const common = {
  variantId: "",
  modifierIds: [],
  disabled: false,
  onVariantChange: () => {},
  onModifierToggle: () => {},
  onClose: () => {},
  onAdd: () => {},
};
test("guest combo enforces minimum and maximum with a live price", () => {
  function Sheet() {
    const [keys, setKeys] = React.useState<string[]>([]);
    return (
      <CustomizationDialog
        {...common}
        product={combo}
        choiceKeys={keys}
        onChoicesChange={setKeys}
        estimate={
          10000 +
          (keys.includes(choiceKey("drink", combo.choiceGroups[0].options[0]))
            ? 5000
            : 0)
        }
      />
    );
  }
  render(<Sheet />);
  assert.equal(
    (screen.getByRole("button", { name: "Add to basket" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Tea" }));
  assert.equal(
    (screen.getByRole("button", { name: "Add to basket" }) as HTMLButtonElement)
      .disabled,
    false,
  );
  assert.equal(
    (screen.getByRole("checkbox", { name: "Water" }) as HTMLInputElement)
      .disabled,
    true,
  );
  assert.match(
    screen.getByRole("button", { name: "Add to basket" }).textContent!,
    /150/,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Tea" }));
  assert.equal(
    (screen.getByRole("button", { name: "Add to basket" }) as HTMLButtonElement)
      .disabled,
    true,
  );
});
test("table-only package disables add without a seated or booked table context", () => {
  const product = {
    id: "bottle",
    name: "Bottle service",
    kind: "package",
    requiresTable: true,
    components: [{ productId: "spirit", name: "Hennessy VS", quantity: 1 }],
    serves: 4,
  };
  const view = render(
    <CustomizationDialog {...common} product={product} estimate={500000} />,
  );
  assert.ok(screen.getByText("Available for booked or seated tables"));
  assert.equal(
    (screen.getByRole("button", { name: "Add to basket" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  view.rerender(
    <CustomizationDialog
      {...common}
      product={product}
      estimate={500000}
      hasTable
    />,
  );
  assert.equal(
    (screen.getByRole("button", { name: "Add to basket" }) as HTMLButtonElement)
      .disabled,
    false,
  );
});
test("QR preview renders server URL, warnings and phone before publication", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        url: "https://venue.example/mera/menu/venue/branch?preview=staff-token",
        label: "Counter",
        opensAs: "counter_pickup",
        warnings: ["Menu not published yet"],
        menuPublished: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  try {
    render(
      <QrLinkPreview base="/organizations/org/branches/branch" tables={[]} />,
    );
    await waitFor(() => assert.ok(screen.getByText("Menu not published yet")));
    assert.equal(
      screen
        .getByRole("link", { name: "Open in new tab" })
        .getAttribute("href"),
      "https://venue.example/mera/menu/venue/branch?preview=staff-token",
    );
    assert.ok(screen.getByText("Opens as: Order and collect at the counter"));
    assert.equal(
      screen.getByTitle("Guest menu preview").getAttribute("src"),
      "https://venue.example/mera/menu/venue/branch?preview=staff-token",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("counter combo add sheet retains choices and includes extra price in validation", async () => {
  const { default: StaffPos } = await import("../src/mera/workspace/StaffPos");
  const { validateStaffSelection } =
    await import("../src/mera/workspace/staffSelection");
  let saved: any[] = [];
  render(
    <StaffPos
      products={[
        {
          ...combo,
          price: 10000,
          variants: [],
          modifierGroups: [],
          category: "Meals",
        },
      ]}
      lines={[]}
      onChange={(lines) => {
        saved = lines;
      }}
      disabled={false}
      details={null}
      staffName="Staff"
    >
      {null}
    </StaffPos>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Lunch/ }));
  assert.ok(screen.getByRole("dialog", { name: "Lunch" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Tea" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
  assert.deepEqual(saved[0].choices, [
    { groupId: "drink", productId: "tea", variantId: null },
  ]);
  assert.equal(
    validateStaffSelection([{ ...combo, price: 10000 }], saved).estimate,
    15000,
  );
  assert.equal(
    validateStaffSelection(
      [{ ...combo, price: 10000 }],
      [{ ...saved[0], choices: [] }],
    ).complete,
    false,
  );
});

test("guest staff preview loads draft token without a guest session or writes", async () => {
  const { default: CustomerExperience } =
    await import("../src/mera/customer/CustomerExperience");
  const original = globalThis.fetch,
    calls: string[] = [];
  window.history.replaceState(
    {},
    "",
    "/mera/menu/test/branch?preview=staff-token",
  );
  globalThis.fetch = async (input, init) => {
    calls.push(`${init?.method || "GET"} ${input}`);
    if (String(input).includes("/menu?preview="))
      return Response.json({
        organization: { name: "Test", slug: "test", branding: {} },
        branch: { name: "Branch", settings: {} },
        products: [],
        tables: [],
        version: 0,
        preview: true,
        orderingAvailable: false,
        reservations: { enabled: false },
      });
    if (String(input).includes("/branches"))
      return Response.json({ branches: [] });
    throw Error(`Unexpected preview request: ${input}`);
  };
  try {
    render(<CustomerExperience organizationSlug="test" branchId="branch" />);
    await screen.findByText("Preview - orders are off");
    assert.ok(calls.some((path) => path.includes("/menu?preview=staff-token")));
    assert.ok(
      calls.every(
        (path) => path.startsWith("GET ") && !path.endsWith("/guest"),
      ),
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
    window.history.replaceState({}, "", "/");
  }
});
