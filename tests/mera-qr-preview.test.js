import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createPreviewTokens, PREVIEW_TTL_MS, previewWriteGuard, mountMeraQrPreview } from "../server/mera/qr-preview.js";

const org = "10000000-0000-4000-8000-000000000001";
const branch = "20000000-0000-4000-8000-000000000001";
const table = "30000000-0000-4000-8000-000000000001";
test("staff preview tokens expire within thirty minutes and bind organization, branch and target", () => {
  let stamp = 1000;
  const tokens = createPreviewTokens("test-secret", () => stamp);
  const token = tokens.issue(org, branch, "table:" + table);
  assert.equal(tokens.verify(token, org, branch).target, "table:" + table);
  assert.throws(() => tokens.verify(token, "another-org", branch), { code: "PREVIEW_EXPIRED" });
  assert.throws(() => tokens.verify(token, org, "another-branch"), { code: "PREVIEW_EXPIRED" });
  assert.throws(() => tokens.verify(token + "x", org, branch), { code: "PREVIEW_EXPIRED" });
  stamp += PREVIEW_TTL_MS;
  assert.throws(() => tokens.verify(token, org, branch), { code: "PREVIEW_EXPIRED" });
});
test("every public preview write rejects before guest sessions or mutations, even expired tokens", () => {
  for (const path of ["/guests", "/orders", "/help", "/reservations", "/orders/id/feedback", "/consent"]) {
    for (const token of ["valid", "expired", ""]) {
      let status, body, proceeded = false;
      const res = { status(value) { status = value; return this; }, json(value) { body = value; } };
      previewWriteGuard({ method: path === "/consent" ? "PUT" : "POST", path, query: { preview: token } }, res, () => { proceeded = true; });
      assert.equal(status, 403);
      assert.equal(body.code, "PREVIEW_ONLY");
      assert.equal(proceeded, false);
    }
  }
  let proceeded = false;
  previewWriteGuard({ method: "GET", query: { preview: "token" } }, {}, () => { proceeded = true; });
  assert.equal(proceeded, true);
});
test("QR preview projects capabilities, draft warning and a bound staff link without writing records", async () => {
  const oldDemo = process.env.MERA_DEMO;
  process.env.MERA_DEMO = "true";
  try {
    const router = express.Router(), tokens = createPreviewTokens("secret");
    let permission;
    mountMeraQrPreview(router, {
      db: { query: async sql => ({ rows: sql.includes("mera_branches") ? [{ id: branch, settings: { capabilities: ["qr_ordering"] }, menu_version: 0 }] : [{ id: org, slug: "fictional-shop" }] }) },
      guard: value => { permission = value; return (_req, _res, next) => next(); },
      scope: () => ({ organizationId: org, branchId: branch }),
      find: async (_db, s, kind, id) => { assert.equal(s.branchId, branch); assert.equal(kind, "table"); assert.equal(id, table); return { id, name: "Table 1" }; },
      tokens,
    });
    const handler = router.stack[0].route.stack.at(-1).handle;
    let response;
    const res = { set() { return this; }, json(value) { response = value; } };
    await handler({ query: { target: "table:" + table }, protocol: "http", get: () => "localhost" }, res);
    assert.ok(permission.includes("qr.manage"));
    assert.equal(response.opensAs, "counter_pickup");
    assert.equal(response.menuPublished, false);
    assert.ok(response.warnings.includes("Menu not published yet"));
    const url = new URL(response.url);
    assert.equal(url.searchParams.get("tableId"), table);
    assert.equal(tokens.verify(url.searchParams.get("preview"), org, branch).target, "table:" + table);
  } finally {
    oldDemo === undefined ? delete process.env.MERA_DEMO : process.env.MERA_DEMO = oldDemo;
  }
});

test("public staff preview serves an unpublished draft without releasing holds or creating a guest", async () => {
  const { createMeraRouter } = await import("../server/mera/index.js");
  const b = { id: branch, organization_id: org, timezone: "Africa/Lagos", settings: { showSoldOut: true, capabilities: ["qr_ordering"] }, menu_version: 0, published_menu: [] };
  const organization = { id: org, slug: "fictional-shop", name: "Fictional shop", onboarding: {} };
  const product = { id: table, name: "Draft item", available: true, stockMode: "unlimited", stock: 0, variants: [], unitCost: 123 };
  let writes = 0;
  const db = {
    transaction() { writes++; throw new Error("Preview must not mutate holds"); },
    async query(sql, args) {
      if (sql.includes("mera_organizations")) return { rows: [organization] };
      if (sql.includes("mera_branches")) return { rows: [b] };
      if (sql.includes("mera_records")) return { rows: args[2] === "product" ? [{ data: product }] : [] };
      throw new Error("Unexpected query: " + sql);
    },
  };
  const router = createMeraRouter(db);
  const previewRoute = router.stack.find(layer => layer.route?.path.endsWith("/qr-preview")).route;
  const menuRoute = router.stack.find(layer => layer.route?.path === "/public/:slug/:branchId/menu").route;
  const oldDemo = process.env.MERA_DEMO, oldOrigin = process.env.MERA_PUBLIC_ORIGIN;
  process.env.MERA_DEMO = "false";
  process.env.MERA_PUBLIC_ORIGIN = "https://fictional.example";
  try {
    let response;
    const res = { set() { return this; }, json(value) { response = value; } };
    await previewRoute.stack.at(-1).handle({ params: { organizationId: org, branchId: branch }, query: { target: "counter" } }, res);
    const token = new URL(response.url).searchParams.get("preview");
    const req = { params: { slug: "fictional-shop", branchId: branch }, query: { preview: token } };
    await menuRoute.stack.at(-1).handle(req, res);
    assert.equal(response.preview, true);
    assert.equal(response.previewMessage, "Preview, orders are off");
    assert.equal(response.products[0].name, "Draft item");
    assert.equal(Object.hasOwn(response.products[0], "unitCost"), false);
    assert.equal(response.orderingAvailable, false);
    assert.equal(response.reservationPolicy.enabled, false);
    assert.equal(writes, 0);
    await assert.rejects(() => menuRoute.stack.at(-1).handle({ ...req, query: {} }, res), /Menu not found/);
  } finally {
    for (const [key, old] of [["MERA_DEMO", oldDemo], ["MERA_PUBLIC_ORIGIN", oldOrigin]]) old === undefined ? delete process.env[key] : process.env[key] = old;
  }
});
