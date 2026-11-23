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
const { render, screen, fireEvent, waitFor, cleanup, act, within } =
  await import("@testing-library/react");
const { default: Tickets } = await import("../src/mera/workspace/Tickets");
const ticket = {
  id: "t1",
  orderId: "o1",
  station: "kitchen",
  status: "preparing",
  version: 8,
  createdAt: "2026-11-18T10:00:00Z",
  items: [
    {
      orderLineId: "l1",
      name: "Tea",
      quantity: 3,
      preparedQuantity: 1,
      modifiers: [{ name: "Less sugar" }],
      allergens: ["Milk"],
    },
  ],
};
const order = {
  id: "o1",
  reference: "A100",
  displayName: "Ada",
  status: "preparing",
  paymentStatus: "paid",
  note: "No ice <script>unsafe</script>",
  handlerName: "Teni",
  history: [],
};
const base = "/organizations/org-a/branches/branch-a";
const props = {
  base,
  tickets: [ticket],
  orders: [order],
  disabled: false,
  save: async () => ({}),
};
test.afterEach(cleanup);
test("filter changes and loading retain prepared-count displays without mounting hidden cards as visible", () => {
  const { container, rerender } = render(<Tickets {...props} />);
  const count = screen.getByLabelText("Prepared quantity for Tea on kitchen");
  fireEvent.click(
    within(screen.getByRole("group", { name: "Show tickets" })).getByRole(
      "radio",
      { name: "Ready" },
    ),
  );
  assert.ok(container.querySelector("article[hidden]"));
  assert.equal(count.isConnected, true);
  assert.ok(screen.getByText("No tickets in this view"));
  fireEvent.click(
    within(screen.getByRole("group", { name: "Show tickets" })).getByRole(
      "radio",
      { name: "Active" },
    ),
  );
  assert.equal(
    screen.getByLabelText("Prepared quantity for Tea on kitchen"),
    count,
  );
  assert.equal(count.textContent, "1 / 3");
  rerender(<Tickets {...props} loading />);
  assert.ok(container.querySelector(".mw-preparation-grid[hidden]"));
  assert.ok(count.isConnected);
  rerender(<Tickets {...props} />);
  assert.equal(
    screen.getByLabelText("Prepared quantity for Tea on kitchen"),
    count,
  );
});
test("malformed ticket items and rows are unavailable instead of crashing or claiming an empty queue", () => {
  for (const bad of [
    null,
    { ...ticket, items: [null] },
    { ...ticket, items: [{ quantity: "bad", preparedQuantity: null }] },
    { ...ticket, items: [{ ...ticket.items[0], cancelledQuantity: -1 }] },
  ]) {
    const view = render(<Tickets {...props} tickets={[bad]} />);
    assert.ok(screen.getByText(/Preparation tickets are unavailable/));
    assert.ok(!screen.queryByText("No preparation tickets for this branch."));
    view.unmount();
  }
});
test("elapsed time is unavailable without valid server clock and prepared counts cannot move below saved or above ordered", async () => {
  const calls: any[] = [];
  render(
    <Tickets
      {...props}
      tickets={[
        { ...ticket, items: [{ ...ticket.items[0], preparedQuantity: 3 }] },
      ]}
      save={async (...args) => {
        calls.push(args);
      }}
    />,
  );
  assert.ok(screen.getByLabelText("Waiting time unavailable"));
  assert.ok(screen.getByText("Time unavailable"));
  const plus = screen.getByRole("button", {
    name: "Prepare one more Tea on kitchen",
  });
  assert.equal((plus as HTMLButtonElement).disabled, true);
  fireEvent.click(plus);
  assert.equal(calls.length, 0);
  assert.equal(screen.queryByRole("spinbutton"), null);
  assert.equal(document.querySelector("input[type=number]"), null);
});
test("synchronous count taps serialize, unknown body survives conflicts, and denied writes hide private ticket details", async () => {
  const calls: any[] = [];
  let reject: any;
  render(
    <Tickets
      {...props}
      save={async (...args: any[]) => {
        calls.push(args);
        if (calls.length === 1)
          return await new Promise((_r, r) => (reject = r));
        throw Object.assign(Error("Check original"), {
          status: calls.length === 2 ? 409 : 403,
        });
      }}
    />,
  );
  const plus = screen.getByRole("button", {
    name: "Prepare one more Tea on kitchen",
  });
  fireEvent.click(plus);
  fireEvent.click(plus);
  assert.equal(calls.length, 1);
  assert.equal(
    screen.getByLabelText("Prepared quantity for Tea on kitchen").textContent,
    "2 / 3",
  );
  await act(async () => reject(Error("Unknown outcome")));
  assert.equal(
    screen.getByLabelText("Prepared quantity for Tea on kitchen").textContent,
    "1 / 3",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original preparation update" }),
  );
  await waitFor(() => assert.equal(calls.length, 2));
  await waitFor(() =>
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Retry original preparation update",
        }) as HTMLButtonElement
      ).disabled,
      false,
    ),
  );
  assert.deepEqual(calls[0][2], calls[1][2]);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original preparation update" }),
  );
  await screen.findByText(/Preparation access needs checking/);
  assert.ok(!screen.queryByText("Ada"));
  assert.ok(!screen.queryByText("Tea"));
});
test("old scope failure cannot restore a private error in a new preparation station", async () => {
  let reject: any;
  const p = {
    ...props,
    save: async () => await new Promise((_r, r) => (reject = r)),
  };
  const view = render(<Tickets {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));
  view.rerender(
    <Tickets
      {...p}
      base="/organizations/other/branches/other"
      tickets={[]}
      orders={[]}
    />,
  );
  await act(async () => reject(Error("PRIVATE OLD FAILURE")));
  assert.ok(!screen.queryByText("PRIVATE OLD FAILURE"));
  assert.ok(screen.getByText("No preparation tickets for this branch."));
});
test("saving one ticket preserves another ticket's confirmed preparation count", async () => {
  const second = { ...ticket, id: "t2", orderId: "o2" },
    secondOrder = { ...order, id: "o2", reference: "A101" };
  render(
    <Tickets
      {...props}
      tickets={[ticket, second]}
      orders={[order, secondOrder]}
    />,
  );
  const counts = screen.getAllByLabelText(
    "Prepared quantity for Tea on kitchen",
  );
  fireEvent.click(
    screen.getAllByRole("button", {
      name: "Prepare one more Tea on kitchen",
    })[0],
  );
  await waitFor(() =>
    assert.equal(
      (
        screen.getAllByRole("button", {
          name: "Prepare one more Tea on kitchen",
        })[0] as HTMLButtonElement
      ).disabled,
      false,
    ),
  );
  assert.equal(counts[0].textContent, "2 / 3");
  assert.equal(counts[1].textContent, "1 / 3");
  assert.ok(counts[1].isConnected);
});
test("reviewing a newer ticket restores its authoritative count and preserves other ticket counts", async () => {
  const second = { ...ticket, id: "t2", orderId: "o2" },
    secondOrder = { ...order, id: "o2", reference: "A101" },
    p = {
      ...props,
      save: async () => {
        throw Error("Unknown");
      },
    };
  const view = render(
    <Tickets {...p} tickets={[ticket, second]} orders={[order, secondOrder]} />,
  );
  const counts = screen.getAllByLabelText(
    "Prepared quantity for Tea on kitchen",
  );
  fireEvent.click(
    screen.getAllByRole("button", {
      name: "Prepare one more Tea on kitchen",
    })[0],
  );
  await screen.findByText("Check this update before preparing more items.");
  view.rerender(
    <Tickets
      {...p}
      tickets={[{ ...ticket, version: 9 }, second]}
      orders={[order, secondOrder]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Use latest ticket" }));
  assert.equal(counts[0].textContent, "1 / 3");
  assert.equal(counts[1].textContent, "1 / 3");
  assert.ok(counts[1].isConnected);
});
for (const scope of ["kitchen", "bar"])
  test(`${scope} role view never mounts the other station and read retry retains confirmed count`, async () => {
    const own = { ...ticket, id: scope + "-ticket", station: scope },
      other = {
        ...ticket,
        id: "other-ticket",
        station: scope === "kitchen" ? "bar" : "kitchen",
        items: [{ ...ticket.items[0], name: "OTHER STATION PRIVATE ITEM" }],
      };
    let reads = 0;
    const p = {
      ...props,
      tickets: [own, other],
      stationScope: scope,
      onRefresh: async () => {
        reads++;
        throw Error("Offline read");
      },
    };
    const view = render(<Tickets {...p} />),
      count = screen.getByLabelText(`Prepared quantity for Tea on ${scope}`);
    fireEvent.click(screen.getByRole("button", { name: "Refresh tickets" }));
    await screen.findByText("Tickets could not be refreshed. Try again.");
    assert.equal(reads, 1);
    assert.equal(count.textContent, "1 / 3");
    assert.ok(!screen.queryByText(/OTHER STATION PRIVATE ITEM/));
    assert.ok(!screen.queryByLabelText("Preparation station"));
    view.rerender(<Tickets {...p} loadError="Branch read unavailable" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading tickets" }),
    );
    await waitFor(() => assert.equal(reads, 2));
    assert.equal(count.textContent, "1 / 3");
    assert.ok(count.isConnected);
  });

test("a single-item row autosaves exact SET and real acknowledgement moves the ticket to Ready", async () => {
  const calls: any[] = [];
  const single = {
    ...ticket,
    items: [
      {
        ...ticket.items[0],
        quantity: 1,
        preparedQuantity: 0,
        cancelledQuantity: 2,
      },
    ],
  };
  render(
    <Tickets
      {...props}
      tickets={[single]}
      save={async (...args: any[]) => {
        calls.push(args);
        return {
          ticket: {
            ...single,
            status: "ready",
            version: 9,
            items: [{ ...single.items[0], preparedQuantity: 1 }],
          },
        };
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Prepare Tea on kitchen" }),
  );
  await screen.findByText("Ready for service");
  assert.deepEqual(calls[0][2], { preparedQuantity: 1, version: 8 });
  assert.equal(
    document.querySelector("article")?.getAttribute("data-lane"),
    "ready",
  );
  assert.equal(screen.queryByRole("button", { name: "Mark ready" }), null);
  assert.equal(
    screen.getByLabelText("Prepared quantity for Tea on kitchen").textContent,
    "1 / 1",
  );
});
test("definite autosave rejection rolls back and leaves an inline error on only the affected ticket", async () => {
  render(
    <Tickets
      {...props}
      save={async () => {
        throw Object.assign(Error("Ticket changed. Refresh it."), {
          status: 409,
        });
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Prepare one more Tea on kitchen" }),
  );
  const error = await screen.findByRole("alert");
  assert.ok(error.closest("article"));
  assert.equal(
    screen.getByLabelText("Prepared quantity for Tea on kitchen").textContent,
    "1 / 3",
  );
  assert.equal(
    screen.queryByRole("button", { name: "Retry original preparation update" }),
    null,
  );
});

test("phone status filter is independent of the previous desktop view", () => {
  const original = window.matchMedia;
  let change: (() => void) | undefined;
  const media = {
    matches: false,
    addEventListener: (_event: string, callback: () => void) => {
      change = callback;
    },
    removeEventListener: () => {},
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => media,
  });
  try {
    const { container } = render(<Tickets {...props} />);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Show tickets" })).getByRole(
        "radio",
        { name: "Ready" },
      ),
    );
    assert.equal(
      container.querySelector("article")?.hasAttribute("hidden"),
      true,
    );
    act(() => {
      media.matches = true;
      change?.();
    });
    assert.equal(
      container.querySelector("article")?.hasAttribute("hidden"),
      false,
    );
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Preparation status" }),
      ).getByRole("radio", { name: "Ready" }),
    );
    assert.equal(
      container.querySelector("article")?.hasAttribute("hidden"),
      true,
    );
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Preparation status" }),
      ).getByRole("radio", { name: "Preparing" }),
    );
    assert.equal(
      container.querySelector("article")?.hasAttribute("hidden"),
      false,
    );
  } finally {
    cleanup();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: original,
    });
  }
});
