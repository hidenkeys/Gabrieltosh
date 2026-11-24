import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  effectiveCapabilities,
  capabilitiesToLegacyModes,
} from "../shared/mera-venues.js";
import {
  paymentInputSchema,
  rolePermissions,
} from "../shared/mera-contracts.js";
import {
  assertCapability,
  effectiveBranchAccess,
  canSeeBranch,
  locationSettings,
  assertBranchFeature,
} from "../server/mera/venue-access.js";
import { buildOverview, mountMeraOverview } from "../server/mera/overview.js";
import { mountMeraOperating } from "../server/mera/operating.js";
import { mountMeraGuestList } from "../server/mera/guest-list.js";
for (const capability of [
  "table_service",
  "reservations",
  "qr_ordering",
  "open_tabs",
  "minimum_spend",
  "deposits",
  "room_charge",
  "guest_list",
])
  test(`${capability} gate is explicit and rejects stock rooms`, () => {
    assert.throws(
      () => assertCapability({ settings: { capabilities: [] } }, capability),
      (e) => e.status === 409 && e.code === "CAPABILITY_OFF",
    );
    assert.doesNotThrow(() =>
      assertCapability(
        { settings: { capabilities: [capability] } },
        capability,
      ),
    );
    assert.throws(
      () =>
        assertCapability(
          { settings: { role: "stock_room", capabilities: [capability] } },
          capability,
        ),
      { code: "CAPABILITY_OFF" },
    );
  });
test("legacy derivation and capability writes preserve service-mode compatibility", () => {
  assert.deepEqual(
    effectiveCapabilities({ serviceModes: ["table_service", "reservations"] }),
    ["table_service", "split_bills", "reservations", "prep_stations"],
  );
  assert.deepEqual(
    effectiveCapabilities({
      capabilities: [],
      serviceModes: ["table_service"],
    }),
    [],
  );
  assert.deepEqual(
    locationSettings({ capabilities: ["guest_list", "table_service"] })
      .serviceModes,
    capabilitiesToLegacyModes(["guest_list", "table_service"]),
  );
});
test("branch roles take precedence; cashier at A has no access at B; organization checks retain membership role", () => {
  const m = {
    role: "reports_only",
    permissions: ["reports.view"],
    branch_ids: [],
    branch_roles: {
      a: { role: "cashier", permissions: rolePermissions.cashier },
    },
  };
  assert(effectiveBranchAccess(m, "a").permissions.includes("payments.record"));
  assert.deepEqual(effectiveBranchAccess(m, "b").permissions, []);
  assert.deepEqual(effectiveBranchAccess(m).permissions, ["reports.view"]);
  assert(canSeeBranch(m, "a"));
  assert(!canSeeBranch(m, "b"));
  assert.deepEqual(
    effectiveBranchAccess(
      {
        ...m,
        organization_wide: true,
        branch_roles: { a: { role: "reports_only", permissions: [] } },
      },
      "a",
    ).permissions,
    [],
  );
});
test("room charge validates reference and platform branch flags stop only new requests", () => {
  const input = {
    requestKey: randomUUID(),
    amount: 100,
    method: "room_charge",
  };
  assert(!paymentInputSchema.safeParse(input).success);
  assert(
    paymentInputSchema.safeParse({ ...input, reference: "102 Ada" }).success,
  );
  assert.throws(
    () =>
      assertBranchFeature(
        { settings: { platformFlags: { flags: { new_reservations: false } } } },
        "new_reservations",
      ),
    { code: "FEATURE_DISABLED" },
  );
});
test("overview uses each cutoff, excludes stock-room sales and preserves unknown stock valuation", () => {
  const branches = [
    { id: "a", name: "A", timezone: "Africa/Lagos", cutoff: 0, settings: {} },
    { id: "b", name: "B", timezone: "UTC", cutoff: 420, settings: {} },
    {
      id: "c",
      name: "Store",
      timezone: "UTC",
      cutoff: 0,
      settings: { role: "stock_room" },
    },
  ];
  const rows = branches.flatMap((b) => [
    {
      branch_id: b.id,
      kind: "order",
      data: {
        id: b.id,
        createdAt: "2026-11-24T02:00:00Z",
        completedAt: "2026-11-24T02:00:00Z",
        status: "completed",
        total: 1000,
        paid: 1000,
        refunded: 0,
        items: [],
      },
    },
    {
      branch_id: b.id,
      kind: "payment",
      data: {
        createdAt: "2026-11-24T02:00:00Z",
        amount: 1000,
        method: "room_charge",
      },
    },
  ]);
  rows.push(
    {
      branch_id: "a",
      kind: "product",
      data: { id: "p", stockMode: "counted", stock: 2 },
    },
    {
      branch_id: "b",
      kind: "product",
      data: { id: "q", stockMode: "counted", stock: 3, unitCost: 100 },
    },
  );
  const today = buildOverview(branches, rows, {
    from: "2026-11-24",
    to: "2026-11-24",
  });
  assert.equal(today.totals.revenue, 1000);
  assert.equal(today.totals.orders, 1);
  assert.equal(today.totals.roomCharges, 1000);
  assert.equal(today.branches.length, 2);
  assert.deepEqual(today.stock.valueByBranch, [
    { branchId: "a", value: null },
    { branchId: "b", value: 300 },
    { branchId: "c", value: 0 },
  ]);
  assert.equal(
    buildOverview(branches, rows, { from: "2026-11-23", to: "2026-11-24" })
      .totals.revenue,
    2000,
  );
});
function routerFixture(mount, services) {
  const handlers = new Map(),
    router = {};
  for (const method of ["get", "post", "patch", "delete"])
    router[method] = (path, ...chain) => handlers.set(method + path, chain);
  mount(router, services);
  return async (method, path, req) => {
    let value;
    const res = {
      json(v) {
        value = v;
        return this;
      },
      status() {
        return this;
      },
    };
    for (const fn of handlers.get(method + path)) await fn(req, res, () => {});
    return value;
  };
}
const pass = () => (req, res, next) => next();
test("overview rejects branch IDs from another organization even with a passing route guard", async () => {
  const call = routerFixture(mountMeraOverview, {
    guard: pass,
    db: { query: async () => ({ rows: [{ id: "a" }] }) },
  });
  await assert.rejects(
    () =>
      call("get", "/organizations/:organizationId/overview", {
        params: { organizationId: "org" },
        query: { from: "2026-11-24", to: "2026-11-24", branchIds: "foreign" },
        meraMembership: { organization_wide: true },
      }),
    { status: 403 },
  );
});
test("operating rejects a missing/cross-organization target", async () => {
  const call = routerFixture(mountMeraOperating, {
    guard: pass,
    db: { transaction: (fn) => fn({ query: async () => ({ rows: [] }) }) },
  });
  await assert.rejects(
    () =>
      call("patch", "/organizations/:organizationId/operating", {
        params: { organizationId: "foreign" },
        user: { id: "u" },
        body: {
          requestKey: randomUUID(),
          version: 1,
          inventoryMode: "central",
        },
      }),
    { status: 404 },
  );
});
test("guest list reads reject missing/cross-organization branch", async () => {
  const call = routerFixture(mountMeraGuestList, {
    guard: pass,
    scope: (req) => ({
      organizationId: req.params.organizationId,
      branchId: req.params.branchId,
    }),
    db: {
      query: async (sql, p) => {
        assert.deepEqual(p, ["org", "foreign"]);
        return { rows: [] };
      },
    },
  });
  await assert.rejects(
    () =>
      call(
        "get",
        "/organizations/:organizationId/branches/:branchId/guest-list",
        { params: { organizationId: "org", branchId: "foreign" }, query: {} },
      ),
    { status: 404 },
  );
});

function writeStore() {
  const branches = [
      {
        id: "a",
        organization_id: "org",
        name: "A",
        settings: { capabilities: ["guest_list"] },
      },
    ],
    records = [];
  const org = { id: "org", operating: { version: 1 } },
    query = async (sql, p = []) => {
      if (sql.startsWith("SELECT * FROM mera_organizations"))
        return { rows: p[0] === "org" ? [org] : [] };
      if (sql.startsWith("SELECT * FROM mera_branches"))
        return { rows: branches.filter((b) => b.organization_id === p[0]) };
      if (sql.startsWith("SELECT id FROM mera_branches"))
        return { rows: branches.filter((b) => b.organization_id === p[0]) };
      if (sql.startsWith("SELECT data FROM mera_records")) {
        if (sql.includes("kind='product'"))
          return {
            rows: records.filter((r) => r.kind === "product" && r.org === p[0]),
          };
        return {
          rows: records.filter(
            (r) =>
              r.org === p[0] &&
              r.kind === p[1] &&
              r.data.requestKey === p[2] &&
              r.data.actorId === p[3],
          ),
        };
      }
      if (sql.startsWith("INSERT INTO mera_branches")) {
        branches.push({
          id: p[0],
          organization_id: p[1],
          name: p[2],
          settings: JSON.parse(p[3]),
        });
        return { rows: [] };
      }
      if (sql.startsWith("UPDATE mera_organizations")) {
        org.operating = JSON.parse(p[0]);
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO mera_records")) {
        records.push({
          org: p[1],
          branch: p[2],
          kind: p[3],
          data: JSON.parse(p[4]),
        });
        return { rows: [] };
      }
      throw Error(sql);
    };
  const db = { query, transaction: (fn) => fn({ query }) };
  return { db, org, branches, records };
}
test("central inventory creates one stock room, replays exactly, checks versions and locks counted stock", async () => {
  const f = writeStore(),
    call = routerFixture(mountMeraOperating, {
      db: f.db,
      guard: pass,
      event: async () => {},
    }),
    req = {
      params: { organizationId: "org" },
      user: { id: "u" },
      body: { requestKey: randomUUID(), version: 1, inventoryMode: "central" },
    };
  const result = await call(
    "patch",
    "/organizations/:organizationId/operating",
    req,
  );
  assert.equal(f.branches.length, 2);
  assert.equal(f.branches[1].settings.role, "stock_room");
  assert.equal(result.centralStockBranchId, f.branches[1].id);
  assert.deepEqual(
    await call("patch", "/organizations/:organizationId/operating", req),
    result,
  );
  assert.equal(f.branches.length, 2);
  await assert.rejects(
    () =>
      call("patch", "/organizations/:organizationId/operating", {
        ...req,
        body: { ...req.body, inventoryMode: "per_location" },
      }),
    { code: "IDEMPOTENCY_CONFLICT" },
  );
  await assert.rejects(
    () =>
      call("patch", "/organizations/:organizationId/operating", {
        ...req,
        body: { ...req.body, requestKey: randomUUID() },
      }),
    { code: "STALE_VERSION" },
  );
  f.records.push({
    org: "org",
    kind: "product",
    data: { stockMode: "counted", stock: 4 },
  });
  await assert.rejects(
    () =>
      call("patch", "/organizations/:organizationId/operating", {
        ...req,
        body: {
          requestKey: randomUUID(),
          version: 2,
          inventoryMode: "per_location",
        },
      }),
    { code: "INVENTORY_MODE_LOCKED" },
  );
  assert.equal(
    (
      await call("patch", "/organizations/:organizationId/operating", {
        ...req,
        body: {
          requestKey: randomUUID(),
          version: 2,
          inventoryMode: "per_location",
          confirmCount: true,
        },
      })
    ).version,
    3,
  );
});
test("guest-list check-in is bounded, versioned and idempotent, including deleted entries", async () => {
  const f = writeStore(),
    entries = new Map();
  const call = routerFixture(mountMeraGuestList, {
    db: f.db,
    guard: pass,
    scope: (req) => ({
      organizationId: req.params.organizationId,
      branchId: req.params.branchId,
    }),
    locked: async (s, fn) => {
      if (s.organizationId !== "org" || s.branchId !== "a")
        throw Object.assign(Error("Missing branch"), { status: 404 });
      return fn(f.db, f.branches[0]);
    },
    record: async (c, s, kind, data) => {
      const e = { ...data, id: randomUUID() };
      entries.set(e.id, e);
      return e;
    },
    find: async (c, s, kind, id) => {
      const e = entries.get(id);
      if (!e) throw Object.assign(Error("Missing"), { status: 404 });
      return e;
    },
    update: async (c, s, kind, id, data) => entries.set(id, data),
    event: async () => {},
  });
  const path = "/organizations/:organizationId/branches/:branchId/guest-list",
    req = {
      params: { organizationId: "org", branchId: "a" },
      user: { id: "u" },
      body: {
        requestKey: randomUUID(),
        name: "Ada",
        partySize: 2,
        tradingDate: "2026-11-24",
      },
    };
  const entry = await call("post", path, req);
  assert.equal(entry.version, 1);
  const check = {
    ...req,
    params: { ...req.params, id: entry.id },
    body: { requestKey: randomUUID(), version: 1, count: 1 },
  };
  const arrived = await call("post", path + "/:id/check-in", check);
  assert.equal(arrived.arrivedCount, 1);
  assert.deepEqual(await call("post", path + "/:id/check-in", check), arrived);
  await assert.rejects(
    () =>
      call("post", path + "/:id/check-in", {
        ...check,
        body: { ...check.body, requestKey: randomUUID() },
      }),
    { code: "STALE_VERSION" },
  );
  await assert.rejects(
    () =>
      call("post", path + "/:id/check-in", {
        ...check,
        body: { requestKey: randomUUID(), version: 2, count: 2 },
      }),
    { status: 409 },
  );
  const del = { ...check, body: { requestKey: randomUUID(), version: 2 } };
  assert.equal((await call("delete", path + "/:id", del)).deleted, true);
  assert.equal((await call("delete", path + "/:id", del)).deleted, true);
  await assert.rejects(
    () =>
      call("post", path, {
        ...req,
        params: { ...req.params, organizationId: "other" },
      }),
    { status: 404 },
  );
});

test("overview counts no-shows using the existing reservation status contract", () => {
  const branch = {
    id: "a",
    name: "A",
    timezone: "UTC",
    cutoff: 0,
    settings: {},
  };
  const result = buildOverview(
    [branch],
    [
      {
        branch_id: "a",
        kind: "reservation",
        data: {
          status: "no-show",
          partySize: 2,
          startsAt: "2026-11-24T12:00:00Z",
          createdAt: "2026-11-23T12:00:00Z",
        },
      },
    ],
    { from: "2026-11-24", to: "2026-11-24" },
  );
  assert.equal(result.totals.reservations, 1);
  assert.equal(result.totals.noShows, 1);
});

test("counted variants use their product cost and legacy low-stock threshold", () => {
  const branch = {
    id: "a",
    name: "A",
    timezone: "UTC",
    cutoff: 0,
    settings: {},
  };
  const result = buildOverview(
    [branch],
    [
      {
        branch_id: "a",
        kind: "product",
        data: {
          id: "p",
          name: "Drink",
          stockMode: "unlimited",
          unitCost: 200,
          variants: [
            { id: "v", name: "Small", stockMode: "counted", stock: 3 },
          ],
        },
      },
    ],
    { from: "2026-11-24", to: "2026-11-24" },
  );
  assert.equal(result.stock.valueByBranch[0].value, 600);
  assert.equal(result.stock.lowStock[0].threshold, 5);
});
