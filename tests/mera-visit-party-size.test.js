import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMeraRouter } from "../server/mera/index.js";

// Exercise the real visit handler and persisted records, without a network or
// production database. Existing authorization tests cover the mounted guard.
function fixture() {
  const organizationId = randomUUID(),
    branchId = randomUUID(),
    tableId = randomUUID();
  const branch = {
    id: branchId,
    organization_id: organizationId,
    settings: { capabilities: ["table_service"] },
  };
  let records = [
    {
      id: tableId,
      kind: "table",
      data: { id: tableId, name: "Garden", capacity: 4, status: "available" },
    },
  ];
  const db = {
    async transaction(fn) {
      const before = structuredClone(records);
      try {
        return await fn(db);
      } catch (e) {
        records = before;
        throw e;
      }
    },
    async query(sql, args = []) {
      if (sql.includes("mera_branches")) return { rows: [branch] };
      if (sql.includes("mera_organizations"))
        return { rows: [{ platform_flags: {} }] };
      if (sql.startsWith("INSERT INTO mera_records")) {
        records.push({ id: args[0], kind: args[3], data: JSON.parse(args[4]) });
        return { rows: [] };
      }
      if (sql.startsWith("UPDATE mera_records")) {
        const row = records.find((r) => r.id === args[1] && r.kind === args[4]);
        if (row) row.data = JSON.parse(args[0]);
        return { rows: row ? [{ id: row.id }] : [] };
      }
      if (sql.includes("mera_records") && sql.includes("WHERE id=$1"))
        return {
          rows: records.filter((r) => r.id === args[0] && r.kind === args[3]),
        };
      throw Error("Unexpected fixture query");
    },
  };
  const router = createMeraRouter(db);
  const route = router.stack.find(
    (layer) =>
      layer.route?.path ===
        "/organizations/:organizationId/branches/:branchId/visits" &&
      layer.route.methods.post,
  ).route;
  return {
    records: () => structuredClone(records),
    async open(partySize) {
      let result;
      const response = {
        status() {
          return this;
        },
        json(value) {
          result = value;
        },
      };
      await route.stack
        .at(-1)
        .handle(
          {
            params: { organizationId, branchId },
            user: { id: "fictional-owner", name: "Fictional owner" },
            body: {
              tableId,
              displayName: "Fictional party",
              ...(partySize === undefined ? {} : { partySize }),
            },
          },
          response,
        );
      return result;
    },
  };
}

test("walk-in party size is validated and persisted with the opened visit", async () => {
  const f = fixture();
  const visit = await f.open(3);
  assert.equal(visit.partySize, 3);
  assert.equal(f.records().find((r) => r.kind === "visit").data.partySize, 3);
  assert.equal(
    f.records().find((r) => r.kind === "table").data.status,
    "occupied",
  );
  assert.equal("joiningCodeHash" in visit, false);
});

test("walk-in visit rejects invalid counts and over-capacity parties without seating anyone", async () => {
  for (const size of [0, -1, 1.5, 101, "3", 5]) {
    const f = fixture();
    await assert.rejects(() => f.open(size));
    assert.equal(f.records().length, 1);
    assert.equal(f.records()[0].data.status, "available");
  }
  assert.equal((await fixture().open()).partySize, 2);
});
