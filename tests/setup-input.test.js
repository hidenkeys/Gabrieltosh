import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const provision = new URL("../scripts/windows/provision.js", import.meta.url);
test("Windows setup accepts redirected JSON with a UTF-8 BOM", () => {
  const result = spawnSync(process.execPath, [provision.pathname], {
    input:
      "\uFEFF" +
      JSON.stringify({
        action: "database",
        port: 0,
        password: "never-echo-this-password",
      }),
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error, "Invalid database port.");
  assert(!result.stderr.includes("never-echo-this-password"));
});
test("invalid setup input does not echo any supplied credentials", () => {
  const result = spawnSync(process.execPath, [provision.pathname], {
    input: '\uFEFF{"password":"never-echo-this-password",broken',
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stderr).error,
    /setup input could not be read/,
  );
  assert(!result.stderr.includes("never-echo-this-password"));
});
