import test from 'node:test';import assert from 'node:assert/strict';
import {replayShiftOperation,assertShiftRequestActive,recordShiftOperation,assertExpectedShiftActor}from'../server/mera/shift-attempts.js';
const scope={organizationId:'org',branchId:'branch'},attempt={requestKey:'key',actorId:'actor',operation:'close',shiftId:'shift',intent:{countedCash:0,reason:'Checked',shiftId:'shift'}};
test('shift replay compares structured exact intent independent of JSONB property order',async()=>{
 const row={operation:'close',shiftId:'shift',intent:{shiftId:'shift',reason:'Checked',countedCash:0},result:{id:'shift',status:'closed',expectedCash:0}};
 const db={query:async(sql,args)=>{assert.deepEqual(args,['org','branch','key','actor']);return{rows:[{data:row}]};}};
 assert.deepEqual(await replayShiftOperation(db,scope,attempt),row.result);
 await assert.rejects(replayShiftOperation(db,scope,{...attempt,intent:{...attempt.intent,countedCash:1}}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 await assert.rejects(replayShiftOperation(db,scope,{...attempt,shiftId:'other'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 assert.equal(await replayShiftOperation({query:()=>{throw Error('No legacy query');}},scope,{...attempt,requestKey:undefined}),null);
});
test('shift tombstones fence only matching operation, while immutable acknowledgment copies result',async()=>{
 const db={query:async()=>({rows:[{data:{operation:'close',shiftId:'shift'}}]})};
 await assert.rejects(assertShiftRequestActive(db,scope,attempt),e=>e.code==='SHIFT_REQUEST_ABANDONED');
 await assert.rejects(assertShiftRequestActive(db,scope,{...attempt,operation:'open'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 let saved;const shift={id:'shift',status:'closed',nested:{cash:0}};await recordShiftOperation(null,scope,async(c,s,kind,data)=>{saved=data;},attempt,shift);shift.nested.cash=100;assert.equal(saved.result.nested.cash,0);
 assert.throws(()=>assertExpectedShiftActor({get:()=> 'other',user:{id:'actor'}}),e=>e.code==='ACTOR_CHANGED'&&e.status===403);
});
