import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { dataPath, printOutputPath, backupPath } from "../server/paths.js";
test("installed output uses a persistent data root independent of the application directory", () => {
  const original = process.env.POS_DATA_DIR;
  process.env.POS_DATA_DIR = resolve("separate-store-data");
  try {
    assert.equal(
      printOutputPath("receipt.html"),
      resolve("separate-store-data/print-output/receipt.html"),
    );
    assert.equal(
      backupPath("snapshot.dump"),
      resolve("separate-store-data/backups/snapshot.dump"),
    );
    assert.equal(
      dataPath("diagnostics"),
      resolve("separate-store-data/diagnostics"),
    );
  } finally {
    if (original === undefined) delete process.env.POS_DATA_DIR;
    else process.env.POS_DATA_DIR = original;
  }
});
