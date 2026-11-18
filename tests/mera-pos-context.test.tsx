import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
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
const { default: PosOrderContext } =
  await import("../src/mera/workspace/PosOrderContext");
const initial = { displayName: "", fulfillment: "counter_pickup", note: "" };
test("P1 optional context starts closed and retains controlled drafts after closing", () => {
  function Harness() {
    const [draft, setDraft] = React.useState(initial);
    return (
      <PosOrderContext
        draft={draft}
        visits={[]}
        tables={[]}
        canUseTables={false}
        onChange={(patch) => setDraft((value) => ({ ...value, ...patch }))}
      />
    );
  }
  try {
    const { container } = render(<Harness />);
    const details = container.querySelector("details")!;
    assert.equal(details.open, false);
    assert(screen.getByLabelText("Fulfillment"));
    details.open = true;
    fireEvent.change(screen.getByLabelText("Customer name (optional)"), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByLabelText("Order note"), {
      target: { value: "No ice" },
    });
    details.open = false;
    assert(screen.getByText("Ada · Note added"));
    details.open = true;
    assert.equal(
      (screen.getByLabelText("Customer name (optional)") as HTMLInputElement)
        .value,
      "Ada",
    );
    assert.equal(
      (screen.getByLabelText("Order note") as HTMLInputElement).value,
      "No ice",
    );
    assert.equal(
      (screen.getByLabelText("Customer name (optional)") as HTMLInputElement)
        .maxLength,
      100,
    );
    assert.equal(
      (screen.getByLabelText("Order note") as HTMLInputElement).maxLength,
      500,
    );
  } finally {
    cleanup();
  }
});
test("P1 fulfillment patches reset visit without owning request keys or cart state", () => {
  const patches: any[] = [];
  try {
    render(
      <PosOrderContext
        draft={{ ...initial, visitId: "old" }}
        visits={[]}
        tables={[]}
        canUseTables={false}
        onChange={(patch) => patches.push(patch)}
      />,
    );
    fireEvent.change(screen.getByLabelText("Fulfillment"), {
      target: { value: "takeaway" },
    });
    assert.deepEqual(patches, [
      { fulfillment: "takeaway", visitId: undefined },
    ]);
    assert.equal(screen.queryByRole("option", { name: "Table service" }), null);
    assert.equal(screen.queryByLabelText("Open table visit"), null);
  } finally {
    cleanup();
  }
});
test("P1 table choice uses only open current parties and readable table names", () => {
  const patches: any[] = [];
  try {
    render(
      <PosOrderContext
        draft={{ ...initial, fulfillment: "table_service" }}
        visits={[
          {
            id: "private-open-id",
            status: "open",
            tableIds: ["a", "b"],
            displayName: "Ada’s party",
          },
          {
            id: "closed-id",
            status: "closed",
            tableId: "a",
            displayName: "Old party",
          },
          { id: "no-name-id", status: "open", tableId: "missing" },
        ]}
        tables={[
          { id: "a", name: "Garden 1" },
          { id: "b", name: "Garden 2" },
        ]}
        canUseTables
        onChange={(patch) => patches.push(patch)}
      />,
    );
    assert(
      (screen.getByLabelText("Open table visit") as HTMLSelectElement).required,
    );
    assert(
      screen.getByRole("option", { name: "Garden 1 + Garden 2 · Ada’s party" }),
    );
    assert(screen.getByRole("option", { name: "Table · Current party" }));
    assert.equal(screen.queryByRole("option", { name: /Old party/ }), null);
    assert.equal(screen.queryByText("private-open-id"), null);
    fireEvent.change(screen.getByLabelText("Open table visit"), {
      target: { value: "private-open-id" },
    });
    assert.deepEqual(patches, [{ visitId: "private-open-id" }]);
  } finally {
    cleanup();
  }
});
test("P1 revoked table access exposes no party data and never silently rewrites the draft", () => {
  const patches: any[] = [];
  try {
    render(
      <PosOrderContext
        draft={{ ...initial, fulfillment: "table_service", visitId: "private" }}
        visits={[
          { id: "private", status: "open", displayName: "Private party" },
        ]}
        tables={[]}
        canUseTables={false}
        disabled
        onChange={(patch) => patches.push(patch)}
      />,
    );
    assert.equal(screen.queryByText(/Private party/), null);
    assert.equal(screen.queryByRole("option", { name: "Table service" }), null);
    assert(
      (screen.getByLabelText("Fulfillment") as HTMLSelectElement).disabled,
    );
    assert.deepEqual(patches, []);
  } finally {
    cleanup();
  }
});
