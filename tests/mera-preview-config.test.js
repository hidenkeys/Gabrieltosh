import test from "node:test";
import assert from "node:assert/strict";
import { meraPreviewConfig } from "../scripts/mera-preview-config.js";

test("default preview preserves its directory and ports with an explicit loopback URL", () => {
  assert.deepEqual(meraPreviewConfig({}), {
    instance: "default",
    databaseDir: "data/mera-demo-db",
    webPort: 3003,
    dbPort: 55441,
    host: "127.0.0.1",
    url: "http://127.0.0.1:3003/mera",
  });
});
test("named preview isolates its database and uses the requested distinct ports", () => {
  const config = meraPreviewConfig({
    MERA_PREVIEW_INSTANCE: "visual",
    MERA_PREVIEW_PORT: "3006",
    MERA_PREVIEW_DB_PORT: "55443",
    HOST: "0.0.0.0",
    DATABASE_URL: "postgres://untrusted.example/live",
    MERA_PREVIEW_DATA_DIR: "/untrusted",
  });
  assert.equal(config.databaseDir, "data/mera-demo-visual-db");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.dbPort, 55443);
  assert.equal(config.webPort, 3006);
  assert.equal(config.url, "http://127.0.0.1:3006/mera");
  assert.notEqual(config.databaseDir, meraPreviewConfig({}).databaseDir);
});
test("production and unsafe instance directory selectors are rejected", () => {
  assert.throws(
    () => meraPreviewConfig({ NODE_ENV: "production" }),
    /not a production launcher/,
  );
  for (const instance of [
    "",
    "../demo",
    "/tmp/demo",
    "visual/db",
    "visual\\db",
    "Visual",
    "two words",
    "a".repeat(41),
    "-visual",
    "visual-",
    "visual--two",
  ])
    assert.throws(
      () => meraPreviewConfig({ MERA_PREVIEW_INSTANCE: instance }),
      /lowercase slug/,
    );
});
test("ports are bounded integers and cannot collide", () => {
  for (const key of ["MERA_PREVIEW_PORT", "MERA_PREVIEW_DB_PORT"])
    for (const value of [
      "",
      "0",
      "65536",
      "3.5",
      "-1",
      "3006junk",
      " 3006",
      "1e4",
      "999999999999999999999",
    ])
      assert.throws(
        () => meraPreviewConfig({ [key]: value }),
        /integer from 1 to 65535/,
      );
  assert.throws(
    () =>
      meraPreviewConfig({
        MERA_PREVIEW_PORT: "3006",
        MERA_PREVIEW_DB_PORT: "3006",
      }),
    /distinct/,
  );
  assert.equal(
    meraPreviewConfig({ MERA_PREVIEW_PORT: "1", MERA_PREVIEW_DB_PORT: "65535" })
      .dbPort,
    65535,
  );
});
