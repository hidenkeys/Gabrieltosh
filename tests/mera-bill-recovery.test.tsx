import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/workspace",
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
const { render, screen, fireEvent, cleanup, waitFor, act } =
  await import("@testing-library/react");
const { default: Bills } = await import("../src/mera/workspace/Bills");
const { readBillChangeMarker } =
  await import("../src/mera/workspace/billChangeJournal");
const base = "/organizations/org/branches/branch",
  actorId = "actor",
  original = globalThis.fetch;
const bill = {
  id: "bill-one",
  name: "Party bill",
  visitId: "private-visit",
  status: "open",
  total: 300000,
  paid: 0,
  balance: 300000,
  charges: [
    {
      id: "charge-one",
      name: "Tea",
      quantity: 2,
      amount: 300000,
      unitPrice: 150000,
    },
  ],
  allocations: [],
};
const props = {
  base,
  actorId,
  bills: [bill],
  disabled: false,
  canPay: true,
  save: async () => ({}),
};
const choose = () =>
  fireEvent.change(screen.getByLabelText("Bill to manage"), {
    target: { value: bill.id },
  });
async function split() {
  choose();
  fireEvent.click(screen.getByText("Split this bill", { exact: true }));
  fireEvent.change(screen.getByLabelText("New bill name"), {
    target: { value: "PRIVATE BILL NAME" },
  });
  fireEvent.change(screen.getByLabelText("Amount to move (naira)"), {
    target: { value: "12.34" },
  });
  return screen.getByRole("button", { name: "Split bill" }).closest("form")!;
}
const proof = (status = "not_found", extra: any = {}) => {
  const marker = readBillChangeMarker(actorId, base)!;
  return {
    actorId,
    organizationId: "org",
    branchId: "branch",
    billId: marker.billId,
    operation: marker.operation,
    requestKey: marker.requestKey,
    status,
    ...extra,
  };
};
test.afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  globalThis.fetch = original;
});
test("unknown split records only nonsecret marker, serializes submissions and retains exact memory retry through later conflicts", async () => {
  const writes: any[] = [];
  let reject: any;
  globalThis.fetch = async () => Response.json(proof());
  render(
    <Bills
      {...props}
      save={async (...args: any[]) => {
        writes.push(args);
        if (writes.length === 1)
          return await new Promise((_r, r) => (reject = r));
        throw Object.assign(Error("Conflict"), { status: 409 });
      }}
    />,
  );
  const form = await split();
  fireEvent.submit(form);
  fireEvent.submit(form);
  assert.equal(writes.length, 1);
  await act(async () => reject(Error("Unknown")));
  await screen.findByRole("button", { name: "Retry original bill change" });
  assert.ok(
    !JSON.stringify(readBillChangeMarker(actorId, base)).includes(
      "PRIVATE BILL NAME",
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Check bill change outcome" }),
  );
  await screen.findByText(/No completed bill change was found/);
  assert.ok(readBillChangeMarker(actorId, base));
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original bill change" }),
  );
  await waitFor(() => assert.equal(writes.length, 2));
  assert.deepEqual(writes[0][2], writes[1][2]);
  assert.equal(writes[0][2].amount, 1234);
  assert.ok(readBillChangeMarker(actorId, base));
});
test("remount never resends split or exposes private body; explicit fenced stop clears only verified marker", async () => {
  let writes = 0,
    stopped = false;
  const calls: any[] = [];
  globalThis.fetch = async (input, options) => {
    calls.push([String(input), options]);
    if (String(input).endsWith("/abandon")) stopped = true;
    return Response.json(
      stopped ? proof("abandoned", { resolutionId: "resolution" }) : proof(),
    );
  };
  const p = {
    ...props,
    save: async () => {
      writes++;
      throw Error("Unknown");
    },
  };
  const view = render(<Bills {...p} />);
  fireEvent.submit(await split());
  await screen.findByRole("button", { name: "Retry original bill change" });
  view.unmount();
  render(<Bills {...p} />);
  assert.ok(screen.getByRole("button", { name: "Check bill change outcome" }));
  assert.ok(
    !screen.queryByRole("button", { name: "Retry original bill change" }),
  );
  assert.ok(!screen.queryByDisplayValue("PRIVATE BILL NAME"));
  assert.equal(writes, 1);
  fireEvent.click(
    screen.getByRole("button", { name: "Stop original bill change" }),
  );
  await screen.findByText(/original bill change is stopped/i);
  assert.equal(readBillChangeMarker(actorId, base), null);
  assert.equal(writes, 1);
  for (const [, options] of calls)
    assert.equal(options.headers["X-Mera-Actor-Id"], actorId);
});
test("recorded split needs matching actor/key/operation intent and valid immutable result, not changed live props", async () => {
  let valid = false,
    badIntent = false,
    body: any;
  globalThis.fetch = async () => {
    const marker = readBillChangeMarker(actorId, base)!;
    return Response.json(
      proof("recorded", {
        resultBasis: "recorded_operation_snapshot",
        result: { source: bill, bill: { ...bill, id: "new-bill" } },
        operationRecord: {
          id: "op",
          requestKey: valid ? marker.requestKey : "wrong-key",
          actorId,
          billId: bill.id,
          operation: "split",
          intent: {
            name: body.name.trim(),
            amount: badIntent ? body.amount + 1 : body.amount,
            items: null,
          },
        },
      }),
    );
  };
  const view = render(
    <Bills
      {...props}
      save={async (_p, _m, b) => {
        body = b;
        return {};
      }}
    />,
  );
  fireEvent.submit(await split());
  await screen.findByText(/recorded bill change could not be verified/);
  assert.ok(readBillChangeMarker(actorId, base));
  view.rerender(
    <Bills {...props} bills={[{ ...bill, total: 1, balance: 1 }]} />,
  );
  assert.ok(readBillChangeMarker(actorId, base));
  valid = true;
  badIntent = true;
  fireEvent.click(
    screen.getByRole("button", { name: "Check bill change outcome" }),
  );
  await screen.findByText(/differs from the original request/);
  assert.ok(readBillChangeMarker(actorId, base));
  badIntent = false;
  fireEvent.click(
    screen.getByRole("button", { name: "Check bill change outcome" }),
  );
  await waitFor(() => assert.equal(readBillChangeMarker(actorId, base), null));
  assert.ok(
    !screen.queryByRole("button", { name: "Retry original bill change" }),
  );
});
test("merge body and source target stay exact after props refresh while payment collection remains a separate original intent", async () => {
  const writes: any[] = [];
  render(
    <Bills
      {...props}
      bills={[bill, { ...bill, id: "source", name: "Same party" }]}
      save={async (...args: any[]) => {
        writes.push(args);
        throw Error("Unknown");
      }}
    />,
  );
  choose();
  fireEvent.click(screen.getByText("Merge another bill", { exact: true }));
  fireEvent.change(screen.getByLabelText("Merge another bill into this one"), {
    target: { value: "source" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Merge into selected bill" })
      .closest("form")!,
  );
  await screen.findByRole("button", { name: "Retry original bill change" });
  assert.equal(readBillChangeMarker(actorId, base)?.operation, "merge");
  assert.deepEqual(writes[0][2].sourceBillIds, ["source"]);
  cleanup();
  window.sessionStorage.clear();
  writes.length = 0;
  render(
    <Bills
      {...props}
      save={async (...args: any[]) => {
        writes.push(args);
        throw Error("Unknown collection");
      }}
    />,
  );
  choose();
  fireEvent.click(screen.getByText("Record money received", { exact: true }));
  fireEvent.change(screen.getByLabelText("Amount received (naira)"), {
    target: { value: "12.34" },
  });
  fireEvent.change(screen.getByLabelText("Method"), {
    target: { value: "cash" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Record bill collection" })
      .closest("form")!,
  );
  await screen.findByRole("button", { name: "Retry original bill collection" });
  assert.equal(readBillChangeMarker(actorId, base), null);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original bill collection" }),
  );
  await waitFor(() => assert.equal(writes.length, 2));
  assert.deepEqual(writes[0][2], writes[1][2]);
});
test("authorization loss hides private change body and late old-scope completion cannot populate another branch", async () => {
  let reject: any;
  const p = {
    ...props,
    save: async () => await new Promise((_r, r) => (reject = r)),
  };
  const view = render(<Bills {...p} />);
  fireEvent.submit(await split());
  view.rerender(<Bills {...p} base="/organizations/other/branches/other" />);
  await act(async () =>
    reject(Object.assign(Error("OLD PRIVATE ERROR"), { status: 403 })),
  );
  assert.ok(!screen.queryByText(/OLD PRIVATE ERROR/));
  assert.ok(
    !screen.queryByRole("button", { name: "Retry original bill change" }),
  );
  assert.ok(readBillChangeMarker(actorId, base));
  view.unmount();
  render(
    <Bills
      {...props}
      save={async () => {
        throw Object.assign(Error("Denied"), { status: 403 });
      }}
    />,
  );
  assert.ok(!screen.queryByDisplayValue("PRIVATE BILL NAME"));
  globalThis.fetch = async () =>
    Response.json({ error: "Denied" }, { status: 403 });
  fireEvent.click(
    screen.getByRole("button", { name: "Check bill change outcome" }),
  );
  await screen.findByText(/Access to these bills needs checking/);
  assert.ok(!screen.queryByRole("button"));
  assert.ok(readBillChangeMarker(actorId, base));
});
test("predispatch marker storage failure prevents split PATCH and locks fresh changes", async () => {
  let writes = 0;
  render(
    <Bills
      {...props}
      save={async () => {
        writes++;
        return {};
      }}
    />,
  );
  const form = await split(),
    proto = Object.getPrototypeOf(window.sessionStorage),
    old = proto.setItem;
  proto.setItem = () => {
    throw Error("Storage unavailable");
  };
  try {
    fireEvent.submit(form);
    await screen.findByRole("alert");
    assert.equal(writes, 0);
    assert.equal(readBillChangeMarker(actorId, base), null);
  } finally {
    proto.setItem = old;
  }
});
