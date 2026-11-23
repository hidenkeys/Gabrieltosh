import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<html><body></body></html>", {
  url: "http://localhost/mera/workspace",
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
const { render, screen, fireEvent, cleanup, waitFor } =
  await import("@testing-library/react");
const { default: UnitInput } = await import("../src/mera/ui/UnitInput");
const { default: OrderInstructions } =
  await import("../src/mera/workspace/OrderInstructions");
const { default: ReservationPolicy } =
  await import("../src/mera/workspace/ReservationPolicy");
test.afterEach(cleanup);
test("ticket-only notes collapse without hiding recorded allergens or changing other consumers", async () => {
  const note =
    "No ice. Please pack these separately. <script>not executable</script>";
  const { container, rerender } = render(
    <OrderInstructions compactNote order={{ note, allergens: ["Milk"] }} />,
  );
  const details = container.querySelector("details")!;
  assert.equal(details.open, false);
  assert.ok(screen.getByText("Milk", { exact: false }));
  assert.equal(container.querySelector("script"), null);
  fireEvent.click(screen.getByText("Preparation note"));
  await waitFor(() => assert.equal(details.open, true));
  assert.equal(screen.getByText(note).parentElement?.tagName, "DETAILS");
  rerender(<OrderInstructions order={{ note, allergens: ["Milk"] }} />);
  assert.equal(container.querySelector("details"), null);
  assert.ok(container.querySelector(".mw-note"));
  assert.ok(screen.getByText(note));
});
test("unit controls keep native bounds, blank drafts and filtered presets", () => {
  const values: string[] = [];
  function Field() {
    const [value, setValue] = React.useState("");
    return (
      <UnitInput
        label="Cutoff (minutes)"
        unit="minutes"
        value={value}
        onChange={(next) => {
          values.push(next);
          setValue(next);
        }}
        min={0}
        max={60}
        allowUnset
        presets={[{ value: 15 }, { value: 120 }]}
      />
    );
  }
  render(<Field />);
  const input = screen.getByLabelText("Cutoff (minutes)") as HTMLInputElement;
  assert.equal(input.value, "");
  assert.equal(input.min, "0");
  assert.equal(input.max, "60");
  assert.equal(screen.queryByRole("button", { name: "120 minutes" }), null);
  fireEvent.click(screen.getByRole("button", { name: "15 minutes" }));
  assert.equal(input.value, "15");
  fireEvent.change(input, { target: { value: "61" } });
  assert.equal(input.checkValidity(), false);
  fireEvent.click(screen.getByRole("button", { name: "Leave cutoff not set" }));
  assert.equal(input.value, "");
  assert.equal(values.at(-1), "");
});
test("nullable reservation units preserve null versus explicit zero in the existing policy body", async () => {
  let body: any;
  render(
    <ReservationPolicy
      base="/branch"
      policy={{
        enabled: false,
        cancellationCutoffMinutes: null,
        lateAfterMinutes: null,
      }}
      disabled={false}
      save={async (_path, _method, next) => {
        body = next;
      }}
    />,
  );
  fireEvent.change(
    screen.getByLabelText("Cancellation cutoff (minutes, optional)"),
    { target: { value: "0" } },
  );
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I reviewed this timing policy and any cutoffs not yet set.",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Save reviewed reservation policy" }),
  );
  await waitFor(() => assert.ok(body));
  assert.equal(body.cancellationCutoffMinutes, 0);
  assert.equal(body.lateAfterMinutes, null);
  assert.equal(body.approved, true);
});

test("category order stepper preserves signed integers in the existing category request", async () => {
  const { default: Categories } =
    await import("../src/mera/workspace/Categories");
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ categories: [] });
  let body: any;
  try {
    render(
      <Categories
        base="/branch"
        disabled={false}
        onCategories={() => {}}
        save={async (_path, _method, next) => {
          body = next;
        }}
      />,
    );
    await waitFor(() =>
      assert.equal(
        (
          screen
            .getByLabelText("Category name")
            .closest("fieldset") as HTMLFieldSetElement
        ).disabled,
        false,
      ),
    );
    fireEvent.change(screen.getByLabelText("Category name"), {
      target: { value: "Drinks" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Decrease Category sort order" }),
    );
    const count = screen.getByLabelText(
      "Category sort order",
    ) as HTMLInputElement;
    assert.equal(count.value, "-1");
    assert.equal(count.min, "-100000");
    fireEvent.submit(count.closest("form")!);
    await waitFor(() => assert.ok(body));
    assert.equal(body.sortOrder, -1);
  } finally {
    globalThis.fetch = original;
  }
});
