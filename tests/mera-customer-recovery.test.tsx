import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  assertCheckoutSession,
  buildCheckoutJournal,
  checkoutJournalKey,
  clearCheckoutJournal,
  readCheckoutJournal,
  saveCheckoutJournal,
  MAX_CHECKOUT_JOURNAL_BYTES,
} from "../src/mera/customer/checkoutRecovery.ts";
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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: CustomerExperience } =
  await import("../src/mera/customer/CustomerExperience.tsx");
const scope = {
    organizationId: "10000000-0000-4000-8000-000000000001",
    branchId: "20000000-0000-4000-8000-000000000001",
  },
  sessionRef = "40000000-0000-4000-8000-000000000001",
  productId = "30000000-0000-4000-8000-000000000001",
  quoteId = "50000000-0000-4000-8000-000000000001";
const intent = {
  requestKey: "60000000-0000-4000-8000-000000000001",
  menuVersion: 1,
  displayName: "Original private Ada",
  fulfillment: "takeaway" as const,
  items: [{ productId, quantity: 1, modifiers: [] }],
  note: "Original private note",
};
const line = {
  key: productId + ":",
  productId,
  name: "Original tea",
  quantity: 1,
  unitPrice: 100000,
  modifiers: [],
  summary: "",
};
const product = {
  id: productId,
  code: "C2",
  name: "Original tea",
  category: "Tea",
  price: 100000,
  available: true,
  stockMode: "unlimited",
  variants: [],
  modifierGroups: [],
  allergens: [],
  dietary: [],
};
const menu = {
  organization: { id: scope.organizationId, name: "Bing Chun" },
  branch: { id: scope.branchId, name: "Surulere" },
  version: 1,
  orderingAvailable: true,
  products: [product],
};
function record() {
  return buildCheckoutJournal({
    scope,
    sessionRef,
    intent,
    lines: [line],
    quote: null,
  });
}
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(() => cleanup());
test("journal is bounded, scope-isolated and never expires an unresolved record into a new basket", () => {
  const saved = { ...record(), savedAt: "2020-01-01T00:00:00.000Z" };
  saveCheckoutJournal(saved);
  assert.deepEqual(readCheckoutJournal(scope)?.intent, intent);
  assert.equal(
    readCheckoutJournal({
      ...scope,
      branchId: "20000000-0000-4000-8000-000000000002",
    }),
    null,
  );
  assert.throws(
    () =>
      saveCheckoutJournal({
        ...saved,
        intent: {
          ...intent,
          requestKey: "60000000-0000-4000-8000-000000000002",
        },
      }),
    /earlier order/,
  );
  assert.throws(
    () => clearCheckoutJournal(scope, "60000000-0000-4000-8000-000000000002"),
    /different saved order/,
  );
  assert(readCheckoutJournal(scope));
  clearCheckoutJournal(scope, intent.requestKey);
  assert.equal(readCheckoutJournal(scope), null);
});
test("untrusted, oversized or private-context additions fail closed without deleting storage", () => {
  const key = checkoutJournalKey(scope);
  for (const raw of [
    "{broken",
    JSON.stringify({ ...record(), joiningCode: "private" }),
    JSON.stringify({ ...record(), intent: { ...intent, customerHistory: [] } }),
    JSON.stringify({
      ...record(),
      branchId: "20000000-0000-4000-8000-000000000002",
    }),
    "x".repeat(MAX_CHECKOUT_JOURNAL_BYTES + 1),
  ]) {
    window.sessionStorage.setItem(key, raw);
    assert.throws(() => readCheckoutJournal(scope));
    assert.equal(window.sessionStorage.getItem(key), raw);
  }
});
test("a name or matching history never replaces canonical cookie-bound session proof", () => {
  assert.throws(
    () =>
      assertCheckoutSession(record(), {
        displayName: intent.displayName,
        orders: [{ requestKey: intent.requestKey }],
      }),
    /different or expired/,
  );
  assert.throws(
    () =>
      assertCheckoutSession(record(), {
        sessionRef: "40000000-0000-4000-8000-000000000002",
      }),
    /different or expired/,
  );
  assert.doesNotThrow(() => assertCheckoutSession(record(), { sessionRef }));
});
test("remount restores exact review only after cookie proof, with no automatic write or guest creation", async (t) => {
  let created = false,
    menuReads = 0;
  const bodies: any[] = [],
    writes: string[] = [];
  const quote = {
    id: quoteId,
    expiresAt: "2099-01-01T00:00:00.000Z",
    menuVersion: 1,
    currency: "NGN",
    subtotal: 100000,
    discount: 0,
    serviceCharge: 10000,
    tax: 0,
    total: 110000,
    lines: [{ type: "service_charge", label: "Service charge", amount: 10000 }],
    policyVersion: "pricing-original",
  };
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (init.method === "POST") writes.push(path);
    if (path.endsWith("/menu")) {
      menuReads++;
      return Response.json({
        ...menu,
        version: menuReads,
        orderingAvailable: menuReads === 1,
        pricingPolicy: { enabled: true },
        products: [{ ...product, price: menuReads === 1 ? 100000 : 150000 }],
      });
    }
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return created
        ? Response.json({
            displayName: "Ada",
            sessionRef,
            orders: [],
            reservations: [],
            openVisits: [],
          })
        : Response.json({ error: "Guest required" }, { status: 401 });
    if (path.endsWith("/guests")) {
      created = true;
      return Response.json({ displayName: "Ada", sessionRef });
    }
    if (path.endsWith("/quote"))
      return Response.json(quote, {
        headers: { Date: "Wed, 18 Nov 2026 12:00:00 GMT" },
      });
    if (path.endsWith("/orders")) {
      bodies.push(JSON.parse(init.body));
      assert(readCheckoutJournal(scope), "journal must exist before the write");
      if (bodies.length === 1) throw new TypeError("Lost reply");
      return Response.json({
        id: "70000000-0000-4000-8000-000000000001",
        reference: "M-RESTORED",
        status: "submitted",
        paymentStatus: "unpaid",
        paid: 0,
        total: 110000,
        items: [],
        history: [],
      });
    }
    if (path.includes("/guest-orders?"))
      return Response.json({ orders: [], nextCursor: null });
    if (path.endsWith("/activity"))
      return Response.json({ reservations: [], feedback: [] });
    if (path.endsWith("/consent")) return Response.json({ marketing: false });
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(screen.getByRole("button", { name: "Choose: Original tea" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  fireEvent.change(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    {
      target: { value: "Ada" },
    },
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Anything we should know?" }),
    { target: { value: "Original note" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Review total" }));
  await screen.findByText("Service charge: ₦100");
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByRole("button", { name: "Retry original order" });
  const before = readCheckoutJournal(scope)!;
  const guestWrites = writes.filter((path) => path.endsWith("/guests")).length;
  cleanup();
  render(React.createElement(CustomerExperience));
  await screen.findByRole("button", { name: "Retry original order" });
  assert.equal(bodies.length, 1);
  assert.equal(
    writes.filter((path) => path.endsWith("/guests")).length,
    guestWrites,
  );
  assert.equal(
    screen.getByRole("textbox", { name: "Anything we should know?" }).value,
    "Original note",
  );
  assert.equal(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }).disabled,
    true,
  );
  assert(screen.getByText("Service charge: ₦100"));
  fireEvent.click(screen.getByRole("button", { name: "Retry original order" }));
  await screen.findByText("M-RESTORED");
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1], bodies[0]);
  assert.deepEqual(bodies[1], before.intent);
  assert.equal(
    writes.filter((path) => path.endsWith("/guests")).length,
    guestWrites,
  );
  assert.equal(readCheckoutJournal(scope), null);
});
for (const mode of ["mismatch", "missing", "expired", "offline"] as const)
  test(
    "restore " +
      mode +
      " session proof blocks all writes and hides saved private details",
    async (t) => {
      saveCheckoutJournal(record());
      let writes = 0;
      t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
        if (init.method !== "GET") writes++;
        const path = String(input);
        if (path.endsWith("/menu")) return Response.json(menu);
        if (path.endsWith("/branches")) return Response.json({ branches: [] });
        if (path.endsWith("/guest")) {
          if (mode === "offline") throw new TypeError("Offline");
          if (mode === "expired")
            return Response.json({ error: "Expired" }, { status: 401 });
          return Response.json({
            displayName: "Current session",
            orders: [],
            ...(mode === "mismatch"
              ? { sessionRef: "40000000-0000-4000-8000-000000000002" }
              : {}),
          });
        }
        throw Error("Unexpected request");
      });
      render(React.createElement(CustomerExperience));
      await screen.findByRole("button", {
        name: "Check saved order and session",
      });
      assert.equal(
        screen.queryByRole("button", { name: "Retry original order" }),
        null,
      );
      assert.equal(
        screen.getByRole("button", { name: "Choose: Original tea" }).disabled,
        true,
      );
      assert.equal(
        document.body.textContent?.includes(intent.displayName),
        false,
      );
      assert.equal(document.body.textContent?.includes(intent.note), false);
      assert.equal(writes, 0);
      assert(readCheckoutJournal(scope));
    },
  );
test("storage refusal prevents order POST rather than claiming recoverability", async (t) => {
  let created = false,
    orders = 0;
  t.mock.method(Object.getPrototypeOf(window.sessionStorage), "setItem", () => {
    throw Error("Quota exceeded");
  });
  t.mock.method(globalThis, "fetch", async (input: any) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return created
        ? Response.json({ displayName: "Ada", sessionRef, orders: [] })
        : Response.json({ error: "Guest required" }, { status: 401 });
    if (path.endsWith("/guests")) {
      created = true;
      return Response.json({ displayName: "Ada", sessionRef });
    }
    if (path.endsWith("/orders")) {
      orders++;
      return Response.json({ id: "unexpected" });
    }
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(screen.getByRole("button", { name: "Choose: Original tea" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  fireEvent.change(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    {
      target: { value: "Ada" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByRole("button", { name: "Check saved order and session" });
  assert.equal(orders, 0);
  assert.equal(screen.queryByRole("button", { name: "Submit order" }), null);
  assert.equal(
    screen.getByRole("button", { name: "Choose: Original tea" }).disabled,
    true,
  );
});

test("not_found keeps the original frozen; only explicit abandoned proof permits a new key", async (t) => {
  saveCheckoutJournal(record());
  let abandoned = false;
  const writes: any[] = [],
    orderBodies: any[] = [];
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (init.method === "POST")
      writes.push({ path, body: JSON.parse(init.body) });
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({
        displayName: intent.displayName,
        sessionRef,
        orders: [],
      });
    if (path.endsWith("/guests"))
      return Response.json({ displayName: intent.displayName, sessionRef });
    if (path.includes("/order-attempts/")) {
      if (path.endsWith("/abandon")) {
        abandoned = true;
        return Response.json({
          status: "abandoned",
          resolutionId: "80000000-0000-4000-8000-000000000001",
        });
      }
      return Response.json({ status: "not_found" });
    }
    if (path.endsWith("/orders")) {
      orderBodies.push(JSON.parse(init.body));
      assert(abandoned);
      return Response.json({
        id: "70000000-0000-4000-8000-000000000001",
        reference: "M-NEW",
        status: "submitted",
        paymentStatus: "unpaid",
        paid: 0,
        total: 100000,
        items: [],
        history: [],
      });
    }
    if (path.includes("/guest-orders?"))
      return Response.json({ orders: [], nextCursor: null });
    if (path.endsWith("/activity"))
      return Response.json({ reservations: [], feedback: [] });
    if (path.endsWith("/consent")) return Response.json({ marketing: false });
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByRole("button", { name: "Retry original order" });
  fireEvent.click(screen.getByRole("button", { name: "Check original order" }));
  await screen.findByText(/The venue has not recorded this request yet/);
  assert(readCheckoutJournal(scope));
  assert.equal(
    screen.getByRole("button", { name: "Choose: Original tea" }).disabled,
    true,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Stop unconfirmed request…" }),
  );
  assert.equal(writes.length, 0);
  assert(
    screen.getByText(
      /If the venue already received your order, it will be kept/,
    ),
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Why stop this request?" }),
    { target: { value: "Please allow me to start again" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop this request" }));
  await screen.findByText(/That unconfirmed request is stopped/);
  assert.equal(readCheckoutJournal(scope), null);
  assert.equal(orderBodies.length, 0);
  assert.equal(writes.length, 1);
  assert(writes[0].path.endsWith("/" + intent.requestKey + "/abandon"));
  fireEvent.click(screen.getByRole("button", { name: "Choose: Original tea" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByText("M-NEW");
  assert.notEqual(orderBodies[0].requestKey, intent.requestKey);
  assert.equal(orderBodies[0].note, "");
  assert.equal(
    writes.some((write) => /refund|cancel|payments/.test(write.path)),
    false,
  );
});

test("stop action opens an already recorded order without cancellation or a replacement write", async (t) => {
  saveCheckoutJournal(record());
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (init.method === "POST") writes.push(path);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({
        displayName: intent.displayName,
        sessionRef,
        orders: [],
      });
    if (path.endsWith("/abandon"))
      return Response.json({
        status: "recorded",
        order: {
          id: "70000000-0000-4000-8000-000000000001",
          reference: "M-ALREADY",
          status: "preparing",
          paymentStatus: "unpaid",
          paid: 0,
          total: 100000,
          items: [],
          history: [],
        },
      });
    if (path.includes("/guest-orders?"))
      return Response.json({ orders: [], nextCursor: null });
    if (path.endsWith("/activity"))
      return Response.json({ reservations: [], feedback: [] });
    if (path.endsWith("/consent")) return Response.json({ marketing: false });
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByRole("button", { name: "Retry original order" });
  fireEvent.click(
    screen.getByRole("button", { name: "Stop unconfirmed request…" }),
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Why stop this request?" }),
    { target: { value: "Check before starting again" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop this request" }));
  await screen.findByText("M-ALREADY");
  assert.equal(readCheckoutJournal(scope), null);
  assert.equal(writes.length, 1);
  assert(writes[0].endsWith("/abandon"));
  assert(
    screen.getByText(
      /Your order was already received. It has not been cancelled/,
    ),
  );
});

test("ending guest access preserves an unresolved journal without revealing its private review", async (t) => {
  saveCheckoutJournal(record());
  let ended = false;
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (init.method === "POST") writes.push(path);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return ended
        ? Response.json({ error: "Expired" }, { status: 401 })
        : Response.json({
            displayName: intent.displayName,
            sessionRef,
            orders: [],
          });
    if (path.endsWith("/guest/end")) {
      ended = true;
      return Response.json({
        ended: true,
        ordersCancelled: false,
        refundConfirmed: false,
      });
    }
    if (path.includes("/guest-orders?"))
      return Response.json({ orders: [], nextCursor: null });
    if (path.endsWith("/activity"))
      return Response.json({ reservations: [], feedback: [] });
    if (path.endsWith("/consent")) return Response.json({ marketing: false });
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByRole("button", { name: "Retry original order" });
  fireEvent.click(screen.getByRole("button", { name: "Your order" }));
  await screen.findByRole("button", { name: "End guest session…" });
  fireEvent.click(screen.getByRole("button", { name: "End guest session…" }));
  assert(screen.getByText(/An order still needs checking/));
  fireEvent.click(
    screen.getByRole("button", { name: "End this guest session" }),
  );
  await screen.findByRole("button", { name: "Check saved order and session" });
  assert(readCheckoutJournal(scope));
  assert.equal(
    screen.queryByRole("button", { name: "Retry original order" }),
    null,
  );
  assert.equal(document.body.textContent?.includes(intent.displayName), false);
  assert.equal(document.body.textContent?.includes(intent.note), false);
  assert.equal(writes.length, 1);
  assert(writes[0].endsWith("/guest/end"));
});
