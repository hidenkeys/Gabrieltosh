import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(
  new URL("../scripts/mera-restore-rehearsal.js", import.meta.url),
);
test("recovery rehearsal rejects production mode before touching a database", () => {
  const result = spawnSync(process.execPath, [script], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://invalid.example/production",
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /development-only/);
  assert(!result.stdout.includes('status":"passed'));
});
test("recovery rehearsal cannot be redirected to an arbitrary database URL", () => {
  const result = spawnSync(
    process.execPath,
    [script, "--database-url", "postgres://invalid.example/production"],
    { env: { ...process.env, NODE_ENV: "test" }, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /accepts no database URL/);
});
