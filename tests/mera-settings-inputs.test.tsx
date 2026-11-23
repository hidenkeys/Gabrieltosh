import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "Event",
  "MouseEvent",
])
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = await import("react");
const { render, screen, fireEvent, cleanup, waitFor } =
  await import("@testing-library/react");
const { default: BranchSettings } =
  await import("../src/mera/workspace/BranchSettings");
const { default: DepositPolicy } =
  await import("../src/mera/workspace/DepositPolicy");
const { default: MinimumSpendPolicy } =
  await import("../src/mera/workspace/MinimumSpendPolicy");
const { default: PolicyEditor } =
  await import("../src/mera/workspace/PolicyEditor");
const { default: TimeWindows } =
  await import("../src/mera/workspace/TimeWindows");
test.afterEach(cleanup);
test("guided branch settings retain changes through all steps and submit only reviewed canonical policy", async () => {
  const writes: any[] = [];
  render(
    <BranchSettings
      branch={{
        settings: { address: "Old place", serviceModes: [] },
        timezone: "Africa/Lagos",
      }}
      organization={{ id: "org", name: "Cafe" }}
      base="/org/branch"
      disabled={false}
      save={async (...args) => writes.push(args)}
    />,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Save branch policies" }),
    null,
  );
  fireEvent.change(screen.getByLabelText("Branch address"), {
    target: { value: "New place" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Continue to service modes" }),
  );
  fireEvent.click(screen.getByRole("switch", { name: "Table service" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue to hours" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue to payments" }));
  fireEvent.click(
    screen.getByRole("switch", {
      name: "Allow preparation before full payment",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Continue to reservations" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Increase Reservation capacity" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Continue to review" }));
  assert.equal(writes.length, 0);
  assert.ok(screen.getByText("New place · Africa/Lagos"));
  fireEvent.click(screen.getByRole("button", { name: "1. Business" }));
  assert.equal(
    (screen.getByLabelText("Branch address") as HTMLInputElement).value,
    "New place",
  );
  fireEvent.click(screen.getByRole("button", { name: "6. Review" }));
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Save branch policies" })
      .closest("form")!,
  );
  await waitFor(() => assert.equal(writes.length, 1));
  assert.equal(writes[0][0], "/org/branch/settings");
  assert.equal(writes[0][2].payLater, true);
  assert.equal(writes[0][2].capacity, 31);
  assert.deepEqual(writes[0][2].serviceModes, ["table_service"]);
});
test("branch settings redirect incomplete business timezone before progressing", () => {
  render(
    <BranchSettings
      branch={{ settings: {}, timezone: "Africa/Lagos" }}
      organization={{ id: "org" }}
      base="/org/branch"
      disabled={false}
      save={async () => {
        throw Error("must not save");
      }}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Branch timezone" }), {
    target: { value: "Unknown place" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Continue to service modes" }),
  );
  assert.equal(screen.queryByRole("switch", { name: "Table service" }), null);
  assert.equal(
    (screen.getByRole("combobox") as HTMLInputElement).validity.customError,
    true,
  );
});
test("deposit currency and choice controls retain cents conversion and explicit approval", async () => {
  const writes: any[] = [];
  render(
    <DepositPolicy
      policy={{}}
      base="/branch"
      disabled={false}
      save={async (...args) => writes.push(args)}
    />,
  );
  fireEvent.click(
    screen.getByRole("switch", { name: "Require manual deposit" }),
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Deposit amount (naira)" }),
    { target: { value: "1,250.50" } },
  );
  fireEvent.change(screen.getByLabelText("Cancellation cutoff (hours)"), {
    target: { value: "24" },
  });
  fireEvent.click(
    screen.getByRole("radio", { name: "Refundable before cutoff" }),
  );
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Save explicitly approved policy",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Save explicitly approved policy" })
      .closest("form")!,
  );
  await waitFor(() => assert.equal(writes.length, 1));
  assert.deepEqual(writes[0][2], {
    enabled: true,
    amount: 125050,
    cancellationCutoffHours: 24,
    refundRule: "refundable_before_cutoff",
    approved: true,
  });
});
test("minimum spend preserves typed decimals and nullable policy when not enabled", async () => {
  const writes: any[] = [];
  render(
    <MinimumSpendPolicy
      policy={{}}
      base="/branch"
      disabled={false}
      save={async (...args) => writes.push(args)}
    />,
  );
  const field = screen.getByRole("textbox", {
    name: "Minimum-spend amount (naira)",
  }) as HTMLInputElement;
  fireEvent.change(field, { target: { value: "25." } });
  assert.equal(field.value, "25.");
  fireEvent.change(field, { target: { value: "25.50" } });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Save minimum-spend policy" })
      .closest("form")!,
  );
  await waitFor(() => assert.equal(writes.length, 1));
  assert.equal(writes[0][2].amount, 2550);
  assert.equal(writes[0][2].basis, null);
  assert.equal(writes[0][2].shortfallTreatment, "manager_review");
});
test("pricing proposal uses raw money and leaves not-set choices null", async () => {
  const writes: any[] = [];
  render(
    <PolicyEditor
      organizationId="org"
      policy={{}}
      disabled={false}
      save={async (...args) => writes.push(args)}
    />,
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Monthly price (naira)" }),
    { target: { value: "13,500.25" } },
  );
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Save pricing proposal" })
      .closest("form")!,
  );
  await waitFor(() => assert.equal(writes.length, 1));
  assert.equal(writes[0][2].monthlyPrice, 1350025);
  assert.equal(writes[0][2].feePayer, null);
  assert.equal(writes[0][2].trialDays, null);
});
test("weekly service presets preserve the existing windows payload", () => {
  let result: any;
  function Example() {
    const [value, setValue] = React.useState([
      { days: [1], start: "09:00", end: "17:00" },
    ]);
    return (
      <TimeWindows
        label="Service hours"
        value={value}
        onChange={(next) => {
          result = next;
          setValue(next);
        }}
      />
    );
  }
  render(<Example />);
  fireEvent.click(screen.getByRole("button", { name: "Same every day" }));
  assert.deepEqual(result, [
    { days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Weekends" }));
  assert.deepEqual(result[0].days, [0, 6]);
});
