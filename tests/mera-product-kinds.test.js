import test from "node:test";
import assert from "node:assert/strict";
import { productInputSchema } from "../shared/mera-contracts.js";
import { remapSharedContents } from "../server/mera/menus.js";
import { projectPreparationFacts } from "../server/mera/projection.js";
import { quote } from "../server/mera/domain.js";
import { validateProductReferences,stockLines,componentAvailability } from "../server/mera/product-kinds.js";
import { publishedCounterProducts } from "../server/mera/catalog.js";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const single={...productInputSchema.parse({name:"Tea",code:"TEA",category:"Drinks",price:100,stockMode:"counted",stock:8}),id:a};
const pack={...productInputSchema.parse({name:"Tea set",code:"SET",category:"Drinks",price:300,kind:"package",stockMode:"counted",components:[{productId:a,quantity:3}]}),id:b};
const line=(p,extra={})=>({productId:p.id,quantity:2,modifiers:[],...extra});
test("package component stock holds and cancellation restoration use ordered quantities",()=>{
 const priced=quote([line(pack)],[single,pack]);
 assert.equal(priced.total,600);assert.equal(pack.stockMode,"unlimited");
 const held=stockLines(priced.items);assert.equal(held[0].productId,a);assert.equal(held[0].quantity,6);
 const balance=single.stock-held[0].quantity;assert.equal(balance,2);assert.equal(balance+stockLines(priced.items)[0].quantity,8);
 assert.throws(()=>quote([line(pack),line(pack)],[single,pack]),{code:"OUT_OF_STOCK"});
});
test("combo prices choices and enforces group minimum maximum and duplicates",()=>{
 const combo={...productInputSchema.parse({name:"Meal",code:"MEAL",category:"Meals",price:200,kind:"combo",choiceGroups:[{id:"drink",name:"Drink",min:1,max:1,options:[{productId:a,priceDelta:75}]}]}),id:b};
 const choices=[{groupId:"drink",productId:a}];
 assert.equal(quote([line(combo,{choices})],[single,combo]).total,550);
 assert.throws(()=>quote([line(combo)],[single,combo]));
 assert.throws(()=>quote([line(combo,{choices:[...choices,...choices]})],[single,combo]));
 assert.throws(()=>quote([line(combo,{choices:[{groupId:"unknown",productId:a}]})],[single,combo]));
});
test("nested and cross-branch references are rejected and component sizes are validated",()=>{
 assert.equal(validateProductReferences(pack,[single]),pack);
 assert.throws(()=>validateProductReferences(pack,[]),{code:"INVALID_COMPONENT"});
 assert.throws(()=>validateProductReferences(pack,[{...single,kind:"package"}]),{code:"INVALID_COMPONENT"});
 assert.throws(()=>validateProductReferences({...pack,components:[{productId:a,variantId:"missing",quantity:1}]},[single]),{code:"INVALID_COMPONENT"});
});
test("table packages require verified order context and public snapshots expose component names",()=>{
 assert.throws(()=>quote([line(pack)],[single,{...pack,requiresTable:true}]),{code:"TABLE_REQUIRED"});
 assert.equal(quote([line(pack)],[single,{...pack,requiresTable:true}],{tableContext:true}).total,600);
 assert.equal(componentAvailability(pack,[{...single,stock:2}]),false);
 const published=publishedCounterProducts({published_menu:[single,pack],timezone:"Africa/Lagos"},[single,pack]);
 assert.equal(published[1].components[0].name,"Tea");
 assert.equal(productInputSchema.safeParse({...single,components:pack.components}).success,false);
});

test("shared menus remap contents by product code and variant name to destination identities",()=>{
 const target={...single,id:"source",variants:[{id:"new-size",name:"Large"}]};
 const ids=new Map([["TEA",a]]);
 const source={components:[{productId:"old",productCode:"TEA",variantName:"Large",quantity:2}],choiceGroups:[{id:"drink",options:[{productId:"old",productCode:"TEA",variantName:null,priceDelta:25}]}]};
 const mapped=remapSharedContents(source,[target],ids);
 assert.equal(mapped.components[0].productId,a);assert.equal(mapped.components[0].variantId,"new-size");assert.equal(mapped.choiceGroups[0].options[0].productId,a);
 assert.throws(()=>remapSharedContents(source,[],ids),{code:"INVALID_COMPONENT"});
});

test("component preparation waits for every station and never doubles parent quantities",()=>{
 const order={id:b,items:[{orderLineId:a,quantity:2,components:[{station:"bar"},{station:"kitchen"}]}]};
 const permissions=["orders.view","orders.fulfill"];
 const ticket=station=>({orderId:b,station,status:"ready",items:[{orderLineId:a,quantity:2}]});
 const count=tickets=>projectPreparationFacts([order],tickets,permissions)[0].items[0].preparedQuantity;
 assert.equal(count([]),0);assert.equal(count([ticket("bar")]),0);assert.equal(count([ticket("bar"),ticket("kitchen")]),2);
});
