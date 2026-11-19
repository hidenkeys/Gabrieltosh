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
const { render, screen, fireEvent, waitFor, cleanup, act } =
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
test("filter changes and loading retain actual prepared-count inputs and unsaved values without showing hidden cards", () => {
  const { container, rerender } = render(<Tickets {...props} />);
  const input = screen.getByLabelText("Prepared quantity for Tea on kitchen");
  fireEvent.input(input, { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Ticket view"), {
    target: { value: "ready" },
  });
  assert.ok(container.querySelector("article[hidden]"));
  assert.equal(input.isConnected, true);
  assert.ok(screen.getByText("No tickets in this view"));
  fireEvent.change(screen.getByLabelText("Ticket view"), {
    target: { value: "active" },
  });
  assert.ok(
    screen.getByLabelText("Prepared quantity for Tea on kitchen") === input,
  );
  assert.equal((input as HTMLInputElement).value, "2");
  rerender(<Tickets {...props} loading />);
  assert.ok(container.querySelector(".mw-preparation-grid[hidden]"));
  assert.ok(input.isConnected);
  rerender(<Tickets {...props} />);
  assert.ok(
    screen.getByLabelText("Prepared quantity for Tea on kitchen") === input,
  );
  assert.equal((input as HTMLInputElement).value, "2");
});
test("malformed ticket items and rows are unavailable instead of crashing or claiming an empty queue", () => {
  for (const bad of [
    null,
    { ...ticket, items: [null] },
    { ...ticket, items: [{ quantity: "bad", preparedQuantity: null }] },
  ]) {
    const view = render(<Tickets {...props} tickets={[bad]} />);
    assert.ok(screen.getByText(/Preparation tickets are unavailable/));
    assert.ok(!screen.queryByText("No preparation tickets for this branch."));
    view.unmount();
  }
});
test("elapsed time is unavailable without valid server clock and blank/out-of-range native counts cannot dispatch", () => {
  let writes = 0;
  render(
    <Tickets
      {...props}
      save={async () => {
        writes++;
        return {};
      }}
    />,
  );
  assert.ok(
    screen.getByText(
      /Waiting times are unavailable until the branch clock is refreshed/,
    ),
  );
  assert.ok(screen.getByText("Time unavailable"));
  const input = screen.getByLabelText("Prepared quantity for Tea on kitchen");
  for (const value of ["", "9", "1.5", "-1"]) {
    fireEvent.input(input, { target: { value } });
    fireEvent.submit(input.closest("form")!);
  }
  assert.equal(writes, 0);
});
test("synchronous count submissions serialize, unknown body survives conflicts, and denied writes hide private ticket details", async () => {
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
  const input = screen.getByLabelText("Prepared quantity for Tea on kitchen");
  fireEvent.change(input, { target: { value: "2" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.submit(input.closest("form")!);
  assert.equal(calls.length, 1);
  await act(async () => reject(Error("Unknown outcome")));
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
  assert.ok(!screen.queryByText("3 × Tea"));
});
test("old scope failure cannot restore a private error in a new preparation station", async () => {
  let reject: any;
  const p = {
    ...props,
    save: async () => await new Promise((_r, r) => (reject = r)),
  };
  const view = render(<Tickets {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Mark station ready" }));
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
