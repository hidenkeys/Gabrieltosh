import { chooseField } from "./choice-field-helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
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
const { default: MenuManagement } =
  await import("../src/mera/workspace/MenuManagement");
const products = Array.from({ length: 14 }, (_, i) => ({
  id: String(i),
  name: `Product ${i + 1}`,
  code: `X${i + 1}`,
  category: i % 2 ? "Tea" : "Food",
}));
const mount = () =>
  render(
    <MenuManagement
      products={products}
      header={<h2>Menu products</h2>}
      renderProducts={(rows) => (
        <ul aria-label="Visible products">
          {rows.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      )}
      editor={<input aria-label="Editor draft" defaultValue="" />}
      categories={<input aria-label="Category draft" />}
      stock={<p>Stock settings</p>}
      shared={<p>Shared catalog</p>}
    />,
  );
test("product search, category filters and pagination retain real counts and recover from no results", () => {
  try {
    mount();
    assert.equal(screen.getAllByRole("listitem").length, 12);
    fireEvent.click(screen.getByRole("button", { name: "Show more products" }));
    assert.equal(screen.getAllByRole("listitem").length, 14);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find a product" }),
      { target: { value: "X13" } },
    );
    assert.equal(screen.getAllByRole("listitem").length, 1);
    assert(screen.getByText("Product 13"));
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find a product" }),
      { target: { value: "Missing" } },
    );
    assert(screen.getByText("No products match"));
    fireEvent.click(
      screen.getByRole("button", { name: "Clear product filters" }),
    );
    assert.equal(screen.getAllByRole("listitem").length, 12);
    chooseField(screen, fireEvent, "Product category", "Tea");
    assert.equal(screen.getAllByRole("listitem").length, 7);
  } finally {
    cleanup();
  }
});
test("menu views retain drafts while hidden and use manual keyboard activation", () => {
  try {
    mount();
    fireEvent.change(screen.getByLabelText("Editor draft"), {
      target: { value: "Unsaved product" },
    });
    const productTab = screen.getByRole("tab", {
      name: "Products",
      exact: true,
    });
    productTab.focus();
    fireEvent.keyDown(productTab, { key: "ArrowRight" });
    const categoryTab = screen.getByRole("tab", {
      name: "Categories",
      exact: true,
    });
    assert.equal(document.activeElement, categoryTab);
    assert.equal(productTab.getAttribute("aria-selected"), "true");
    fireEvent.click(categoryTab);
    fireEvent.change(screen.getByLabelText("Category draft"), {
      target: { value: "New tea" },
    });
    fireEvent.click(
      screen.getByRole("tab", { name: "Stock & availability", exact: true }),
    );
    assert(screen.getByText("Stock settings"));
    fireEvent.click(categoryTab);
    assert.equal(
      (screen.getByLabelText("Category draft") as HTMLInputElement).value,
      "New tea",
    );
    fireEvent.click(productTab);
    assert.equal(
      (screen.getByLabelText("Editor draft") as HTMLInputElement).value,
      "Unsaved product",
    );
  } finally {
    cleanup();
  }
});
test("an empty catalog offers a clear starting point without pretending publication succeeded", () => {
  try {
    render(
      <MenuManagement
        products={[]}
        header={<button>Add first product</button>}
        renderProducts={() => {
          throw new Error("No products expected");
        }}
        categories={null}
        stock={null}
        shared={null}
      />,
    );
    assert(screen.getByText("Your menu starts here"));
    assert(screen.getByRole("button", { name: "Add first product" }));
    assert.equal(
      screen.queryByRole("button", { name: "Show more products" }),
      null,
    );
  } finally {
    cleanup();
  }
});

test("stock-only access never mounts catalog editing tools and permission reduction selects the allowed view", () => {
  let forbiddenMounts = 0;
  function Forbidden() {
    forbiddenMounts++;
    return <p>Forbidden tools</p>;
  }
  const props = {
    products,
    header: <h2>Catalog</h2>,
    renderProducts: () => <Forbidden />,
    editor: <Forbidden />,
    categories: <Forbidden />,
    stock: <p>Authorized stock tools</p>,
    shared: <Forbidden />,
  };
  try {
    const view = render(
      <MenuManagement
        {...props}
        allowedViews={["stock"]}
        initialView="stock"
      />,
    );
    assert.equal(forbiddenMounts, 0);
    assert(
      screen.getByRole("tab", { name: "Stock & availability", selected: true }),
    );
    assert(!screen.queryByRole("tab", { name: "Products" }));
    view.rerender(<MenuManagement {...props} allowedViews={[]} />);
    assert(screen.getByText("No menu tools are available for your access."));
    assert(!screen.queryByText("Authorized stock tools"));
    assert.equal(forbiddenMounts, 0);
  } finally {
    cleanup();
  }
});
test("an overview stock entry selects stock without discarding a mounted product draft", () => {
  try {
    render(
      <MenuManagement
        products={products}
        initialView="stock"
        header={<h2>Catalog</h2>}
        renderProducts={() => null}
        editor={
          <input
            aria-label="Persistent product draft"
            defaultValue="Original"
          />
        }
        categories={<p>Categories</p>}
        stock={<p>Review stock here</p>}
        shared={<p>Shared</p>}
      />,
    );
    assert(
      screen.getByRole("tab", { name: "Stock & availability", selected: true }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Products" }));
    fireEvent.change(screen.getByLabelText("Persistent product draft"), {
      target: { value: "Unsaved" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Stock & availability" }));
    fireEvent.click(screen.getByRole("tab", { name: "Products" }));
    assert.equal(
      (screen.getByLabelText("Persistent product draft") as HTMLInputElement)
        .value,
      "Unsaved",
    );
  } finally {
    cleanup();
  }
});

test("menu keyboard wrapping follows the visible tab set after permissions limit available views", () => {
  try {
    render(
      <MenuManagement
        products={[]}
        allowedViews={["products", "categories", "stock"]}
        header={<h2>Catalog</h2>}
        renderProducts={() => null}
        categories={<p>Categories</p>}
        stock={<p>Stock</p>}
        shared={<p>Forbidden shared</p>}
      />,
    );
    fireEvent.keyDown(
      screen.getByRole("tab", { name: "Products", exact: true }),
      { key: "ArrowLeft" },
    );
    assert(screen.getByRole("tab", { name: "Products", selected: true }));
    assert(
      document.activeElement ===
        screen.getByRole("tab", { name: "Stock & availability" }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Stock & availability" }));
    assert(
      screen.getByRole("tab", { name: "Stock & availability", selected: true }),
    );
    assert(!screen.queryByText("Forbidden shared"));
  } finally {
    cleanup();
  }
});
