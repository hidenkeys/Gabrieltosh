import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mountMeraFulfillment } from "../server/mera/fulfillment.js";
import { projectPreparationFacts } from "../server/mera/projection.js";
test("component meals wait for every station before partial handoff",async()=>{
 const order={id:"10000000-0000-4000-8000-000000000001",version:1,status:"preparing",items:[{orderLineId:"meal",quantity:2,components:[{station:"kitchen"},{station:"bar"}]}],history:[]};
 const tickets=[{orderId:order.id,station:"kitchen",status:"ready",items:[{orderLineId:"meal",quantity:2,preparedQuantity:2}]},{orderId:order.id,station:"bar",status:"preparing",items:[{orderLineId:"meal",quantity:2,preparedQuantity:0}]}];
 const router=express.Router();
 mountMeraFulfillment(router,{guard:()=>()=>{},scope:()=>({}),locked:async(_s,fn)=>fn({}, {settings:{payLater:true}}),find:async()=>order,readRecords:async(_c,_o,_b,kind)=>kind==="ticket"?tickets.map(data=>({data})):[],update:async()=>{},record:async()=>{},event:async()=>{},paidForBill:()=>0});
 const handler=router.stack[0].route.stack.at(-1).handle;
 const req={params:{id:order.id,lineId:"meal"},body:{requestKey:"20000000-0000-4000-8000-000000000001",version:1,fulfilledQuantity:1},user:{id:"staff"}};
 await assert.rejects(()=>handler(req,{json(){}}),/Only prepared/);
 assert.equal(projectPreparationFacts([order],tickets,["orders.view","orders.fulfill"])[0].items[0].preparedQuantity,0);
 tickets[1].items[0].preparedQuantity=1;
 let result;await handler(req,{json(value){result=value;}});
 assert.equal(result.fulfilledQuantity,1);
});
