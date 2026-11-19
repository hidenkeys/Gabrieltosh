import { paidForBill,effectiveSettlement,orderBalance } from "./domain.js";
export function projectStaffOrder(order,permissions=[]) {
 const value={...order,effectivePaid:paidForBill(order),effectiveSettlement:effectiveSettlement(order),outstandingBalance:orderBalance(order)};
 if(!permissions.some(p=>["billing.manage","organization.manage"].includes(p))){delete value.financialPolicy;delete value.policyVersion;}
 return value;
}
// Deliberately exclude ticket identities, station notes and preparation staff.
export function projectPreparationFacts(orders,tickets,permissions=[]) {
 if(!permissions.includes('orders.view')||!permissions.includes('orders.fulfill'))return [];
 return orders.filter(order=>order&&typeof order.id==='string'&&Array.isArray(order.items)&&order.items.every(line=>line&&typeof line.orderLineId==='string')).map(order=>({orderId:order.id,items:order.items.map(line=>{
  let preparedQuantity=0;
  for(const ticket of tickets.filter(t=>t?.orderId===order.id&&t.status!=='cancelled')){
   if(!Array.isArray(ticket.items)||ticket.items.some(item=>!item||typeof item.orderLineId!=='string')){preparedQuantity=null;break;}
   for(const item of ticket.items.filter(i=>i.orderLineId===line.orderLineId)){
    const count=ticket.status==='ready'?item.quantity:item.preparedQuantity;
    if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(preparedQuantity+count)){preparedQuantity=null;break;}
    preparedQuantity+=count;
   }
   if(preparedQuantity===null)break;
  }
  return{orderLineId:line.orderLineId,preparedQuantity};
 })}));
}
