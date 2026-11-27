import test from "node:test";
import assert from "node:assert/strict";
import { billingEnabled, subscriptionEntitlement } from "../server/mera/subscriptions.js";
import { mountMeraReadiness } from "../server/mera/readiness.js";

test("billing requires the exact opt-in and expired trials never restrict service while off", () => {
  const previous = process.env.MERA_BILLING_ENABLED;
  try {
    for (const value of [undefined, "false", "TRUE", "1", "true"]) {
      if (value === undefined) delete process.env.MERA_BILLING_ENABLED;
      else process.env.MERA_BILLING_ENABLED = value;
      assert.equal(billingEnabled(), value === "true");
      const access = subscriptionEntitlement({ status: "trialing", trialEndsAt: "2020-01-01T00:00:00Z" });
      assert.equal(access.newOrdersAllowed, value !== "true");
      if (value !== "true") {
        assert.equal(access.effectiveState, "not_billed");
        assert.equal(access.warning, null);
        assert.equal(access.restrictionAt, null);
        assert.equal(access.exportsAllowed, true);
        assert.equal(access.existingPaidOrdersContinue, true);
        assert.equal(subscriptionEntitlement({ status: "suspended" }).newOrdersAllowed, true);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.MERA_BILLING_ENABLED;
    else process.env.MERA_BILLING_ENABLED = previous;
  }
});

test("readiness omits subscription access while off and checks expired trials when on", async () => {
  const previous = process.env.MERA_BILLING_ENABLED;
  const handlers = new Map();
  const branch = { name: "Branch", timezone: "Africa/Lagos", currency: "NGN", menu_version: 1, published_menu: [{}], settings: { serviceHours: [{days:[0],start:"08:00",end:"22:00"}], manualPaymentMethods: ["cash"] } };
  const db = { query: async (sql) => ({ rows: sql.includes("mera_organizations") ? [{ name: "Venue", slug: "venue", branding: { email: "venue@example.com" }, subscription: { status: "trialing", trialEndsAt: "2020-01-01T00:00:00Z" } }] : sql.includes("mera_branches") ? [branch] : [{ user_id: "owner" }] }) };
  mountMeraReadiness({ get: (path, ...callbacks) => handlers.set(path, callbacks.at(-1)), patch() {}, post() {} }, {
    db, guard: () => () => {}, scope: () => ({ organizationId: "org", branchId: "branch" }), readRecords: async () => [{}],
  });
  try {
    for (const enabled of [false, true]) {
      process.env.MERA_BILLING_ENABLED = String(enabled);
      let result;
      await handlers.get("/organizations/:organizationId/branches/:branchId/readiness")({}, { json: (body) => { result = body; } });
      assert.equal(result.billingEnabled, enabled);
      assert.equal(result.checks.some((row) => row.id === "subscription_access"), enabled);
      assert.equal(result.canPublish, !enabled);
      assert.equal(result.checks.find((row) => row.id === "manual_branch_policy").ready, true);
    }
  } finally {
    if (previous === undefined) delete process.env.MERA_BILLING_ENABLED;
    else process.env.MERA_BILLING_ENABLED = previous;
  }
});

test("billing off rejects invoice creation before reading or writing records", async () => {
  const { mountMeraOperations } = await import("../server/mera/operations.js");
  const previous = process.env.MERA_BILLING_ENABLED;
  const routes = new Map();
  mountMeraOperations({ get() {}, post: (path, ...callbacks) => routes.set(path, callbacks.at(-1)), patch() {} }, {
    guard: () => () => {}, db: { query: () => { throw Error("Billing must not touch records while off"); } },
  });
  try {
    delete process.env.MERA_BILLING_ENABLED;
    let status, body;
    const response = { status: (value) => { status = value; return response; }, json: (value) => { body = value; } };
    await routes.get("/organizations/:organizationId/invoices")({}, response);
    assert.equal(status, 409);
    assert.equal(body.code, "BILLING_DISABLED");
  } finally {
    if (previous === undefined) delete process.env.MERA_BILLING_ENABLED;
    else process.env.MERA_BILLING_ENABLED = previous;
  }
});
