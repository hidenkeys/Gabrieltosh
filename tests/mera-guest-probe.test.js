import test from "node:test";
import assert from "node:assert/strict";
import { createMeraRouter } from "../server/mera/index.js";

test("anonymous guest read is empty; invalid cookies and private writes remain unauthorized", async () => {
  const organization = { id: "org", slug: "venue", onboarding: { status: "published" } };
  const branch = { id: "branch", settings: { launchState: "published" } };
  let guestReads = 0;
  const db = { async query(sql) {
    if (sql.includes("mera_organizations")) return { rows: [organization] };
    if (sql.includes("mera_branches")) return { rows: [branch] };
    if (sql.includes("mera_guests")) { guestReads++; return { rows: [] }; }
    throw new Error("Unexpected database access");
  } };
  const router = createMeraRouter(db);
  const handler = (suffix, method) => router.stack.find(layer => layer.route?.path === "/public/:slug/:branchId" + suffix && layer.route.methods[method]).route.stack.at(-1).handle;
  const req = { params: { slug: "venue", branchId: "branch" }, query: {}, cookies: {}, get() {} };
  let response, cache;
  const res = { set(key, value) { cache = value; return this; }, json(value) { response = value; } };
  await handler("/guest", "get")(req, res);
  assert.deepEqual(response, { guest: null });
  assert.equal(cache, "no-store");
  assert.equal(guestReads, 0);
  await assert.rejects(handler("/guest", "get")({ ...req, cookies: { mera_guest_org: "invalid-test-session" } }, res), { status: 401, code: "GUEST_REQUIRED" });
  await assert.rejects(handler("/orders", "post")({ ...req, body: { marketing: false } }, res), { status: 401, code: "GUEST_REQUIRED" });
});
