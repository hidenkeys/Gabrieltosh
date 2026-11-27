import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { subscriptionEntitlement } from "../server/mera/subscriptions.js";
import { trialDays } from "../server/mera/index.js";

const day = 86400000;
const now = Date.parse("2026-11-26T12:00:00Z");

test("a business in its free trial can take orders", () => {
  const e = subscriptionEntitlement(
    { status: "trialing", trialEndsAt: new Date(now + 5 * day).toISOString() },
    {},
    now,
  );
  assert.equal(e.newOrdersAllowed, true);
  assert.equal(e.warning, null);
});

test("the last days of a trial warn the owner with the end date", () => {
  const e = subscriptionEntitlement(
    { status: "trialing", trialEndsAt: "2026-11-28T12:00:00Z" },
    {},
    now,
  );
  assert.equal(e.newOrdersAllowed, true);
  assert.match(e.warning, /Your free trial ends on 28 Nov 2026\. Subscribe/);
});

test("after the trial, new orders stop until the subscription is paid", () => {
  const e = subscriptionEntitlement(
    { status: "trialing", trialEndsAt: new Date(now - day).toISOString() },
    {},
    now,
  );
  assert.equal(e.newOrdersAllowed, false);
  assert.equal(
    e.warning,
    "Your free trial has ended. Pay your subscription to keep taking new orders.",
  );
  const paid = subscriptionEntitlement(
    { status: "active", paidThrough: new Date(now + 30 * day).toISOString() },
    {},
    now,
  );
  assert.equal(paid.newOrdersAllowed, true);
});

test("trial length defaults to 5 days and accepts a sane override", () => {
  const before = process.env.MERA_TRIAL_DAYS;
  try {
    delete process.env.MERA_TRIAL_DAYS;
    assert.equal(trialDays(), 5);
    process.env.MERA_TRIAL_DAYS = "14";
    assert.equal(trialDays(), 14);
    process.env.MERA_TRIAL_DAYS = "-3";
    assert.equal(trialDays(), 5);
  } finally {
    if (before === undefined) delete process.env.MERA_TRIAL_DAYS;
    else process.env.MERA_TRIAL_DAYS = before;
  }
});

const previousBilling = process.env.MERA_BILLING_ENABLED;
before(() => { process.env.MERA_BILLING_ENABLED = "true"; });
after(() => { if (previousBilling === undefined) delete process.env.MERA_BILLING_ENABLED; else process.env.MERA_BILLING_ENABLED = previousBilling; });
