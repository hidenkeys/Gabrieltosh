import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMeraRouter } from "../server/mera/index.js";
import { permissions } from "../shared/mera-contracts.js";

function fixture({ expiredHold = false } = {}) {
  const organizationId = randomUUID(), branchId = randomUUID(), visitId = randomUUID(), componentId = randomUUID(), packageId = randomUUID(), reservationId = randomUUID();
  const component = { id: componentId, kind: "single", name: "Fictional bottle", price: 1000, size: "Bottle", available: true, stockMode: "counted", stock: 20, station: "bar", variants: [], modifierGroups: [] };
  const bundle = { id: packageId, kind: "package", name: "Fictional table package", price: 5000, available: true, stockMode: "unlimited", stock: 0, station: "kitchen", variants: [], modifierGroups: [], requiresTable: true, components: [{ productId: componentId, variantId: null, quantity: 3 }] };
  const branch = { id: branchId, organization_id: organizationId, menu_version: 1, published_menu: [component, bundle], timezone: "Africa/Lagos", settings: { holdMinutes: 10 } };
  const organization = { subscription: { status: "active" }, policy: { includedBranches: 1, version: "fictional-policy" } };
  let rows = [component, bundle].map(data => ({ id: data.id, organization_id: organizationId, branch_id: branchId, kind: "product", data: structuredClone(data) }));
  rows.push({ id: visitId, organization_id: organizationId, branch_id: branchId, kind: "visit", data: { id: visitId, status: "open", guestIds: [] } });
  rows.push({id:reservationId,organization_id:organizationId,branch_id:branchId,kind:"reservation",data:{id:reservationId,status:"confirmed"}});
  if (expiredHold) {
    rows.find(
      (row) => row.kind === "product" && row.id === componentId,
    ).data.stock = 17;
    const oldId = randomUUID();
    rows.push({
      id: oldId,
      organization_id: organizationId,
      branch_id: branchId,
      kind: "order",
      data: {
        id: oldId,
        status: "submitted",
        stockHeld: true,
        holdExpired: false,
        holdExpiresAt: "2000-01-01T00:00:00Z",
        version: 1,
        items: [{ productId: componentId, quantity: 3 }],
        total: 3000,
        paid: 0,
        refunded: 0,
        paymentStatus: "unpaid",
        history: [],
      },
    });
  }
  const member = { role: "owner", organization_wide: true, branch_ids: [], permissions };
  const db = {
    async transaction(fn) { const before = structuredClone(rows); try { return await fn(db); } catch (error) { rows = before; throw error; } },
    async query(sql, args = []) {
      let result;
      if (sql.includes("mera_memberships")) result = [member];
      else if (sql.includes("COUNT(*)")) result = [{ count: 1 }];
      else if (sql.includes("mera_branches")) result = [branch];
      else if (sql.includes("mera_organizations")) result = [organization];
      else if (sql.startsWith("INSERT INTO mera_records")) {
        const [id, org, location, kind, json] = args;
        rows.push({ id, organization_id: org, branch_id: location, kind, data: JSON.parse(json) });
        result = [];
      } else if (sql.startsWith("UPDATE mera_records")) {
        const [json, id, org, location, kind] = args;
        const row = rows.find(r => r.id === id && r.organization_id === org && r.branch_id === location && r.kind === kind);
        if (row) row.data = JSON.parse(json);
        result = row ? [{ id }] : [];
      } else if (sql.includes("mera_records")) {
        if (sql.includes("WHERE id=$1")) {
          const kind = sql.match(/kind='([^']+)'/)?.[1] || args[3];
          result = rows.filter(r => r.id === args[0] && r.organization_id === args[1] && r.branch_id === args[2] && r.kind === kind);
        } else {
          const literalKind = sql.match(/kind='([^']+)'/)?.[1];
          const kind = literalKind || args[2];
          result = rows.filter(r => r.organization_id === args[0] && r.branch_id === args[1] && r.kind === kind);
          if (sql.includes("data ? 'requestKey'")) result = result.filter(r => r.data.requestKey === args[3]);
          if (kind === "order_request_resolution") result = [];
          if (sql.includes("data->'charges' @>")) result = result.filter(r => r.data.charges?.some(c => c.orderId === JSON.parse(args[2])[0].orderId));
          if (sql.includes("data->>'visitId'=$3")) result = result.filter(r => r.data.visitId === args[2] && r.data.status === "open");
        }
      } else throw new Error("Unexpected SQL: " + sql);
      return { rows: structuredClone(result) };
    },
  };
  const router = createMeraRouter(db), B = "/organizations/:organizationId/branches/:branchId";
  async function invoke(path, body, extra = {}) {
    const route = router.stack.find(layer => layer.route?.path === B + path && layer.route.methods.post).route;
    let response;
    const res = { status() { return this; }, json(value) { response = value; } };
    await route.stack.at(-1).handle({ params: { organizationId, branchId, ...extra }, body, user: { id: "fictional-owner", name: "Fictional owner" } }, res);
    return response;
  }
  return { invoke, packageId, componentId, visitId, reservationId, records: kind => rows.filter(r => r.kind === kind).map(r => structuredClone(r.data)) };
}

test("real package checkout holds component quantity and cancelling restores persisted stock", async () => {
  const f = fixture();
  const body = { requestKey: randomUUID(), menuVersion: 1, displayName: "Fictional guest", fulfillment: "table_service", visitId: f.visitId, items: [{ productId: f.packageId, quantity: 2 }] };
  const order = await f.invoke("/orders", body);
  assert.equal(order.total, 10000);
  assert.equal(order.stockHeld, true);
  assert.equal(f.records("product").find(p => p.id === f.componentId).stock, 14);
  assert.equal(f.records("product").find(p => p.id === f.packageId).stock, 0);
  assert.equal(f.records("stock_movement")[0].quantity, -6);
  assert.equal(f.records("ticket")[0].station, "bar");
  assert.equal(f.records("ticket")[0].items[0].components[0].name, "Fictional bottle");
  const replay = await f.invoke("/orders", body);
  assert.equal(replay.id, order.id);
  assert.equal(f.records("product").find(p => p.id === f.componentId).stock, 14);
  const cancelled = await f.invoke("/orders/:id/status", { status: "cancelled", version: order.version }, { id: order.id });
  assert.equal(cancelled.stockHeld, false);
  assert.equal(f.records("product").find(p => p.id === f.componentId).stock, 20);
  assert.equal(f.records("order")[0].status, "cancelled");
});

test("real package checkout requires a validated open table visit and leaves stock untouched on denial", async () => {
  const f = fixture();
  const body = { requestKey: randomUUID(), menuVersion: 1, displayName: "Fictional guest", items: [{ productId: f.packageId, quantity: 1 }] };
  await assert.rejects(() => f.invoke("/orders", body), /table/i);
  await assert.rejects(() => f.invoke("/orders", { ...body, fulfillment: "table_service", visitId: randomUUID() }), {status:403});
  assert.equal(f.records("product").find(p => p.id === f.componentId).stock, 20);
  assert.equal(f.records("order").length, 0);
});

 test("table packages accept a same-location confirmed reservation and reject an unknown one",async()=>{
 const f=fixture(),body={requestKey:randomUUID(),menuVersion:1,displayName:"Fictional guest",reservationId:f.reservationId,items:[{productId:f.packageId,quantity:1}]};
 await assert.rejects(()=>f.invoke("/orders",{...body,reservationId:randomUUID()}),/Record not found/);
 const order=await f.invoke("/orders",body);assert.equal(order.reservationId,f.reservationId);
 assert.equal(f.records("product").find(p=>p.id===f.componentId).stock,17);
 });

test("package quote accepts a current table visit and counter quote stays blocked", async () => {
  const f = fixture();
  const base = {
    menuVersion: 1,
    items: [{ productId: f.packageId, quantity: 1 }],
  };
  await assert.rejects(
    () => f.invoke("/quote", base),
    (error) => error.status === 409 && error.code === "TABLE_REQUIRED",
  );
  await assert.rejects(
    () =>
      f.invoke("/quote", {
        ...base,
        fulfillment: "table_service",
        visitId: randomUUID(),
      }),
    (error) => error.status === 403,
  );
  assert.equal(
    (
      await f.invoke("/quote", {
        ...base,
        fulfillment: "table_service",
        visitId: f.visitId,
      })
    ).total,
    5000,
  );
  assert.equal(
    (await f.invoke("/quote", { ...base, reservationId: f.reservationId }))
      .total,
    5000,
  );
  assert.equal(
    f.records("product").find((row) => row.id === f.componentId).stock,
    20,
    "Quote does not reserve or deduct stock",
  );
});

test("checkout atomically restores expired old holds before deducting the new package", async () => {
  const f = fixture({ expiredHold: true });
  const before = f
    .records("product")
    .find((row) => row.id === f.componentId).stock;
  const order = await f.invoke("/orders", {
    requestKey: randomUUID(),
    menuVersion: 1,
    displayName: "Fictional new party",
    fulfillment: "table_service",
    visitId: f.visitId,
    items: [{ productId: f.packageId, quantity: 1 }],
  });
  const old = f.records("order").find((row) => row.id !== order.id);
  assert.equal(old.holdExpired, true);
  assert.equal(old.stockHeld, false);
  assert.equal(
    f.records("stock_movement")[0].quantity,
    -3,
    "The new package still deducts all three components exactly once",
  );
  assert.equal(
    f.records("product").find((row) => row.id === f.componentId).stock,
    before + 3 - 3,
  );
});
