import { chooseField, choiceValue } from "./choice-field-helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { formatMoney } from "../src/mera/workspace/api";
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
const { render, screen, fireEvent, cleanup, waitFor, act } =
  await import("@testing-library/react");
const { default: TableServiceView } =
  await import("../src/mera/workspace/TableServiceView");
const props = {
  tables: [],
  visits: [],
  renderTableTools: () => null,
  renderPartyTools: () => null,
  openParty: null,
  setup: null,
};
test("tables distinguish unavailable reads from confirmed empty collections", () => {
  try {
    const view = render(
      <TableServiceView {...props} tables={undefined} visits={undefined} />,
    );
    assert.ok(screen.getByText(/Table records are unavailable/));
    assert.ok(screen.getByText(/Visit records are unavailable/));
    assert.equal(screen.queryByText(/0 tables/), null);
    view.rerender(<TableServiceView {...props} />);
    assert.ok(screen.getByText("No tables created yet."));
    assert.ok(screen.getByText("No open parties at this branch."));
  } finally {
    cleanup();
  }
});
test("party filtering preserves mounted drafts and resolves combined table names", () => {
  let mounts = 0;
  function Tools() {
    React.useEffect(() => {
      mounts++;
    }, []);
    return <input aria-label="Party note" defaultValue="" />;
  }
  try {
    render(
      <TableServiceView
        {...props}
        tables={[
          {
            id: "private-table-a",
            name: "Window",
            status: "occupied",
            capacity: 4,
          },
          {
            id: "private-table-b",
            name: "Garden",
            status: "occupied",
            capacity: 2,
          },
        ]}
        visits={[
          {
            id: "private-visit",
            status: "open",
            displayName: "Lunch party",
            tableIds: ["private-table-a", "private-table-b"],
          },
        ]}
        renderPartyTools={() => <Tools />}
      />,
    );
    assert.ok(screen.getByText("Window + Garden"));
    assert.equal(document.body.textContent?.includes("private-table"), false);
    fireEvent.change(screen.getByLabelText("Party note"), {
      target: { value: "Keep this draft" },
    });
    chooseField(screen, fireEvent, "Party view", String("closed"));
    assert.ok(screen.getByText("No visits in this view."));
    assert.equal(
      screen.getByLabelText("Party note").closest("article")?.hidden,
      true,
    );
    chooseField(screen, fireEvent, "Party view", String("open"));
    assert.equal(
      (screen.getByLabelText("Party note") as HTMLInputElement).value,
      "Keep this draft",
    );
    assert.equal(mounts, 1);
  } finally {
    cleanup();
  }
});
