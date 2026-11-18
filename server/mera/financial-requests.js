import { z } from "zod";
import { fail } from "./domain.js";
const kinds={deposit_hold:{permission:"refunds.approve",actor:"approvedBy"},deposit_refund:{permission:"refunds.approve",actor:"approvedBy"},deposit_forfeiture:{permission:"refunds.approve",actor:"approvedBy"},writeoff:{permission:"refunds.approve",actor:"approvedBy"},payment:{permission:"payments.record",actor:"recordedBy"},deposit:{permission:"payments.record",actor:"recordedBy"},refund:{permission:"refunds.approve",actor:"approvedBy"},cash_movement:{permission:"shifts.manage",actor:"actorId"},item_cancellation:{permission:"orders.fulfill",actor:"actorId"}};
export async function assertFinancialRequestActive(c,s,key,kind,actorId) {
 const denied=(await c.query("SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='financial_request_resolution' AND data->>'requestKey'=$3 AND data->>'financialKind'=$4 AND data->>'actorId'=$5",[s.organizationId,s.branchId,key,kind,actorId])).rows[0];
 if(denied)throw fail("This financial request was safely abandoned. Start a new reviewed intent if needed.",409,"REQUEST_ABANDONED");
}
export function mountMeraFinancialRequests(router,{db,guard,scope,locked,record,event}) {
 const B="/organizations/:organizationId/branches/:branchId/financial-requests/:requestKey";
 const permissions=[...new Set(Object.values(kinds).map(k=>k.permission))];
 const ownRecord=async(c,req,key,kind)=>{
  const rows=(await c.query("SELECT id,kind,data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind=ANY($3::text[]) AND data->>'requestKey'=$4",[req.params.organizationId,req.params.branchId,kind?[kind]:Object.keys(kinds),key])).rows;
  return rows.find(r=>req.meraMembership.permissions.includes(kinds[r.kind].permission)&&r.data[kinds[r.kind].actor]===req.user.id);
 };
 router.get(B,guard(permissions),async(req,res)=>{
  const key=z.string().uuid().parse(req.params.requestKey),own=await ownRecord(db,req,key);
  if(own)return res.set("Cache-Control","no-store").json({status:"recorded",kind:own.kind,id:own.id});
  const resolutions=(await db.query("SELECT id,data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='financial_request_resolution' AND data->>'requestKey'=$3 AND data->>'actorId'=$4",[req.params.organizationId,req.params.branchId,key,req.user.id])).rows;
  const resolution=resolutions.find(r=>req.meraMembership.permissions.includes(kinds[r.data.financialKind]?.permission));
  res.set("Cache-Control","no-store").json(resolution?{status:"abandoned",kind:resolution.data.financialKind,id:resolution.id}:{status:"not_found"});
 });
 router.post(B+"/abandon",guard(permissions),async(req,res)=>{
  const key=z.string().uuid().parse(req.params.requestKey),input=z.object({kind:z.enum(Object.keys(kinds)),reason:z.string().trim().min(3).max(300)}).strict().parse(req.body);
  if(!req.meraMembership.permissions.includes(kinds[input.kind].permission))throw fail("This action requires the original financial permission.",403);
  res.json(await locked(scope(req),async c=>{
   const own=await ownRecord(c,req,key,input.kind);
   if(own)return {status:"recorded",kind:own.kind,id:own.id};
   let resolution=(await c.query("SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='financial_request_resolution' AND data->>'requestKey'=$3 AND data->>'financialKind'=$4 AND data->>'actorId'=$5",[req.params.organizationId,req.params.branchId,key,input.kind,req.user.id])).rows[0];
   if(!resolution){resolution=await record(c,scope(req),"financial_request_resolution",{requestKey:key,financialKind:input.kind,actorId:req.user.id,status:"abandoned",reason:input.reason,createdAt:new Date().toISOString()});await event(c,scope(req),"financial_request_abandoned",req.user,{requestKey:key,financialKind:input.kind,resolutionId:resolution.id,reason:input.reason});}
   return {status:"abandoned",kind:input.kind,id:resolution.id};
  }));
 });
}
