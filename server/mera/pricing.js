import { z } from "zod";
import { createHash } from "node:crypto";
import { orderInputSchema } from "../../shared/mera-contracts.js";
import { fail,quote,assertMoney,availableNow } from "./domain.js";
const stamp=()=>new Date().toISOString();
const rate=z.number().int().min(0).max(10000),label=z.string().trim().min(1).max(80);
export const pricingPolicySchema=z.object({enabled:z.boolean(),approved:z.literal(true),discount:z.object({label,type:z.enum(["fixed","basis_points"]),value:z.number().int().safe().min(0).max(100000000000)}).refine(v=>v.type!=="basis_points"||v.value<=10000).nullable(),serviceCharge:z.object({label,basisPoints:rate}).nullable(),tax:z.object({label,basisPoints:rate,basis:z.enum(["net_items","net_items_and_service"])}).nullable()}).strict();
const rounded=(amount,bps)=>Number((BigInt(amount)*BigInt(bps)+5000n)/10000n);
export function priceBreakdown(subtotal,policy) {
 assertMoney(subtotal);
 if(!policy?.enabled)return {subtotal,discount:0,serviceCharge:0,tax:0,total:subtotal,lines:[],policyVersion:null,policySnapshot:null};
 if(!policy.approved)throw fail("Pricing policy has not been approved.",409,"POLICY_BLOCKED");
 const discount=Math.min(subtotal,policy.discount?(policy.discount.type==="fixed"?policy.discount.value:rounded(subtotal,policy.discount.value)):0),net=subtotal-discount;
 const serviceCharge=policy.serviceCharge?rounded(net,policy.serviceCharge.basisPoints):0;
 const tax=policy.tax?rounded(net+(policy.tax.basis==="net_items_and_service"?serviceCharge:0),policy.tax.basisPoints):0;
 const lines=[...(discount?[{type:"discount",label:policy.discount.label,amount:-discount}]:[]),...(serviceCharge?[{type:"service_charge",label:policy.serviceCharge.label,amount:serviceCharge}]:[]),...(tax?[{type:"tax",label:policy.tax.label,amount:tax}]:[])];
 return {subtotal,discount,serviceCharge,tax,total:assertMoney(net+serviceCharge+tax),lines,policyVersion:policy.version,policySnapshot:policy};
}
export const pricingItemsHash=input=>createHash("sha256").update(JSON.stringify({menuVersion:input.menuVersion,items:input.items.map(i=>({productId:i.productId,quantity:i.quantity,variantId:i.variantId||null,modifiers:[...(i.modifiers||[])].sort()}))})).digest("hex");
export async function resolveQuotedPricing(c,s,b,input,actor,guestId,subtotal) {
 if(!b.settings.pricingPolicy?.enabled)return priceBreakdown(subtotal,null);
 if(!input.quoteId)throw fail("Review the current item, discount, charge and tax quote before submitting.",409,"QUOTE_REQUIRED");
 const q=(await c.query("SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND branch_id=$3 AND kind='order_quote'",[input.quoteId,s.organizationId,s.branchId])).rows[0]?.data;
 if(!q||q.actorId!==(actor?.id||null)||q.guestId!==(guestId||null)||q.intentHash!==pricingItemsHash(input)||q.policyVersion!==b.settings.pricingPolicy.version||Date.parse(q.expiresAt)<=Date.now()||q.subtotal!==subtotal)throw fail("The checkout quote changed or expired. Review a fresh quote.",409,"QUOTE_CHANGED");
 const {id,actorId,guestId:ignored,intentHash,createdAt,expiresAt,menuVersion,...pricing}=q;
 return pricing;
}
export function mountMeraPricing(router,{guard,scope,locked,record,readRecords,event,publicContext,guest}) {
 const B="/organizations/:organizationId/branches/:branchId",P="/public/:slug/:branchId";
 router.patch(B+"/pricing-policy",guard("organization.manage"),async(req,res)=>{
  const input=pricingPolicySchema.parse(req.body);
  res.json(await locked(scope(req),async(c,b)=>{
   const policy={...input,version:"pricing-"+Date.now()+"-"+Math.random().toString(36).slice(2,9),configuredAt:stamp()};
   await c.query("UPDATE mera_branches SET settings=jsonb_set(settings,'{pricingPolicy}',$1::jsonb) WHERE id=$2 AND organization_id=$3",[JSON.stringify(policy),b.id,b.organization_id]);
   await event(c,scope(req),"pricing_policy_approved",req.user,{policy});return policy;
  }));
 });
 async function make(req,s,actor,guestId){
  const input=orderInputSchema.pick({menuVersion:true,items:true}).strict().parse(req.body);
  return locked(s,async(c,b)=>{
   if(input.menuVersion!==b.menu_version)throw fail("Menu changed. Refresh before requesting a quote.",409,"MENU_CHANGED");
   const live=(await readRecords(c,s.organizationId,s.branchId,"product")).map(r=>r.data);
   const products=b.published_menu.map(p=>{const current=live.find(i=>i.id===p.id);return {...p,available:!!current?.available&&availableNow(p.availabilityWindows,b.timezone),stockMode:current?.stockMode||"unlimited",stock:current?.stock||0,variants:p.variants.map(v=>({...v,stockMode:current?.variants.find(i=>i.id===v.id)?.stockMode||"unlimited",stock:current?.variants.find(i=>i.id===v.id)?.stock||0}))};});
   const amounts=priceBreakdown(quote(input.items,products).total,b.settings.pricingPolicy);
   const stored=await record(c,s,"order_quote",{...amounts,menuVersion:input.menuVersion,currency:b.currency,actorId:actor?.id||null,guestId:guestId||null,intentHash:pricingItemsHash(input),createdAt:stamp(),expiresAt:new Date(Date.now()+5*60000).toISOString()});
   const {actorId,guestId:ignored,intentHash,policySnapshot,...safe}=stored;return safe;
  });
 }
 router.post(B+"/quote",guard("orders.create"),async(req,res)=>res.status(201).json(await make(req,scope(req),req.user,null)));
 router.post(P+"/quote",async(req,res)=>{const {organization,s}=await publicContext(req),g=await guest(req,organization.id);res.status(201).json(await make(req,s,null,g.id));});
}
