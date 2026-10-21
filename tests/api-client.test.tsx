import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api";

test("an unreachable store server gives an actionable error without retrying a write", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(api("/login", "POST", { username: "admin" }), {
    message:
      "Cannot reach the store server. Make sure it is running and this device is connected to the store network, then try again.",
  });
  assert.equal(attempts, 1);
});

test("reachable server errors retain their specific explanation", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "Administrator sign-in is restricted to the Windows server." },
      { status: 403 },
    ),
  );
  await assert.rejects(api("/login", "POST", {}), {
    message: "Administrator sign-in is restricted to the Windows server.",
  });
});
