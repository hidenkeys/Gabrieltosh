import test from 'node:test';
import assert from 'node:assert/strict';
import {assertStaffReservationRequestActive} from '../server/mera/reservation-attempts.js';
test('staff reservation fence binds actor, request and both tenant scopes; absent fence grants no booking',async()=>{
 const args=[];const s={organizationId:'org',branchId:'branch'};
 await assertStaffReservationRequestActive({query:async(sql,values)=>{assert.ok(sql.includes("data->>'actorType'='staff'"));assert.ok(sql.includes("data->>'status'='abandoned'"));args.push(values);return{rows:[]};}},s,'key','actor');assert.deepEqual(args,[['org','branch','key','actor']]);
 await assert.rejects(assertStaffReservationRequestActive({query:async()=>({rows:[{id:'resolution'}]})},s,'key','actor'),e=>e.status===409&&e.code==='RESERVATION_REQUEST_ABANDONED');
});
test('expected staff actor header is optional expectation, never authentication',async()=>{
 const {assertExpectedReservationActor}=await import('../server/mera/reservation-attempts.js');
 for(const header of [undefined,'actual'])assert.doesNotThrow(()=>assertExpectedReservationActor({get:()=>header,user:{id:'actual'}}));
 for(const header of ['', 'different'])assert.throws(()=>assertExpectedReservationActor({get:()=>header,user:{id:'actual'}}),e=>e.status===403&&e.code==='ACTOR_CHANGED');
});
