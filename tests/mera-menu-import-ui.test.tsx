import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://mera.test/mera/workspace",
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
const { render, screen, cleanup, fireEvent, waitFor } =
  await import("@testing-library/react");
const { default: MenuImport } =
  await import("../src/mera/workspace/MenuImport");
const draft = {
  currency: "NGN",
  categories: [
    {
      name: "Food",
      items: [
        {
          name: "Rice",
          description: "With vegetables",
          price: null,
          sizes: [],
          addOns: [],
          dietary: [],
          station: "kitchen" as const,
          confidence: "low" as const,
          note: "Check the price",
        },
      ],
    },
  ],
  warnings: ["Review all prices"],
};
test("review renders draft and low-confidence reason; missing price disables import; edited payload is submitted", async () => {
  const original = globalThis.fetch;
  let payload: any,
    refreshes = 0;
  globalThis.fetch = async (input, options) => {
    assert.equal(String(input), "/api/mera/v1/branch/menu-import/apply");
    payload = JSON.parse(String(options?.body));
    return Response.json({ created: 1, skipped: [], categoriesCreated: 1 });
  };
  try {
    render(
      <MenuImport
        base="/branch"
        initialDraft={structuredClone(draft)}
        onClose={() => {}}
        onImported={() => {
          refreshes++;
        }}
      />,
    );
    assert(screen.getByRole("table"));
    assert.equal(screen.getAllByRole("row").length, 2);
    assert.equal(
      screen
        .getByRole("button", { name: "Details" })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert(screen.getByText("Review all prices"));
    assert(screen.getByText("Check the price"));
    assert(
      screen
        .getByRole("row", { name: /Include Rice/ })
        .classList.contains("mmi-check"),
    );
    assert(
      (
        screen.getByRole("button", {
          name: "Import 1 items",
        }) as HTMLButtonElement
      ).disabled,
    );
    fireEvent.change(screen.getByLabelText("Price for Rice"), {
      target: { value: "2,500" },
    });
    fireEvent.change(screen.getByLabelText("Item name"), {
      target: { value: "Jollof rice" },
    });
    fireEvent.change(screen.getByLabelText("Category name"), {
      target: { value: "Lunch" },
    });
    assert(
      !(
        screen.getByRole("button", {
          name: "Import 1 items",
        }) as HTMLButtonElement
      ).disabled,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import 1 items" }));
    await screen.findByText("Added 1 items. 0 skipped");
    assert.equal(payload.categories[0].name, "Lunch");
    assert.equal(payload.categories[0].items[0].name, "Jollof rice");
    assert.equal(payload.categories[0].items[0].price, 2500);
    assert.equal(refreshes, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("deselecting missing-price category disables empty import; valid sizes allow import", () => {
  try {
    const withSize = structuredClone(draft);
    withSize.categories[0].items[0].sizes = [
      { name: "Large", price: 3000 },
    ] as never;
    render(
      <MenuImport
        base="/branch"
        initialDraft={withSize}
        onClose={() => {}}
        onImported={() => {}}
      />,
    );
    assert(
      !(
        screen.getByRole("button", {
          name: "Import 1 items",
        }) as HTMLButtonElement
      ).disabled,
    );
    fireEvent.click(screen.getByLabelText("Select category"));
    assert(
      (
        screen.getByRole("button", {
          name: "Import 0 items",
        }) as HTMLButtonElement
      ).disabled,
    );
  } finally {
    cleanup();
  }
});
test("upload validates total size and offers an accessible file picker", () => {
  try {
    render(
      <MenuImport base="/branch" onClose={() => {}} onImported={() => {}} />,
    );
    const file = new dom.window.File(["menu"], "menu.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("Choose files"), {
      target: { files: [file] },
    });
    assert(screen.getByRole("alert").textContent?.includes("10 MB"));
    assert(
      (screen.getByRole("button", { name: "Read menu" }) as HTMLButtonElement)
        .disabled,
    );
  } finally {
    cleanup();
  }
});
