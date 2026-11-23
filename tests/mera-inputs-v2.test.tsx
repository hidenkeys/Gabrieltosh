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
  "KeyboardEvent",
  "Node",
  "getComputedStyle",
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
const { render, screen, fireEvent, cleanup, act } =
  await import("@testing-library/react");
const { Segmented } = await import("../src/mera/ui/Segmented");
const { Stepper } = await import("../src/mera/ui/Stepper");
const { MoneyInput } = await import("../src/mera/ui/MoneyInput");
const { ReasonInput } = await import("../src/mera/ui/ReasonInput");
const { Combobox } = await import("../src/mera/ui/Combobox");
const { Switch } = await import("../src/mera/ui/Switch");
const { BottomSheet } = await import("../src/mera/ui/BottomSheet");
const { CashCounter } = await import("../src/mera/ui/CashCounter");
const { DateTimePicker } = await import("../src/mera/ui/DateTimePicker");
test.afterEach(cleanup);
test("radio arrows skip disabled choices and native form serializes selected value", () => {
  function Example() {
    const [value, setValue] = React.useState("active");
    return (
      <form>
        <Segmented
          label="Show"
          name="view"
          value={value}
          onChange={setValue}
          options={[
            { value: "active", label: "Active", count: 4 },
            { value: "hidden", label: "Unavailable", disabled: true },
            { value: "ready", label: "Ready" },
          ]}
        />
      </form>
    );
  }
  render(<Example />);
  fireEvent.keyDown(screen.getByRole("radio", { name: "Active" }), {
    key: "ArrowRight",
  });
  assert.equal(
    (screen.getByRole("radio", { name: "Ready" }) as HTMLInputElement).checked,
    true,
  );
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("view"),
    "ready",
  );
});
test("stepper honors saved floor and maximum with pointer and editable numeric input", () => {
  function Example() {
    const [value, setValue] = React.useState(2);
    return (
      <Stepper
        label="Prepared quantity for Tea on Bar"
        value={value}
        onChange={setValue}
        min={2}
        max={4}
      />
    );
  }
  render(<Example />);
  assert.equal(
    (screen.getByRole("button", { name: /Decrease/ }) as HTMLButtonElement)
      .disabled,
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: /Increase/ }));
  assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).value, "3");
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "9" } });
  assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).value, "9");
  assert.equal(
    (screen.getByRole("button", { name: /Increase/ }) as HTMLButtonElement)
      .disabled,
    true,
  );
});
test("long press repeats and stops after release", async () => {
  function Example() {
    const [value, setValue] = React.useState(0);
    return (
      <Stepper label="Quantity" value={value} onChange={setValue} max={20} />
    );
  }
  render(<Example />);
  const plus = screen.getByRole("button", { name: "Increase Quantity" });
  fireEvent.pointerDown(plus);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 620));
  });
  fireEvent.pointerUp(plus);
  const value = (screen.getByRole("spinbutton") as HTMLInputElement).value;
  assert.ok(Number(value) >= 2);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 180));
  });
  assert.equal(
    (screen.getByRole("spinbutton") as HTMLInputElement).value,
    value,
  );
});
test("money formats visible value but submits raw decimal and keeps bounds", () => {
  function Example() {
    const [value, setValue] = React.useState("");
    return (
      <form>
        <MoneyInput
          label="Amount received"
          name="amount"
          value={value}
          onChange={setValue}
          max={5000}
          required
        />
      </form>
    );
  }
  render(<Example />);
  const input = screen.getByRole("textbox", {
    name: "Amount received",
  }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "1234.50" } });
  assert.equal(input.value, "1,234.50");
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("amount"),
    "1234.50",
  );
  fireEvent.change(input, { target: { value: "6000" } });
  assert.equal(input.validity.customError, true);
  assert.equal(input.type, "text");
});
test("reason presets retain backend minimum and Other exposes constrained text", () => {
  function Example() {
    const [value, setValue] = React.useState("");
    return (
      <form>
        <ReasonInput
          label="Reason"
          name="reason"
          value={value}
          onChange={setValue}
          minLength={10}
          required
          presets={["Spilled", "Spilled stock"]}
        />
      </form>
    );
  }
  render(<Example />);
  assert.equal(screen.queryByRole("radio", { name: "Spilled" }), null);
  fireEvent.click(screen.getByRole("radio", { name: "Spilled stock" }));
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("reason"),
    "Spilled stock",
  );
  fireEvent.click(screen.getByRole("radio", { name: "Other" }));
  const details = screen.getByRole("textbox", {
    name: "Reason details",
  }) as HTMLTextAreaElement;
  assert.equal(details.minLength, 10);
  assert.equal(details.required, true);
});
test("combobox searches metadata, selects via keyboard and refuses arbitrary required text", () => {
  function Example() {
    const [value, setValue] = React.useState("");
    return (
      <form>
        <Combobox
          label="Order"
          name="orderId"
          value={value}
          onChange={setValue}
          required
          options={[
            {
              value: "one",
              label: "JH-017",
              description: "Table 6 · ₦4,200 · Unpaid",
            },
            { value: "two", label: "JH-018", description: "Table 8" },
          ]}
        />
      </form>
    );
  }
  render(<Example />);
  const input = screen.getByRole("combobox") as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Table 6" } });
  assert.equal(input.validity.customError, true);
  assert.equal(screen.getAllByRole("option").length, 1);
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("orderId"),
    "one",
  );
  assert.equal(input.validity.customError, false);
});
test("switch retains checkbox submission and sheet closes on Escape", () => {
  function Example() {
    const [checked, setChecked] = React.useState(false),
      [open, setOpen] = React.useState(false);
    return (
      <>
        <Switch
          label="Play new ticket sound"
          name="sound"
          checked={checked}
          onChange={setChecked}
        />
        <button onClick={() => setOpen(true)}>Open adjustment</button>
        <BottomSheet
          title="Adjust stock"
          open={open}
          onClose={() => setOpen(false)}
        >
          <button>Save stock</button>
        </BottomSheet>
      </>
    );
  }
  render(<Example />);
  fireEvent.click(screen.getByRole("switch"));
  assert.equal((screen.getByRole("switch") as HTMLInputElement).checked, true);
  fireEvent.click(screen.getByRole("button", { name: "Open adjustment" }));
  assert.ok(screen.getByRole("dialog"));
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
});
test("cash counter uses an explicit total and date choices submit unchanged local timestamp", () => {
  function Example() {
    const [money, setMoney] = React.useState("20"),
      [date, setDate] = React.useState("2026-12-01T10:30");
    return (
      <form>
        <CashCounter
          label="Counted cash"
          name="cash"
          value={money}
          onChange={setMoney}
        />
        <DateTimePicker
          label="Arrival"
          name="startsAt"
          value={date}
          onChange={setDate}
        />
      </form>
    );
  }
  render(<Example />);
  fireEvent.click(
    screen.getByRole("button", { name: "Count notes and coins" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Increase ₦1,000 notes or coins" }),
  );
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("cash"),
    "20",
  );
  fireEvent.click(screen.getByRole("button", { name: "Use counted total" }));
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("cash"),
    "1000.00",
  );
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("startsAt"),
    "2026-12-01T10:30",
  );
  assert.ok(
    screen.getByText(
      "Choose a preferred time. The venue will confirm availability.",
    ),
  );
});

const { default: requireChoice } = await import("../src/mera/ui/ChoiceField");
test("choice adapter preserves required empty state, grouped disabled options and form reset", () => {
  const ChoiceField = requireChoice;
  render(
    <form>
      <ChoiceField label="Destination" name="destination" required>
        <option value="">Choose destination</option>
        <>
          <option value="one">One</option>
        </>
        <optgroup label="Closed" disabled>
          <option value="two">Two</option>
        </optgroup>
      </ChoiceField>
    </form>,
  );
  assert.equal(
    screen.queryByRole("radio", { name: "Choose destination" }),
    null,
  );
  assert.equal(document.querySelector("form")!.checkValidity(), false);
  assert.equal(
    (screen.getByRole("radio", { name: "Two" }) as HTMLInputElement).disabled,
    true,
  );
  fireEvent.click(screen.getByRole("radio", { name: "One" }));
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("destination"),
    "one",
  );
  fireEvent.reset(document.querySelector("form")!);
  assert.equal(document.querySelector("form")!.checkValidity(), false);
});

test("choice adapter searches data lists and preserves optional empty all value", () => {
  const ChoiceField = requireChoice;
  render(
    <form>
      <ChoiceField label="Table" name="table" searchable>
        <option value="">All tables</option>
        <option value="a">Table A</option>
      </ChoiceField>
    </form>,
  );
  const input = screen.getByRole("combobox", { name: "Table" });
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name: "Table A" }));
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("table"),
    "a",
  );
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name: "All tables" }));
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("table"),
    "",
  );
});
test("date input-only events preserve exact local values and billing can omit availability language", () => {
  function Example() {
    const [value, setValue] = React.useState("2026-12-01T10:00");
    return (
      <form>
        <DateTimePicker
          label="Invoice period"
          name="period"
          value={value}
          onChange={setValue}
          availabilityHint={false}
        />
      </form>
    );
  }
  render(<Example />);
  fireEvent.input(screen.getByLabelText("Date"), {
    target: { value: "2026-12-02" },
  });
  fireEvent.input(screen.getByLabelText("Preferred time"), {
    target: { value: "11:30" },
  });
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("period"),
    "2026-12-02T11:30",
  );
  assert.equal(screen.queryByText(/venue will confirm/), null);
});

test("unnamed controlled choices do not introduce extra form fields and still validate selection", () => {
  function Example() {
    const [value, setValue] = React.useState("");
    return (
      <form>
        <Segmented
          label="Show"
          value={value}
          onChange={setValue}
          required
          options={[
            { value: "active", label: "Active" },
            { value: "ready", label: "Ready" },
          ]}
        />
      </form>
    );
  }
  render(<Example />);
  const form = document.querySelector("form")!;
  assert.equal(form.checkValidity(), false);
  fireEvent.click(screen.getByRole("radio", { name: "Ready" }));
  assert.equal(form.checkValidity(), true);
  assert.equal(Array.from(new dom.window.FormData(form).keys()).length, 0);
  assert.equal(
    (screen.getByRole("radio", { name: "Active" }) as HTMLInputElement)
      .tabIndex,
    -1,
  );
});

test("combobox reopening preserves selected record and closed ArrowDown starts at first permitted option", () => {
  const changes: string[] = [];
  function Example() {
    const [value, setValue] = React.useState("b");
    return (
      <Combobox
        label="Record"
        value={value}
        onChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
      />
    );
  }
  render(<Example />);
  const input = screen.getByRole("combobox");
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "Enter" });
  assert.deepEqual(changes, ["b"]);
  assert.equal((input as HTMLInputElement).value, "Beta");
  cleanup();
  render(
    <Combobox
      label="Record"
      value=""
      onChange={(value) => changes.push(value)}
      options={[
        { value: "blocked", label: "Blocked", disabled: true },
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ]}
    />,
  );
  const empty = screen.getByRole("combobox");
  fireEvent.focus(empty);
  fireEvent.keyDown(empty, { key: "Escape" });
  fireEvent.keyDown(empty, { key: "ArrowDown" });
  fireEvent.keyDown(empty, { key: "Enter" });
  assert.equal(changes.at(-1), "a");
});
test("required choices without any enabled option block native form submission and remain focusable", () => {
  const cases = [
    [],
    [{ value: "disabled", label: "Unavailable", disabled: true }],
  ];
  for (const options of cases) {
    const view = render(
      <form>
        <Segmented
          label="Required destination"
          value=""
          onChange={() => {}}
          options={options}
          required
        />
      </form>,
    );
    const form = document.querySelector("form")!;
    assert.equal(form.checkValidity(), false);
    const field = screen.getByRole("textbox", {
      name: "Required destination selection required",
    });
    (field as HTMLElement).focus();
    assert.equal(document.activeElement, field);
    assert.equal(Array.from(new dom.window.FormData(form).keys()).length, 0);
    view.rerender(
      <form>
        <Segmented
          label="Required destination"
          value="a"
          onChange={() => {}}
          options={[{ value: "a", label: "Available" }]}
          required
        />
      </form>,
    );
    assert.equal(form.checkValidity(), true);
    cleanup();
  }
  const ChoiceField = requireChoice;
  render(
    <form>
      <ChoiceField label="Required empty" required>
        <option value="">Choose</option>
      </ChoiceField>
    </form>,
  );
  assert.equal(document.querySelector("form")!.checkValidity(), false);
});
const { default: MinorMoneyInput } =
  await import("../src/mera/ui/MinorMoneyInput");
test("minor-unit currency retains decimal drafts, converts cents and resets external record values", () => {
  const changes: number[] = [];
  function Example({ external }: { external?: number }) {
    const [value, setValue] = React.useState(500);
    return (
      <MinorMoneyInput
        label="Variant price"
        value={external ?? value}
        onChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
        required
      />
    );
  }
  const view = render(<Example />);
  const input = screen.getByRole("textbox", {
    name: "Variant price",
  }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "5." } });
  assert.equal(input.value, "5.");
  fireEvent.change(input, { target: { value: "5.25" } });
  assert.equal(input.value, "5.25");
  assert.equal(changes.at(-1), 525);
  fireEvent.change(input, { target: { value: "" } });
  assert.equal(input.value, "");
  assert.equal(input.validity.valueMissing, true);
  view.rerender(<Example external={125050} />);
  assert.equal(input.value, "1,250.5");
});
test("preset reason notes are optional, bounded, resumable and leave the plain preset unchanged when removed", () => {
  const saved: string[] = [];
  function Example({ initial = "" }: { initial?: string }) {
    const [value, setValue] = React.useState(initial);
    return (
      <form>
        <ReasonInput
          label="Refund reason"
          name="reason"
          minLength={10}
          maxLength={40}
          required
          presets={["Quality issue"]}
          value={value}
          onChange={(next) => {
            saved.push(next);
            setValue(next);
          }}
        />
      </form>
    );
  }
  render(<Example />);
  fireEvent.click(screen.getByRole("radio", { name: "Quality issue" }));
  assert.equal(saved.at(-1), "Quality issue");
  fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
  const note = screen.getByRole("textbox", {
    name: "Refund reason additional note",
  }) as HTMLTextAreaElement;
  assert.equal(note.required, false);
  assert.equal(note.maxLength, 25);
  fireEvent.change(note, { target: { value: "Cold drink" } });
  assert.equal(
    new dom.window.FormData(document.querySelector("form")!).get("reason"),
    "Quality issue: Cold drink",
  );
  cleanup();
  render(<Example initial="Quality issue: Cold drink" />);
  assert.equal(
    (screen.getByRole("radio", { name: "Quality issue" }) as HTMLInputElement)
      .checked,
    true,
  );
  assert.equal(
    (
      screen.getByRole("textbox", {
        name: "Refund reason additional note",
      }) as HTMLTextAreaElement
    ).value,
    "Cold drink",
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove note" }));
  assert.equal(saved.at(-1), "Quality issue");
  assert.equal(screen.queryByRole("textbox"), null);
});
test("suggested booking hours do not prohibit an explicitly entered preferred time", () => {
  function Example() {
    const [value, setValue] = React.useState("2026-12-01T09:00");
    return (
      <form>
        <DateTimePicker
          label="Preferred arrival"
          value={value}
          onChange={setValue}
          suggestedSlots={["09:00", "09:30"]}
          required
        />
      </form>
    );
  }
  render(<Example />);
  fireEvent.input(screen.getByLabelText("Preferred time"), {
    target: { value: "22:15" },
  });
  assert.equal(document.querySelector("form")!.checkValidity(), true);
  assert.equal(screen.queryByRole("radio", { name: "10:00" }), null);
});
