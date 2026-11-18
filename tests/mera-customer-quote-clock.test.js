import test from "node:test";
import assert from "node:assert/strict";
import {
  quoteDeadline,
  quoteReviewExpired,
} from "../src/mera/customer/quoteClock.ts";
test("price review clock charges HTTP precision and full round trip without device wall-clock time", () => {
  const deadline = quoteDeadline(
    "2026-11-18T12:05:00Z",
    "Wed, 18 Nov 2026 12:00:00 GMT",
    100,
    2100,
  );
  assert.equal(deadline, 299100);
  assert.equal(
    quoteReviewExpired(
      { expiresAt: "2026-11-18T12:05:00Z", reviewDeadline: deadline },
      299099,
    ),
    false,
  );
  assert.equal(
    quoteReviewExpired(
      { expiresAt: "2026-11-18T12:05:00Z", reviewDeadline: deadline },
      299100,
    ),
    true,
  );
});
test("missing or malformed server time fails closed only for expiring quotes", () => {
  assert.equal(quoteDeadline("2026-11-18T12:05:00Z", null, 100, 200), 200);
  assert.equal(quoteDeadline("bad", "bad", 100, 200), 200);
  assert.equal(
    quoteReviewExpired({ expiresAt: "2026-11-18T12:05:00Z" }, 0),
    true,
  );
  assert.equal(quoteReviewExpired({ id: "without-expiry" }, 0), false);
});
