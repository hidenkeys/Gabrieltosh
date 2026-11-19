import test from 'node:test';import assert from 'node:assert/strict';import{projectPreparationFacts}from'../server/mera/projection.js';
const orders=[{id:'o',items:[{orderLineId:'l'},{orderLineId:'none'}]}],access=['orders.view','orders.fulfill'];
test('service preparation facts use same noncancelled ready/count aggregation without exposing station/private fields',()=>{
 const tickets=[{orderId:'o',status:'preparing',actorId:'SECRET',note:'PRIVATE',items:[{orderLineId:'l',preparedQuantity:2}]},{orderId:'o',status:'ready',items:[{orderLineId:'l',quantity:3,preparedQuantity:0}]},{orderId:'o',status:'cancelled',items:[{orderLineId:'l',quantity:99}]},{orderId:'other',status:'ready',items:[{orderLineId:'l',quantity:9}]}];
 assert.deepEqual(projectPreparationFacts(orders,tickets,access),[{orderId:'o',items:[{orderLineId:'l',preparedQuantity:5},{orderLineId:'none',preparedQuantity:0}]}]);assert.deepEqual(projectPreparationFacts(orders,tickets,['orders.view']),[]);assert.deepEqual(projectPreparationFacts(orders,tickets,['orders.fulfill']),[]);
});
test('unknown or unsafe prepared quantities never become a fabricated zero or partial sum',()=>{
 for(const value of [undefined,null,-1,NaN,'2',0.5,Number.MAX_SAFE_INTEGER+1])assert.equal(projectPreparationFacts(orders,[{orderId:'o',status:'preparing',items:[{orderLineId:'l',preparedQuantity:2},{orderLineId:'l',preparedQuantity:value}]}],access)[0].items[0].preparedQuantity,null);
});
test('malformed legacy orders and null ticket items cannot crash workspace or imply a prepared balance',()=>{
 assert.deepEqual(projectPreparationFacts([{id:'bad'},null],[],access),[]);
 assert.equal(projectPreparationFacts(orders,[null,{orderId:'o',status:'preparing',items:[null]}],access)[0].items[0].preparedQuantity,null);
});
