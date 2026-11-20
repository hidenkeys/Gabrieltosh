import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMeraRouter } from "../server/mera/index.js";
test("address precheck requires authentication, respects canonical/alias claims and exposes no tenant data", async () => {
  const queries = [];
  const db = {
    query: async (sql, values) => {
      queries.push({ sql, values });
      assert.match(
        sql,
        /^SELECT (id|organization_id) FROM mera_(organizations|slug_claims) WHERE slug=\$1 LIMIT 1$/,
      );
      const found =
        (sql.includes("mera_organizations") &&
          values[0] === "canonical-venue") ||
        (sql.includes("mera_slug_claims") && values[0] === "old-address");
      return {
        rows: found
          ? [{ id: "private-tenant-id", organization_id: "private-tenant-id" }]
          : [],
      };
    },
  };
  const app = express();
  app.use((req, _res, next) => {
    if (req.get("x-test-actor")) req.user = { id: "synthetic-actor" };
    next();
  });
  app.use(createMeraRouter(db));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/organizations/address-availability?slug=`;
  try {
    assert.equal((await fetch(base + "available-venue")).status, 401);
    assert.equal(queries.length, 0);
    for (const candidate of ["admin", "bad--address", "x"]) {
      assert.deepEqual(
        await (
          await fetch(base + candidate, { headers: { "x-test-actor": "1" } })
        ).json(),
        { available: false, reason: "invalid_or_reserved" },
      );
    }
    assert.equal(queries.length, 0);
    for (const candidate of ["canonical-venue", "old-address"]) {
      assert.deepEqual(
        await (
          await fetch(base + candidate, { headers: { "x-test-actor": "1" } })
        ).json(),
        { available: false, reason: "already_claimed" },
      );
    }
    assert.deepEqual(
      await (
        await fetch(base + "NEW-Place", { headers: { "x-test-actor": "1" } })
      ).json(),
      { available: true, reason: "available" },
    );
    assert.deepEqual(queries.at(-1).values, ["new-place"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
