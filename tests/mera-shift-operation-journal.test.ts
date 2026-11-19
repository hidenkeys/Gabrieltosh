import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("", { url: "http://localhost" });
Object.defineProperty(globalThis, "window", {
  value: dom.window,
  configurable: true,
});
const j = await import("../src/mera/workspace/shiftOperationJournal");
const scope = {
  actorId: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
  branchId: "30000000-0000-4000-8000-000000000001",
};
const requestKey = "40000000-0000-4000-8000-000000000001";
const record = {
  version: 1,
  ...scope,
  referenceOnly: false,
  operation: "close",
  shiftId: requestKey,
  requestKey,
  body: { requestKey, countedCash: 1234, reason: "Private count reason" },
} as const;
const result = {
  ...scope,
  requestKey,
  shiftId: requestKey,
  operation: "close",
  status: "recorded",
  resultBasis: "recorded_operation_snapshot",
  shift: { id: requestKey, status: "pending_approval" },
  operationRecord: {
    id: requestKey,
    actorId: scope.actorId,
    requestKey,
    operation: "close",
    shiftId: requestKey,
    intent: {
      countedCash: 1234,
      reason: "Private count reason",
      shiftId: requestKey,
    },
    createdAt: "2026-11-19T10:00:00Z",
  },
};
test("journal keeps one exact operation per branch and validates actor/scope/strict immutable intent proof", () => {
  try {
    j.saveShiftOperationJournal(record);
    assert.deepEqual(j.readShiftOperationJournal(scope), record);
    assert.throws(() =>
      j.saveShiftOperationJournal({
        ...record,
        operation: "open",
        shiftId: null,
        body: { requestKey, openingFloat: 0 },
      }),
    );
    assert.equal(
      j.parseShiftOperationAttempt(result, record).status,
      "recorded",
    );
    for (const changed of [
      { ...result, actorId: requestKey },
      { ...result, requestKey: scope.actorId },
      { ...result, shiftId: scope.actorId },
      { ...result, resultBasis: "current_shift" },
      {
        ...result,
        operationRecord: {
          ...result.operationRecord,
          intent: { ...result.operationRecord.intent, countedCash: 999 },
        },
      },
    ])
      assert.throws(() => j.parseShiftOperationAttempt(changed, record));
    assert.throws(() => j.clearShiftOperationJournal(scope, scope.actorId));
    assert.ok(j.readShiftOperationJournal(scope));
  } finally {
    window.sessionStorage.clear();
  }
});
test("redaction retains operation reference while removing amount/reason and marker proof still requires valid operation intent", () => {
  try {
    j.saveShiftOperationJournal(record);
    assert.equal(j.redactShiftOperationJournals(), true);
    const marker = j.readShiftOperationJournal(scope)!;
    assert.equal(marker.referenceOnly, true);
    assert.ok(!JSON.stringify(marker).includes("1234"));
    assert.ok(!JSON.stringify(marker).includes("Private count reason"));
    assert.equal(j.hasShiftOperationJournals(scope.actorId), true);
    assert.equal(j.hasShiftOperationJournals(requestKey), false);
    assert.equal(
      j.parseShiftOperationAttempt(result, marker).status,
      "recorded",
    );
    assert.throws(() =>
      j.parseShiftOperationAttempt(
        {
          ...result,
          operationRecord: { ...result.operationRecord, intent: {} },
        },
        marker,
      ),
    );
    assert.throws(() => j.saveShiftOperationJournal(record));
    j.clearShiftOperationJournal(scope, requestKey);
    assert.equal(j.readShiftOperationJournal(scope), null);
  } finally {
    window.sessionStorage.clear();
  }
});
test("strict cash parsing preserves minor units, explicit zero is valid and malformed/corrupt storage blocks recovery", () => {
  for (const amount of ["", " ", "-1", "1.001", "1e2", "01", "Infinity"])
    assert.throws(() => j.parseShiftAmount(amount));
  assert.equal(j.parseShiftAmount("0"), 0);
  assert.equal(j.parseShiftAmount("12.34"), 1234);
  assert.equal(j.parseShiftAmount(" 1.2 "), 120);
  try {
    j.saveShiftOperationJournal(record);
    const key = window.sessionStorage.key(0)!;
    window.sessionStorage.setItem(key, "{corrupt");
    assert.throws(() => j.readShiftOperationJournal(scope));
    assert.equal(j.redactShiftOperationJournals(), false);
  } finally {
    window.sessionStorage.clear();
  }
  const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get() {
      throw Error("blocked");
    },
  });
  try {
    assert.throws(() => j.saveShiftOperationJournal(record));
    assert.equal(j.redactShiftOperationJournals(), false);
    assert.equal(j.hasShiftOperationJournals(), true);
  } finally {
    Object.defineProperty(window, "sessionStorage", descriptor);
  }
});
