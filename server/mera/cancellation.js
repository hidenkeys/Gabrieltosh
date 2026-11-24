import { stockLines } from "./product-kinds.js";
import { assertFinancialRequestActive } from "./financial-requests.js";
import { priceBreakdown } from "./pricing.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { fail,paymentStatus,paidForBill,assertHistoricalWritable } from "./domain.js";
const stamp=()=>new Date().toISOString();
export function mountMeraCancellation(router,{guard,scope,locked,find,readRecords,record,event}) {
 const B="/organizations/:organizationId/branches/:branchId";
 const save=(c,s,kind,id,data)=>c.query("UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind=$5",[JSON.stringify(data),id,s.organizationId,s.branchId,kind]);
 router.post(B+"/orders/:id/items/:orderLineId/cancel-quote",guard("orders.fulfill"),async(req,res)=>{
  const input=z.object({quantity:z.number().int().positive(),version:z.number().int().positive()}).strict().parse(req.body);
  res.status(201).json(await locked(scope(req),async c=>{
   const s=scope(req),order=assertHistoricalWritable(await find(c,s,"order",req.params.id)),line=order.items.find(l=>l.orderLineId===req.params.orderLineId);
   if(order.version!==input.version)throw fail("Order changed. Refresh before reviewing cancellation.",409,"STALE_VERSION");
   if(!line||input.quantity>line.quantity||!["submitted","accepted","preparing"].includes(order.status))throw fail("This item cannot be cancelled.",409);
   const tickets=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='ticket' AND data->>'orderId'=$3",[s.organizationId,s.branchId,order.id])).rows.map(r=>r.data);
   const prepared=Math.max(0,...tickets.flatMap(t=>t.items).filter(i=>i.orderLineId===line.orderLineId).map(i=>i.preparedQuantity||0));
   if(input.quantity>line.quantity-Math.max(prepared,line.fulfilledQuantity||0))throw fail("Prepared or handed-over quantities cannot be cancelled as unused stock.",409);
   const subtotal=(order.pricing?.subtotal??order.items.reduce((n,l)=>n+l.total,0))-line.unitPrice*input.quantity;
   const pricing=priceBreakdown(subtotal,order.pricing?.policySnapshot),amount=order.total-pricing.total;
   const quote=await record(c,s,"cancellation_quote",{orderId:order.id,orderLineId:line.orderLineId,quantity:input.quantity,lineQuantity:line.quantity,actorId:req.user.id,previousTotal:order.total,newTotal:pricing.total,creditRequired:amount,refundTaxAmount:(order.pricing?.tax||0)-pricing.tax,pricing,policyVersion:order.pricing?.policyVersion||null,expiresAt:new Date(Date.now()+5*60000).toISOString(),createdAt:stamp()});
   return quote;
  }));
 });
 router.post(B+"/orders/:id/items/:orderLineId/cancel",guard("orders.fulfill"),async(req,res)=>{
  const input=z.object({requestKey:z.string().uuid(),quantity:z.number().int().positive(),version:z.number().int().positive(),reason:z.string().trim().min(3).max(300),cancellationQuoteId:z.string().uuid().optional(),refundAllocations:z.array(z.object({refundId:z.string().uuid(),amount:z.number().int().positive()})).max(100).optional()}).strict().parse(req.body);
  const intentHash=createHash("sha256").update(JSON.stringify({...input,orderId:req.params.id,orderLineId:req.params.orderLineId,actor:req.user.id})).digest("hex");
  res.json(await locked(scope(req),async c=>{
   const s=scope(req),previous=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='item_cancellation' AND data ? 'requestKey' AND data->>'requestKey'=$3 LIMIT 1",[s.organizationId,s.branchId,input.requestKey])).rows[0]?.data;
   const order=assertHistoricalWritable(await find(c,s,"order",req.params.id));
   if(previous){if(previous.intentHash!==intentHash)throw fail("Cancellation request key conflict.",409,"IDEMPOTENCY_CONFLICT");return {order,cancellation:previous};}
   await assertFinancialRequestActive(c,s,input.requestKey,"item_cancellation",req.user.id);
   if(order.version!==input.version)throw fail("Order changed. Refresh before cancelling.",409,"STALE_VERSION");
   if(!["submitted","accepted","preparing"].includes(order.status))throw fail("Items can only be cancelled before readiness or collection.",409);


   const lineIndex=order.items.findIndex(l=>l.orderLineId===req.params.orderLineId),line=order.items[lineIndex];
   if(!line||input.quantity>line.quantity)throw fail("Invalid item quantity.",409);
   const tickets=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='ticket' AND data->>'orderId'=$3",[s.organizationId,s.branchId,order.id])).rows.map(r=>r.data);
   const ticket=tickets.find(t=>t.items.some(i=>i.orderLineId===line.orderLineId)),ticketLine=ticket?.items.find(i=>i.orderLineId===line.orderLineId);
   if(input.quantity>line.quantity-Math.max(0,...tickets.flatMap(t=>t.items).filter(i=>i.orderLineId===line.orderLineId).map(i=>i.preparedQuantity||0),line.fulfilledQuantity||0))throw fail("Already prepared quantities cannot be cancelled as unprepared stock.",409);
   let reviewed;
   if(order.pricing?.policySnapshot?.enabled){
    if(!input.cancellationQuoteId)throw fail("Review the original-policy cancellation quote first.",409,"PRICING_REVIEW_REQUIRED");
    reviewed=await find(c,s,"cancellation_quote",input.cancellationQuoteId);
    if(reviewed.orderId!==order.id||reviewed.orderLineId!==line.orderLineId||reviewed.actorId!==req.user.id||reviewed.quantity!==input.quantity||reviewed.lineQuantity!==line.quantity||reviewed.previousTotal!==order.total||reviewed.policyVersion!==order.pricing.policyVersion||Date.parse(reviewed.expiresAt)<=Date.now())throw fail("The cancellation quote changed or expired.",409,"CANCELLATION_QUOTE_CHANGED");
   }
   const amount=reviewed?reviewed.creditRequired:line.unitPrice*input.quantity;
   if(order.paid>0 && (!req.meraMembership.permissions.includes("refunds.approve") || (amount>0&&!input.refundAllocations?.length)))throw fail("Paid cancellation requires refund approval permission and existing credits for any positive return.",409,"PAID_ITEM_REVIEW_REQUIRED");
   const allocations=input.refundAllocations||[];
   let remaining=amount;
   const bills=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='bill' AND data->>'status'='open' AND data->'charges' @> $3::jsonb ORDER BY created_at,id",[s.organizationId,s.branchId,JSON.stringify([{orderId:order.id}])])).rows.map(r=>r.data);
   if(order.paid>0){
    if(new Set(allocations.map(a=>a.refundId)).size!==allocations.length || allocations.reduce((n,a)=>n+a.amount,0)!==amount) throw fail("Refund allocations must uniquely equal the cancelled item value.",409);
    let allocatedTax=0;
    for(const allocation of allocations){
     const refund=await find(c,s,"refund",allocation.refundId);
     const used=(await readRecords(c,s.organizationId,s.branchId,"item_cancellation")).map(r=>r.data).flatMap(r=>r.refundAllocations||[]).filter(a=>a.refundId===refund.id).reduce((n,a)=>n+a.amount,0);
     if(refund.orderId!==order.id || allocation.amount>refund.amount-used) throw fail("Refund credit is unavailable or already applied.",409);
     allocatedTax+=allocation.amount===refund.amount?(refund.taxAmount||0):Number((BigInt(allocation.amount)*BigInt(refund.taxAmount||0)+BigInt(refund.amount)/2n)/BigInt(refund.amount));
     let creditLeft=allocation.amount;
     for(const bill of bills){for(const charge of bill.charges.filter(l=>l.refundId===refund.id && l.amount<0)){
       const available=-charge.amount-(charge.cancellationAppliedAmount||0),part=Math.min(creditLeft,available);
       charge.cancellationAppliedAmount=(charge.cancellationAppliedAmount||0)+part;creditLeft-=part;
     }await save(c,s,"bill",bill.id,bill);}
     if(creditLeft)throw fail("Refund bill credits do not cover this cancellation.",409);
    }
    if(reviewed && allocatedTax!==reviewed.refundTaxAmount)throw fail("Approved refund tax credits do not match the reviewed cancellation. Record a refund using this cancellation quote.",409,"REFUND_TAX_REVIEW_REQUIRED");
    order.recognitionPricing??=order.pricing;
    order.recognitionTotal??=order.total+(order.cancellationRefundApplied||0);
    order.cancellationRefundApplied=(order.cancellationRefundApplied||0)+amount;
    remaining=0;
   } else {
   for(const bill of bills){
    const charges=bill.charges.filter(l=>l.orderId===order.id && l.amount>0 && (l.lineIndex===lineIndex || l.lineIndex===null)).sort((a,b)=>(a.lineIndex===lineIndex?-1:1)-(b.lineIndex===lineIndex?-1:1));
    for(const charge of charges){const removed=Math.min(remaining,charge.amount);charge.amount-=removed;remaining-=removed;if(charge.lineIndex===lineIndex)charge.quantity=charge.amount/line.unitPrice;if(!remaining)break;}
    bill.charges=bill.charges.filter(l=>l.amount!==0);
    bill.total=bill.charges.reduce((n,l)=>n+l.amount,0);bill.paid=bill.allocations.reduce((n,a)=>n+a.amount,0);bill.balance=bill.total-bill.paid;
    await save(c,s,"bill",bill.id,bill);
    if(!remaining)break;
   }
   }
   if(remaining)throw fail("Bill charges could not be reconciled. No cancellation was applied.",409);
   if(!order.holdExpired){
    for(const held of stockLines([{...line,quantity:input.quantity}])) {
     const product=await find(c,s,"product",held.productId),variant=product.variants?.find(v=>v.id===held.variantId);
     if(product.stockMode==="counted")product.stock+=held.quantity;
     if(variant?.stockMode==="counted")variant.stock+=held.quantity;
     await save(c,s,"product",product.id,product);
     await record(c,s,"stock_movement",{productId:product.id,variantId:held.variantId,quantity:held.quantity,type:"unprepared_item_cancelled",orderId:order.id,reason:input.reason,createdAt:stamp()});
    }
   }
   order.originalTotal??=order.total;
   line.originalQuantity??=line.quantity;line.cancelledQuantity=(line.cancelledQuantity||0)+input.quantity;line.quantity-=input.quantity;line.total=line.quantity*line.unitPrice;
   order.total-=amount;if(reviewed)order.pricing=reviewed.pricing;else if(order.pricing){order.pricing={...order.pricing,subtotal:order.pricing.subtotal-line.unitPrice*input.quantity,total:order.total};}order.effectivePaid=paidForBill(order);order.version++;order.paymentStatus=paymentStatus(order);
   for(const ticket of tickets){const ticketLine=ticket.items.find(i=>i.orderLineId===line.orderLineId);if(ticketLine){ticketLine.quantity-=input.quantity;ticketLine.cancelledQuantity=(ticketLine.cancelledQuantity||0)+input.quantity;ticket.version=(ticket.version||1)+1;ticket.status=ticket.items.every(i=>i.quantity===0)?"cancelled":ticket.items.every(i=>(i.preparedQuantity||0)===i.quantity)?"ready":ticket.status;await save(c,s,"ticket",ticket.id,ticket);}}
   if(order.items.every(i=>!i.quantity)){order.status="cancelled";order.stockHeld=false;}
   else if(order.status!=="submitted" && tickets.length && tickets.every(t=>["ready","cancelled"].includes(t.status))) order.status="ready";
   order.history.push({action:"item_cancelled",actorId:req.user.id,actorName:req.user.name,orderLineId:line.orderLineId,quantity:input.quantity,amount,reason:input.reason,at:stamp()});
   await save(c,s,"order",order.id,order);
   const cancellation=await record(c,s,"item_cancellation",{...input,intentHash,orderId:order.id,orderLineId:line.orderLineId,amount,actorId:req.user.id,pricingDifference:reviewed?{previousTotal:reviewed.previousTotal,newTotal:reviewed.newTotal,tax:reviewed.refundTaxAmount,policyVersion:reviewed.policyVersion}:null,createdAt:stamp()});
   await event(c,s,"order_item_cancelled",req.user,{orderId:order.id,cancellationId:cancellation.id,quantity:input.quantity,amount,reason:input.reason});
   return {order,cancellation};
  }));
 });
}
