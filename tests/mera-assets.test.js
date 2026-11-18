import test from "node:test";
import assert from "node:assert/strict";
import { inspectImage, assertMeraAsset } from "../server/mera/assets.js";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8N8AAAAASUVORK5CYII=",
  "base64",
);
test("image upload inspects raster signatures and bounds dimensions before storage", () => {
  assert.deepEqual(inspectImage(png, "image/png"), { width: 1, height: 1 });
  assert.throws(() =>
    inspectImage(Buffer.from('<svg onload="alert(1)"></svg>'), "image/png"),
  );
  assert.throws(() => inspectImage(png, "image/jpeg"));
  const large = Buffer.from(png);
  large.writeUInt32BE(100000, 16);
  assert.throws(() => inspectImage(large, "image/png"));
  assert.throws(() => inspectImage(Buffer.alloc(4), "image/webp"));
});
test("image references cannot bind another organization or branch asset", async () => {
  const url = "/api/mera/v1/public/assets/10000000-0000-4000-8000-000000000001";
  const db = {
    query: async (sql, args) => {
      assert.match(sql, /organization_id=\$2/);
      assert.match(sql, /branch_id IS NULL OR branch_id=\$3/);
      return {
        rows:
          args[1] === "own" && args[2] === "branch" ? [{ id: "asset" }] : [],
      };
    },
  };
  await assertMeraAsset(db, "own", "branch", url);
  await assert.rejects(assertMeraAsset(db, "foreign", "branch", url), {
    status: 403,
  });
  await assert.rejects(assertMeraAsset(db, "own", "other", url), {
    status: 403,
  });
  await assert.rejects(
    assertMeraAsset(db, "own", "branch", "https://foreign.example/image.png"),
  );
});
