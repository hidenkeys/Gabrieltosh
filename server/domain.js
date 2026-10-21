export const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:2}).format(n/100);
export function priceOrder(lines,products,discountInput,role) {
 const byId=new Map(products.map(p=>[p.id,p]));
 const items=lines.map(line=>{
  const p=byId.get(line.productId);
  if(!p||!p.available||p.needs_review) throw new Error('An item is unavailable. Refresh the menu.');
  const quantity=Number(line.quantity);
  if(!Number.isInteger(quantity)||quantity<1||quantity>99) throw new Error('Quantity must be between 1 and 99.');
  const sweetness=['Normal sweet','Less sweet','No sugar'].includes(line.sweetness)?line.sweetness:'Normal sweet';
  const ice=['Normal ice','Less ice','No ice'].includes(line.ice)?line.ice:'Normal ice';
  if((line.toppings||[]).length>10) throw new Error('Too many toppings.');
  const toppings=(line.toppings||[]).map(id=>{const t=byId.get(id);if(!t||!t.available||t.category!=='Toppings')throw new Error('Invalid topping');return {id:t.id,name:t.name,price:t.price};});
  const unitPrice=p.price+toppings.reduce((s,t)=>s+t.price,0);
  return {productId:p.id,code:p.code,name:p.name,category:p.category,size:p.size,quantity,basePrice:p.price,unitPrice,lineTotal:unitPrice*quantity,labelRequired:p.label_required,options:p.options?{sweetness,ice}:null,toppings};
 });
 const subtotal=items.reduce((s,i)=>s+i.lineTotal,0);
 let discount=0,reason='';
 if(discountInput?.value){
  if(role==='cashier')throw new Error('A supervisor must apply discounts.');
  const value=Number(discountInput.value); if(!Number.isFinite(value)||value<0)throw new Error('Invalid discount');
  if(discountInput.type==='percent'&&value>100)throw new Error('Discount cannot exceed 100%.');
  discount=discountInput.type==='percent'?Math.round(subtotal*value/100):Math.round(value*100);
  if(discount>subtotal)throw new Error('Discount exceeds order value.');
  reason=String(discountInput.reason||'').trim();if(!reason)throw new Error('Discount reason is required.');
 }
 return {items,subtotal,discount,discountReason:reason,total:subtotal-discount};
}
export function buildPrintPayloads(order,template) {
 const jobs=[{kind:'receipt',sequence:0,payload:{order,template}}];
 const units=order.items.flatMap(item=>item.labelRequired?Array.from({length:item.quantity},()=>item):[]);
 units.forEach((item,i)=>jobs.push({kind:'label',sequence:i+1,payload:{orderNumber:order.number,orderId:order.id,item,index:i+1,count:units.length,staffName:order.staff_name,template}}));
 return jobs;
}
export function reportFor(orders,refunds=[]) {
 const paid=orders.filter(o=>o.payment_status==='paid'||o.payment_status==='refunded');
 const gross=paid.reduce((s,o)=>s+o.subtotal,0),discounts=paid.reduce((s,o)=>s+o.discount,0),refundTotal=refunds.reduce((s,r)=>s+r.amount,0);
 const payments={cash:0,card:0,transfer:0};for(const o of paid) payments[o.payment_method]=(payments[o.payment_method]||0)+o.total;
 for(const r of refunds)payments[r.method]=(payments[r.method]||0)-r.amount;
 const products=new Map();for(const o of paid) for(const item of o.items){const key=item.productId;const p=products.get(key)||{name:item.name,quantity:0,revenue:0};p.quantity+=item.quantity;p.revenue+=item.lineTotal;products.set(key,p);for(const t of item.toppings){const k='topping:'+t.id;const a=products.get(k)||{name:t.name+' (add-on)',quantity:0,revenue:0};a.quantity+=item.quantity;/* Revenue is already included in parent item */products.set(k,a);}}
 const statuses={};for(const o of orders)statuses[o.status]=(statuses[o.status]||0)+1;
 return {orders:orders.length,paidOrders:paid.length,gross,discounts,refunds:refundTotal,net:gross-discounts-refundTotal,payments,statuses,products:[...products.values()],average:paid.length?Math.round((gross-discounts)/paid.length):0};
}
export function dayBounds(date) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00+01:00')))throw new Error('Invalid report date');
 const start=new Date(date+'T00:00:00+01:00'); return [start.toISOString(),new Date(start.getTime()+86400000).toISOString()];
}
export const lagosDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
