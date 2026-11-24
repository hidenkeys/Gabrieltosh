import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/mera/workspace",
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
const { render, screen, fireEvent, cleanup, waitFor } =
  await import("@testing-library/react");
const { default: StockTransfers } =
  await import("../src/mera/workspace/StockTransfers");
const source = {
  id: "cst",
  name: "Central store",
  settings: { code: "CST" },
  permissions: ["stock.transfer", "stock.adjust"],
};
const destination = {
  id: "rst",
  name: "Restaurant",
  settings: { code: "RST" },
  permissions: ["stock.receive", "stock.transfer", "stock.adjust"],
};
const transfer = {
  id: "transfer-one",
  fromBranchId: "cst",
  toBranchId: "rst",
  fromBranchName: "Central store",
  toBranchName: "Restaurant",
  sentByName: "Fictional stock clerk",
  sentAt: "2026-11-24T09:00:00Z",
  timeZone: "Africa/Lagos",
  status: "sent",
  version: 1,
  note: "E2E unique-run",
  lines: [{ code: "TEA", name: "Tea", quantity: 1, receivedQuantity: null }],
};
test.afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});
function mockReads(t: any, getRows = () => [transfer]) {
  t.mock.method(globalThis, "fetch", async (input: any) =>
    Response.json(
      String(input).endsWith("/workspace")
        ? {
            products: [
              {
                id: "tea",
                code: "TEA",
                name: "Tea",
                stock: 5,
                stockMode: "counted",
                variants: [],
              },
            ],
          }
        : { transfers: getRows() },
    ),
  );
}

test("receiver-only history shows source, note, sender, sent time and received time without granting Cancel", async (t) => {
  let rows: any[] = [transfer];
  mockReads(t, () => rows);
  render(
    <StockTransfers
      organizationId="org"
      actorId="receiver"
      branches={[destination]}
      branchId="rst"
      membershipPermissions={[
        "stock.receive",
        "stock.transfer",
        "stock.adjust",
      ]}
    />,
  );
  await screen.findByRole("heading", {
    name: "From Central store → To Restaurant",
  });
  assert(screen.getByText("Note: E2E unique-run"));
  assert(screen.getByText(/Sent by Fictional stock clerk/));
  assert.match(
    document.querySelector("time")!.textContent!,
    /24 Nov 2026.*10:00.*Africa\/Lagos/,
  );
  assert.equal(
    document.querySelector("time")!.getAttribute("datetime"),
    transfer.sentAt,
  );
  assert.equal(document.querySelector(".mw-status-chip")!.textContent, "Sent");
  assert(
    screen
      .getByRole("button", { name: "Receive transfer" })
      .classList.contains("primary"),
  );
  assert.equal(screen.queryByRole("button", { name: "Cancel transfer" }), null);
  rows = [
    { ...transfer, status: "received", receivedAt: "2026-11-24T10:30:00Z" },
  ];
  fireEvent.click(screen.getByRole("button", { name: "Refresh transfers" }));
  await waitFor(() =>
    assert.equal(
      document.querySelector(".mw-status-chip")!.textContent,
      "Received",
    ),
  );
  const times = document.querySelectorAll("time");
  assert.equal(times.length, 2);
  assert.equal(times[1].getAttribute("datetime"), rows[0].receivedAt);
  assert.match(times[1].textContent!, /11:30.*Africa\/Lagos/);
  assert.equal(
    screen.queryByRole("button", { name: "Receive transfer" }),
    null,
  );
});

test("transfer actions follow the active sending or receiving side even with grants on both branches", async (t) => {
  mockReads(t);
  const props = {
    organizationId: "org",
    branches: [source, destination],
    membershipPermissions: ["stock.transfer", "stock.receive", "stock.adjust"],
  };
  const sender = render(
    <StockTransfers {...props} actorId="owner" branchId="cst" />,
  );
  await screen.findByRole("button", { name: "Cancel transfer" });
  assert.equal(
    screen.queryByRole("button", { name: "Receive transfer" }),
    null,
  );
  assert(
    screen
      .getByRole("button", { name: "Cancel transfer" })
      .classList.contains("danger"),
  );
  sender.unmount();
  render(<StockTransfers {...props} actorId="owner" branchId="rst" />);
  await screen.findByRole("button", { name: "Receive transfer" });
  assert.equal(screen.queryByRole("button", { name: "Cancel transfer" }), null);
});

test("Send remains disabled until a destination and counted item are selected", async (t) => {
  mockReads(t, () => []);
  render(
    <StockTransfers
      organizationId="org"
      branches={[source, destination]}
      branchId="cst"
    />,
  );
  const send = screen.getByRole("button", {
    name: "Send transfer",
  }) as HTMLButtonElement;
  assert.equal(send.disabled, true);
  fireEvent.focus(screen.getByRole("combobox", { name: "To location" }));
  fireEvent.click(screen.getByRole("option", { name: /RST Restaurant/ }));
  assert.equal(send.disabled, true);
  fireEvent.focus(screen.getByRole("combobox", { name: "Item 1" }));
  fireEvent.click(await screen.findByRole("option", { name: /Tea/ }));
  assert.equal(send.disabled, false);
});
