import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003",
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
const { default: Categories } =
  await import("../src/mera/workspace/Categories");
const base = "/organizations/org-a/branches/branch-a";
test("O4 category read failure offers explicit retry and never claims an empty catalog", async () => {
  const original = globalThis.fetch;
  let reads = 0;
  const published: any[] = [];
  globalThis.fetch = async () =>
    ++reads === 1
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : Response.json({ categories: [] });
  try {
    render(
      <Categories
        base={base}
        disabled={false}
        save={async () => {
          throw new Error("No writes expected");
        }}
        onCategories={(rows) => published.push(rows)}
      />,
    );
    assert(screen.getByRole("status"));
    assert.equal(screen.queryByText(/No category groups yet/), null);
    const retry = await screen.findByRole("button", {
      name: "Retry loading categories",
    });
    assert(screen.getByRole("alert"));
    assert.equal(screen.queryByText(/No category groups yet/), null);
    assert.deepEqual(published, []);
    fireEvent.click(retry);
    await screen.findByText(
      "No category groups yet. Your existing category names are still used.",
    );
    assert.equal(screen.queryByRole("alert"), null);
    assert.equal(reads, 2);
    assert.deepEqual(published, [[]]);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O4 a late old-scope category response cannot replace rows or invoke the current callback", async () => {
  const original = globalThis.fetch;
  let resolveOld: ((response: Response) => void) | undefined;
  const calls: any[] = [];
  globalThis.fetch = async (input) =>
    String(input).includes("branch-a/")
      ? new Promise<Response>((resolve) => {
          resolveOld = resolve;
        })
      : Response.json({
          categories: [
            {
              id: "new",
              name: "New branch group",
              active: true,
              parentId: null,
              version: 1,
              sortOrder: 0,
            },
          ],
        });
  try {
    const { rerender } = render(
      <Categories
        base={base}
        disabled={false}
        save={async () => {}}
        onCategories={(rows) => calls.push(["old", rows])}
      />,
    );
    assert(resolveOld);
    rerender(
      <Categories
        base="/organizations/org-a/branches/branch-b"
        disabled={false}
        save={async () => {}}
        onCategories={(rows) => calls.push(["new", rows])}
      />,
    );
    await screen.findByRole("button", { name: "Edit New branch group" });
    await act(async () => {
      resolveOld!(
        Response.json({
          categories: [{ id: "old", name: "Private old branch", active: true }],
        }),
      );
      await Promise.resolve();
    });
    assert.equal(screen.queryByText("Private old branch"), null);
    assert.deepEqual(
      calls.map((call) => call[0]),
      ["new"],
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O4 category edits retain existing versioned mutation fields and notify canonical rows", async () => {
  const original = globalThis.fetch;
  const row = {
    id: "c1",
    name: "Tea",
    parentId: null,
    sortOrder: 2,
    active: true,
    version: 7,
  };
  const writes: any[] = [];
  globalThis.fetch = async () => Response.json({ categories: [row] });
  try {
    render(
      <Categories
        base={base}
        disabled={false}
        save={async (...args) => {
          writes.push(args);
        }}
        onCategories={() => {}}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit Tea" }));
    fireEvent.click(screen.getByLabelText("Category active"));
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Save category changes" })
        .closest("form")!,
    );
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0][0], base + "/categories/c1");
    assert.equal(writes[0][1], "PATCH");
    assert.deepEqual(writes[0][2], {
      name: "Tea",
      parentId: null,
      sortOrder: 2,
      active: false,
      version: 7,
    });
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
