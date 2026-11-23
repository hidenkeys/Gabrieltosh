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
const { render, screen, fireEvent, waitFor, cleanup } =
  await import("@testing-library/react");
const { default: StockMovements } =
  await import("../src/mera/workspace/StockMovements");

test("stock history requires a product and distinguishes failed loading from a successful empty result", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let fail = true;
  globalThis.fetch = (async (input: any) => {
    requests.push(String(input));
    return fail
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : Response.json({ movements: [], hasOlder: false });
  }) as any;
  try {
    render(
      <StockMovements
        base="/organizations/org/branches/branch"
        products={[
          { id: "product-1", name: "Tea", stockMode: "counted", stock: 5 },
        ]}
        disabled={false}
        save={async () => {
          throw new Error("No write expected");
        }}
      />,
    );
    assert(screen.getByText("Choose a product to see its stock movements."));
    assert.equal(requests.length, 0);
    fireEvent.focus(screen.getByLabelText("Stock product"));
    fireEvent.click(screen.getByRole("option", {name: "Tea 5 in stock"}));
    await screen.findByText("Stock movements could not be loaded. Try again.");
    assert.equal(
      screen.queryByText("No stock movements for this product."),
      null,
    );
    assert(requests[0].includes("productId=product-1"));
    fail = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading movements" }),
    );
    await screen.findByText("No stock movements for this product.");
    await waitFor(() => assert.equal(screen.queryByRole("alert"), null));
    assert.equal(requests.length, 2);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
