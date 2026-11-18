import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mountMeraPlatformSupport } from "../server/mera/platform-support.js";
const O = "/organizations/:organizationId/support-cases";
function fixture() {
  const rows = [],
    audits = [],
    handlers = new Map();
  const branchId = randomUUID();
  const query = async (sql, p = []) => {
    if (sql.includes("FROM mera_organizations"))
      return { rows: p[0] === "orgA" ? [{ id: "orgA" }] : [] };
    if (sql.includes("FROM mera_branches"))
      return {
        rows:
          p[0] === "orgA" && (!p[1] || p[1] === branchId)
            ? [{ id: branchId }]
            : [],
      };
    if (sql.startsWith("SELECT") && sql.includes("mera_records"))
      return {
        rows: rows.filter((r) =>
          sql.includes("WHERE id=$1")
            ? r.id === p[0]
            : !p[0] || r.organization_id === p[0],
        ),
      };
    if (sql.startsWith("INSERT")) {
      rows.push({
        id: p[0],
        organization_id: p[1],
        branch_id: p[2],
        data: JSON.parse(p[3]),
      });
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE")) {
      rows.find((r) => r.id === p[1]).data = JSON.parse(p[0]);
      return { rows: [] };
    }
    throw Error(sql);
  };
  const db = { query, transaction: (fn) => fn({ query }) },
    router = {};
  for (const method of ["get", "post", "patch"])
    router[method] = (path, ...chain) => handlers.set(method + path, chain);
  mountMeraPlatformSupport(router, {
    db,
    guard: (permission) => (req, res, next) => {
      assert.equal(permission, "organization.manage");
      if (!req.allowed)
        throw Object.assign(Error("Forbidden"), { status: 403 });
      next();
    },
    platformGuard: (req, res, next) => {
      if (!req.operator)
        throw Object.assign(Error("Operator required"), { status: 403 });
      next();
    },
    platformAudit: async (c, req, action, org, details) =>
      audits.push({ actor: req.user.id, action, org, details }),
  });
  return {
    rows,
    audits,
    branchId,
    async call(method, path, body, opts = {}) {
      let status = 200,
        value;
      const req = {
        params: { organizationId: opts.org || "orgA", id: opts.id },
        body,
        user: { id: opts.actor || "merchant" },
        allowed: opts.allowed ?? true,
        operator: opts.operator ?? false,
        meraMembership: { organization_wide: opts.orgWide ?? true },
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
      for (const handler of handlers.get(method + path))
        await handler(req, res, () => {});
      return { status, value };
    },
  };
}
const input = () => ({
  requestKey: randomUUID(),
  subject: "Printer setup help",
  topic: "integration",
  message: "Please review our setup.",
});
test("merchant creation is actor-bound idempotent, branch scoped and not externally delivered", async () => {
  const f = fixture(),
    body = input();
  const first = await f.call("post", O, body);
  assert.equal(first.status, 201);
  assert.equal(first.value.externalDelivery, false);
  assert.equal(first.value.branchId, f.branchId);
  f.rows[0].data.intent = Object.fromEntries(
    Object.entries(f.rows[0].data.intent).reverse(),
  );
  assert.equal((await f.call("post", O, body)).value.id, first.value.id);
  assert.equal(f.rows.length, 1);
  await assert.rejects(
    f.call("post", O, body, { actor: "other" }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    f.call("post", O, { ...body, message: "Changed" }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    f.call("post", O, { ...input(), branchId: randomUUID() }),
    (e) => e.status === 404,
  );
  await assert.rejects(
    f.call("get", O, undefined, { orgWide: false }),
    (e) => e.status === 403,
  );
  assert.equal(
    (await f.call("get", O, undefined, { org: "orgB" })).value.cases.length,
    0,
  );
  assert.equal(f.audits.length, 1);
});
test("platform updates require operator, fresh version and visible resolution reply; notes remain private", async () => {
  const f = fixture(),
    created = (await f.call("post", O, input())).value;
  await assert.rejects(
    f.call("get", "/platform/support-cases"),
    (e) => e.status === 403,
  );
  await assert.rejects(
    f.call(
      "patch",
      "/platform/support-cases/:id",
      {
        version: 1,
        status: "resolved",
        internalNote: "Private operator details",
      },
      { id: created.id, operator: true },
    ),
    /visible reply/,
  );
  const updated = await f.call(
    "patch",
    "/platform/support-cases/:id",
    {
      version: 1,
      status: "in_progress",
      customerReply: "Reviewing your setup",
      internalNote: "Private operator details",
    },
    { id: created.id, operator: true, actor: "operator" },
  );
  assert.equal(updated.value.version, 2);
  await assert.rejects(
    f.call(
      "patch",
      "/platform/support-cases/:id",
      { version: 1, status: "resolved", customerReply: "Done" },
      { id: created.id, operator: true },
    ),
    /changed/,
  );
  const merchant = (await f.call("get", O)).value.cases[0];
  assert.equal(merchant.customerReply, "Reviewing your setup");
  assert.equal("internalNotes" in merchant, false);
  assert.equal("createdBy" in merchant, false);
  assert.equal(
    JSON.stringify(merchant).includes("Private operator details"),
    false,
  );
  assert.equal(JSON.stringify(merchant).includes("actorId"), false);
  assert.equal(f.audits.at(-1).actor, "operator");
});
