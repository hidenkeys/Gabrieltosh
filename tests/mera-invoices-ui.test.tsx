import { chooseDateTime, readDateTime } from "./mera-input-helpers";
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
const { render, screen, fireEvent, waitFor, cleanup, act, within } =
  await import("@testing-library/react");
const { default: Invoices } = await import("../src/mera/workspace/Invoices");
const billing = {
  subscription: { status: "trial" },
  invoices: [],
  liveBillingEnabled: false,
};
test("O7 invoice read failure offers retry without claiming empty records or endless loading", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () =>
    ++count === 1
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : Response.json(billing);
  try {
    render(
      <Invoices billingEnabled={true}
        organizationId="org-a"
        disabled={false}
        save={async () => {}}
      />,
    );
    await screen.findByRole("button", {
      name: "Retry loading billing records",
    });
    assert.equal(screen.queryByText("No invoices recorded."), null);
    assert.equal(screen.queryByText("Loading billing records…"), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading billing records" }),
    );
    await screen.findByText("No invoices recorded.");
    assert.equal(screen.queryByRole("alert"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O7 invoice list precedes disclosed creation and pending retry retains original period/key", async () => {
  const original = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = async () =>
    Response.json({
      ...billing,
      invoices: [
        {
          id: "old",
          status: "draft",
          amount: 1350000,
          periodStart: "2026-10-01T00:00:00Z",
          periodEnd: "2026-11-01T00:00:00Z",
        },
      ],
    });
  try {
    const { container } = render(
      <Invoices billingEnabled={true}
        organizationId="org-a"
        disabled={false}
        save={async (...args) => {
          calls.push(args);
          throw Object.assign(new Error("Unknown invoice outcome"), {
            status: calls.length === 1 ? 0 : 409,
          });
        }}
      />,
    );
    await screen.findByText(/draft ·/);
    const details = container.querySelector(
      ".mw-invoice-create",
    ) as HTMLDetailsElement;
    assert.equal(details.open, false);
    assert(
      container.querySelector("article")!.compareDocumentPosition(details) &
        dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    );
    details.open = true;
    chooseDateTime(
      screen,
      fireEvent,
      within,
      "Period starts",
      "2026-11-01T00:00",
    );
    chooseDateTime(
      screen,
      fireEvent,
      within,
      "Period ends",
      "2026-12-01T00:00",
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create proposed invoice" })
        .closest("form")!,
    );
    await screen.findByText("Invoice creation unconfirmed");
    details.open = false;
    details.open = true;
    assert.equal(
      readDateTime(screen, within, "Period starts"),
      "2026-11-01T00:00",
    );
    assert(
      (
        screen.getByRole("group", {
          name: "Period starts",
          exact: true,
        }) as HTMLFieldSetElement
      ).disabled,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original invoice creation" }),
    );
    await waitFor(() => assert.equal(calls.length, 2));
    assert.deepEqual(calls[0][2], calls[1][2]);
    assert.equal(calls[0][0], "/organizations/org-a/invoices");
    assert(screen.getByText("Invoice creation unconfirmed"));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O7 old organization invoice reads cannot restore private records into the new scope", async () => {
  const original = globalThis.fetch;
  let release: ((response: Response) => void) | undefined;
  globalThis.fetch = async (input) =>
    String(input).includes("org-a/")
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json(billing);
  try {
    const view = render(
      <Invoices billingEnabled={true}
        organizationId="org-a"
        disabled={false}
        save={async () => {}}
      />,
    );
    assert(release);
    view.rerender(
      <Invoices billingEnabled={true}
        organizationId="org-b"
        disabled={false}
        save={async () => {}}
      />,
    );
    await screen.findByText("No invoices recorded.");
    await act(async () => {
      release!(
        Response.json({
          ...billing,
          subscription: { status: "Private old subscription" },
        }),
      );
      await Promise.resolve();
    });
    assert.equal(screen.queryByText(/Private old subscription/), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("O7 composed invoice view hides duplicate service summary but retains records, creation, warnings and read retry", async () => {
  const original = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () =>
    ++reads === 1
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : Response.json({
          ...billing,
          entitlements: {
            effectiveState: "trial",
            newOrdersAllowed: true,
            warning: "Review service restriction date",
          },
          invoices: [
            {
              id: "invoice1",
              status: "draft",
              amount: 100000,
              periodStart: "2026-11-01T00:00:00Z",
              periodEnd: "2026-12-01T00:00:00Z",
            },
          ],
        });
  try {
    render(
      <Invoices billingEnabled={true}
        organizationId="org-a"
        disabled={false}
        showServiceSummary={false}
        save={async () => {}}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Retry loading billing records",
      }),
    );
    await screen.findByText(/draft ·/);
    assert.equal(screen.queryByText("Subscription: trial"), null);
    assert.equal(screen.queryByText("Effective subscription state"), null);
    assert.equal(screen.queryByText("New orders"), null);
    assert(screen.getByRole("heading", { name: "Invoices" }));
    assert(screen.getByText("Review service restriction date"));
    fireEvent.click(
      screen.getByText("Create a proposed invoice", { exact: true }),
    );
    assert(screen.getByRole("button", { name: "Create proposed invoice" }));
    assert.equal(reads, 2);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("invoice period presets keep device-local boundaries explicit and never create an invoice until submitted", async () => {
  const before = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async () => Response.json(billing);
  try {
    render(
      <Invoices billingEnabled={true}
        organizationId="org"
        disabled={false}
        save={async (...args: any[]) => {
          writes.push(args);
          return { id: "new-invoice" };
        }}
      />,
    );
    await screen.findByText("No invoices recorded.");
    fireEvent.click(
      screen.getByText("Create a proposed invoice", { selector: "summary" }),
    );
    fireEvent.click(
      screen.getByRole("radio", { name: "This month", exact: true }),
    );
    assert.equal(writes.length, 0);
    const start = readDateTime(screen, within, "Period starts"),
      end = readDateTime(screen, within, "Period ends");
    assert.ok(start.endsWith("-01T00:00"));
    assert.ok(Date.parse(end) > Date.parse(start));
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create proposed invoice" })
        .closest("form")!,
    );
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0][2].periodStart, new Date(start).toISOString());
    assert.equal(writes[0][2].periodEnd, new Date(end).toISOString());
  } finally {
    cleanup();
    globalThis.fetch = before;
  }
});

test("billing off never mounts invoice records or requests billing data", () => {
  const original = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = (async () => { reads++; return Response.json(billing); }) as any;
  try {
    const { container, rerender } = render(<Invoices organizationId="org" disabled={false} save={async () => {}} billingEnabled={false} />);
    assert.equal(container.textContent, "");
    rerender(<Invoices organizationId="org" disabled={false} save={async () => {}} />);
    assert.equal(container.textContent, "");
    assert.equal(reads, 0);
  } finally { cleanup(); globalThis.fetch = original; }
});
