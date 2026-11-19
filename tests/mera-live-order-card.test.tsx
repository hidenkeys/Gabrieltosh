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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: LiveOrderCard } =
  await import("../src/mera/workspace/LiveOrderCard");
const { Disclosure } = await import("../src/mera/ui/OperationalPrimitives");
const order = {
  reference: "A100",
  displayName: "Ada",
  status: "submitted",
  paymentStatus: "unpaid",
  total: 150000,
  handlerId: "private-assigned-user",
  createdAt: "2026-11-18T23:30:00Z",
  source: "staff",
  fulfillment: "counter_pickup",
};
const value = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
test("P2 live order uses recorded totals, distinguishes missing from valid zero and never substitutes handler IDs", () => {
  try {
    const { rerender } = render(
      <LiveOrderCard order={order} actions={null}>
        {null}
      </LiveOrderCard>,
    );
    assert.equal(value("Total"), formatMoney(150000));
    assert.equal(value("Handler"), "Staff name unavailable");
    assert.equal(screen.queryByText("private-assigned-user"), null);
    rerender(
      <LiveOrderCard
        order={{
          ...order,
          total: undefined,
          handlerId: undefined,
          assignedTo: "another-private-id",
        }}
        actions={null}
      >
        {null}
      </LiveOrderCard>,
    );
    assert.equal(value("Total"), "Unavailable");
    assert.notEqual(value("Total"), formatMoney(0));
    assert.equal(value("Handler"), "Staff name unavailable");
    assert.equal(screen.queryByText("another-private-id"), null);
    rerender(
      <LiveOrderCard
        order={{ ...order, total: 0, handlerName: "Teni" }}
        actions={null}
      >
        {null}
      </LiveOrderCard>,
    );
    assert.equal(value("Total"), formatMoney(0));
    assert.equal(value("Handler"), "Teni");
  } finally {
    cleanup();
  }
});
test("P2 placement time crosses midnight in the supplied branch timezone with honest invalid-zone fallback", () => {
  try {
    const { rerender } = render(
      <LiveOrderCard order={order} timeZone="Africa/Lagos" actions={null}>
        {null}
      </LiveOrderCard>,
    );
    assert(value("Placed")?.includes("19 Nov 2026"));
    assert(value("Placed")?.includes("00:30"));
    assert(value("Placed")?.endsWith("Africa/Lagos"));
    rerender(
      <LiveOrderCard order={order} timeZone="UTC" actions={null}>
        {null}
      </LiveOrderCard>,
    );
    assert(value("Placed")?.includes("18 Nov 2026"));
    assert(value("Placed")?.includes("23:30"));
    rerender(
      <LiveOrderCard order={order} timeZone="Invalid/Branch" actions={null}>
        {null}
      </LiveOrderCard>,
    );
    assert.equal(value("Placed"), "2026-11-18T23:30:00.000Z · UTC");
  } finally {
    cleanup();
  }
});
test("P2 primary order action stays available while details close without resetting child draft or remounting", () => {
  let calls = 0,
    mounts = 0;
  function ExistingDraft() {
    const [text, setText] = React.useState("");
    React.useEffect(() => {
      mounts++;
    }, []);
    return (
      <label>
        Existing service draft
        <input value={text} onChange={(event) => setText(event.target.value)} />
      </label>
    );
  }
  try {
    const { container } = render(
      <LiveOrderCard
        order={order}
        actions={<button onClick={() => calls++}>Accept order</button>}
      >
        <Disclosure summary="Order detail">
          <ExistingDraft />
        </Disclosure>
      </LiveOrderCard>,
    );
    const details = container.querySelector("details")!;
    assert.equal(details.open, false);
    assert(
      !screen.getByRole("button", { name: "Accept order" }).closest("details"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept order" }));
    assert.equal(calls, 1);
    fireEvent.click(screen.getByText("Order detail", { exact: true }));
    assert(details.open);
    fireEvent.change(screen.getByLabelText("Existing service draft"), {
      target: { value: "Keep original service note" },
    });
    fireEvent.click(screen.getByText("Order detail", { exact: true }));
    assert.equal(details.open, false);
    fireEvent.click(screen.getByRole("button", { name: "Accept order" }));
    assert.equal(calls, 2);
    fireEvent.click(screen.getByText("Order detail", { exact: true }));
    assert.equal(
      (screen.getByLabelText("Existing service draft") as HTMLInputElement)
        .value,
      "Keep original service note",
    );
    assert.equal(mounts, 1);
  } finally {
    cleanup();
  }
});
