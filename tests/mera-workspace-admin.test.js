import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mountMeraWorkspaceAdmin,
  customerActivityView,
  customerSummary,
} from "../server/mera/workspace-admin.js";
const B = "/organizations/:organizationId/branches/:branchId";
function fixture() {
  const handlers = new Map(),
    calls = [],
    events = [],
    branchInserts = [];
  const first = randomUUID(),
    second = randomUUID();
  const customers = [
    {
      organizationId: "org",
      branchId: "branch",
      guest_id: first,
      display_name: "Branch Ada",
      order_count: 1,
      reservation_count: 1,
      feedback_count: 1,
      last_at: new Date("2026-11-18T12:00:00Z"),
      consent: {
        marketing: true,
        explicit: true,
        recordedAt: "2026-11-18T12:00:00Z",
      },
    },
    {
      organizationId: "org",
      branchId: "branch",
      guest_id: second,
      display_name: "Branch Ben",
      order_count: 1,
      reservation_count: 0,
      feedback_count: 0,
      last_at: new Date("2026-11-18T11:00:00Z"),
      consent: { marketing: false, explicit: false },
    },
  ];
  const query = async (sql, p = []) => {
    calls.push({ sql, p });
    if (sql.startsWith("SELECT id FROM mera_organizations"))
      return { rows: p[0] === "org" ? [{ id: "org" }] : [] };
    if (sql.startsWith("INSERT INTO mera_branches")) {
      branchInserts.push(p);
      return { rows: [] };
    }
    if (sql.startsWith("SELECT u.id"))
      return {
        rows: [{ id: "staff-one", name: "Branch waiter", role: "waiter" }],
      };
    if (sql.startsWith("WITH activity")) {
      assert(sql.includes("organization_id=$1 AND branch_id=$2"));
      assert(sql.includes("EXISTS(SELECT 1 FROM mera_guests"));
      const scoped = customers.filter(
        (c) => c.organizationId === p[0] && c.branchId === p[1],
      );
      return {
        rows: sql.includes("WHERE g.guest_id=$3")
          ? scoped.filter((c) => c.guest_id === p[2])
          : scoped.slice(0, p.at(-1)),
      };
    }
    if (sql.startsWith("SELECT kind,data")) {
      assert.equal(p[0], "org");
      assert.equal(p[1], "branch");
      return {
        rows: [
          {
            kind: "order",
            data: {
              id: "order",
              guestId: p[2],
              reference: "M-ONE",
              status: "submitted",
              total: 100,
              createdAt: "2026-11-18T12:00:00Z",
              note: "Private note",
              contact: "private@example.invalid",
              token_hash: "secret",
            },
          },
          {
            kind: "reservation",
            data: {
              id: "booking",
              guestId: p[2],
              status: "requested",
              partySize: 2,
              contact: "private@example.invalid",
              joiningCode: "secret",
            },
          },
          {
            kind: "complaint",
            data: {
              id: "feedback",
              guestId: p[2],
              category: "service",
              rating: 3,
              text: "Please review timing",
              status: "open",
              internalNote: "Private staff detail",
            },
          },
        ].slice(0, p[3]),
      };
    }
    throw Error(sql);
  };
  const router = {};
  for (const method of ["get", "post"])
    router[method] = (path, ...chain) => handlers.set(method + path, chain);
  mountMeraWorkspaceAdmin(router, {
    db: { query, transaction: (fn) => fn({ query }) },
    guard: (permission) => (req, res, next) => {
      if (!req.permissions.includes(permission))
        throw Object.assign(Error("Forbidden"), { status: 403 });
      next();
    },
    scope: (req) => ({
      organizationId: req.params.organizationId,
      branchId: req.params.branchId,
    }),
    event: async (...args) => events.push(args),
  });
  return {
    first,
    calls,
    events,
    branchInserts,
    async call(
      method,
      path,
      body,
      {
        branch = "branch",
        org = "org",
        guestId = first,
        query = {},
        permissions = ["organization.manage", "orders.assign"],
        orgWide = true,
      } = {},
    ) {
      let status = 200,
        value;
      const req = {
        body,
        query,
        params: { organizationId: org, branchId: branch, guestId },
        permissions,
        meraMembership: { organization_wide: orgWide },
        user: { id: "owner" },
      };
      const res = {
        status(n) {
          status = n;
          return this;
        },
        set() {
          return this;
        },
        json(data) {
          value = data;
          return this;
        },
      };
      for (const fn of handlers.get(method + path))
        await fn(req, res, () => {});
      return { status, value };
    },
  };
}
test("branch creation is organization-wide draft-only and never charges or publishes", async () => {
  const f = fixture();
  await assert.rejects(
    f.call(
      "post",
      "/organizations/:organizationId/branches",
      { name: "Draft branch" },
      { orgWide: false },
    ),
    (e) => e.status === 403,
  );
  const result = await f.call(
    "post",
    "/organizations/:organizationId/branches",
    {
      name: "Draft branch",
      timezone: "Africa/Lagos",
      currency: "NGN",
      serviceModes: ["counter_takeaway"],
      cutoff: 240,
    },
  );
  assert.equal(result.status, 201);
  assert.equal(result.value.menuVersion, 0);
  assert.equal(result.value.published, false);
  assert.equal(result.value.chargesApplied, false);
  assert.equal(result.value.settings.orderingPaused, true);
  assert.equal(result.value.settings.reservationsEnabled, false);
  assert.equal(f.branchInserts.length, 1);
  assert.equal(f.events.length, 1);
  await assert.rejects(
    f.call("post", "/organizations/:organizationId/branches", {
      name: "Wrong currency",
      currency: "USD",
    }),
  );
});
test("assignment candidates expose only branch-authorized IDs and names under orders.assign", async () => {
  const f = fixture();
  await assert.rejects(
    f.call("get", B + "/service-staff", undefined, {
      permissions: ["menu.edit"],
    }),
    (e) => e.status === 403,
  );
  const result = await f.call("get", B + "/service-staff");
  assert.deepEqual(result.value.staff, [
    { id: "staff-one", name: "Branch waiter" },
  ]);
  const sql = f.calls.at(-1);
  assert(sql.sql.includes("m.organization_wide=true OR m.branch_ids ? $2"));
  assert.deepEqual(sql.p, ["org", "branch"]);
});
test("customer list is bounded, branch-scoped and cursor cannot cross scope", async () => {
  const f = fixture();
  const result = await f.call("get", B + "/customers", undefined, {
    query: { take: "1" },
  });
  assert.equal(result.value.customers.length, 1);
  assert(result.value.nextCursor);
  assert.equal(result.value.customers[0].contactVerified, false);
  assert.deepEqual(result.value.customers[0].consent, {
    marketing: true,
    explicit: true,
    recordedAt: "2026-11-18T12:00:00Z",
    deliveryAvailable: false,
  });
  await assert.rejects(
    f.call("get", B + "/customers", undefined, {
      branch: "other",
      query: { cursor: result.value.nextCursor },
    }),
    (e) => e.status === 400,
  );
  await assert.rejects(
    f.call("get", B + "/customers", undefined, { query: { take: "51" } }),
  );
  assert.equal(
    (await f.call("get", B + "/customers", undefined, { branch: "other" }))
      .value.customers.length,
    0,
  );
});
test("customer detail excludes contacts, private notes and joining/token secrets", async () => {
  const f = fixture();
  const result = await f.call("get", B + "/customers/:guestId");
  const text = JSON.stringify(result.value);
  assert(!text.includes("private@example.invalid"));
  assert(!text.includes("Private staff detail"));
  assert(!text.includes("Private note"));
  assert(!text.includes("joiningCode"));
  assert(!text.includes("token_hash"));
  assert.equal(result.value.orders.length, 1);
  assert.equal(result.value.reservations.length, 1);
  assert.equal(result.value.feedback.length, 1);
  await assert.rejects(
    f.call("get", B + "/customers/:guestId", undefined, { branch: "other" }),
    (e) => e.status === 404,
  );
  await assert.rejects(
    f.call("get", B + "/customers/:guestId", undefined, {
      query: { take: 51 },
    }),
  );
});
test("projection does not turn implicit consent or unrelated fields into contact claims", () => {
  const result = customerSummary({
    guest_id: randomUUID(),
    display_name: null,
    order_count: 0,
    reservation_count: 0,
    feedback_count: 0,
    last_at: new Date(),
    consent: { marketing: true, explicit: false, token_hash: "secret" },
  });
  assert.equal(result.consent.marketing, false);
  assert.equal(result.consent.explicit, false);
  assert.equal(result.consent.recordedAt, null);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(customerActivityView("visit", { joiningCode: "secret" }), null);
});
