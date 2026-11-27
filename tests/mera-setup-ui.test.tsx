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
const { default: SetupChecklist } =
  await import("../src/mera/workspace/SetupChecklist");
test("O3 setup leads with basics, closes optional forms and keeps publication last", () => {
  try {
    const { container } = render(
      <SetupChecklist
        basics={
          <form aria-label="Existing basics">
            <input aria-label="Business name" />
          </form>
        }
        appearance={<p>Existing branding</p>}
        booking={<p>Existing booking</p>}
        readiness={<button>Existing publish action</button>}
      />,
    );
    assert(screen.getByLabelText("Business name"));
    const details = container.querySelectorAll("details");
    assert.equal(details.length, 2);
    for (const node of details) assert.equal(node.open, false);
    const regions = screen.getAllByRole("region");
    assert.equal(regions[0].getAttribute("aria-label"), "Business basics");
    assert.equal(
      regions.at(-1)?.getAttribute("aria-label"),
      "Menu publication",
    );
    assert.equal(screen.queryByText(/completed|setup complete/i), null);
  } finally {
    cleanup();
  }
});
test("O3 closing optional sections keeps existing form state and save action", () => {
  function Existing() {
    const [value, setValue] = React.useState("");
    return (
      <label>
        Draft logo caption
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
    );
  }
  try {
    const { container } = render(
      <SetupChecklist basics={<p>Basics</p>} appearance={<Existing />} />,
    );
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.change(screen.getByLabelText("Draft logo caption"), {
      target: { value: "Unsaved venue draft" },
    });
    details.open = false;
    details.open = true;
    assert.equal(
      (screen.getByLabelText("Draft logo caption") as HTMLInputElement).value,
      "Unsaved venue draft",
    );
  } finally {
    cleanup();
  }
});
test("O3 missing permission-controlled slots create no fake controls or readiness claims", () => {
  try {
    const { container } = render(
      <SetupChecklist basics={null} appearance={false} readiness={null} />,
    );
    assert(
      screen.getByText("No business settings are available to edit here."),
    );
    assert.equal(container.querySelector("details"), null);
    assert.equal(screen.queryByRole("button"), null);
    assert.equal(
      screen.queryByRole("region", { name: "Menu publication" }),
      null,
    );
  } finally {
    cleanup();
  }
});
test("O3 supplied real loading and error states survive layout composition unchanged", () => {
  try {
    render(
      <SetupChecklist
        basics={<p role="status">Loading branch preferences…</p>}
        readiness={
          <div>
            <p role="alert">Publication check failed</p>
            <button>Retry existing check</button>
          </div>
        }
      />,
    );
    assert(screen.getByRole("status"));
    assert(screen.getByRole("alert"));
    assert(screen.getByRole("button", { name: "Retry existing check" }));
  } finally {
    cleanup();
  }
});

test("readiness Fix opens and focuses the requested setup disclosure", async () => {
  const { openReadinessTarget, clearReadinessTarget } = await import("../src/mera/workspace/readinessTargets");
  try {
    const opened: string[] = [];
    render(<SetupChecklist operations={<p>Service hours editor</p>} deposits={<p>Deposit policy editor</p>} />);
    openReadinessTarget("deposits", section => opened.push(section));
    assert.deepEqual(opened, ["onboarding"]);
    assert.equal((document.getElementById("mera-setup-deposits") as HTMLDetailsElement).open, true);
    assert.equal(document.activeElement, document.querySelector("#mera-setup-deposits summary"));
    assert.equal((document.getElementById("mera-setup-operations") as HTMLDetailsElement).open, false);
  } finally {clearReadinessTarget();cleanup();}
});
