import { mockGuestSessionFetch } from "./mera-customer-session-fixture.js";
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
    value: dom.window[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = await import("react");
const { render, screen, fireEvent, cleanup, waitFor } =
  await import("@testing-library/react");
const { default: CustomerExperience } =
  await import("../src/mera/customer/CustomerExperience.tsx");
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(() => cleanup());

const menu = {
  organization: {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Bing Chun",
  },
  branch: { id: "20000000-0000-4000-8000-000000000001", name: "Surulere" },
  version: 1,
  orderingAvailable: true,
  products: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      code: "C2",
      name: "Brown Sugar Boba",
      category: "Milk tea",
      description: "",
      size: "700 ml",
      price: 380000,
      available: true,
      stockMode: "unlimited",
      variants: [],
      modifierGroups: [],
      allergens: [],
      dietary: [],
    },
  ],
};
test("table QR context never fetches a private bill before code validation", async (t) => {
  window.history.replaceState({}, "", "?tableId=table-one");
  const calls = [];
  mockGuestSessionFetch(t, async (input, init) => {
    const path = String(input);
    calls.push({ path, body: init?.body });
    if (path.endsWith("/menu"))
      return Response.json({
        ...menu,
        tables: [{ id: "table-one", name: "Window table" }],
      });
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "guest" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.endsWith("/visits/terms"))
      return Response.json({ error: "Invalid joining code" }, { status: 403 });
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  assert.equal(
    calls.some((c) => /public\/visits\//.test(c.path)),
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Join a table" }));
  assert.equal(
    screen.getByRole("combobox", { name: "Table" }).value,
    "Window table",
  );
  assert.equal(
    screen.queryByRole("textbox", { name: "Visit reference" }),
    null,
  );
  fireEvent.change(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    {
      target: { value: "Ada" },
    },
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Joining code" }), {
    target: { value: "invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join current visit" }));
  await screen.findByRole("alert");
  const joined = calls.find((c) => c.path.endsWith("/visits/terms"));
  assert.deepEqual(JSON.parse(joined.body), {
    tableId: "table-one",
    code: "invalid",
  });
  assert.equal(
    calls.some((c) => /public\/visits\//.test(c.path)),
    false,
  );
  cleanup();
  window.history.replaceState(
    {},
    "",
    "/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001",
  );
});

test("deposit cancellation shows pending review without claiming refund", async (t) => {
  let requested = false;
  const { default: GuestActivity } =
    await import("../src/mera/customer/GuestActivity.tsx");
  mockGuestSessionFetch(t, async (input, init) => {
    if (String(input).endsWith("/guest"))
      return Response.json({
        sessionRef: "40000000-0000-4000-8000-000000000001",
      });
    if (String(input).endsWith("/activity"))
      return Response.json({
        reservations: [
          {
            id: "70000000-0000-4000-8000-000000000001",
            startsAt: "2026-12-01T12:00:00Z",
            partySize: 2,
            status: "confirmed",
            depositAmount: 50000,
            depositRequired: 50000,
            cancellationRequestedAt: requested ? "2026-11-18T12:00:00Z" : null,
          },
        ],
        feedback: [
          {
            id: "feedback-one",
            category: "service",
            rating: 2,
            text: "Please review service timing",
            status: "open",
            createdAt: "2026-11-18T10:00:00Z",
          },
        ],
      });
    if (String(input).endsWith("/cancellation")) {
      assert.equal(JSON.parse(init.body).reason, "Plans changed");
      requested = true;
      return Response.json({
        id: "70000000-0000-4000-8000-000000000001",
        depositReviewRequired: true,
        refundConfirmed: false,
      });
    }
    throw Error("Unexpected request");
  });
  render(
    React.createElement(GuestActivity, {
      prefix: "/public/org/20000000-0000-4000-8000-000000000001",
    }),
  );
  await screen.findByText("Please review service timing");
  fireEvent.click(
    screen.getByText("Request cancellation", { selector: "summary" }),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Cancellation reason details" }),
    { target: { value: "Plans changed" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Send cancellation request" }),
  );
  await screen.findByRole("status");
  assert.match(
    screen.getByRole("status").textContent,
    /no refund is confirmed/,
  );
  assert(screen.getByText("Reservation confirmed"));
  assert.equal(
    screen.queryByRole("button", { name: "Request cancellation" }),
    null,
  );
  cleanup();
});

test("another venue renders uploaded branding and photo without Bing Chun mascot", async (t) => {
  const asset = "/api/mera/v1/public/assets/asset-one";
  mockGuestSessionFetch(t, async (input) => {
    if (String(input).endsWith("/menu"))
      return Response.json({
        ...menu,
        organization: {
          name: "Other Venue",
          branding: { logo: asset, coverImage: asset },
        },
        products: [{ ...menu.products[0], image: asset }],
      });
    if (String(input).endsWith("/branches"))
      return Response.json({ branches: [] });
    return Response.json({ error: "Guest session required" }, { status: 401 });
  });
  render(
    React.createElement(CustomerExperience, {
      organizationSlug: "other-venue",
    }),
  );
  await screen.findByText("Brown Sugar Boba");
  assert.equal(screen.queryByAltText("Bing Chun mascot"), null);
  assert.equal(
    screen.getByAltText("Other Venue welcome").getAttribute("src"),
    asset,
  );
  assert.equal(
    document.querySelector(".mc-product img")?.getAttribute("src"),
    asset,
  );
  cleanup();
});

test("configured charges require server review and uncertain retries preserve quote identity", async (t) => {
  const orders = [];
  let quotes = 0;
  mockGuestSessionFetch(t, async (input, init) => {
    const path = String(input);
    if (path.endsWith("/menu"))
      return Response.json({ ...menu, pricingPolicy: { enabled: true } });
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "guest" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.endsWith("/quote")) {
      quotes++;
      return Response.json(
        {
          id: "50000000-0000-4000-8000-000000000001",
          currency: "NGN",
          policyVersion: "pricing-v1",
          menuVersion: 1,
          expiresAt: "2099-01-01T00:00:00Z",
          subtotal: 380000,
          discount: 0,
          serviceCharge: 38000,
          tax: 0,
          total: 418000,
          lines: [
            { type: "service_charge", label: "Service charge", amount: 38000 },
          ],
        },
        { headers: { Date: "Wed, 18 Nov 2026 12:00:00 GMT" } },
      );
    }
    if (path.endsWith("/orders")) {
      orders.push(JSON.parse(init.body));
      throw new TypeError("Failed to fetch");
    }
    throw Error("unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  await screen.findByRole("heading", { name: "Your basket" });
  fireEvent.click(
    screen.getByRole("button", { name: "Choose: Brown Sugar Boba" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
  fireEvent.change(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    {
      target: { value: "Ada" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Review total" }));
  await screen.findByText("Service charge: ₦380");
  assert.equal(orders.length, 0);
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry original order" }));
  await screen.findByRole("alert");
  assert.equal(quotes, 1);
  assert.equal(orders.length, 2);
  assert.equal(orders[0].quoteId, "50000000-0000-4000-8000-000000000001");
  assert.equal(orders[1].quoteId, orders[0].quoteId);
  assert.equal(orders[1].requestKey, orders[0].requestKey);
  cleanup();
});

test("customization modal contains keyboard focus and restores its trigger", async (t) => {
  mockGuestSessionFetch(t, async (input) =>
    String(input).endsWith("/menu")
      ? Response.json(menu)
      : Response.json({ error: "guest" }, { status: 401 }),
  );
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  const trigger = screen.getByRole("button", {
    name: "Choose: Brown Sugar Boba",
  });
  await waitFor(() => assert.equal(trigger.disabled, false));
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  assert.equal(document.activeElement, dialog);
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  assert.equal(
    document.activeElement,
    screen.getByRole("button", { name: "Add to basket" }),
  );
  fireEvent.keyDown(document, { key: "Tab" });
  assert.equal(
    document.activeElement,
    screen.getByRole("button", { name: "Close customization" }),
  );
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, trigger);
  cleanup();
});

test("help request uncertainty retries original intent without claiming external delivery", async (t) => {
  const { default: HelpRequests } =
    await import("../src/mera/customer/HelpRequests.tsx");
  const attempts = [];
  let guestCreations = 0;
  mockGuestSessionFetch(t, async (input, init) => {
    if (String(input).endsWith("/guest"))
      return Response.json({
        sessionRef: "40000000-0000-4000-8000-000000000001",
      });
    assert.equal(
      String(input),
      "/api/mera/v1/public/org/20000000-0000-4000-8000-000000000001/help-requests",
    );
    if (init.method === "POST") {
      attempts.push(JSON.parse(init.body));
      if (attempts.length === 2)
        return Response.json(
          { error: "Guest access interrupted" },
          { status: 401 },
        );
      throw new TypeError("Failed to fetch");
    }
    return Response.json({ requests: [], externalDelivery: false });
  });
  render(
    React.createElement(HelpRequests, {
      prefix: "/public/org/20000000-0000-4000-8000-000000000001",
      ensureGuest: async () => {
        guestCreations++;
      },
      hasGuest: false,
      displayName: "Ada",
      onName: () => {},
      visitId: undefined,
    }),
  );
  assert.equal(
    screen.queryByRole("option", { name: "My joined table visit" }),
    null,
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "How can staff help?" }),
    { target: { value: "Please bring water" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Send help request" }));
  await screen.findByRole("alert");
  assert(screen.getByText(/We will not send a text or email/));
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original help request" }),
  );
  await screen.findByRole("alert");
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original help request" }),
  );
  await screen.findByRole("alert");
  assert.equal(attempts.length, 3);
  assert.deepEqual(attempts[0], attempts[2]);
  assert.equal("visitId" in attempts[0], false);
  assert.equal(guestCreations, 1);
  cleanup();
});

test("minimum-spend visit terms require explicit acknowledgement before private joining", async (t) => {
  let joins = 0,
    bills = 0,
    body;
  const originalPolicy = {
    enabled: true,
    approved: true,
    amount: 1000000,
    basis: "net_paid_bill",
    shortfallTreatment: "manager_review",
    disclosure: "Original visit terms saved before the current policy changed.",
    version: "original-version",
  };
  mockGuestSessionFetch(t, async (input, init) => {
    const path = String(input);
    if (path.endsWith("/menu"))
      return Response.json({
        ...menu,
        minimumSpendPolicy: {
          ...originalPolicy,
          version: "new-version",
          disclosure: "Current branch terms",
        },
      });
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "guest" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.endsWith("/visits/terms"))
      return Response.json({
        visitId: "visit-one",
        minimumSpendPolicy: originalPolicy,
        privateBillAccessGranted: false,
      });
    if (path.endsWith("/visits/join")) {
      joins++;
      body = JSON.parse(init.body);
      return Response.json({ id: "visit-one" });
    }
    if (path.endsWith("/public/visits/visit-one")) {
      bills++;
      return Response.json({
        visit: { id: "visit-one", tableName: "Window table", status: "open" },
        orders: [],
        bills: [],
        balance: 0,
        minimumSpend: {
          policy: originalPolicy,
          summary: { netPaid: 0, waived: 0, shortfall: 1000000 },
        },
      });
    }
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  fireEvent.click(screen.getByRole("button", { name: "Join a table" }));
  fireEvent.change(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    {
      target: { value: "Ada" },
    },
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Visit reference" }), {
    target: { value: "visit-one" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Joining code" }), {
    target: { value: "1234" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join current visit" }));
  await screen.findByText(originalPolicy.disclosure);
  assert.equal(joins, 0);
  assert.equal(bills, 0);
  assert.equal(screen.queryByText("Current branch terms"), null);
  assert.equal(
    screen.getByRole("checkbox", {
      name: "I acknowledge this visit’s minimum-spend policy",
    }).checked,
    false,
  );
  assert.equal(
    screen.getByRole("button", { name: "Join current visit" }).disabled,
    true,
  );
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I acknowledge this visit’s minimum-spend policy",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Join current visit" }));
  await screen.findByRole("button", { name: "Your order" });
  assert.equal(joins, 1);
  assert.equal(body.minimumSpendPolicyVersion, "original-version");
  assert.equal(body.minimumSpendAcknowledged, true);
  assert.equal(body.visitId, "visit-one");
  assert.equal(bills, 1);
  cleanup();
});

test("reservation acknowledgement and original details survive uncertain delivery", async (t) => {
  const attempts = [];
  const policy = {
    enabled: true,
    approved: true,
    amount: 1000000,
    basis: "net_paid_bill",
    disclosure: "Booking minimum-spend terms",
    shortfallTreatment: "manager_review",
    version: "booking-v1",
  };
  mockGuestSessionFetch(t, async (input, init) => {
    const path = String(input);
    if (path.endsWith("/menu"))
      return Response.json({
        ...menu,
        tables: [
          {
            id: "70000000-0000-4000-8000-000000000001",
            name: "Window preference",
          },
        ],
        reservationPolicy: {
          enabled: true,
          minimumSpend: 1000000,
          minimumSpendPolicy: policy,
        },
      });
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "guest" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.includes("/reservation-attempts/"))
      return Response.json({
        status: "not_found",
        sessionRef: "40000000-0000-4000-8000-000000000001",
        organizationId: "10000000-0000-4000-8000-000000000001",
        branchId: "20000000-0000-4000-8000-000000000001",
      });
    if (path.endsWith("/reservations")) {
      attempts.push(JSON.parse(init.body));
      if (attempts.length === 2)
        return Response.json({ error: "Please try later" }, { status: 429 });
      throw new TypeError("Failed to fetch");
    }
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  fireEvent.click(screen.getByRole("button", { name: "Reserve a table" }));
  await screen.findByText(policy.disclosure);
  fireEvent.focus(
    screen.getByRole("combobox", { name: "Preferred table (optional)" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "Window preference" }));
  assert.equal(
    screen.getByRole("button", { name: "Request reservation" }).disabled,
    true,
  );
  fireEvent.change(
    screen.getByRole("textbox", {
      name: /^(?:Your name|What should we call you\?)$/,
    }),
    {
      target: { value: "Ada" },
    },
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Contact email or phone" }),
    { target: { value: "fixture@example.invalid" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose another date" }));
  fireEvent.change(screen.getByLabelText("Date", { exact: true }), {
    target: { value: "2026-12-10" },
  });
  fireEvent.change(screen.getByLabelText("Preferred time", { exact: true }), {
    target: { value: "12:00" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I acknowledge this minimum-spend policy",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Request reservation" }));
  await screen.findByRole("alert");
  assert.equal(
    screen
      .getByRole("textbox", { name: "Contact email or phone" })
      .matches(":disabled"),
    true,
  );
  assert.equal(document.querySelector("fieldset").disabled, true);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original reservation" }),
  );
  await screen.findByRole("alert");
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(attempts[0].minimumSpendPolicyVersion, "booking-v1");
  assert.equal(attempts[0].minimumSpendAcknowledged, true);
  assert.equal(attempts[0].tableId, "70000000-0000-4000-8000-000000000001");
  assert.equal(document.querySelector("fieldset").disabled, true);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original reservation" }),
  );
  await screen.findByRole("alert");
  assert.equal(attempts.length, 3);
  assert.deepEqual(attempts[0], attempts[2]);
  cleanup();
});

test("customer private requests select organization from explicit menu/store route", async (t) => {
  const { customerOrganizationSlug, customerRequest } =
    await import("../src/mera/customer/client.ts");
  assert.equal(
    customerOrganizationSlug("/mera/menu/venue-one/branch"),
    "venue-one",
  );
  assert.equal(
    customerOrganizationSlug("/mera/store/venue-two/branch"),
    "venue-two",
  );
  assert.equal(customerOrganizationSlug("/mera/workspace"), undefined);
  assert.equal(
    customerOrganizationSlug("/mera/menu/%0Avenue/branch"),
    undefined,
  );
  const calls = [];
  mockGuestSessionFetch(t, async (input, init) => {
    calls.push(init);
    return Response.json({ id: "own-order" });
  });
  window.history.replaceState({}, "", "/mera/menu/venue-two/branch");
  const body = { requestKey: "preserved-key", rating: 4 };
  await customerRequest("/public/orders/own-order/feedback", "POST", body);
  assert.equal(calls[0].headers["X-Mera-Organization-Slug"], "venue-two");
  assert.deepEqual(JSON.parse(calls[0].body), body);
  window.history.replaceState(
    {},
    "",
    "/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001",
  );
});

test("published nested category IDs filter descendants and retain legacy category fallback", async (t) => {
  const graph = [
    {
      id: "drinks",
      name: "Drinks",
      parentId: null,
      active: true,
      sortOrder: 0,
    },
    { id: "tea", name: "Tea", parentId: "drinks", active: true, sortOrder: 0 },
    {
      id: "hidden",
      name: "Unpublished or inactive",
      parentId: null,
      active: false,
    },
  ];
  const products = [
    {
      ...menu.products[0],
      id: "tea-product",
      categoryId: "tea",
      category: "Old category name",
      dietary: ["Vegan"],
    },
    {
      ...menu.products[0],
      id: "legacy-product",
      name: "Legacy sundae",
      category: "Desserts",
    },
  ];
  mockGuestSessionFetch(t, async (input) =>
    String(input).endsWith("/menu")
      ? Response.json({ ...menu, categories: graph, products })
      : Response.json({ error: "guest" }, { status: 401 }),
  );
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  assert(screen.getByText("Dietary: Vegan"));
  assert.equal(
    screen.queryByRole("radio", {
      name: "Unpublished or inactive",
      exact: true,
    }),
    null,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Drinks", exact: true }));
  assert(screen.getByText("Brown Sugar Boba"));
  assert.equal(screen.queryByText("Legacy sundae"), null);
  fireEvent.click(
    screen.getByRole("radio", { name: "Drinks / Tea", exact: true }),
  );
  assert(screen.getByText("Brown Sugar Boba"));
  fireEvent.click(screen.getByRole("radio", { name: "Desserts", exact: true }));
  assert(screen.getByText("Legacy sundae"));
  assert.equal(screen.queryByText("Brown Sugar Boba"), null);
  cleanup();
});

test("canonical outstanding and authorized writeoff are disclosed instead of recalculating cash due", async (t) => {
  mockGuestSessionFetch(t, async (input) => {
    const path = String(input);
    if (path.endsWith("/menu")) return Response.json(menu);
    if (path.endsWith("/guest"))
      return Response.json({
        displayName: "Ada",
        orders: [{ id: "own-order", createdAt: "2026-11-18T12:00:00Z" }],
      });
    if (path.endsWith("/public/orders/own-order"))
      return Response.json({
        id: "own-order",
        reference: "M-WRITEOFF",
        status: "completed",
        paymentStatus: "partially_paid",
        total: 380000,
        paid: 100000,
        effectivePaid: 100000,
        effectiveSettlement: 380000,
        outstandingBalance: 0,
        writtenOff: 280000,
        refunded: 0,
        settlementOutcome: "settled_with_writeoff",
        items: [],
        history: [],
      });
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/activity"))
      return Response.json({ reservations: [], feedback: [] });
    if (path.endsWith("/consent"))
      return Response.json({ marketing: false, deliveryAvailable: false });
    throw Error("Unexpected request");
  });
  render(React.createElement(CustomerExperience));
  await screen.findByText("Brown Sugar Boba");
  fireEvent.click(screen.getByRole("button", { name: "Your order" }));
  await screen.findByText("M-WRITEOFF");
  assert(screen.getByText(/Order total ₦3,800 · Outstanding ₦0/));
  assert(screen.getByText(/Authorized write-off ₦2,800/));
  const receipt = screen.getByLabelText("Order details");
  assert.match(receipt.textContent, /Order reference: M-WRITEOFF/);
  assert.match(receipt.textContent, /Recorded payments: ₦1,000/);
  assert.match(receipt.textContent, /Authorized write-off: ₦2,800/);
  assert.equal(receipt.querySelector(".mc-history"), null);
  assert.equal(
    screen.queryByRole("button", { name: "Print payment receipt" }),
    null,
  );
  cleanup();
});

test("session history pages and ending require explicit in-app confirmation", async (t) => {
  const { default: SessionOrders } =
    await import("../src/mera/customer/SessionOrders.tsx");
  const calls = [];
  let cleared = "",
    selected;
  mockGuestSessionFetch(t, async (input, init) => {
    const path = String(input);
    calls.push({ path, method: init.method });
    if (path.endsWith("/guest/end"))
      return Response.json({
        ended: true,
        ordersCancelled: false,
        refundConfirmed: false,
      });
    if (path.includes("cursor=page-two"))
      return Response.json({
        orders: [
          {
            id: "second",
            reference: "M-SECOND",
            status: "completed",
            paymentStatus: "paid",
          },
        ],
        nextCursor: null,
      });
    if (path.includes("/guest-orders?take=20"))
      return Response.json({
        orders: [
          {
            id: "first",
            reference: "M-FIRST",
            status: "ready",
            paymentStatus: "paid",
          },
        ],
        nextCursor: "page-two",
      });
    if (path.endsWith("/public/orders/second"))
      return Response.json({
        id: "second",
        reference: "M-SECOND",
        status: "completed",
      });
    throw Error("Unexpected request");
  });
  render(
    React.createElement(SessionOrders, {
      prefix: "/public/org/branch",
      onSelect: (order) => {
        selected = order;
      },
      onClear: (message) => {
        cleared = message;
      },
    }),
  );
  await screen.findByText("M-FIRST · Ready · Payment confirmed");
  fireEvent.click(
    screen.getByRole("button", { name: "Load more session orders" }),
  );
  await screen.findByText("M-SECOND · Completed · Payment confirmed");
  fireEvent.click(screen.getByRole("button", { name: "Open order M-SECOND" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(selected.id, "second");
  fireEvent.click(screen.getByRole("button", { name: "End guest session…" }));
  assert.equal(
    calls.some((call) => call.path.endsWith("/guest/end")),
    false,
  );
  assert(screen.getByText(/Other venues’ guest sessions stay active/));
  fireEvent.click(
    screen.getByRole("button", { name: "End this guest session" }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(cleared, /Existing orders and visits remain unchanged/);
  assert.equal(
    calls.filter((call) => call.path.endsWith("/guest/end")).length,
    1,
  );
  cleanup();
});

test("table QR package stays blocked until joining and quotes with the joined visit", async (t) => {
  window.history.replaceState({}, "", "?tableId=table-one");
  const quotes = [];
  const packageProduct = {
    ...menu.products[0],
    id: "vip-package",
    name: "VIP bottle package",
    kind: "package",
    requiresTable: true,
    components: [{ productId: menu.products[0].id, quantity: 2 }],
  };
  mockGuestSessionFetch(t, async (input, init) => {
    const path = String(input);
    if (path.endsWith("/menu"))
      return Response.json({
        ...menu,
        pricingPolicy: { enabled: true },
        products: [...menu.products, packageProduct],
        tables: [{ id: "table-one", name: "VIP table" }],
      });
    if (path.endsWith("/branches")) return Response.json({ branches: [] });
    if (path.endsWith("/guest"))
      return Response.json({ error: "guest" }, { status: 401 });
    if (path.endsWith("/guests")) return Response.json({ displayName: "Ada" });
    if (path.endsWith("/visits/terms"))
      return Response.json({ visitId: "visit-one", minimumSpendPolicy: null });
    if (path.endsWith("/visits/join"))
      return Response.json({ id: "visit-one" });
    if (path.endsWith("/public/visits/visit-one"))
      return Response.json({
        visit: {
          id: "visit-one",
          tableId: "table-one",
          tableName: "VIP table",
          status: "open",
        },
        orders: [],
        bills: [],
        balance: 0,
      });
    if (path.endsWith("/quote")) {
      quotes.push(JSON.parse(init.body));
      return Response.json({
        id: "reviewed-quote",
        currency: "NGN",
        policyVersion: "p1",
        menuVersion: 1,
        expiresAt: "2099-01-01T00:00:00Z",
        subtotal: 380000,
        total: 380000,
        lines: [],
      });
    }
    throw Error(`Unexpected request: ${path}`);
  });
  try {
    render(React.createElement(CustomerExperience));
    const choosePackage = await screen.findByRole("button", {
      name: "Choose: VIP bottle package",
    });
    assert.equal(
      choosePackage.disabled,
      true,
      "A table QR alone must not authorize a table package",
    );
    fireEvent.click(screen.getByRole("button", { name: "Join a table" }));
    fireEvent.change(
      screen.getByRole("textbox", {
        name: /^(?:Your name|What should we call you\?)$/,
      }),
      { target: { value: "Ada" } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Joining code" }), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join current visit" }));
    await screen.findByText(
      "You have joined this visit. Additional rounds will be linked to this table.",
    );
    const joinedPackage = screen.getByRole("button", {
      name: "Choose: VIP bottle package",
    });
    assert.equal(joinedPackage.disabled, false);
    fireEvent.click(joinedPackage);
    fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
    fireEvent.click(screen.getByRole("button", { name: "Review total" }));
    await waitFor(() => assert.equal(quotes.length, 1));
    assert.equal(quotes[0].visitId, "visit-one");
    assert.equal(quotes[0].fulfillment, "table_service");
    assert.equal(quotes[0].items[0].productId, "vip-package");
  } finally {
    cleanup();
    window.history.replaceState({}, "", window.location.pathname);
  }
});
