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
const { render, screen, fireEvent, cleanup, act, waitFor } =
  await import("@testing-library/react");
const { default: StockAdjustment } =
  await import("../src/mera/workspace/StockAdjustment");
test.afterEach(cleanup);
const product = {
  id: "product-tea",
  name: "Tea",
  stockMode: "counted",
  stock: 10,
  variants: [],
};
const props = {
  product,
  base: "/organizations/org/branches/branch",
  disabled: false,
  save: async (..._args: any[]) => ({}),
};
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Adjust stock for Tea" }));
}
function reason() {
  fireEvent.click(
    screen.getByRole("radio", { name: "Delivery received", exact: true }),
  );
}
function submit() {
  fireEvent.submit(
    screen.getByRole("button", { name: "Save stock change" }).closest("form")!,
  );
}
test("stock movement unknown then domain/rate errors retries original body, key, path and opening balance", async () => {
  const calls: any[] = [];
  const view = render(
    <StockAdjustment
      {...props}
      save={async (...args: any[]) => {
        calls.push(args);
        if (calls.length === 1) throw Error("Lost acknowledgment");
        if (calls.length < 4)
          throw Object.assign(Error("Retry original"), {
            status: calls.length === 2 ? 409 : 429,
          });
        return {};
      }}
    />,
  );
  open();
  fireEvent.click(screen.getByRole("radio", { name: "+5", exact: true }));
  reason();
  submit();
  await screen.findByRole("alert");
  view.rerender(
    <StockAdjustment
      {...props}
      product={{ ...product, stock: 15 }}
      save={async (...args: any[]) => {
        calls.push(args);
        if (calls.length < 4)
          throw Object.assign(Error("Retry original"), {
            status: calls.length === 2 ? 409 : 429,
          });
        return {};
      }}
    />,
  );
  for (let n = 2; n <= 4; n++) {
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original stock movement" }),
    );
    await waitFor(() => assert.equal(calls.length, n));
    await act(async () => {});
  }
  assert.equal(calls[0][2].expectedStock, 10);
  assert.equal(calls[0][2].quantity, 5);
  assert.match(calls[0][2].requestKey, /^[0-9a-f-]{36}$/);
  for (const call of calls.slice(1)) {
    assert.equal(call[0], calls[0][0]);
    assert.deepEqual(call[2], calls[0][2]);
  }
  assert.equal(screen.queryByRole("dialog"), null);
});
for (const status of [401, 403, 404])
  test(`stock${status} hides private sheet and remains denied across refreshed props`, async () => {
    let calls = 0;
    const save = async () => {
      calls++;
      throw Object.assign(Error("Access denied"), { status });
    };
    const view = render(<StockAdjustment {...props} save={save} />);
    open();
    reason();
    submit();
    await screen.findByRole("alert");
    assert.equal(screen.queryByRole("dialog"), null);
    assert.equal(
      screen.queryByRole("button", { name: "Adjust stock for Tea" }),
      null,
    );
    view.rerender(
      <StockAdjustment
        {...props}
        product={{ ...product, stock: 20 }}
        save={save}
      />,
    );
    assert.equal(
      screen.queryByRole("button", { name: "Retry original stock movement" }),
      null,
    );
    assert.equal(calls, 1);
  });
test("negative quick choices match waste without silently choosing non-idempotent correction", async () => {
  const calls: any[] = [];
  render(
    <StockAdjustment
      {...props}
      save={async (...args: any[]) => {
        calls.push(args);
        return {};
      }}
    />,
  );
  open();
  assert.equal(screen.queryByRole("radio", { name: "-5", exact: true }), null);
  fireEvent.click(screen.getByRole("radio", { name: "Waste", exact: true }));
  fireEvent.click(screen.getByRole("radio", { name: "-5", exact: true }));
  assert.equal(
    (
      screen.getByRole("radio", {
        name: "Waste",
        exact: true,
      }) as HTMLInputElement
    ).checked,
    true,
  );
  assert.equal(
    (
      screen.getByRole("radio", {
        name: "Count correction",
        exact: true,
      }) as HTMLInputElement
    ).checked,
    false,
  );
  fireEvent.click(
    screen.getByRole("radio", { name: "Spilled stock", exact: true }),
  );
  submit();
  await waitFor(() => assert.equal(calls.length, 1));
  assert.ok(calls[0][0].endsWith("/stock/movements"));
  assert.equal(calls[0][2].type, "waste");
  assert.equal(calls[0][2].quantity, 5);
});
test("ambiguous count correction cannot be retried or unlocked by changing refreshed stock props", async () => {
  let calls = 0;
  const save = async () => {
    calls++;
    throw Error("Unknown correction");
  };
  const view = render(<StockAdjustment {...props} save={save} />);
  open();
  fireEvent.click(
    screen.getByRole("radio", { name: "Count correction", exact: true }),
  );
  fireEvent.click(
    screen.getByRole("radio", { name: "Stock recount", exact: true }),
  );
  submit();
  await screen.findByText(/could not confirm this count correction/);
  view.rerender(
    <StockAdjustment
      {...props}
      product={{ ...product, stock: 11 }}
      save={save}
    />,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Retry original stock movement" }),
    null,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Save stock change" }),
    null,
  );
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Close Adjust stock · Tea",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  assert.equal(calls, 1);
});
for (const stock of [undefined, -1, 1000001])
  test(`invalid initial stock${String(stock)} never becomes zero or sends an adjustment`, () => {
    let calls = 0;
    render(
      <StockAdjustment
        {...props}
        product={{ ...product, stock }}
        save={async () => {
          calls++;
          return {};
        }}
      />,
    );
    open();
    reason();
    assert.ok(screen.getAllByText("Unavailable").length >= 1);
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Save stock change",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    submit();
    assert.equal(calls, 0);
  });
test("fractional stock change is rejected by controller even when native validation is bypassed", () => {
  let calls = 0;
  render(
    <StockAdjustment
      {...props}
      save={async () => {
        calls++;
        return {};
      }}
    />,
  );
  open();
  reason();
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Stock change for Tea" }),
    { target: { value: "1.5" } },
  );
  submit();
  assert.equal(calls, 0);
});
test("late previous-scope completion cannot restore private sheet or mutate the new scope view", async () => {
  let done!: (value: any) => void;
  const save = async () =>
    new Promise((resolve) => {
      done = resolve;
    });
  const view = render(<StockAdjustment {...props} save={save} />);
  open();
  reason();
  submit();
  view.rerender(
    <StockAdjustment
      {...props}
      base="/organizations/org/branches/other"
      save={save}
    />,
  );
  assert.equal(screen.queryByRole("dialog"), null);
  await act(async () => done({}));
  assert.equal(
    screen.queryByRole("button", { name: "Adjust stock for Tea" }),
    null,
  );
  assert.match(screen.getByRole("alert").textContent!, /view changed/);
});
test("stock writes remain usable under StrictMode effect setup/cleanup rehearsal", async () => {
  let calls = 0;
  render(
    <React.StrictMode>
      <StockAdjustment
        {...props}
        save={async () => {
          calls++;
          return {};
        }}
      />
    </React.StrictMode>,
  );
  open();
  reason();
  submit();
  await waitFor(() => assert.equal(calls, 1));
});

test("reopening after a removed size safely selects an existing counted balance without a stale target crash", () => {
  const view = render(
    <StockAdjustment
      {...props}
      product={{
        ...product,
        variants: [
          { id: "small", name: "Small", stockMode: "counted", stock: 5 },
        ],
      }}
    />,
  );
  open();
  fireEvent.focus(
    screen.getByRole("combobox", { name: "Stock target for Tea" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "Small 5 in stock" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Close Adjust stock · Tea" }),
  );
  view.rerender(<StockAdjustment {...props} />);
  open();
  assert.equal(
    screen.queryByRole("combobox", { name: "Stock target for Tea" }),
    null,
  );
  assert(screen.getByText("10", { selector: "strong" }));
});
