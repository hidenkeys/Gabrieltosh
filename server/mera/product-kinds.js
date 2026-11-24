import { fail } from "./domain.js";
export function validateProductReferences(product, products) {
 for(const ref of [...(product.components||[]),...(product.choiceGroups||[]).flatMap(g=>g.options)]) {
  const target=products.find(p=>p.id===ref.productId);
  if(!target||(target.kind||"single")!=="single"||target.id===product.id)throw fail("Contents must reference single items in this location.",409,"INVALID_COMPONENT");
  if(ref.variantId&&!target.variants?.some(v=>v.id===ref.variantId)||!ref.variantId&&target.variants?.length)throw fail("Select a valid component size.",409,"INVALID_COMPONENT");
 }
 return product;
}
export function resolveContents(product, choices=[], products=[]) {
 if(product.kind!=="combo"&&choices.length)throw fail("This item has no combo choices.");
 let refs=[];
 if(product.kind==="package")refs=product.components;
 else if(product.kind==="combo") {
  const remaining=[...choices];
  for(const group of product.choiceGroups) {
   const selected=remaining.filter(c=>c.groupId===group.id);
   if(selected.length<group.min||selected.length>group.max)throw fail(`Choose ${group.min}–${group.max} options for ${group.name}.`);
   const seen=new Set();
   for(const choice of selected){const key=choice.productId+":"+(choice.variantId||null),option=group.options.find(o=>o.productId===choice.productId&&(o.variantId||null)===(choice.variantId||null));if(!option||seen.has(key))throw fail("Invalid or duplicate combo choice.");seen.add(key);refs.push({...option,groupId:group.id,quantity:1});remaining.splice(remaining.indexOf(choice),1);}
  }
  if(remaining.length)throw fail("Unknown choice group.");
 } else if(choices.length)throw fail("This item has no combo choices.");
 return refs.map(ref=>{const p=products.find(p=>p.id===ref.productId),v=p?.variants?.find(v=>v.id===ref.variantId);if(!p||!p.available||(p.kind||"single")!=="single"||(ref.variantId&&!v))throw fail("A component is unavailable.",409,"OUT_OF_STOCK");return {...ref,name:p.name,size:v?.name||p.size,station:p.station};});
}
export function stockLines(lines) {
 return lines.flatMap(line=>line.components?.length?line.components.map(c=>({...c,quantity:c.quantity*line.quantity})): [line]);
}
export function componentAvailability(product, products) {
 if((product.kind||"single")==="single")return true;
 const enough=(ref)=>{const p=products.find(p=>p.id===ref.productId),v=p?.variants?.find(v=>v.id===ref.variantId),q=ref.quantity||1;return !!p?.available&&(p.kind||"single")==="single"&&(p.stockMode!=="counted"||p.stock>=q)&&(!ref.variantId||!!v)&&(v?.stockMode!=="counted"||v.stock>=q);};
 const packageRefs=new Map();for(const ref of product.components||[]){const key=ref.productId+":"+(ref.variantId||"");const old=packageRefs.get(key);packageRefs.set(key,{...ref,quantity:(old?.quantity||0)+ref.quantity});}
 const parentRefs=new Map();for(const ref of packageRefs.values())parentRefs.set(ref.productId,(parentRefs.get(ref.productId)||0)+ref.quantity);
 const parentsEnough=[...parentRefs].every(([id,q])=>{const p=products.find(p=>p.id===id);return !!p&&(p.stockMode!=="counted"||p.stock>=q);});
 return product.kind==="package"?parentsEnough&&[...packageRefs.values()].every(enough):(product.choiceGroups||[]).every(g=>g.options.filter(enough).length>=g.min);
}
