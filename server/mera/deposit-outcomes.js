import { z } from "zod";
import { createHash } from "node:crypto";
import { fail,assertHistoricalWritable } from "./domain.js";
import { assertFinancialRequestActive } from "./financial-requests.js";
const stamp=()=>new Date().toISOString();
export function availableDeposit(deposit,bills=[]) {
 const remaining=Math.max(0,deposit.amount-(deposit.refunded||0)-(deposit.forfeited||0));
 if(!deposit.allocated)return remaining;
 const unused=bills.filter(b=>b.status==="open").flatMap(b=>b.allocations||[]).filter(a=>a.paymentId===deposit.id&&a.orderId===null).reduce((n,a)=>n+Math.max(0,a.amount),0);
 return Math.min(remaining,unused);
}
export function depositView(deposit,bills=[]) {
 return {...deposit,unallocatedBalance:availableDeposit(deposit,bills),disposition:deposit.disposition||"held_unreviewed",providerPayoutInitiated:false};
}
export function mountMeraDepositOutcomes(router,{db,guard,scope,locked,record,readRecords,find,update,event}) {
 const B="/organizations/:organizationId/branches/:branchId";
 const kinds={held:"deposit_hold",manual_return:"deposit_refund",forfeit:"deposit_forfeiture"};
 const schema=z.object({requestKey:z.string().uuid(),outcome:z.enum(["held","manual_return","forfeit"]),expectedRemaining:z.number().int().safe().min(0),amount:z.number().int().safe().min(0).max(100000000000).default(0),method:z.enum(["cash","external_pos","external_transfer"]).optional(),reference:z.string().max(200).default(""),reason:z.string().trim().min(10).max(500),policyReviewed:z.literal(true),taxAmount:z.number().int().safe().min(0).nullable().optional()}).strict().superRefine((v,ctx)=>{
  if(v.outcome!=="held"&&v.amount<=0)ctx.addIssue({code:"custom",message:"Enter the positive deposit outcome amount."});
  if(v.outcome==="held"&&v.amount!==0)ctx.addIssue({code:"custom",message:"Holding funds does not post an amount."});
  if(v.outcome==="manual_return"&&(!v.method||(v.method==="external_transfer"&&!v.reference)))ctx.addIssue({code:"custom",message:"Record the actual return method and transfer reference."});
  if(v.outcome==="forfeit"&&(!Object.hasOwn(v,"taxAmount")||(v.taxAmount!==null&&v.taxAmount>v.amount)))ctx.addIssue({code:"custom",message:"Review the tax amount explicitly, or mark it unknown."});
 });
 router.get(B+"/reservations/:id/deposits",guard(["payments.record","refunds.approve"]),async(req,res)=>{
  const s=scope(req);await find(db,s,"reservation",req.params.id);
  const bills=(await db.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='bill' AND data->>'status'='open'",[s.organizationId,s.branchId])).rows.map(r=>r.data);
  const deposits=(await db.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='deposit' AND data->>'reservationId'=$3",[s.organizationId,s.branchId,req.params.id])).rows.map(r=>depositView(r.data,bills));
  res.json({deposits,unallocatedBalance:deposits.reduce((n,d)=>n+d.unallocatedBalance,0),providerPayoutInitiated:false});
 });
 router.post(B+"/reservations/:id/deposits/:depositId/outcomes",guard("refunds.approve"),async(req,res)=>{
  const input=schema.parse(req.body),kind=kinds[input.outcome];
  const intentHash=createHash("sha256").update(JSON.stringify({...input,reservationId:req.params.id,depositId:req.params.depositId,actorId:req.user.id})).digest("hex");
  res.json(await locked(scope(req),async c=>{
   const s=scope(req),reservation=assertHistoricalWritable(await find(c,s,"reservation",req.params.id)),deposit=assertHistoricalWritable(await find(c,s,"deposit",req.params.depositId));
   if(deposit.reservationId!==reservation.id)throw fail("Deposit not found for this reservation.",404);
   const previous=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind=ANY($3::text[]) AND data->>'requestKey'=$4",[s.organizationId,s.branchId,Object.values(kinds),input.requestKey])).rows[0]?.data;
   const bills=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='bill' AND data->>'status'='open'",[s.organizationId,s.branchId])).rows.map(r=>r.data);
   if(previous){if(previous.intentHash!==intentHash)throw fail("This request key records a different deposit outcome.",409,"IDEMPOTENCY_CONFLICT");return {record:previous,deposit:depositView(deposit,bills),providerPayoutInitiated:false};}
   await assertFinancialRequestActive(c,s,input.requestKey,kind,req.user.id);
   const available=availableDeposit(deposit,bills);
   if(available!==input.expectedRemaining)throw fail("The unused deposit balance changed. Review the current amount.",409,"STALE_DEPOSIT_BALANCE");
   if(!available||input.amount>available)throw fail("This outcome exceeds the unused deposit balance.",409);
   const policy=deposit.policySnapshot||reservation.depositPolicy||null;
   if(input.outcome==="forfeit"){
    if(!policy?.approved||deposit.allocated||!["cancelled","no-show"].includes(reservation.status))throw fail("Forfeiture requires a reviewed cancellation/no-show policy and an unseated cancelled booking.",409,"POLICY_BLOCKED");
    const cutoff=Date.parse(reservation.startsAt)-(policy.cancellationCutoffHours||0)*3600000;
    if(policy.refundRule!=="non_refundable"&&!(policy.refundRule==="refundable_before_cutoff"&&Date.now()>=cutoff))throw fail("The booked deposit policy still permits a return; it does not authorize forfeiture.",409,"POLICY_BLOCKED");
   }
   if(input.outcome!=="held"&&deposit.allocated){
    let left=input.amount;
    for(const bill of bills.filter(b=>b.status==="open")){
     for(const credit of bill.allocations.filter(a=>a.paymentId===deposit.id&&a.orderId===null&&a.amount>0)){const part=Math.min(left,credit.amount);credit.amount-=part;left-=part;}
     bill.allocations=bill.allocations.filter(a=>a.amount!==0);bill.total=bill.charges.reduce((n,l)=>n+l.amount,0);bill.paid=bill.allocations.reduce((n,a)=>n+a.amount,0);bill.balance=bill.total-bill.paid;
     await update(c,s,"bill",bill.id,bill);if(!left)break;
    }
    if(left)throw fail("Unused bill credit cannot be reconciled.",409);
   }
   const taxAmount=input.outcome==="forfeit"?input.taxAmount:null;
   const outcome=await record(c,s,kind,{...input,method:input.outcome==="manual_return"?input.method:null,reference:input.outcome==="manual_return"?input.reference:"",intentHash,reservationId:reservation.id,depositId:deposit.id,approvedBy:req.user.id,policySnapshot:policy,taxAmount,source:input.outcome==="manual_return"?"staff_recorded_external_return":"reviewed_deposit_disposition",providerPayoutInitiated:false,createdAt:stamp()});
   if(input.outcome==="manual_return"){
    await record(c,s,"ledger",{depositId:deposit.id,depositRefundId:outcome.id,type:"deposit_manual_return",postings:[{account:"reservation_liability",debit:input.amount,credit:0},{account:"collections_"+input.method,debit:0,credit:input.amount}],createdAt:stamp()});
    deposit.refunded=(deposit.refunded||0)+input.amount;reservation.depositReturned=(reservation.depositReturned||0)+input.amount;
   }
   if(input.outcome==="forfeit"){
    const postings=[{account:"reservation_liability",debit:input.amount,credit:0}];
    if(taxAmount===null)postings.push({account:"reservation_forfeiture_income_pending_tax",debit:0,credit:input.amount});
    else{if(input.amount-taxAmount)postings.push({account:"reservation_forfeiture_income",debit:0,credit:input.amount-taxAmount});if(taxAmount)postings.push({account:"tax_payable",debit:0,credit:taxAmount});}
    await record(c,s,"ledger",{depositId:deposit.id,forfeitureId:outcome.id,type:"deposit_forfeiture",postings,createdAt:stamp()});
    deposit.forfeited=(deposit.forfeited||0)+input.amount;reservation.depositForfeited=(reservation.depositForfeited||0)+input.amount;
   }
   reservation.depositGrossCollected??=(reservation.depositAmount||0)+(reservation.depositReturned||0)+(reservation.depositForfeited||0)-(input.outcome==="held"?0:input.amount);
   if(input.outcome!=="held")reservation.depositAmount=Math.max(0,(reservation.depositAmount||0)-input.amount);
   deposit.disposition=input.outcome;deposit.version=(deposit.version||1)+1;reservation.depositDisposition=input.outcome;reservation.depositReviewRequired=input.outcome==="held";
   await update(c,s,"deposit",deposit.id,deposit);await update(c,s,"reservation",reservation.id,reservation);
   await event(c,s,"deposit_outcome_recorded",req.user,{reservationId:reservation.id,depositId:deposit.id,outcomeId:outcome.id,outcome:input.outcome,amount:input.amount,reason:input.reason,providerPayoutInitiated:false});
   return {record:outcome,deposit:depositView(deposit,bills),providerPayoutInitiated:false};
  }));
 });
}
