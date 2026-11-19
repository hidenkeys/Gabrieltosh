import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
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
const { default: ReportDetails, validBusinessDate } =
  await import("../src/mera/workspace/ReportDetails");
const { default: ReportExplorer } =
  await import("../src/mera/workspace/ReportExplorer");
test.afterEach(cleanup);
const report = {
  date: "2026-11-17",
  grossSales: 100000,
  netSales: 80000,
  collections: 200000,
  outstanding: 30000,
  orders: 3,
  products: [
    {
      productId: "tea",
      variantId: "large",
      name: "Tea",
      size: "Large",
      quantity: 2,
      total: 100000,
    },
    {
      productId: "tea",
      variantId: "large",
      name: "Tea",
      size: "Large",
      quantity: 1,
      total: 50000,
    },
  ],
  paymentMethods: { cash: 0, external_pos: 200000, external_transfer: 0 },
  netRevenueExTax: null,
  netTaxLiability: null,
};
const response = (value: any = report) => ({
  report: value,
  branch: { timezone: "Africa/Lagos" },
  reportWindow: { from: "2026-11-17T03:00:00Z", to: "2026-11-18T03:00:00Z" },
});
const base = "/organizations/org/branches/branch";
function submitDate(value = "2026-11-17") {
  fireEvent.input(screen.getByLabelText("Business date"), {
    target: { value },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Load date report" }).closest("form")!,
  );
}
test("day report leads with real totals, aggregates recorded product snapshots and keeps accounting mounted but closed", () => {
  render(<ReportDetails report={report} />);
  assert(
    screen.getByRole("heading", { name: "Trading day detail · 17 Nov 2026" }),
  );
  const metrics = document.querySelector(".mw-report-metrics")!;
  assert.equal(metrics.children.length, 5);
  assert(within(metrics as HTMLElement).getByText("₦2,000.00"));
  assert(screen.getByText(/current recorded unpaid balance/));
  const table = screen.getByRole("region", {
    name: "Products recognized for the selected trading day",
  });
  assert(within(table).getByText("3"));
  assert(within(table).getByText("₦1,500.00"));
  const accounting = document.querySelector(
    "details.mw-report-accounting",
  ) as HTMLDetailsElement;
  assert.equal(accounting.open, false);
  assert.equal(screen.getAllByText("Unresolved").length, 2);
});
test("missing or malformed breakdowns are unavailable while valid zero is actually zero", () => {
  const view = render(
    <ReportDetails
      report={{
        ...report,
        products: undefined,
        paymentMethods: {
          cash: 0,
          external_pos: null,
          external_transfer: "0",
          raw_internal_method: 123,
        },
      }}
    />,
  );
  assert(screen.getByText("Product quantities unavailable"));
  assert.equal(
    screen.queryByText("No products recognized as sold for this trading day."),
    null,
  );
  const methodSection = screen
    .getByRole("heading", { name: "Collections by payment method" })
    .closest("section")!;
  assert(within(methodSection).getByText("₦0.00"));
  assert(within(methodSection).getByText("Unresolved"));
  assert(within(methodSection).getByText("Unavailable"));
  assert(within(methodSection).getByText("Unrecognized payment method"));
  assert.equal(
    document.body.textContent?.includes("raw_internal_method"),
    false,
  );
  view.rerender(
    <ReportDetails
      report={{
        ...report,
        products: [{ productId: "x", name: "Tea", quantity: null, total: 0 }],
        paymentMethods: null,
      }}
    />,
  );
  assert(screen.getByText("Product quantities unavailable"));
  assert(screen.getByText("Payment-method breakdown unavailable"));
});
test("additive order/staff breakdowns use exact basis and actual names without live-queue or actor-ID guesses", () => {
  render(
    <ReportDetails
      report={{
        ...report,
        orderStates: {
          basis: "current_state_of_orders_created_on_trading_day",
          counts: { preparing: 2, cancelled: 1 },
          total: 3,
        },
        staffActivity: {
          basis: "recorded_order_history_events_on_trading_day",
          entries: [
            {
              name: "Ada",
              actorType: "staff",
              eventCount: 2,
              actions: { submitted: 1, ready: 1 },
            },
            {
              name: null,
              actorType: "unknown",
              eventCount: 1,
              actions: { private_internal_action: 1 },
              actorId: "private-actor-uuid",
            },
          ],
          unattributedEvents: 1,
        },
        platformFees: { status: "unavailable", amount: null },
      }}
    />,
  );
  assert(screen.getByText("Preparing"));
  assert(screen.getByText("Ada"));
  assert(screen.getByText("Recorded name unavailable"));
  assert(screen.getByText("Other recorded order event: 1"));
  assert.equal(
    document.body.textContent?.includes("private-actor-uuid"),
    false,
  );
  assert.equal(
    document.body.textContent?.includes("private_internal_action"),
    false,
  );
  assert(screen.getByText(/not a complete register of staff payments/));
  assert(screen.getByText(/Mera platform fees: Unavailable/));
});
test("absent optional EOD details remain unavailable and real empty arrays do not invent activity", () => {
  const view = render(<ReportDetails report={report} />);
  assert(screen.getByText("Order-status breakdown unavailable"));
  assert(screen.getByText("Order activity unavailable"));
  view.rerender(
    <ReportDetails
      report={{
        ...report,
        orderStates: {
          basis: "current_state_of_orders_created_on_trading_day",
          counts: {},
          total: 0,
        },
        staffActivity: {
          basis: "recorded_order_history_events_on_trading_day",
          entries: [],
          unattributedEvents: 0,
        },
      }}
    />,
  );
  assert(screen.getByText("No orders were placed on this trading day."));
  assert(
    screen.getByText(
      "No order-history events were recorded for this trading day.",
    ),
  );
});
test("native form reads actual named date value rather than a stale React date and exports only verified selected date", async (t) => {
  const paths: string[] = [],
    exports: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: any) => {
    paths.push(String(input));
    return Response.json(response());
  });
  render(
    <ReportExplorer
      base={base}
      disabled={false}
      initialDate="2026-11-19"
      onExportDate={(value) => exports.push(value)}
    />,
  );
  assert.equal(paths.length, 0);
  const input = screen.getByLabelText("Business date") as HTMLInputElement;
  input.value = "2026-11-17";
  fireEvent.submit(
    screen.getByRole("button", { name: "Load date report" }).closest("form")!,
  );
  await screen.findByRole("heading", {
    name: "Trading day detail · 17 Nov 2026",
  });
  assert(paths[0].endsWith("/workspace?date=2026-11-17"));
  assert.equal(input.value, "2026-11-17");
  assert(screen.getByText(/17 Nov 2026, 04:00 to 18 Nov 2026, 04:00/));
  assert(screen.getByText(/end time belongs to the next trading day/));
  fireEvent.click(
    screen.getByRole("button", { name: "Export this trading day" }),
  );
  assert.deepEqual(exports, ["2026-11-17"]);
  fireEvent.input(input, { target: { value: "2026-11-18" } });
  assert.equal(
    screen.queryByRole("button", { name: "Export this trading day" }),
    null,
  );
});
test("real calendar validation rejects normalized impossible dates and direct invalid form submissions make no read", () => {
  for (const value of ["2026-02-30", "1900-02-29", "2026-13-01", "1899-12-31"])
    assert.equal(validBusinessDate(value), false);
  assert.equal(validBusinessDate("2000-02-29"), true);
  render(<ReportExplorer base={base} disabled={false} />);
  fireEvent.submit(
    screen.getByRole("button", { name: "Load date report" }).closest("form")!,
  );
  assert(screen.getByRole("alert"));
});
test("wrong report day has no export and deliberate read retry recovers without relabelling totals", async (t) => {
  let reads = 0;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      response({
        ...report,
        date: ++reads === 1 ? "2026-11-18" : "2026-11-17",
      }),
    ),
  );
  render(
    <ReportExplorer
      base={base}
      disabled={false}
      onExportDate={() => {
        throw Error("Must only export matching report");
      }}
    />,
  );
  submitDate();
  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent || "", /different trading day/);
  assert.equal(
    screen.queryByRole("button", { name: "Export this trading day" }),
    null,
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry selected date" }));
  await screen.findByRole("heading", {
    name: "Trading day detail · 17 Nov 2026",
  });
  assert.equal(reads, 2);
});
test("branch switch immediately hides previous report and ignores its delayed read", async (t) => {
  let reads = 0,
    resolve!: (value: Response) => void;
  t.mock.method(globalThis, "fetch", async (input: any) =>
    String(input).includes("/old/")
      ? ++reads === 1
        ? Response.json(response())
        : new Promise<Response>((done) => {
            resolve = done;
          })
      : Response.json(response()),
  );
  const view = render(
    <ReportExplorer base="/organizations/org/branches/old" disabled={false} />,
  );
  submitDate();
  await screen.findByRole("heading", {
    name: "Trading day detail · 17 Nov 2026",
  });
  submitDate();
  view.rerender(
    <ReportExplorer base="/organizations/org/branches/new" disabled={false} />,
  );
  assert.equal(
    screen.queryByRole("heading", { name: "Trading day detail · 17 Nov 2026" }),
    null,
  );
  await act(async () =>
    resolve(Response.json(response({ ...report, netSales: 999999 }))),
  );
  assert.equal(screen.queryByText("₦9,999.99"), null);
  assert(screen.getByText("Choose a business date to see its report."));
});
for (const status of [401, 403, 404])
  test(`date report ${status} clears private totals and offers only explicit read retry`, async (t) => {
    let reads = 0;
    t.mock.method(globalThis, "fetch", async () =>
      ++reads === 1
        ? Response.json(response())
        : Response.json({ error: "Report access unavailable" }, { status }),
    );
    render(<ReportExplorer base={base} disabled={false} />);
    submitDate();
    await screen.findByRole("heading", {
      name: "Trading day detail · 17 Nov 2026",
    });
    submitDate();
    await screen.findByRole("alert");
    assert.equal(
      screen.queryByRole("heading", {
        name: "Trading day detail · 17 Nov 2026",
      }),
      null,
    );
    assert(screen.getByRole("button", { name: "Retry selected date" }));
    assert.equal(reads, 2);
  });
