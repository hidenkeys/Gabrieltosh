import { randomUUID } from "node:crypto";
import { z } from "zod";
import { paidForBill,fail } from "./domain.js";
export function eligiblePaidDocuments(order) {
 return !order.historicalReadOnly && !order.writtenOff && order.total>0 && order.paid>0 && paidForBill(order)>=order.total && order.paymentStatus==="paid" && !["cancelled","rejected"].includes(order.status);
}
export async function enqueuePaidDocuments(c,s,order,actor=null,settlement=null) {
 if(!eligiblePaidDocuments(order))return {created:0};
 const previous=(await c.query("SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='print_job' AND data->>'orderId'=$3 AND data->>'automaticPaid'='true' LIMIT 1",[s.organizationId,s.branchId,order.id])).rows[0];
 if(previous)return {created:0};
 const branch=(await c.query("SELECT name,currency FROM mera_branches WHERE id=$1 AND organization_id=$2",[s.branchId,s.organizationId])).rows[0];
 const org=(await c.query("SELECT name FROM mera_organizations WHERE id=$1",[s.organizationId])).rows[0];
 const stored=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='template' ORDER BY created_at,id LIMIT 1",[s.organizationId,s.branchId])).rows[0]?.data;
 const template=stored||{receipt:{businessName:org.name,footer:"Thank you. See you again soon.",showStaff:true,paperWidth:58},label:{width:50,height:40},version:1};
 const at=new Date().toISOString(),batchId=randomUUID();
 const staffName=order.staffCreatorName||(order.staffCreatorId?(await c.query("SELECT name FROM users WHERE id=$1",[order.staffCreatorId])).rows[0]?.name:null)||null;
 const common={businessName:template.receipt.businessName,branchName:branch.name,reference:order.reference,currency:branch.currency,customerName:order.displayName,staffName,source:order.source,settledAt:at,note:order.note||""};
 const items=order.items.filter(i=>i.quantity>0).map(i=>({orderLineId:i.orderLineId,productId:i.productId,name:i.name,size:i.size,quantity:i.quantity,unitPrice:i.unitPrice,total:i.total,modifiers:i.modifiers||[],allergens:i.allergens||[],dietary:i.dietary||[]}));
 const jobs=[];
 const add=(kind,key,snapshot)=>jobs.push({id:randomUUID(),orderId:order.id,kind,status:"queued",automaticPaid:true,documentVersion:1,documentKey:key,batchId,settlement,physicalConfirmed:false,duplicate:false,createdAt:at,documentSnapshot:snapshot});
 add("receipt",order.id+":receipt",{...common,items,total:order.total,appliedPaid:paidForBill(order),lifetimeCollected:order.paid,refunded:order.refunded||0,pricing:order.pricing?{subtotal:order.pricing.subtotal,discount:order.pricing.discount,serviceCharge:order.pricing.serviceCharge,tax:order.pricing.tax,total:order.pricing.total,lines:order.pricing.lines}:null,recordedByName:actor?.name||null,template:template.receipt,templateVersion:template.version||1});
 for(const item of items)for(let unit=1;unit<=item.quantity;unit++)add("label",order.id+":label:"+item.orderLineId+":"+unit,{...common,...item,quantity:1,unitIndex:unit,unitCount:item.quantity,template:template.label,templateVersion:template.version||1});
 await c.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) SELECT value->>'id',$2,$3,'print_job',value FROM jsonb_array_elements($1::jsonb)",[JSON.stringify(jobs),s.organizationId,s.branchId]);
 order.paidDocumentBatchId=batchId;order.paidDocumentsQueuedAt=at;
 await c.query("UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind='order'",[JSON.stringify(order),order.id,s.organizationId,s.branchId]);
 const audit={id:randomUUID(),action:"paid_documents_queued",actorId:actor?.id||null,actorName:actor?.name||"System",details:{orderId:order.id,batchId,receiptCount:1,stickerCount:jobs.length-1,physicalConfirmed:false},createdAt:at};
 await c.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'audit',$4)",[audit.id,s.organizationId,s.branchId,JSON.stringify(audit)]);
 return {created:jobs.length,batchId};
}

export function mountMeraPrinting(router,{db,guard,scope,locked,find,record,update,event}) {
 const B="/organizations/:organizationId/branches/:branchId";
 router.get(B+"/print-jobs/:id",guard("orders.view"),async(req,res)=>{
  const job=await find(db,scope(req),"print_job",req.params.id);
  if(job.documentVersion!==1||!job.documentSnapshot)throw fail("This older job needs a reviewed canonical document.",409,"DOCUMENT_REVIEW_REQUIRED");
  res.json(job);
 });
 router.post(B+"/print-jobs/:id/browser-submission",guard("orders.fulfill"),async(req,res)=>{
  const input=z.object({requestKey:z.string().uuid()}).strict().parse(req.body);
  res.json(await locked(scope(req),async c=>{
   const s=scope(req),previous=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='browser_print_submission' AND data ? 'requestKey' AND data->>'requestKey'=$3 LIMIT 1",[s.organizationId,s.branchId,input.requestKey])).rows[0]?.data;
   if(previous){if(previous.jobId!==req.params.id||previous.actorId!==req.user.id)throw fail("This key belongs to another browser print request.",409,"IDEMPOTENCY_CONFLICT");return previous.result;}
   const job=await find(c,s,"print_job",req.params.id);
   if(job.documentVersion!==1||!job.documentSnapshot)throw fail("Review a canonical paid document first.",409,"DOCUMENT_REVIEW_REQUIRED");
   if(job.status!=="queued")throw fail("Use an audited, labelled reprint for another attempt.",409,"REPRINT_REQUIRED");
   job.status="browser_submitted";job.physicalConfirmed=false;job.browserOutcome="unverified";job.browserSubmittedAt=new Date().toISOString();job.browserSubmittedBy=req.user.id;
   await update(c,s,"print_job",job.id,job);
   const result={jobId:job.id,status:job.status,physicalConfirmed:false,browserOutcome:"unverified"};
   await record(c,s,"browser_print_submission",{requestKey:input.requestKey,jobId:job.id,actorId:req.user.id,result,createdAt:job.browserSubmittedAt});
   await event(c,s,"browser_print_requested",req.user,{jobId:job.id,physicalConfirmed:false,browserOutcome:"unverified"});return result;
  }));
 });
}
