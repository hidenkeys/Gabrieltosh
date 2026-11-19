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
const { default: Bills } = await import("../src/mera/workspace/Bills");
const base = "/organizations/org/branches/branch";
const bill = {
  id: "bill-1",
  name: "Party bill",
  visitId: "private-visit",
  status: "open",
  total: 300000,
  paid: 0,
  balance: 300000,
  charges: [
    {
      id: "charge-1",
      name: "Lemonade",
      quantity: 2,
      amount: 300000,
      unitPrice: 150000,
    },
  ],
  allocations: [],
};
const props = {
  bills: [bill],
  base,
  disabled: false,
  canPay: true,
  save: async () => ({}),
};
const choose = () =>
  fireEvent.change(screen.getByLabelText("Bill to manage"), {
    target: { value: "bill-1" },
  });
const open = (summary: string) =>
  fireEvent.click(screen.getByText(summary, { exact: true }));
const input = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
test.afterEach(cleanup);
test("bill records distinguish unavailable/empty/zero and held credit without exposing private IDs or payment tools to read-only staff", () => {
  const view = render(<Bills {...props} bills={undefined} canPay={false} />);
  assert(screen.getByText(/Bill records are unavailable/));
  assert.equal(screen.queryByText(/Bills appear/), null);
  view.rerender(<Bills {...props} bills={[]} canPay={false} />);
  assert(screen.getByText("Bills appear when visits receive orders."));
  view.rerender(
    <Bills
      {...props}
      bills={[
        { ...bill, total: 0, paid: 10000, balance: -10000, name: undefined },
      ]}
      canPay={false}
    />,
  );
  assert(screen.getByText("Unnamed bill"));
  assert(screen.getByText(formatMoney(0)));
  assert(screen.getByText("Credit held"));
  assert(!document.body.textContent?.includes("private-visit"));
  assert(!document.body.textContent?.includes("bill-1"));
  choose();
  assert.equal(screen.queryByRole("button", { name: "Split bill" }), null);
  assert.equal(
    screen.queryByRole("button", { name: "Record bill collection" }),
    null,
  );
});
test("split preserves whole-item API body and merges only another open bill from the same party", async () => {
  const calls: any[] = [];
  render(
    <Bills
      {...props}
      bills={[
        bill,
        { ...bill, id: "same", name: "Same party" },
        { ...bill, id: "other", name: "Other party", visitId: "different" },
      ]}
      save={async (...args: any[]) => {
        calls.push(args);
        return {};
      }}
    />,
  );
  choose();
  open("Split this bill");
  input("New bill name", "One guest");
  fireEvent.change(screen.getByLabelText("Split by"), {
    target: { value: "items" },
  });
  input("Move quantity of Lemonade", "1");
  fireEvent.click(screen.getByRole("button", { name: "Split bill" }));
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0][0], base + "/bills/bill-1/split");
  assert.deepEqual(calls[0][2], {
    items: [{ chargeId: "charge-1", quantity: 1 }],
    name: "One guest",
  });
  await waitFor(() =>
    assert(!screen.getByLabelText("Bill to manage").hasAttribute("disabled")),
  );
  open("Merge another bill");
  assert(screen.getByRole("option", { name: "Same party" }));
  assert.equal(screen.queryByRole("option", { name: "Other party" }), null);
  fireEvent.change(screen.getByLabelText("Merge another bill into this one"), {
    target: { value: "same" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Merge into selected bill" }),
  );
  await waitFor(() => assert.equal(calls.length, 2));
  assert.deepEqual(calls[1][2], { sourceBillIds: ["same"] });
});
test("unknown non-idempotent split freezes all bill changes and cannot be unlocked by updated props", async () => {
  const calls: any[] = [];
  const save = async (...args: any[]) => {
    calls.push(args);
    throw new TypeError("Failed to fetch");
  };
  const view = render(<Bills {...props} save={save} />);
  choose();
  open("Split this bill");
  input("New bill name", "Split test");
  input("Amount to move (naira)", "10");
  fireEvent.click(screen.getByRole("button", { name: "Split bill" }));
  await screen.findByText("Bill change not confirmed");
  assert.equal(calls.length, 1);
  assert.equal(screen.queryByRole("button", { name: /Retry/ }), null);
  view.rerender(
    <Bills {...props} bills={[{ ...bill, balance: 299000 }]} save={save} />,
  );
  fireEvent.submit(screen.getByLabelText("New bill name").closest("form")!);
  await act(async () => {});
  assert.equal(calls.length, 1);
  assert(
    (screen.getByLabelText("Bill to manage") as HTMLSelectElement).disabled,
  );
});
test("unknown collection retries exact original key/body through409 and429 without accepting another intent", async () => {
  const calls: any[] = [];
  let number = 0;
  render(
    <Bills
      {...props}
      save={async (...args: any[]) => {
        calls.push(args);
        number++;
        if (number === 1) throw new TypeError("Network lost");
        if (number <= 3)
          throw Object.assign(new Error("Try later"), {
            status: number === 2 ? 409 : 429,
          });
        return {};
      }}
    />,
  );
  choose();
  open("Record money received");
  input("Amount received (naira)", "12.34");
  fireEvent.change(screen.getByLabelText("Method"), {
    target: { value: "external_transfer" },
  });
  input("Verified reference", "Actual-reference");
  fireEvent.click(
    screen.getByRole("button", { name: "Record bill collection" }),
  );
  await screen.findByText("Collection not confirmed");
  const original = calls[0][2];
  assert.equal(original.amount, 1234);
  assert(original.requestKey);
  for (let i = 0; i < 3; i++) {
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original bill collection" }),
    );
    await waitFor(() => assert.equal(calls.length, i + 2));
    await act(async () => {});
  }
  assert.deepEqual(
    calls.map((call) => call[2]),
    [original, original, original, original],
  );
  await waitFor(() =>
    assert.equal(screen.queryByText("Collection not confirmed"), null),
  );
});
test("synchronous duplicate submission and scope changes cannot write twice or restore old private errors", async () => {
  const calls: any[] = [];
  let reject!: (e: any) => void;
  const view = render(
    <Bills
      {...props}
      save={(...args: any[]) => {
        calls.push(args);
        return new Promise((_resolve, no) => {
          reject = no;
        });
      }}
    />,
  );
  choose();
  open("Split this bill");
  input("New bill name", "Draft");
  input("Amount to move (naira)", "10");
  const form = screen.getByLabelText("New bill name").closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  assert.equal(calls.length, 1);
  view.rerender(<Bills {...props} base="/other" bills={[]} />);
  await act(async () => reject(new Error("OLD PRIVATE FAILURE")));
  assert.equal(screen.queryByText("OLD PRIVATE FAILURE"), null);
  assert.equal(screen.queryByText("Party bill"), null);
});
test("authorization denial hides bill rows and retained private collection intent", async () => {
  const view = render(
    <Bills
      {...props}
      save={async () => {
        throw Object.assign(new Error("Access ended"), { status: 403 });
      }}
    />,
  );
  choose();
  open("Record money received");
  input("Amount received (naira)", "10");
  input("Verified reference", "PRIVATE_REFERENCE");
  fireEvent.click(
    screen.getByRole("button", { name: "Record bill collection" }),
  );
  await screen.findByText(/Access to these bills needs checking/);
  assert(!document.body.textContent?.includes("Party bill"));
  assert(!document.body.textContent?.includes("PRIVATE_REFERENCE"));
  view.rerender(<Bills {...props} />);
  assert.equal(screen.queryByLabelText("Bill to manage"), null);
});
