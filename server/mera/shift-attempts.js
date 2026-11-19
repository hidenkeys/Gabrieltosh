import {z} from 'zod';
import {isDeepStrictEqual} from 'node:util';
import {fail} from './domain.js';
export function assertExpectedShiftActor(req){const expected=req.get('X-Mera-Actor-Id');if(expected!==undefined&&expected!==req.user.id)throw fail('Your signed-in account changed. Refresh the workspace before continuing.',403,'ACTOR_CHANGED');}
const matches=(r,operation,shiftId)=>r.operation===operation&&(operation==='open'||r.shiftId===shiftId);
async function ownOperation(c,s,requestKey,actorId){return(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='shift_operation' AND data->>'requestKey'=$3 AND data->>'actorId'=$4 LIMIT 1",[s.organizationId,s.branchId,requestKey,actorId])).rows[0]?.data;}
export async function replayShiftOperation(c,s,{requestKey,actorId,operation,shiftId=null,intent}){
 if(!requestKey)return null;const prior=await ownOperation(c,s,requestKey,actorId);if(!prior)return null;
 if(!matches(prior,operation,shiftId)||!isDeepStrictEqual(prior.intent,intent))throw fail('This key records a different shift operation.',409,'IDEMPOTENCY_CONFLICT');
 return prior.result;
}
export async function assertShiftRequestActive(c,s,{requestKey,actorId,operation,shiftId=null}){
 if(!requestKey)return;const r=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='shift_request_resolution' AND data->>'requestKey'=$3 AND data->>'actorId'=$4 AND data->>'status'='abandoned' LIMIT 1",[s.organizationId,s.branchId,requestKey,actorId])).rows[0]?.data;
 if(r){if(!matches(r,operation,shiftId))throw fail('This key belongs to another shift operation.',409,'IDEMPOTENCY_CONFLICT');throw fail('This shift request was safely abandoned. Review a new request before submitting again.',409,'SHIFT_REQUEST_ABANDONED');}
}
export async function recordShiftOperation(c,s,record,{requestKey,actorId,operation,intent},shift){if(requestKey)await record(c,s,'shift_operation',{requestKey,actorId,operation,shiftId:shift.id,intent,result:structuredClone(shift),createdAt:new Date().toISOString()});}
export function mountMeraShiftAttempts(router,{guard,scope,locked,record,event}){
 const B='/organizations/:organizationId/branches/:branchId';
 async function resolve(req,res,operation,abandon){
  res.set('Cache-Control','no-store');assertExpectedShiftActor(req);
  const requestKey=z.string().uuid().parse(req.params.requestKey),shiftId=operation==='close'?z.string().uuid().parse(req.params.id):null;
  const input=abandon?z.object({reason:z.string().trim().min(3).max(500)}).strict().parse(req.body):null;
  const s=scope(req),actorId=req.user.id;
  const result=await locked(s,async c=>{
   const own=await ownOperation(c,s,requestKey,actorId);
   if(own){if(!matches(own,operation,shiftId))throw fail('This key belongs to another shift operation.',409,'IDEMPOTENCY_CONFLICT');return{status:'recorded',shift:own.result,resultBasis:'recorded_operation_snapshot',operationRecord:{id:own.id,operation:own.operation,requestKey:own.requestKey,actorId:own.actorId,shiftId:own.shiftId,intent:own.intent,createdAt:own.createdAt}};}
   let resolution=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='shift_request_resolution' AND data->>'requestKey'=$3 AND data->>'actorId'=$4 LIMIT 1",[s.organizationId,s.branchId,requestKey,actorId])).rows[0]?.data;
   if(resolution&&!matches(resolution,operation,shiftId))throw fail('This key belongs to another shift operation.',409,'IDEMPOTENCY_CONFLICT');
   if(!resolution&&input){resolution=await record(c,s,'shift_request_resolution',{requestKey,actorId,operation,shiftId,status:'abandoned',reason:input.reason,createdAt:new Date().toISOString()});await event(c,s,'shift_request_abandoned',req.user,{requestKey,operation,shiftId,resolutionId:resolution.id,reason:input.reason});}
   return resolution?{status:'abandoned',resolutionId:resolution.id}:{status:'not_found'};
  });res.json({...result,requestKey,actorId,organizationId:s.organizationId,branchId:s.branchId,operation,shiftId});
 }
 for(const [operation,path]of [['open',B+'/shifts/open-attempts/:requestKey'],['close',B+'/shifts/:id/close-attempts/:requestKey']]){router.get(path,guard('shifts.manage'),(req,res)=>resolve(req,res,operation,false));router.post(path+'/abandon',guard('shifts.manage'),(req,res)=>resolve(req,res,operation,true));}
}
