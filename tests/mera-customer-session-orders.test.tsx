import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/menu/venue/branch",
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
const { default: SessionOrders } =
  await import("../src/mera/customer/SessionOrders");
test.afterEach(cleanup);
const row = {
  id: "own-order",
  reference: "M-ORIGINAL",
  status: "preparing",
  paymentStatus: "partially_paid",
};
const props = {
  prefix: "/public/venue/branch",
  onSelect: (_order: any) => {},
  onClear: (_message: string) => {},
};
test("initial loading is distinct from confirmed empty history and makes no writes", async (t) => {
  let resolve!: (response: Response) => void;
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", async (_input: any, init: any) => {
    methods.push(init.method);
    return new Promise<Response>((done) => {
      resolve = done;
    });
  });
  render(<SessionOrders {...props} />);
  assert(screen.getByRole("status"));
  assert.equal(screen.queryByText("No orders in this guest session."), null);
  await act(async () => {
    resolve(Response.json({ orders: [], nextCursor: null }));
  });
  assert(screen.getByText("No orders in this guest session."));
  assert.deepEqual(methods, ["GET"]);
});
test("prefix change synchronously hides private rows and ignores delayed previous-branch response", async (t) => {
  let oldReads = 0,
    resolve!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", async (input: any) => {
    if (String(input).includes("/old/")) {
      if (++oldReads === 1)
        return Response.json({ orders: [row], nextCursor: "private-cursor" });
      return new Promise<Response>((done) => {
        resolve = done;
      });
    }
    return Response.json({ orders: [], nextCursor: null });
  });
  const view = render(<SessionOrders {...props} prefix="/public/old/branch" />);
  await screen.findByRole("button", { name: "Open order M-ORIGINAL" });
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh session orders" }),
  );
  view.rerender(<SessionOrders {...props} prefix="/public/new/branch" />);
  assert.equal(
    screen.queryByRole("button", { name: "Open order M-ORIGINAL" }),
    null,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Load more session orders" }),
    null,
  );
  await screen.findByText("No orders in this guest session.");
  await act(async () => {
    resolve(
      Response.json({
        orders: [{ ...row, reference: "M-LATE-PRIVATE" }],
        nextCursor: "old",
      }),
    );
  });
  assert.equal(
    screen.queryByRole("button", { name: "Open order M-LATE-PRIVATE" }),
    null,
  );
});
for (const status of [401, 403, 404])
  test(`refresh ${status} removes private rows and cursor without displaying a false empty result`, async (t) => {
    let reads = 0,
      clears = 0;
    t.mock.method(globalThis, "fetch", async () =>
      ++reads === 1
        ? Response.json({ orders: [row], nextCursor: "private-cursor" })
        : Response.json({ error: "Access unavailable" }, { status }),
    );
    render(
      <SessionOrders
        {...props}
        onClear={() => {
          clears++;
        }}
      />,
    );
    await screen.findByRole("button", { name: "Open order M-ORIGINAL" });
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh session orders" }),
    );
    await screen.findByRole("alert");
    assert.equal(
      screen.queryByRole("button", { name: "Open order M-ORIGINAL" }),
      null,
    );
    assert.equal(
      screen.queryByRole("button", { name: "Load more session orders" }),
      null,
    );
    assert.equal(screen.queryByText("No orders in this guest session."), null);
    assert.equal(clears, status === 401 ? 1 : 0);
  });
test("canonical selection fetches current order, formats status, and denial clears private history", async (t) => {
  let selected: any = null,
    deny = false;
  const canonical = { ...row, status: "ready", total: 120000, items: [] };
  t.mock.method(globalThis, "fetch", async (input: any) =>
    String(input).includes("/public/orders/")
      ? deny
        ? Response.json({ error: "Private order unavailable" }, { status: 403 })
        : Response.json(canonical)
      : Response.json({ orders: [row], nextCursor: "next" }),
  );
  render(
    <SessionOrders
      {...props}
      onSelect={(order) => {
        selected = order;
      }}
    />,
  );
  await screen.findByRole("button", { name: "Open order M-ORIGINAL" });
  assert(screen.getByText("M-ORIGINAL · preparing · partially paid"));
  fireEvent.click(
    screen.getByRole("button", { name: "Open order M-ORIGINAL" }),
  );
  await act(async () => {});
  assert.deepEqual(selected, canonical);
  deny = true;
  fireEvent.click(
    screen.getByRole("button", { name: "Open order M-ORIGINAL" }),
  );
  await screen.findByRole("alert");
  assert.equal(
    screen.queryByRole("button", { name: "Open order M-ORIGINAL" }),
    null,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Load more session orders" }),
    null,
  );
});
