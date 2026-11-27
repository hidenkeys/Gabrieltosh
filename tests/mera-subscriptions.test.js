import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { subscriptionEntitlement } from "../server/mera/subscriptions.js";
test("subscription restrictions use explicit dates and preserve paid service/exports", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  assert.equal(
    subscriptionEntitlement({ status: "trialing" }, {}, now).newOrdersAllowed,
    false,
  );
  assert.equal(
    subscriptionEntitlement({ status: "trialing" }, {}, now, true)
      .newOrdersAllowed,
    true,
  );
  assert.equal(
    subscriptionEntitlement(
      { status: "trialing", trialEndsAt: "2026-11-20T12:00:00Z" },
      {},
      now,
    ).newOrdersAllowed,
    true,
  );
  const expired = { status: "trialing", trialEndsAt: "2026-11-17T12:00:00Z" };
  assert.equal(
    subscriptionEntitlement(expired, { graceDays: null }, now).newOrdersAllowed,
    false,
  );
  assert.equal(
    subscriptionEntitlement(expired, { graceDays: 2, status: "approved" }, now)
      .newOrdersAllowed,
    true,
  );
  assert.equal(
    subscriptionEntitlement(expired, { graceDays: 1, status: "approved" }, now)
      .newOrdersAllowed,
    false,
    "cutoff boundary closes new orders",
  );
  for (const status of ["suspended", "cancelled"]) {
    const e = subscriptionEntitlement({ status }, {}, now);
    assert.equal(e.newOrdersAllowed, false);
    assert.equal(e.existingPaidOrdersContinue, true);
    assert.equal(e.exportsAllowed, true);
  }
  const paidExpired = { status: "active", paidThrough: "2026-11-17T12:00:00Z" };
  assert.equal(
    subscriptionEntitlement(paidExpired, { graceDays: 2 }, now).effectiveState,
    "past_due",
  );
});

const previousBilling = process.env.MERA_BILLING_ENABLED;
before(() => { process.env.MERA_BILLING_ENABLED = "true"; });
after(() => { if (previousBilling === undefined) delete process.env.MERA_BILLING_ENABLED; else process.env.MERA_BILLING_ENABLED = previousBilling; });
