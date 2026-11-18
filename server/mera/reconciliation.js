import { z } from "zod";
import { createHash } from "node:crypto";
import { fail } from "./domain.js";
const stamp=()=>new Date().toISOString();
const simulated=()=>process.env.MERA_DEMO==="true" && process.env.NODE_ENV!=="production";
// This is an internal test adapter, not a representation of any provider's API.
export function mountMeraReconciliation(router,{db,guard,scope,locked,record,readRecords,find,event}) {
 const B="/organizations/:organizationId/branches/:branchId";
 const schema=z.object({eventId:z.string().min(3).max(120),transactionId:z.string().min(3).max(120),orderId:z.string().uuid(),sequence:z.number().int().min(1),type:z.enum(["collection_reported","refund_reported","settlement_reported"]),amount:z.number().int().safe().min(1).max(100000000000),occurredAt:z.string().datetime()}).strict();
 router.post(B+"/provider-simulator/events",guard("billing.manage"),async(req,res)=>{
  if(!simulated()) throw fail("Provider simulator is available only in explicit isolated demo mode.",503,"PROVIDER_BLOCKED");
  const input=schema.parse(req.body),digest=createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const result=await locked(scope(req),async c=>{
   const s=scope(req),all=(await readRecords(c,s.organizationId,s.branchId,"provider_event")).map(r=>r.data);
   const previous=all.find(r=>r.eventId===input.eventId);
   if(previous){if(previous.intentHash!==digest) throw fail("Provider event id contains different content.",409,"IDEMPOTENCY_CONFLICT");return {event:previous,replayed:true};}
   await find(c,s,"order",input.orderId);
   if(all.some(e=>e.transactionId===input.transactionId && (e.orderId!==input.orderId || e.sequence===input.sequence))) throw fail("Provider transaction sequence conflicts with an existing event.",409);
   const received=await record(c,s,"provider_event",{...input,intentHash:digest,simulation:true,adapter:"internal-test-v1",receivedAt:stamp()});
   await event(c,s,"simulated_provider_event_received",req.user,{providerEventId:received.id,eventId:input.eventId,type:input.type,orderId:input.orderId});
   return {event:received,replayed:false};
  });res.status(result.replayed?200:201).json(result);
 });
 router.get(B+"/reconciliation",guard("billing.manage"),async(req,res)=>{
  const s=scope(req),kinds=["provider_event","payment","refund","order"];
  const [events,payments,refunds,orders]=await Promise.all(kinds.map(async k=>(await readRecords(db,s.organizationId,s.branchId,k)).map(r=>r.data)));
  const policy=(await db.query("SELECT policy FROM mera_organizations WHERE id=$1",[s.organizationId])).rows[0].policy;
  res.json(projectReconciliation(events,payments,refunds,orders,policy));
 });
}
export function projectReconciliation(events,payments,refunds,orders,policy={}) {
 const transactions=[...new Set(events.map(e=>e.transactionId))].map(id=>{
  const sorted=events.filter(e=>e.transactionId===id).sort((a,b)=>a.sequence-b.sequence),orderId=sorted[0].orderId;
  const missing=[];for(let n=1;n<=sorted.at(-1).sequence;n++)if(!sorted.some(e=>e.sequence===n))missing.push(n);
  const sum=type=>sorted.filter(e=>e.type===type).reduce((a,e)=>a+e.amount,0);
  const reportedCollection=sum("collection_reported"),reportedRefund=sum("refund_reported"),reportedSettlement=sum("settlement_reported");
  const internalCollection=payments.filter(p=>p.orderId===orderId && p.reference===id).reduce((a,p)=>a+p.amount,0),internalRefund=refunds.filter(p=>p.orderId===orderId && p.reference===id).reduce((a,p)=>a+p.amount,0);
  const policyReady=policy.status==="approved" && Number.isInteger(policy.integratedFeeBps) && policy.feeBasis && policy.feePayer && policy.refundTreatment;
  const feeBase=policy.feeBasis==="sales"?(orders.find(o=>o.id===orderId)?.collectedAt?orders.find(o=>o.id===orderId).total:0):reportedCollection;
  const assessed=policyReady?Number((BigInt(feeBase)*BigInt(policy.integratedFeeBps)+5000n)/10000n):null;
  const refunded=policyReady?(policy.refundTreatment==="return_fee"?Number((BigInt(Math.min(reportedRefund,feeBase))*BigInt(policy.integratedFeeBps)+5000n)/10000n):0):null;
  const fee={status:policyReady?"simulation_assessed":"policy_unresolved",policyVersion:policy.version||null,policySnapshot:policy,assessed,refunded,collected:0,settled:0,liveCollectionEnabled:false};
  return {transactionId:id,fee,merchantEntitlement:policyReady?Math.max(0,reportedCollection-reportedRefund-(policy.feePayer==="merchant"?assessed-refunded:0)):null,orderId,reference:orders.find(o=>o.id===orderId)?.reference,reportedCollection,reportedRefund,reportedSettlement,internalCollection,internalRefund,missingSequences:missing,status:missing.length?"awaiting_events":reportedCollection===internalCollection&&reportedRefund===internalRefund?"matched":"mismatch",settlementStatus:reportedSettlement?"reported_unverified":"not_reported",lastSequence:sorted.at(-1).sequence};
 });
 return {simulation:true,adapter:"internal-test-v1",fundsMoved:false,transactions};
}
