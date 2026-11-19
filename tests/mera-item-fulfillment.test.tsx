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
const { render, screen, fireEvent, cleanup, act } =
  await import("@testing-library/react");
const { default: ItemFulfillment } =
  await import("../src/mera/workspace/ItemFulfillment");
const { WorkspaceError } = await import("../src/mera/workspace/api");
test.afterEach(cleanup);
const order = {
  id: "order-one",
  version: 2,
  status: "preparing",
  items: [
    { orderLineId: "line-one", name: "Tea", quantity: 4, fulfilledQuantity: 1 },
  ],
};
const tickets = [
  {
    orderId: "order-one",
    status: "preparing",
    items: [{ orderLineId: "line-one", quantity: 4, preparedQuantity: 3 }],
  },
];
const props = {
  order,
  tickets,
  base: "/organizations/org/branches/branch",
  disabled: false,
  save: async (..._args: any[]) => ({ allItemsHandedOver: false }),
};
function open() {
  fireEvent.click(screen.getByText("Hand over prepared items"));
}
function select() {
  fireEvent.change(
    screen.getByRole("combobox", { name: "Item to hand over" }),
    { target: { value: "line-one" } },
  );
}
test("handoff is a monotonic cumulative total capped by actual prepared quantities", async () => {
  const calls: any[] = [];
  render(
    <ItemFulfillment
      {...props}
      save={async (...args: any[]) => {
        calls.push(args);
        return { allItemsHandedOver: false };
      }}
    />,
  );
  open();
  select();
  const number = screen.getByRole("spinbutton", {
    name: "Total handed over after this action",
  });
  assert.equal(number.getAttribute("min"), "2");
  assert.equal(number.getAttribute("max"), "3");
  assert(screen.getByText("Ordered 4 · Prepared 3 · Handed over 1"));
  fireEvent.change(number, { target: { value: "4" } });
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Record item handoff",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  fireEvent.change(number, { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Record item handoff" }));
  await screen.findByText(/whole order has not been marked collected/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].fulfilledQuantity, 3);
  assert.equal(calls[0][2].version, 2);
  assert.match(calls[0][0], /items\/line-one\/fulfillment$/);
});
test("unknown handoff survives409/429 and refreshed terminal stage with exact original key/body", async () => {
  const calls: any[] = [];
  const save = async (...args: any[]) => {
    calls.push(args);
    if (calls.length === 1) throw new WorkspaceError("Network outcome unknown");
    if (calls.length === 2)
      throw new WorkspaceError("Version check interrupted", 409);
    if (calls.length === 3) throw new WorkspaceError("Please wait", 429);
    return { allItemsHandedOver: true };
  };
  const view = render(<ItemFulfillment {...props} save={save} />);
  open();
  select();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Handoff note (optional)" }),
    { target: { value: "Original handoff note" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Record item handoff" }));
  await screen.findByRole("alert");
  view.rerender(
    <ItemFulfillment
      {...props}
      save={save}
      order={{
        ...order,
        version: 9,
        status: "collected",
        items: order.items.map((item) => ({
          ...item,
          name: "Changed current label",
          fulfilledQuantity: 4,
        })),
      }}
      tickets={undefined}
    />,
  );
  assert.equal(calls.length, 1);
  assert(screen.getByText("Tea"));
  assert(screen.getByText("Original handoff note"));
  for (const message of ["Version check interrupted", "Please wait"]) {
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original handoff" }),
    );
    await screen.findByText(message);
    assert.equal(
      screen.queryByRole("combobox", { name: "Item to hand over" }),
      null,
    );
  }
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original handoff" }),
  );
  await screen.findByText(/All items have been handed over/);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call[0], calls[0][0]);
    assert.deepEqual(call[2], calls[0][2]);
  }
  assert.equal(calls[0][2].fulfilledQuantity, 2);
  assert.equal(calls[0][2].version, 2);
  assert.equal(calls[0][2].reason, "Original handoff note");
});
test("only actionable prepared lines can be selected and fully served items are not new actions", () => {
  render(
    <ItemFulfillment
      {...props}
      order={{
        ...order,
        items: [
          ...order.items,
          {
            orderLineId: "line-two",
            name: "Not prepared",
            quantity: 2,
            fulfilledQuantity: 0,
          },
          {
            orderLineId: "line-three",
            name: "Already handed",
            quantity: 1,
            fulfilledQuantity: 1,
          },
        ],
      }}
      tickets={[
        ...tickets,
        {
          orderId: order.id,
          status: "ready",
          items: [{ orderLineId: "line-three", quantity: 1 }],
        },
      ]}
    />,
  );
  open();
  assert(screen.getByRole("option", { name: "Tea · 1 / 4 handed over" }));
  assert.equal(screen.queryByRole("option", { name: /Not prepared/ }), null);
  assert.equal(screen.queryByRole("option", { name: /Already handed/ }), null);
});
for (const value of [
  undefined,
  null,
  [{ orderId: order.id, status: "ready", items: null }],
])
  test("missing preparation data remains unavailable rather than a false zero", () => {
    render(<ItemFulfillment {...props} tickets={value} />);
    open();
    assert(screen.getByText(/Preparation details are unavailable/));
    assert(
      screen.getByText("Ordered 4 · Prepared unavailable · Handed over 1"),
    );
    assert.equal(
      screen.queryByRole("button", { name: "Record item handoff" }),
      null,
    );
  });
test("a confirmed empty preparation list honestly offers no handoff", () => {
  render(<ItemFulfillment {...props} tickets={[]} />);
  open();
  assert(screen.getByText("Ordered 4 · Prepared 0 · Handed over 1"));
  assert(screen.getByText(/No prepared items are waiting/));
  assert.equal(
    screen.queryByRole("button", { name: "Record item handoff" }),
    null,
  );
});
test("synchronous duplicate submission cannot start a second write", async () => {
  let calls = 0,
    resolve!: (value: any) => void;
  let form: HTMLFormElement;
  render(
    <ItemFulfillment
      {...props}
      save={async () => {
        calls++;
        fireEvent.submit(form);
        return new Promise((done) => {
          resolve = done;
        });
      }}
    />,
  );
  open();
  select();
  form = document.querySelector("form")!;
  fireEvent.submit(form);
  assert.equal(calls, 1);
  assert.equal(
    (screen.getByRole("button", { name: "Recording…" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  await act(async () => resolve({ allItemsHandedOver: false }));
  await screen.findByText(/whole order has not been marked collected/);
});
for (const status of [401, 403, 404])
  test(`handoff ${status} hides stale item details and does not re-enable from props`, async () => {
    let calls = 0;
    const save = async () => {
      calls++;
      throw new WorkspaceError("Access unavailable", status);
    };
    const view = render(<ItemFulfillment {...props} save={save} />);
    open();
    select();
    fireEvent.click(
      screen.getByRole("button", { name: "Record item handoff" }),
    );
    await screen.findByRole("alert");
    assert.equal(screen.queryByText("Tea"), null);
    assert.equal(
      screen.queryByRole("button", { name: "Retry original handoff" }),
      null,
    );
    view.rerender(
      <ItemFulfillment
        {...props}
        save={save}
        order={{ ...order, version: 4 }}
      />,
    );
    assert.equal(screen.queryByText("Hand over prepared items"), null);
    assert.equal(calls, 1);
  });
test("scope change resets view and ignores old write completion without auto submitting", async () => {
  let resolve!: (value: any) => void;
  let calls = 0;
  const save = async () => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  };
  const view = render(<ItemFulfillment {...props} save={save} />);
  open();
  select();
  fireEvent.click(screen.getByRole("button", { name: "Record item handoff" }));
  view.rerender(
    <ItemFulfillment
      {...props}
      base="/organizations/org/branches/other"
      save={save}
      order={{
        ...order,
        items: order.items.map((item) => ({ ...item, name: "New branch tea" })),
      }}
    />,
  );
  open();
  await act(async () => resolve({ allItemsHandedOver: true }));
  assert.equal(screen.queryByText(/All items have been handed over/), null);
  assert.equal(screen.queryByText("Original handoff note"), null);
  assert(screen.getByText("New branch tea"));
  assert.equal(calls, 1);
});

test("fulfillment-only staff use projected preparation facts without kitchen tickets", () => {
  render(
    <ItemFulfillment
      {...props}
      tickets={[]}
      preparationFacts={[
        {
          orderId: order.id,
          items: [{ orderLineId: "line-one", preparedQuantity: 3 }],
        },
      ]}
    />,
  );
  open();
  select();
  assert(screen.getByText("Ordered 4 · Prepared 3 · Handed over 1"));
  assert.equal(
    screen
      .getByRole("spinbutton", { name: "Total handed over after this action" })
      .getAttribute("max"),
    "3",
  );
});

test("missing, invalid or duplicate projected preparation facts never fall back to privileged tickets", () => {
  for (const facts of [
    null,
    [],
    [{ orderId: order.id, items: [] }],
    [
      {
        orderId: order.id,
        items: [{ orderLineId: "line-one", preparedQuantity: -1 }],
      },
    ],
    [
      {
        orderId: order.id,
        items: [
          { orderLineId: "line-one", preparedQuantity: 3 },
          { orderLineId: "line-one", preparedQuantity: 3 },
        ],
      },
    ],
  ]) {
    render(<ItemFulfillment {...props} preparationFacts={facts} />);
    open();
    assert(screen.getByText(/Preparation details are unavailable/));
    assert(!screen.queryByRole("button", { name: "Record item handoff" }));
    cleanup();
  }
});
