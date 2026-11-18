import test from "node:test";
import assert from "node:assert/strict";
import { redactMeraFinancialPolicy } from "../server/mera/index.js";

test("financial redaction preserves real Date JSON values while removing only internal commercial policy", () => {
  const at = new Date("2026-11-19T01:23:45.678Z");
  const source = {
    audits: [{created_at:at,details:{recordedAt:at}}],
    order:{financialPolicy:{monthlyPrice:1350000},policyVersion:"internal-approval",createdAt:at,pricing:{policyVersion:"venue-disclosure",tax:500}},
    nullable:null,
  };
  const serialized=JSON.parse(JSON.stringify(redactMeraFinancialPolicy(source)));
  assert.equal(serialized.audits[0].created_at,at.toISOString());
  assert.equal(serialized.audits[0].details.recordedAt,at.toISOString());
  assert.equal(serialized.order.createdAt,at.toISOString());
  assert.equal(serialized.order.financialPolicy,undefined);
  assert.equal(serialized.order.policyVersion,undefined);
  assert.equal(serialized.order.pricing.policyVersion,"venue-disclosure");
  assert.equal(serialized.order.pricing.tax,500);
  assert.equal(serialized.nullable,null);
  assert.ok(source.audits[0].created_at instanceof Date);
  assert.ok(source.order.financialPolicy);
});
test("invalid dates serialize to null as standard JSON without substituting the current time", () => {
  const invalid = new Date("invalid");
  assert.equal(redactMeraFinancialPolicy(invalid),null);
  assert.equal(JSON.stringify(redactMeraFinancialPolicy({at:invalid})),JSON.stringify({at:invalid}));
  assert.deepEqual(redactMeraFinancialPolicy([false,0,"unchanged",invalid]),[false,0,"unchanged",null]);
});
