import test from "node:test";
import assert from "node:assert/strict";
import {
  memberUpdateSchema,
  validateMemberAssignment,
} from "../server/mera/member-assignment.js";
import { authorizeAccessTarget } from "../server/mera/access-attempts.js";
import { rolePermissions } from "../shared/mera-contracts.js";
const branch = "20000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000002";
const req = {
  params: { organizationId: "org" },
  user: { id: "actor" },
  meraMembership: { role: "owner", permissions: rolePermissions.owner },
};
const input = {
  requestKey: "30000000-0000-4000-8000-000000000001",
  version: 1,
  role: "cashier",
  branchIds: [branch],
  organizationWide: false,
  branch_roles: { [branch]: { role: "waiter" } },
};
const c = {
  query: async (sql, args) => ({
    rows: sql.includes("mera_branches") ? [{ id: branch }] : [],
  }),
};
test("existing member assignment requires request key/version, rejects mixed status edits and normalizes branch IDs", () => {
  assert.equal(
    memberUpdateSchema.safeParse({ ...input, requestKey: undefined }).success,
    false,
  );
  assert.equal(
    memberUpdateSchema.safeParse({ ...input, version: undefined }).success,
    false,
  );
  assert.equal(
    memberUpdateSchema.safeParse({ ...input, active: false }).success,
    false,
  );
  assert.deepEqual(
    memberUpdateSchema.parse({ ...input, branchIds: [branch, branch] })
      .branchIds,
    [branch],
  );
});
test("assignment derives base and location permissions from authoritative roles", async () => {
  const result = await validateMemberAssignment(c, req, input);
  assert.deepEqual(result.permissions, [...rolePermissions.cashier].sort());
  assert.deepEqual(
    result.branchRoles[branch].permissions,
    [...rolePermissions.waiter].sort(),
  );
});
test("cross-organization base and override locations are denied", async () => {
  for (const body of [
    { ...input, branchIds: [other] },
    { ...input, branch_roles: { [other]: { role: "waiter" } } },
  ])
    await assert.rejects(
      validateMemberAssignment(c, req, body),
      (e) => e.status === 403,
    );
  await assert.rejects(
    authorizeAccessTarget(c, req, "membership_update", "foreign", input),
    (e) => e.status === 404,
  );
});
test("cannot elevate base role, branch role or explicit permissions beyond actor authority", async () => {
  const limited = {
    ...req,
    meraMembership: {
      role: "organization_admin",
      permissions: ["members.manage", ...rolePermissions.waiter],
    },
  };
  for (const body of [
    { ...input, role: "owner" },
    { ...input, role: "waiter", branch_roles: { [branch]: { role: "owner" } } },
    {
      ...input,
      role: "waiter",
      branch_roles: {
        [branch]: { role: "waiter", permissions: ["members.manage"] },
      },
    },
  ])
    await assert.rejects(
      validateMemberAssignment(c, limited, body),
      (e) => e.status === 403,
    );
});
test("target authority includes branch overrides; owners and self editing are protected", async () => {
  const limited = {
    ...req,
    meraMembership: {
      role: "organization_admin",
      permissions: rolePermissions.owner,
    },
  };
  for (const target of [
    { user_id: "peer", role: "owner", permissions: [] },
    {
      user_id: "peer",
      role: "waiter",
      permissions: [],
      branch_roles: { [branch]: { role: "owner", permissions: [] } },
    },
  ])
    await assert.rejects(
      authorizeAccessTarget(
        { query: async () => ({ rows: [target] }) },
        limited,
        "membership_update",
        "member",
        input,
      ),
      (e) => e.status === 403,
    );
  await assert.rejects(
    authorizeAccessTarget(
      {
        query: async () => ({
          rows: [{ user_id: "actor", role: "cashier", permissions: [] }],
        }),
      },
      req,
      "membership_update",
      "member",
      input,
    ),
    (e) => e.code === "SELF_ACCESS_CHANGE",
  );
});

test("member PATCH enforces version, exact replay, audit and tenant boundary without a listener", async () => {
  const { createMeraRouter } = await import("../server/mera/index.js");
  let target = {
    id: "member",
    user_id: "peer",
    organization_id: "org",
    role: "waiter",
    permissions: rolePermissions.waiter,
    branch_ids: [branch],
    branch_roles: {},
    active: true,
    version: 1,
  };
  const records = [];
  const db = {
    transaction: async (fn) => fn(db),
    query: async (sql, args) => {
      if (sql.includes("SELECT id FROM mera_organizations"))
        return { rows: [{ id: args[0] }] };
      if (sql.includes("SELECT m.*"))
        return {
          rows: [
            { ...req.meraMembership, organization_wide: true, active: true },
          ],
        };
      if (sql.includes("SELECT * FROM mera_memberships"))
        return {
          rows:
            args[0] === target.organization_id && args[1] === target.id
              ? [structuredClone(target)]
              : [],
        };
      if (sql.includes("data->>'requestKey'"))
        return {
          rows: records
            .filter(
              (r) =>
                r.kind === args[1] &&
                r.data.requestKey === args[2] &&
                r.data.actorId === args[3],
            )
            .map((r) => ({ data: r.data })),
        };
      if (sql.includes("SELECT id FROM mera_branches"))
        return { rows: [{ id: branch }] };
      if (sql.startsWith("UPDATE mera_memberships SET role=")) {
        target = {
          ...target,
          role: args[0],
          permissions: JSON.parse(args[1]),
          branch_ids: JSON.parse(args[2]),
          branch_roles: JSON.parse(args[3]),
          organization_wide: args[4],
          version: target.version + 1,
        };
        return { rows: [] };
      }
      if (sql.startsWith("INSERT INTO mera_records")) {
        records.push({ kind: args[3], data: JSON.parse(args[4]) });
        return { rows: [] };
      }
      throw Error("Unexpected assignment query");
    },
  };
  const router = createMeraRouter(db);
  const route = router.stack.find(
    (layer) =>
      layer.route?.path === "/organizations/:organizationId/members/:id" &&
      layer.route.methods.patch,
  ).route;
  const handler = route.stack.at(-1).handle;
  async function invoke(body, org = "org") {
    let result;
    await handler(
      {
        ...req,
        params: { organizationId: org, id: "member" },
        get: () => undefined,
        body,
      },
      {
        json: (value) => {
          result = value;
        },
      },
    );
    return result;
  }
  const first = await invoke(input);
  assert.equal(first.version, 2);
  assert.equal(target.role, "cashier");
  assert(
    records.some(
      (r) =>
        r.kind === "audit" && r.data.action === "membership_access_updated",
    ),
  );
  assert.deepEqual(
    await invoke(input),
    first,
    "exact replay returns recorded snapshot despite advanced version",
  );
  assert.equal(target.version, 2);
  await assert.rejects(
    invoke({ ...input, requestKey: "30000000-0000-4000-8000-000000000003" }),
    (e) => e.code === "STALE_VERSION",
  );
  await assert.rejects(
    invoke({ ...input, role: "bar" }),
    (e) => e.code === "IDEMPOTENCY_CONFLICT",
  );
  await assert.rejects(invoke(input, "foreign-org"), (e) => e.status === 404);
});
