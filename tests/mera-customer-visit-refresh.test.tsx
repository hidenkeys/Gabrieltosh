import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "FormData",
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
const { render, screen, fireEvent, cleanup, act, within } =
  await import("@testing-library/react");
const { default: CustomerExperience } =
  await import("../src/mera/customer/CustomerExperience");
const organizationId = "10000000-0000-4000-8000-000000000001",
  branchId = "20000000-0000-4000-8000-000000000001",
  visitId = "50000000-0000-4000-8000-000000000001",
  sessionRef = "40000000-0000-4000-8000-000000000001";
const menu = {
  organization: { id: organizationId, name: "Bing Chun" },
  branch: { id: branchId, name: "Surulere", timezone: "Africa/Lagos" },
  version: 1,
  products: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      name: "Original tea",
      code: "A1",
      category: "Tea",
      price: 100000,
      available: true,
      variants: [],
      modifierGroups: [],
    },
  ],
  tables: [],
  orderingAvailable: true,
  reservationPolicy: { enabled: false },
};
const summary = (balance: number) => ({
  visit: { id: visitId, tableName: "Window table", status: "open" },
  balance,
  bills: [],
  orders: [],
});
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(cleanup);
function api(
  t: any,
  visitRead: (count: number) => any,
  other?: (path: string, init: any) => any,
) {
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({
        displayName: "Ada",
        sessionRef,
        orders: [],
        reservations: [],
        openVisits: [],
      });
    if (path.endsWith("/guests"))
      return Response.json({ displayName: "Ada", sessionRef });
    if (path.endsWith("/visits/terms"))
      return Response.json({
        visitId,
        minimumSpendPolicy: null,
        privateBillAccessGranted: false,
      });
    if (path.endsWith("/visits/join")) return Response.json({ id: visitId });
    if (path.endsWith("/public/visits/" + visitId)) return visitRead(++reads);
    if (other) return other(path, init);
    throw Error("Unexpected request: " + path);
  });
  return () => reads;
}
async function join() {
  const view = render(<CustomerExperience />);
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(screen.getByRole("button", { name: "Join a table" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Visit reference" }), {
    target: { value: visitId },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Joining code" }), {
    target: { value: "1234" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join current visit" }));
  await screen.findByText(/joined this visit/);
  fireEvent.click(screen.getByRole("button", { name: "Your table" }));
  await screen.findByText("Window table");
  return view;
}
const topBalance = () =>
  document.querySelector(".mc-visit-balance-card") as HTMLElement;
test("manual bill refresh updates its own request, clears local read error and re-enables refresh", async (t) => {
  api(t, (read) =>
    read === 2
      ? Promise.reject(Error("offline"))
      : Response.json(summary(read === 1 ? 100000 : 250000)),
  );
  await join();
  fireEvent.click(screen.getByRole("button", { name: "Refresh bill" }));
  await screen.findByText(/Updates interrupted/);
  assert(within(topBalance()).getByText("₦1,000.00"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh bill" }));
  await screen.findByText("₦2,500.00");
  assert.equal(screen.queryByText(/Updates interrupted/), null);
  assert.equal(
    (screen.getByRole("button", { name: "Refresh bill" }) as HTMLButtonElement)
      .disabled,
    false,
  );
});
test("a delayed polling read cannot overwrite a newer successful manual refresh", async (t) => {
  let resolvePoll!: (response: Response) => void;
  api(t, (read) =>
    read === 2
      ? new Promise<Response>((resolve) => {
          resolvePoll = resolve;
        })
      : Response.json(summary(read === 1 ? 100000 : 300000)),
  );
  await join();
  act(() => window.dispatchEvent(new Event("online")));
  fireEvent.click(screen.getByRole("button", { name: "Refresh bill" }));
  await screen.findByText("₦3,000.00");
  await act(async () => resolvePoll(Response.json(summary(999900))));
  assert(within(topBalance()).getByText("₦3,000.00"));
  assert.equal(screen.queryByText("₦9,999.00"), null);
});
for (const status of [401, 403, 404])
  test(`visit refresh ${status} removes private bill rather than showing stale authorized content`, async (t) => {
    api(t, (read) =>
      read === 1
        ? Response.json(summary(100000))
        : Response.json({ error: "Visit access unavailable" }, { status }),
    );
    await join();
    fireEvent.click(screen.getByRole("button", { name: "Refresh bill" }));
    await screen.findByText(
      status === 401 ? /guest session expired/ : /visit is no longer available/,
    );
    assert.equal(screen.queryByText("Window table"), null);
    assert.equal(document.querySelector(".mc-visit-balance-card"), null);
  });
test("late old-branch refresh cannot restore its private table after scope change", async (t) => {
  let resolve!: (response: Response) => void;
  api(t, (read) =>
    read === 1
      ? Response.json(summary(100000))
      : new Promise<Response>((done) => {
          resolve = done;
        }),
  );
  const view = await join();
  fireEvent.click(screen.getByRole("button", { name: "Refresh bill" }));
  view.rerender(
    <CustomerExperience
      organizationSlug="bing-chun"
      branchId="20000000-0000-4000-8000-000000000002"
    />,
  );
  await act(async () => resolve(Response.json(summary(999900))));
  assert.equal(screen.queryByText("Window table"), null);
  assert.equal(screen.queryByText("₦9,999.00"), null);
});
test("successful visit refresh does not clear an unrelated uncertain order write error", async (t) => {
  let rejectOrder!: (response: Response) => void;
  api(
    t,
    (read) => Response.json(summary(read === 1 ? 100000 : 200000)),
    (path, init) => {
      if (path.endsWith("/orders") && init.method === "POST")
        return new Promise<Response>((done) => {
          rejectOrder = done;
        });
      throw Error("Unexpected request: " + path);
    },
  );
  await join();
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose: Original tea" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Your table" }));
  await act(async () =>
    rejectOrder(
      Response.json(
        { error: "Order write could not be confirmed" },
        { status: 500 },
      ),
    ),
  );
  await screen.findByText("Order write could not be confirmed");
  fireEvent.click(screen.getByRole("button", { name: "Refresh bill" }));
  await screen.findByText("₦2,000.00");
  assert(screen.getByText("Order write could not be confirmed"));
});

for (const phase of ["terms", "private bill"] as const)
  test(`late initial join ${phase} cannot change the new branch tab, fulfillment or private bill`, async (t) => {
    const newBranch = "20000000-0000-4000-8000-000000000002";
    let resolveHeld!: (response: Response) => void;
    let announceHeld!: () => void;
    const held = new Promise<void>((resolve) => {
      announceHeld = resolve;
    });
    let joinPosts = 0;
    t.mock.method(globalThis, "fetch", async (input: any) => {
      const path = String(input);
      if (path.endsWith("/menu"))
        return Response.json({
          ...menu,
          branch: {
            ...menu.branch,
            id: path.includes(newBranch) ? newBranch : branchId,
          },
        });
      if (path.endsWith("/branches")) return Response.json({ branches: [] });
      if (path.endsWith("/guest"))
        return Response.json({
          displayName: "Ada",
          sessionRef,
          orders: [],
          reservations: [],
          openVisits: [],
        });
      if (path.endsWith("/guests"))
        return Response.json({ displayName: "Ada", sessionRef });
      if (path.endsWith("/visits/terms")) {
        if (phase === "terms") {
          announceHeld();
          return new Promise<Response>((resolve) => {
            resolveHeld = resolve;
          });
        }
        return Response.json({
          visitId,
          minimumSpendPolicy: null,
          privateBillAccessGranted: false,
        });
      }
      if (path.endsWith("/visits/join")) {
        joinPosts++;
        return Response.json({ id: visitId });
      }
      if (path.endsWith("/public/visits/" + visitId)) {
        announceHeld();
        return new Promise<Response>((resolve) => {
          resolveHeld = resolve;
        });
      }
      throw Error("Unexpected request: " + path);
    });
    const view = render(<CustomerExperience />);
    await screen.findByRole("heading", { name: "Your basket" });
    fireEvent.click(screen.getByRole("button", { name: "Join a table" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Visit reference" }), {
      target: { value: visitId },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Joining code" }), {
      target: { value: "1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join current visit" }));
    await held;
    assert.equal(joinPosts, phase === "terms" ? 0 : 1);
    view.rerender(
      <CustomerExperience organizationSlug="bing-chun" branchId={newBranch} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reserve a table" }));
    await screen.findByRole("heading", { name: "A table for your plans" });
    await act(async () =>
      resolveHeld(
        Response.json(
          phase === "terms"
            ? {
                visitId,
                minimumSpendPolicy: null,
                privateBillAccessGranted: false,
              }
            : summary(999900),
        ),
      ),
    );
    assert.equal(joinPosts, phase === "terms" ? 0 : 1);
    assert.equal(
      screen
        .getByRole("button", { name: "Reserve a table" })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(screen.queryByText("Window table"), null);
    assert.equal(screen.queryByText(/You have joined this visit/), null);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    await screen.findByRole("heading", { name: "Your basket" });
    assert.equal(
      (screen.getByRole("combobox", { name: "Enjoy it" }) as HTMLSelectElement)
        .value,
      "counter_pickup",
    );
    assert.equal(screen.queryByRole("option", { name: "At my table" }), null);
  });

test("wrong joining code shows a local table error without a menu refresh or private bill read", async (t) => {
  let privateReads = 0,
    joinPosts = 0;
  api(t, () => {
    privateReads++;
    return Response.json(summary(100000));
  });
  const existing = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/visits/terms"))
      return Response.json(
        { error: "Joining code is incorrect" },
        { status: 403 },
      );
    if (String(input).endsWith("/visits/join")) joinPosts++;
    return existing(input, init);
  });
  render(<CustomerExperience />);
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(screen.getByRole("button", { name: "Join a table" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Visit reference" }), {
    target: { value: visitId },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Joining code" }), {
    target: { value: "wrong-code" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join current visit" }));
  const error = await screen.findByRole("alert");
  assert.match(error.textContent || "", /Joining code is incorrect/);
  assert(error.closest(".mc-visit-panel"));
  assert.equal(screen.queryByRole("button", { name: "Refresh menu" }), null);
  assert.equal(document.querySelector(".mc-visit-balance-card"), null);
  assert.equal(privateReads, 0);
  assert.equal(joinPosts, 0);
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Join current visit",
      }) as HTMLButtonElement
    ).disabled,
    false,
  );
});
