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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: PaymentEntry } =
  await import("../src/mera/workspace/PaymentEntry");
test.afterEach(cleanup);
const order = {
  id: "order-one",
  total: 9000000,
  paid: 0,
  outstandingBalance: 125050,
};
function Harness({
  method = "cash",
  onValue = (_value: any) => {},
}: {
  method?: string;
  onValue?: (value: any) => void;
}) {
  const [state, setState] = React.useState({ amount: "", cashTender: "" });
  return (
    <form aria-label="Payment review">
      <PaymentEntry
        order={order}
        method={method}
        amount={state.amount}
        tender={state.cashTender}
        onChange={(patch) =>
          setState((previous) => {
            const next = { ...previous, ...patch };
            onValue(next);
            return next;
          })
        }
      />
      <button>Review</button>
    </form>
  );
}
test("exact amount uses canonical outstanding cents rather than total and records no extra cash as collection", () => {
  let value: any;
  render(
    <Harness
      onValue={(next) => {
        value = next;
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole("radio", { name: "Exact amount", exact: true }),
  );
  assert.equal(Math.round(Number(value.amount) * 100), 125050);
  assert.equal(Math.round(Number(value.cashTender) * 100), 125050);
  assert.equal(
    (screen.getByLabelText("Amount received (naira)") as HTMLInputElement)
      .value,
    "1,250.5",
  );
  assert.ok(
    (
      screen.getByRole("form", { name: "Payment review" }) as HTMLFormElement
    ).checkValidity(),
  );
});
for (const [label, tender, change] of [
  ["Next ₦500 · ₦1,500.00", 150000, "₦249.50"],
  ["Next ₦1,000 · ₦2,000.00", 200000, "₦749.50"],
] as const)
  test(`cash ${label} keeps exact payable amount and calculates only the separate change`, () => {
    let value: any;
    render(
      <Harness
        onValue={(next) => {
          value = next;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: label, exact: true }));
    assert.equal(Math.round(Number(value.amount) * 100), 125050);
    assert.equal(Math.round(Number(value.cashTender) * 100), tender);
    assert(screen.getByText(change, { selector: "strong" }));
  });
test("typed amounts preserve exact cents and native limits; too-small cash tender blocks a valid form", () => {
  let value: any;
  render(
    <Harness
      onValue={(next) => {
        value = next;
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
    target: { value: "12.34" },
  });
  assert.equal(value.amount, "12.34");
  assert.equal(Math.round(Number(value.amount) * 100), 1234);
  fireEvent.change(
    screen.getByLabelText("Cash handed over (naira, optional)"),
    { target: { value: "12.33" } },
  );
  assert(screen.getByRole("alert"));
  assert.equal(
    (
      screen.getByRole("form", { name: "Payment review" }) as HTMLFormElement
    ).checkValidity(),
    false,
  );
  fireEvent.change(
    screen.getByLabelText("Cash handed over (naira, optional)"),
    { target: { value: "12.34" } },
  );
  assert.equal(
    (
      screen.getByRole("form", { name: "Payment review" }) as HTMLFormElement
    ).checkValidity(),
    true,
  );
  fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
    target: { value: "1250.51" },
  });
  assert.equal(
    (
      screen.getByRole("form", { name: "Payment review" }) as HTMLFormElement
    ).checkValidity(),
    false,
  );
});
test("external collection has only exact amount and does not show cash tender or round-up controls", () => {
  let value: any;
  render(
    <Harness
      method="external_transfer"
      onValue={(next) => {
        value = next;
      }}
    />,
  );
  assert.equal(
    screen.queryByLabelText("Cash handed over (naira, optional)"),
    null,
  );
  assert.equal(screen.queryByRole("radio", { name: /Next ₦/ }), null);
  fireEvent.click(
    screen.getByRole("radio", { name: "Exact amount", exact: true }),
  );
  assert.equal(Math.round(Number(value.amount) * 100), 125050);
  assert.equal(value.cashTender, "");
});
