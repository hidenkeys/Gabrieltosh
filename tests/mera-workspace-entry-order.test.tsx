import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { chooseField } from "./choice-field-helpers";

// Support both the repository's node:test runner and Vitest (--globals).
const { test } = process.env.VITEST
  ? (globalThis as any)
  : await import("node:test");
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
]) {
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
  });
}
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = await import("react");
const { render, screen, fireEvent, waitFor, cleanup } =
  await import("@testing-library/react");
const { default: Workspace } =
  await import("../src/mera/workspace/OrganizationWorkspace");

const visitId = "11111111-1111-4111-8111-111111111111";
const user = { id: "user-1", name: "Teni" };
const branch = {
  id: "branch-1",
  name: "Surulere",
  settings: {
    capabilities: ["table_service", "reservations", "guest_list"],
    entryProductId: "entry",
  },
};
const products = [
  { id: "tea", name: "Milk tea", available: true, price: 150000 },
  { id: "entry", name: "Entry ticket", available: true, price: 200000 },
];

async function withSeatedDraft(check: (posts: any[]) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const posts: any[] = [];
  sessionStorage.clear();
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const path = String(input);
    if (path.endsWith("/context"))
      return Response.json({
        organizations: [
          {
            id: "org-1",
            name: "Bing Chun",
            role: "cashier",
            permissions: [
              "orders.view",
              "orders.create",
              "tables.manage",
              "door.manage",
            ],
            branchIds: [branch.id],
            branches: [branch],
          },
        ],
      });
    if (path.endsWith("/workspace"))
      return Response.json({
        branch,
        menuVersion: 1,
        products,
        counterProducts: products,
        orders: [],
        reservations: [],
        shifts: [],
        payments: [],
        providers: { rubies: "blocked" },
        tables: [{ id: "table-1", name: "Window table" }],
        visits: [
          {
            id: visitId,
            tableId: "table-1",
            status: "open",
            displayName: "Family",
          },
        ],
      });
    if (path.includes("/guest-list?"))
      return Response.json([
        {
          id: "guest-1",
          name: "Ada",
          partySize: 2,
          arrivedCount: 0,
          status: "expected",
          version: 1,
        },
      ]);
    if (path.endsWith("/orders") && init.method === "POST") {
      posts.push(JSON.parse(init.body));
      return Response.json({ id: "created" });
    }
    return Response.json({});
  }) as typeof fetch;
  try {
    render(<Workspace user={user} notify={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Point of sale" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Milk tea to order" }),
    );
    chooseField(screen, fireEvent, "Fulfillment", "table_service");
    chooseField(screen, fireEvent, "Open table visit", visitId);
    assert.equal(
      (
        screen.getByRole("combobox", {
          name: "Open table visit",
        }) as HTMLInputElement
      ).value,
      "Window table",
    );
    await check(posts);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    sessionStorage.clear();
  }
}

test("Collect entry replaces a seated draft with a counter order without visitId or reservationId", async () => {
  await withSeatedDraft(async (posts) => {
    const more = screen.queryByRole("button", { name: "More", exact: true });
    if (more?.getAttribute("aria-expanded") === "false") fireEvent.click(more);
    fireEvent.click(
      await screen.findByRole("tab", { name: "Door & guest list" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Collect entry" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Submit order" }),
    );
    await waitFor(() => assert.equal(posts.length, 1));
    assert.equal(Object.hasOwn(posts[0], "visitId"), false);
    assert.equal(Object.hasOwn(posts[0], "reservationId"), false);
    assert.equal(posts[0].fulfillment, "counter_pickup");
    assert.deepEqual(posts[0].items, [
      { productId: "entry", quantity: 1, extras: [] },
    ]);
  });
});

test("normal table orders retain visitId", async () => {
  await withSeatedDraft(async (posts) => {
    fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
    await waitFor(() => assert.equal(posts.length, 1));
    assert.equal(posts[0].visitId, visitId);
    assert.equal(posts[0].fulfillment, "table_service");
    assert.equal(posts[0].items[0].productId, "tea");
  });
});
