import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  totp,
  base32,
  verifyTotp,
  encryptFactor,
  decryptFactor,
  platformKey,
} from "../server/mera/platform.js";
test("platform authenticator matches RFC 6238 SHA-1 vectors including beyond 2038", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  for (const [seconds, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])
    assert.equal(totp(secret, Math.floor(seconds / 30), 8), expected);
  const now = 1234567890000,
    counter = Math.floor(now / 30000),
    code = totp(secret, counter);
  assert.equal(verifyTotp(secret, code, -1, now), counter);
  assert.equal(
    verifyTotp(secret, code, counter, now),
    null,
    "replayed counter denied",
  );
  assert.equal(
    verifyTotp(secret, code, -1, now + 120000),
    null,
    "expired code denied",
  );
  assert.equal(verifyTotp(secret, "12345", -1, now), null);
});
test("platform authenticator secrets require authenticated encryption and explicit deployment key", () => {
  const key = randomBytes(32),
    value = encryptFactor("AUTHENTICATOR_SECRET", key);
  assert.equal(decryptFactor(value, key), "AUTHENTICATOR_SECRET");
  assert.throws(() => decryptFactor(value, randomBytes(32)));
  const parts = value.split(".");
  parts[2] = Buffer.from("tamper").toString("base64url");
  assert.throws(() => decryptFactor(parts.join("."), key));
  assert.throws(() => platformKey({}));
  assert.throws(() => platformKey({ MERA_PLATFORM_MFA_KEY: "short" }));
  assert.equal(
    platformKey({ MERA_PLATFORM_MFA_KEY: key.toString("hex") }).length,
    32,
  );
});
