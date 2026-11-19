import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("", { url: "http://localhost" });
Object.defineProperty(globalThis, "window", {
  value: dom.window,
  configurable: true,
});
const j = await import("../src/mera/workspace/staffReservationJournal");
const scope = {
  actorId: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
  branchId: "30000000-0000-4000-8000-000000000001",
};
const intent = {
  requestKey: "40000000-0000-4000-8000-000000000001",
  displayName: "Private guest",
  contact: "0801234567",
  partySize: 2,
  startsAt: "2030-01-02T12:00:00Z",
  endsAt: "2030-01-02T13:00:00Z",
  notes: "",
};
const review = {
  branchName: "Surulere",
  timezone: "Africa/Lagos",
  minimumSpendPolicy: null,
  depositPolicy: null,
  reservationPolicy: null,
};
test("strict journal restores exact scope/key/body, blocks replacement and verifies canonical outcome proof", () => {
  try {
    const record = j.saveStaffReservationJournal(
      j.buildStaffReservationJournal(scope, intent, review),
    );
    assert.deepEqual(j.readStaffReservationJournal(scope), record);
    assert.throws(() =>
      j.saveStaffReservationJournal(
        j.buildStaffReservationJournal(
          scope,
          { ...intent, partySize: 3 },
          review,
        ),
      ),
    );
    const result = {
      ...scope,
      requestKey: intent.requestKey,
      status: "recorded",
      reservation: {
        ...intent,
        id: intent.requestKey,
        createdBy: scope.actorId,
        guestId: null,
      },
    };
    assert.equal(
      j.parseStaffReservationAttempt(result, record).status,
      "recorded",
    );
    for (const bad of [
      { ...result, requestKey: scope.actorId },
      { ...result, actorId: intent.requestKey },
      {
        ...result,
        reservation: { ...result.reservation, contact: "different" },
      },
      {
        ...result,
        reservation: { ...result.reservation, guestId: scope.actorId },
      },
    ])
      assert.throws(() => j.parseStaffReservationAttempt(bad, record));
  } finally {
    window.sessionStorage.clear();
  }
});
test("configured server policy metadata is normalized to strict review without rejecting disabled unresolved minimum", () => {
  const configured = {
    ...review,
    minimumSpendPolicy: {
      enabled: false,
      approved: false,
      amount: null,
      basis: null,
      shortfallTreatment: "manager_review",
      disclosure: "",
      version: intent.requestKey,
      configuredBy: scope.actorId,
    },
    depositPolicy: {
      enabled: true,
      approved: true,
      amount: 50000,
      cancellationCutoffHours: 24,
      refundRule: "refundable_before_cutoff",
    },
    reservationPolicy: {
      enabled: true,
      approved: true,
      version: intent.requestKey,
      minimumLeadMinutes: 30,
      maximumAdvanceDays: 30,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 10,
      cancellationCutoffMinutes: null,
      lateAfterMinutes: null,
      refundHandling: "manual_review",
      noShowHandling: "manual_review",
      reviewedBy: scope.actorId,
      reviewedAt: "2026-11-19T10:00:00Z",
    },
  };
  const record = j.buildStaffReservationJournal(scope, intent, configured);
  assert.equal(record.review.minimumSpendPolicy?.amount, null);
  assert.equal(record.review.depositPolicy?.enabled, true);
  assert.ok(!("reviewedBy" in record.review.reservationPolicy!));
  assert.throws(() =>
    j.staffReservationJournalSchema.parse({ ...record, extra: "unrecognized" }),
  );
});
test("logout redaction removes guest data but retains actor scoped key; reads and corrupt data fail closed", () => {
  try {
    j.saveStaffReservationJournal(
      j.buildStaffReservationJournal(scope, intent, review),
    );
    assert.equal(j.redactStaffReservationJournals(), true);
    const marker = j.readStaffReservationJournal(scope)!;
    assert.equal(marker.referenceOnly, true);
    assert.equal(marker.requestKey, intent.requestKey);
    assert.equal(j.hasStaffReservationJournals(scope.actorId), true);
    assert.equal(j.hasStaffReservationJournals(intent.requestKey), false);
    assert.ok(!JSON.stringify(marker).includes("Private guest"));
    assert.throws(() =>
      j.saveStaffReservationJournal(
        j.buildStaffReservationJournal(scope, intent, review),
      ),
    );
    const key = window.sessionStorage.key(0)!;
    window.sessionStorage.setItem(key, "{bad");
    assert.throws(() => j.readStaffReservationJournal(scope));
    assert.equal(j.redactStaffReservationJournals(), false);
  } finally {
    window.sessionStorage.clear();
  }
});
