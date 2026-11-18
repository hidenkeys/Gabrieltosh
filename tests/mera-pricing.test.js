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
