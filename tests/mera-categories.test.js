import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mountMeraCategories,
  validateCategoryGraph,
} from "../server/mera/categories.js";
const category = (name, parentId = null) => ({
  id: randomUUID(),
  name,
  parentId,
  sortOrder: 0,
  active: true,
  version: 1,
});
test("category hierarchy rejects cycles, missing scoped parents and duplicate sibling names", () => {
  const a = category("Drinks"),
    b = category("Tea", a.id);
  assert.throws(
    () => validateCategoryGraph([{ ...a, parentId: b.id }, b]),
    /cycle/,
  );
  assert.throws(
    () => validateCategoryGraph([{ ...a, parentId: randomUUID() }]),
    /not in this branch/,
  );
  assert.throws(() => validateCategoryGraph([a, category("drinks")]), /unique/);
  validateCategoryGraph([a, b, category("Tea")]);
});
test("reparenting includes descendant depth, and retirement protects children and products", () => {
  const chain = [];
  for (let i = 0; i < 6; i++)
    chain.push(category("Level " + i, chain.at(-1)?.id || null));
  validateCategoryGraph(chain);
  assert.throws(
    () =>
      validateCategoryGraph([...chain, category("Too deep", chain.at(-1).id)]),
    /six levels/,
  );
  const other = category("Other");
  assert.throws(
    () =>
      validateCategoryGraph([
        ...chain.map((c, i) => (i === 0 ? { ...c, parentId: other.id } : c)),
        other,
      ]),
    /six levels/,
  );
  assert.throws(
    () => validateCategoryGraph([{ ...chain[0], active: false }, chain[1]]),
    /active parent|active child/,
  );
  assert.throws(
    () =>
      validateCategoryGraph(
        [{ ...other, active: false }],
        [{ categoryId: other.id }],
      ),
    /Reassign referenced/,
  );
});
function fixture() {
  const handlers = new Map(),
    rows = [];
  const scope = (req) => ({
    organizationId: req.params.organizationId,
    branchId: req.params.branchId,
  });
  const guards = [];
  const router = {};
  for (const method of ["get", "post", "patch"])
    router[method] = (path, ...middleware) =>
      handlers.set(method + path, middleware.at(-1));
  const deps = {
    db: {},
    scope,
    guard: (permission) => {
      guards.push(permission);
      return () => {};
    },
    locked: async (s, callback) => callback({}),
    readRecords: async (c, org, branch, kind) =>
      rows.filter(
        (r) => r.org === org && r.branch === branch && r.kind === kind,
      ),
    record: async (c, s, kind, data) => {
      const value = { ...data, id: randomUUID() };
      rows.push({
        org: s.organizationId,
        branch: s.branchId,
        kind,
        data: value,
      });
      return value;
    },
    find: async (c, s, kind, id) => {
      const row = rows.find(
        (r) =>
          r.org === s.organizationId &&
          r.branch === s.branchId &&
          r.kind === kind &&
          r.data.id === id,
      );
      if (!row) throw Object.assign(Error("Record not found"), { status: 404 });
      return row.data;
    },
    update: async (c, s, kind, id, data) => {
      const row = rows.find(
        (r) =>
          r.org === s.organizationId &&
          r.branch === s.branchId &&
          r.kind === kind &&
          r.data.id === id,
      );
      row.data = data;
    },
    event: async () => {},
  };
  mountMeraCategories(router, deps);
  return {
    rows,
    guards,
    async call(method, body, branch = "branchA", id) {
      let status = 200,
        data;
      const response = {
        status(value) {
          status = value;
          return this;
        },
        json(value) {
          data = value;
          return this;
        },
      };
      await handlers.get(
        method +
          "/organizations/:organizationId/branches/:branchId/categories" +
          (id ? "/:id" : ""),
      )(
        {
          params: { organizationId: "orgA", branchId: branch, id },
          body,
          user: { id: "owner" },
        },
        response,
      );
      return { status, data };
    },
  };
}
test("category routes scope parent references, enforce menu permission and reject stale writes", async () => {
  const f = fixture();
  assert.deepEqual(f.guards, ["menu.edit", "menu.edit", "menu.edit"]);
  const parent = (await f.call("post", { name: "Drinks" })).data;
  await assert.rejects(
    f.call("post", { name: "Tea", parentId: parent.id }, "branchB"),
    (e) => e.status === 404,
  );
  const child = (await f.call("post", { name: "Tea", parentId: parent.id }))
    .data;
  await assert.rejects(
    f.call("patch", { version: 2, name: "Other" }, "branchA", child.id),
    /changed/,
  );
  assert.equal(
    (await f.call("get", undefined, "branchB")).data.categories.length,
    0,
  );
  await assert.rejects(
    f.call("patch", { version: 1, parentId: child.id }, "branchA", parent.id),
    /cycle/,
  );
  const updated = await f.call(
    "patch",
    { version: 1, name: "Iced tea" },
    "branchA",
    child.id,
  );
  assert.equal(updated.data.version, 2);
  await assert.rejects(
    f.call("patch", { version: 1, name: "Secret" }, "branchB", child.id),
    (e) => e.status === 404,
  );
});
