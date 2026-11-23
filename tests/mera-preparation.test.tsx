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
const { render, screen, fireEvent, waitFor, cleanup } =
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
test("P4 station queue shows actual instructions, elapsed and named handler without other-station data", () => {
  try {
    const { container } = render(
      <Tickets
        base={base}
        tickets={[
          ticket,
          {
            ...ticket,
            id: "bar",
            station: "bar",
            items: [{ name: "Private bar item" }],
          },
        ]}
        orders={[order]}
        stationScope="kitchen"
        disabled={false}
        serverTime="2026-11-18T10:12:00Z"
        save={async () => {}}
      />,
    );
    assert(screen.getByText("Tea"));
    assert(screen.getByText("Less sugar", { exact: false }));
    assert(screen.getByText("Milk", { exact: false }));
    assert(screen.getByLabelText("12 min since ticket received"));
    assert(screen.getByText("Handled by Teni"));
    assert(screen.getByText("No ice <script>unsafe</script>"));
    assert.equal(container.querySelector("script"), null);
    assert.equal(screen.queryByText("Private bar item"), null);
    assert.equal(screen.queryByLabelText("Preparation station"), null);
    assert.equal(screen.queryByText(/₦/), null);
  } finally {
    cleanup();
  }
});
test("P4 uncertain preparation retries preserve original SET and version despite refreshed tickets", async () => {
  const writes: any[] = [];
  try {
    const view = render(
      <Tickets
        base={base}
        tickets={[ticket]}
        orders={[order]}
        disabled={false}
        save={async (...args) => {
          writes.push(args);
          throw Object.assign(new Error("Unknown outcome"), { status: 0 });
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare one more Tea on kitchen" }),
    );
    await screen.findByText("Check this update before preparing more items.");
    view.rerender(
      <Tickets
        base={base}
        tickets={[{ ...ticket, version: 9 }]}
        orders={[order]}
        disabled={false}
        save={async (...args) => {
          writes.push(args);
          throw Object.assign(new Error("Stale version"), { status: 409 });
        }}
      />,
    );
    assert(
      (
        screen.getByLabelText(
          "Prepared quantity for Tea on kitchen",
        ) as HTMLInputElement
      ).getAttribute("aria-disabled") === "true",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original preparation update" }),
    );
    await waitFor(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0][2], { preparedQuantity: 2, version: 8 });
    assert.deepEqual(writes[1][2], writes[0][2]);
    assert(screen.getByText("Check this update before preparing more items."));
    fireEvent.click(screen.getByRole("button", { name: "Use latest ticket" }));
    assert.equal(
      screen.queryByText("Check this update before preparing more items."),
      null,
    );
    assert.equal(
      (
        screen.getByLabelText(
          "Prepared quantity for Tea on kitchen",
        ) as HTMLInputElement
      ).textContent,
      "1 / 3",
    );
  } finally {
    cleanup();
  }
});
test("P4 read loading, failure, missing data and successful empty are distinct", () => {
  try {
    const { rerender } = render(
      <Tickets
        base={base}
        tickets={null}
        orders={null}
        loading
        disabled={false}
        save={async () => {}}
      />,
    );
    assert(screen.getByText("Loading preparation tickets…"));
    assert.equal(
      screen.queryByText("No preparation tickets for this branch."),
      null,
    );
    rerender(
      <Tickets
        base={base}
        tickets={null}
        orders={null}
        loadError="Could not load station tickets"
        disabled={false}
        onRefresh={async () => {}}
        save={async () => {}}
      />,
    );
    assert(screen.getByRole("alert"));
    assert(screen.getByRole("button", { name: "Retry loading tickets" }));
    assert.equal(
      screen.queryByText("No preparation tickets for this branch."),
      null,
    );
    rerender(
      <Tickets
        base={base}
        tickets={[]}
        orders={[]}
        disabled={false}
        save={async () => {}}
      />,
    );
    assert(screen.getByText("No preparation tickets for this branch."));
  } finally {
    cleanup();
  }
});
test("P4 waiting orders and explicit read-only state cannot start preparation", () => {
  try {
    const { rerender } = render(
      <Tickets
        base={base}
        tickets={[{ ...ticket, status: "queued" }]}
        orders={[{ ...order, status: "submitted" }]}
        disabled={false}
        save={async () => {}}
      />,
    );
    assert(screen.getByText("Awaiting order acceptance"));
    assert(
      (
        screen.getByRole("button", {
          name: "Start preparing",
        }) as HTMLButtonElement
      ).disabled,
    );
    rerender(
      <Tickets
        base={base}
        tickets={[ticket]}
        orders={[{ ...order, paymentStatus: "unpaid" }]}
        payLater={false}
        disabled={false}
        save={async () => {}}
      />,
    );
    assert(screen.getByText("Awaiting payment confirmation"));
    assert(
      (
        screen.getByRole("button", {
          name: "Mark ready",
        }) as HTMLButtonElement
      ).disabled,
    );
    rerender(
      <Tickets
        base={base}
        tickets={[ticket]}
        orders={[order]}
        disabled
        save={async () => {}}
      />,
    );
    assert(
      (
        screen.getByRole("button", {
          name: "Mark ready",
        }) as HTMLButtonElement
      ).disabled,
    );
  } finally {
    cleanup();
  }
});

test("P4 failed reads remain explicitly retryable while preparation writes are disabled", async () => {
  let reads = 0;
  try {
    const props = {
      base,
      disabled: true,
      save: async () => {
        throw new Error("No write expected");
      },
      onRefresh: async () => {
        reads++;
      },
    };
    const ui = render(
      <Tickets
        {...props}
        tickets={null}
        orders={null}
        loadError="Network unavailable"
      />,
    );
    const retry = screen.getByRole("button", { name: "Retry loading tickets" });
    assert.equal((retry as HTMLButtonElement).disabled, false);
    fireEvent.click(retry);
    await waitFor(() => assert.equal(reads, 1));
    assert(screen.getByText("Network unavailable"));
    ui.rerender(<Tickets {...props} tickets={[ticket]} orders={[order]} />);
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Mark ready",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Refresh tickets",
        }) as HTMLButtonElement
      ).disabled,
      false,
    );
  } finally {
    cleanup();
  }
});
