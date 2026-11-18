import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMeraRuntime,
  meraPublicLimits,
} from "../server/mera-security.js";
test("hosted startup fails closed before automatic migration or demo seed", () => {
  const valid = {
    MERA_ENABLED: "true",
    NODE_ENV: "production",
    COOKIE_SECURE: "true",
    DATABASE_URL: "postgresql://configured",
    MERA_PUBLIC_ORIGIN: "https://mera.example.com",
  };
  assert.doesNotThrow(() => validateMeraRuntime(valid));
  for (const change of [
    { MERA_DEMO: "true" },
    { MEMORY_DB: "true" },
    { DEMO_PASSWORD: "demo" },
    { COOKIE_SECURE: "false" },
    { DATABASE_URL: "" },
    { MERA_PUBLIC_ORIGIN: "http://example.com" },
    { MERA_PUBLIC_ORIGIN: "https://user:secret@example.com" },
  ])
    assert.throws(() => validateMeraRuntime({ ...valid, ...change }));
  assert.doesNotThrow(() =>
    validateMeraRuntime({ MERA_ENABLED: "true", NODE_ENV: "development" }),
  );
});
test("public mutation abuse limits recover after window without blocking canonical reads", () => {
  let now = 0,
    nextCalls = 0,
    status,
    headers = {};
  const guard = meraPublicLimits({
    clock: () => now,
    maximum: 2,
    windowMs: 1000,
  });
  const res = {
    status(n) {
      status = n;
      return this;
    },
    set(k, v) {
      headers[k] = v;
      return this;
    },
    json() {
      return this;
    },
  };
  const req = { path: "/public/shop/branch/orders", method: "POST", ip: "one" };
  const next = () => nextCalls++;
  guard(req, res, next);
  guard(req, res, next);
  guard(req, res, next);
  assert.equal(nextCalls, 2);
  assert.equal(status, 429);
  assert.equal(headers["Retry-After"], "1");
  guard({ ...req, method: "GET" }, res, next);
  assert.equal(nextCalls, 3);
  now = 1001;
  guard(req, res, next);
  assert.equal(nextCalls, 4);
});
