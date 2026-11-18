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
const { default: BillingManagement } =
  await import("../src/mera/workspace/BillingManagement");
test("O7 subscription and invoices precede closed advanced details without inventing plan data", () => {
  try {
    const { container } = render(
      <BillingManagement
        status={<p>Subscription: trial</p>}
        services={<p>New orders permitted</p>}
        invoices={<h2>Existing invoice records</h2>}
        proposedPolicy={<p>Unresolved proposed fee</p>}
        reconciliation={<p>Existing provider observations</p>}
      />,
    );
    const regions = screen.getAllByRole("region");
    assert.equal(
      regions[0].getAttribute("aria-label"),
      "Current subscription and services",
    );
    assert.equal(regions[1].getAttribute("aria-label"), "Invoice records");
    assert.equal(
      regions[2].getAttribute("aria-label"),
      "Advanced billing review",
    );
    for (const node of container.querySelectorAll("details"))
      assert.equal(node.open, false);
    assert(screen.getByText("Subscription: trial"));
    assert.equal(
      screen.queryByText(/Subscription active|Billing enabled/i),
      null,
    );
  } finally {
    cleanup();
  }
});
test("O7 closing a disclosure preserves the actual mounted draft and unknown intent lifecycle", () => {
  let mounts = 0;
  function Existing() {
    const [value, setValue] = React.useState(""),
      [unknown, setUnknown] = React.useState(false);
    React.useEffect(() => {
      mounts++;
    }, []);
    return (
      <div>
        <label>
          Original request reference
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button onClick={() => setUnknown(true)}>
          Existing uncertain action
        </button>
        {unknown && <p>Original action unconfirmed</p>}
      </div>
    );
  }
  try {
    const { container } = render(
      <BillingManagement
        status={<p>Known status</p>}
        invoices={<p>Known invoice state</p>}
        reconciliation={<Existing />}
      />,
    );
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.change(screen.getByLabelText("Original request reference"), {
      target: { value: "Original immutable intent" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Existing uncertain action" }),
    );
    details.open = false;
    details.open = true;
    assert.equal(
      (screen.getByLabelText("Original request reference") as HTMLInputElement)
        .value,
      "Original immutable intent",
    );
    assert(screen.getByText("Original action unconfirmed"));
    assert.equal(mounts, 1);
  } finally {
    cleanup();
  }
});
test("O7 supplied read errors and missing permission-controlled slots stay honest", () => {
  try {
    const { container, rerender } = render(
      <BillingManagement
        status={<p role="status">Loading actual subscription…</p>}
        invoices={<p role="alert">Invoice records could not be loaded</p>}
        proposedPolicy={false}
        reconciliation={null}
      />,
    );
    assert(screen.getByRole("status"));
    assert(screen.getByRole("alert"));
    assert.equal(container.querySelector("details"), null);
    rerender(<BillingManagement />);
    assert(
      screen.getByText(
        "Subscription details are unavailable. Refresh your records to check again.",
      ),
    );
    assert(
      screen.getByText(
        "Invoice records are unavailable. Refresh your records to check again.",
      ),
    );
    assert.equal(screen.queryByText("No invoices recorded."), null);
    assert.equal(
      screen.queryByRole("region", { name: "Advanced billing review" }),
      null,
    );
  } finally {
    cleanup();
  }
});
