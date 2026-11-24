import test from "node:test";
import assert from "node:assert/strict";
import { priceBreakdown,pricingPolicySchema,pricingItemsHash } from "../server/mera/pricing.js";
const policy={enabled:true,approved:true,version:"fixture-1",discount:{label:"Discount",type:"basis_points",value:1000},serviceCharge:{label:"Service",basisPoints:500},tax:{label:"Tax",basisPoints:1000,basis:"net_items_and_service"}};
test("canonical pricing discloses exact integer discount, service and tax arithmetic",()=>{
 const result=priceBreakdown(20000,policy);
 assert.equal(result.discount,2000);assert.equal(result.serviceCharge,900);assert.equal(result.tax,1890);assert.equal(result.total,20790);
 assert.equal(result.lines.reduce((n,l)=>n+l.amount,20000),result.total);
 assert.equal(result.policySnapshot,policy);
});
test("tax basis is explicit and total discount never creates a negative payable",()=>{
 assert.equal(priceBreakdown(20000,{...policy,tax:{...policy.tax,basis:"net_items"}}).tax,1800);
 const free=priceBreakdown(20000,{...policy,discount:{label:"Courtesy",type:"fixed",value:100000}});
 assert.equal(free.total,0);assert.equal(free.tax,0);assert.equal(free.serviceCharge,0);
 assert.throws(()=>priceBreakdown(10000,{...policy,approved:false}),/approved/);
 assert.equal(pricingPolicySchema.safeParse({...policy,version:undefined}).success,false);
});
test("quote intent binds quantity and variant while normalizing modifier order",()=>{
 const input={menuVersion:2,items:[{productId:"fixture",quantity:1,variantId:"large",modifiers:["b","a"]}]};
 assert.equal(pricingItemsHash(input),pricingItemsHash({...input,items:[{...input.items[0],modifiers:["a","b"]}]}));
 assert.notEqual(pricingItemsHash(input),pricingItemsHash({...input,items:[{...input.items[0],quantity:2}]}));
});
test("quote intent binds combo choices while normalizing their order",()=>{
 const first={groupId:"main",productId:"meal",variantId:null},second={groupId:"side",productId:"chips"};
 const input={menuVersion:2,items:[{productId:"combo",quantity:1,choices:[first,second]}]};
 assert.equal(pricingItemsHash(input),pricingItemsHash({...input,items:[{...input.items[0],choices:[second,first]}]}));
 assert.notEqual(pricingItemsHash(input),pricingItemsHash({...input,items:[{...input.items[0],choices:[{...first,productId:"other"},second]}]}));
});

test("guest package quotes require membership of an open same-location table or an owned confirmed reservation", async () => {
  const { randomUUID } = await import("node:crypto");
  const { createPricingQuote } = await import("../server/mera/pricing.js");
  const org = randomUUID(),
    branchId = randomUUID(),
    visitId = randomUUID(),
    reservationId = randomUUID(),
    guestId = randomUUID();
  const single = {
    id: randomUUID(),
    name: "Bottle",
    price: 1000,
    available: true,
    kind: "single",
    stockMode: "counted",
    stock: 10,
    variants: [],
    modifierGroups: [],
  };
  const pack = {
    ...single,
    id: randomUUID(),
    name: "VIP package",
    price: 5000,
    kind: "package",
    requiresTable: true,
    stockMode: "unlimited",
    components: [{ productId: single.id, quantity: 2 }],
  };
  const products = [single, pack];
  const visit = { id: visitId, status: "open", guestIds: [guestId] };
  const reservation = { id: reservationId, status: "confirmed", guestId };
  const scope = { organizationId: org, branchId };
  const db = {
    query: async (sql, args) => ({
      rows: sql.includes("mera_organizations")
        ? [{ platform_flags: {} }]
        : args[1] !== org || args[2] !== branchId
          ? []
          : sql.includes("kind='visit'") && args[0] === visitId
            ? [{ data: visit }]
            : sql.includes("kind='reservation'") && args[0] === reservationId
              ? [{ data: reservation }]
              : [],
    }),
  };
  const services = {
    locked: async (_scope, fn) =>
      fn(db, {
        menu_version: 1,
        settings: {},
        timezone: "Africa/Lagos",
        currency: "NGN",
        published_menu: products,
      }),
    readRecords: async () => products.map((data) => ({ data })),
    record: async (_c, _s, _kind, data) => ({ id: randomUUID(), ...data }),
  };
  const body = {
    menuVersion: 1,
    items: [{ productId: pack.id, quantity: 1 }],
    fulfillment: "table_service",
    visitId,
  };
  const quote = (input, guest = guestId, s = scope) =>
    createPricingQuote(services, s, input, null, guest);
  assert.equal((await quote(body)).total, 5000);
  await assert.rejects(
    () => quote(body, randomUUID()),
    (error) => error.status === 403,
  );
  await assert.rejects(
    () => quote(body, guestId, { ...scope, branchId: randomUUID() }),
    (error) => error.status === 403,
  );
  visit.status = "closed";
  await assert.rejects(
    () => quote(body),
    (error) => error.status === 403,
  );
  await assert.rejects(
    () => quote({ menuVersion: 1, items: body.items }),
    (error) => error.code === "TABLE_REQUIRED",
  );
  assert.equal(
    (await quote({ menuVersion: 1, items: body.items, reservationId })).total,
    5000,
  );
  await assert.rejects(
    () =>
      quote({ menuVersion: 1, items: body.items, reservationId }, randomUUID()),
    (error) => error.status === 403,
  );
});
