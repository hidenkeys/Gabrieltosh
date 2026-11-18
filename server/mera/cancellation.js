import { z } from "zod";
import { createHash } from "node:crypto";
import { fail,paymentStatus } from "./domain.js";
const stamp=()=>new Date().toISOString();
export function mountMeraCancellation(router,{guard,scope,locked,find,readRecords,record,event}) {
 const B="/organizations/:organizationId/branches/:branchId";
 const save=(c,s,kind,id,data)=>c.query("UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind=$5",[JSON.stringify(data),id,s.organizationId,s.branchId,kind]);
 router.post(B+"/orders/:id/items/:orderLineId/cancel",guard("orders.fulfill"),async(req,res)=>{
  const input=z.object({requestKey:z.string().uuid(),quantity:z.number().int().positive(),version:z.number().int().positive(),reason:z.string().trim().min(3).max(300)}).strict().parse(req.body);
  const intentHash=createHash("sha256").update(JSON.stringify({...input,orderId:req.params.id,orderLineId:req.params.orderLineId,actor:req.user.id})).digest("hex");
  res.json(await locked(scope(req),async c=>{
   const s=scope(req),previous=(await readRecords(c,s.organizationId,s.branchId,"item_cancellation")).map(r=>r.data).find(r=>r.requestKey===input.requestKey);
   const order=await find(c,s,"order",req.params.id);
   if(previous){if(previous.intentHash!==intentHash)throw fail("Cancellation request key conflict.",409,"IDEMPOTENCY_CONFLICT");return {order,cancellation:previous};}
   if(order.version!==input.version)throw fail("Order changed. Refresh before cancelling.",409,"STALE_VERSION");
   if(!["submitted","accepted","preparing"].includes(order.status))throw fail("Items can only be cancelled before readiness or collection.",409);
   if(order.paid>0)throw fail("Paid item cancellation requires an approved refund allocation workflow. No values were changed.",409,"PAID_ITEM_REVIEW_REQUIRED");
   const lineIndex=order.items.findIndex(l=>l.orderLineId===req.params.orderLineId),line=order.items[lineIndex];
   if(!line||input.quantity>line.quantity)throw fail("Invalid item quantity.",409);
   const tickets=(await readRecords(c,s.organizationId,s.branchId,"ticket")).map(r=>r.data).filter(t=>t.orderId===order.id);
   const ticket=tickets.find(t=>t.items.some(i=>i.orderLineId===line.orderLineId)),ticketLine=ticket?.items.find(i=>i.orderLineId===line.orderLineId);
   if(input.quantity>line.quantity-(ticketLine?.preparedQuantity||0))throw fail("Already prepared quantities cannot be cancelled as unprepared stock.",409);
   const amount=line.unitPrice*input.quantity;
   let remaining=amount;
   const bills=(await readRecords(c,s.organizationId,s.branchId,"bill")).map(r=>r.data).filter(b=>b.status==="open");
   for(const bill of bills){
    const charges=bill.charges.filter(l=>l.orderId===order.id && l.amount>0 && (l.lineIndex===lineIndex || l.lineIndex===null)).sort((a,b)=>(a.lineIndex===lineIndex?-1:1)-(b.lineIndex===lineIndex?-1:1));
    for(const charge of charges){const removed=Math.min(remaining,charge.amount);charge.amount-=removed;remaining-=removed;if(charge.lineIndex===lineIndex)charge.quantity=charge.amount/line.unitPrice;if(!remaining)break;}
    bill.charges=bill.charges.filter(l=>l.amount!==0);
    bill.total=bill.charges.reduce((n,l)=>n+l.amount,0);bill.paid=bill.allocations.reduce((n,a)=>n+a.amount,0);bill.balance=bill.total-bill.paid;
    await save(c,s,"bill",bill.id,bill);
    if(!remaining)break;
   }
   if(remaining)throw fail("Bill charges could not be reconciled. No cancellation was applied.",409);
   if(!order.holdExpired){
    const product=await find(c,s,"product",line.productId),variant=product.variants?.find(v=>v.id===line.variantId);
    if(product.stockMode==="counted")product.stock+=input.quantity;
    if(variant?.stockMode==="counted")variant.stock+=input.quantity;
    await save(c,s,"product",product.id,product);
    await record(c,s,"stock_movement",{productId:product.id,variantId:line.variantId,quantity:input.quantity,type:"unprepared_item_cancelled",orderId:order.id,reason:input.reason,createdAt:stamp()});
   }
   order.originalTotal??=order.total;
   line.originalQuantity??=line.quantity;line.cancelledQuantity=(line.cancelledQuantity||0)+input.quantity;line.quantity-=input.quantity;line.total=line.quantity*line.unitPrice;
   order.total-=amount;order.version++;order.paymentStatus=paymentStatus(order);
   if(ticketLine){ticketLine.quantity-=input.quantity;ticketLine.cancelledQuantity=(ticketLine.cancelledQuantity||0)+input.quantity;ticket.version=(ticket.version||1)+1;ticket.status=ticket.items.every(i=>i.quantity===0)?"cancelled":ticket.items.every(i=>(i.preparedQuantity||0)===i.quantity)?"ready":ticket.status;await save(c,s,"ticket",ticket.id,ticket);}
   if(order.items.every(i=>!i.quantity)){order.status="cancelled";order.stockHeld=false;}
   else if(order.status!=="submitted" && tickets.length && tickets.every(t=>["ready","cancelled"].includes(t.status))) order.status="ready";
   order.history.push({action:"item_cancelled",actorId:req.user.id,actorName:req.user.name,orderLineId:line.orderLineId,quantity:input.quantity,amount,reason:input.reason,at:stamp()});
   await save(c,s,"order",order.id,order);
   const cancellation=await record(c,s,"item_cancellation",{...input,intentHash,orderId:order.id,orderLineId:line.orderLineId,amount,actorId:req.user.id,createdAt:stamp()});
   await event(c,s,"order_item_cancelled",req.user,{orderId:order.id,cancellationId:cancellation.id,quantity:input.quantity,amount,reason:input.reason});
   return {order,cancellation};
  }));
 });
}
