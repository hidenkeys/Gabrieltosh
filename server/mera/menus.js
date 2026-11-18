import { z } from "zod";
import { bindProductCategory } from "./catalog.js";
import { assertMeraAsset } from "./assets.js";
import { randomUUID } from "node:crypto";
import { productInputSchema } from "../../shared/mera-contracts.js";
import { fail } from "./domain.js";
const stamp=()=>new Date().toISOString();
export function mountMeraMenus(router,{db,guard,scope,locked,record,readRecords,event}) {
 const O="/organizations/:organizationId",B=O+"/branches/:branchId";
 const schema=z.object({name:z.string().trim().min(2).max(100),items:z.array(productInputSchema).min(1).max(500)}).refine(v=>v.items.every(p=>p.code.trim())&&new Set(v.items.map(p=>p.code)).size===v.items.length,"Shared menu items require unique nonempty codes");
 router.get(O+"/menus",guard("menu.edit"),async(req,res)=>res.json((await db.query("SELECT data FROM mera_records WHERE organization_id=$1 AND kind='shared_menu' ORDER BY created_at",[req.params.organizationId])).rows.map(r=>r.data)));
 async function save(req,input,id) {
  return db.transaction(async c=>{
   await c.query("SELECT id FROM mera_organizations WHERE id=$1 FOR UPDATE",[req.params.organizationId]);
   const branch=(await c.query("SELECT id FROM mera_branches WHERE organization_id=$1 ORDER BY id LIMIT 1",[req.params.organizationId])).rows[0];
   let old;
   if(id){old=(await c.query("SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND kind='shared_menu'",[id,req.params.organizationId])).rows[0]?.data;if(!old)throw fail("Shared menu not found.",404);if(old.version!==input.version)throw fail("Shared menu changed. Refresh first.",409,"STALE_VERSION");}
   for(const item of input.items) await assertMeraAsset(c,req.params.organizationId,null,item.image);
   const items=input.items.map(p=>({...p,categoryId:null,stockMode:"unlimited",stock:0,variants:p.variants.map(v=>({...v,stockMode:"unlimited",stock:0}))}));
   const data={id:id||randomUUID(),name:input.name,items,version:(old?.version||0)+1,updatedAt:stamp(),updatedBy:req.user.id};
   if(old)await c.query("UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND kind='shared_menu'",[JSON.stringify(data),id,req.params.organizationId]);
   else await c.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'shared_menu',$4)",[data.id,req.params.organizationId,branch.id,JSON.stringify(data)]);
   await event(c,{organizationId:req.params.organizationId,branchId:branch.id},"shared_menu_saved",req.user,{menuId:data.id,version:data.version});
   return data;
  });
 }
 router.post(O+"/menus",guard("menu.edit"),async(req,res)=>res.status(201).json(await save(req,schema.parse(req.body))));
 router.patch(O+"/menus/:id",guard("menu.edit"),async(req,res)=>res.json(await save(req,{...schema.parse(req.body),version:z.number().int().positive().parse(req.body.version)},req.params.id)));
 router.post(B+"/menu/shared-use",guard("menu.publish"),async(req,res)=>{
  if(!req.meraMembership.permissions.includes("menu.edit"))throw fail("Menu editing permission is required.",403);
  const input=z.object({menuId:z.string().uuid(),version:z.number().int().positive(),overrides:z.array(z.object({code:z.string().min(1),price:z.number().int().safe().min(0).optional(),available:z.boolean().optional(),category:z.string().min(1).max(100).optional(),image:z.string().max(200).optional(),categoryId:z.string().uuid().nullable().optional()}).strict()).max(500).default([])}).strict().parse(req.body);
  res.json(await locked(scope(req),async(c,b)=>{
   const s=scope(req),shared=(await c.query("SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND kind='shared_menu' FOR SHARE",[input.menuId,s.organizationId])).rows[0]?.data;
   if(!shared)throw fail("Shared menu not found.",404);if(shared.version!==input.version)throw fail("Shared menu version changed.",409,"STALE_VERSION");
   if(new Set(input.overrides.map(o=>o.code)).size!==input.overrides.length || input.overrides.some(o=>!shared.items.some(p=>p.code===o.code)))throw fail("Overrides require distinct existing item codes.");
   const existing=(await readRecords(c,s.organizationId,s.branchId,"product")).map(r=>r.data),published=[];
   const holds=(await readRecords(c,s.organizationId,s.branchId,"order")).map(r=>r.data).filter(o=>o.stockHeld);
   for(const item of shared.items){
    const old=existing.find(p=>p.code===item.code),override=input.overrides.find(o=>o.code===item.code)||{},data={...item,...override,id:old?.id||randomUUID(),stockMode:old?.stockMode||"unlimited",stock:old?.stock||0,variants:item.variants.map(v=>({...v,stockMode:old?.variants.find(i=>i.id===v.id)?.stockMode||"unlimited",stock:old?.variants.find(i=>i.id===v.id)?.stock||0}))};
    Object.assign(data,await bindProductCategory(c,s,data));
    await assertMeraAsset(c,s.organizationId,s.branchId,data.image);
    if(old?.variants.some(v=>!data.variants.some(n=>n.id===v.id) && ((v.stockMode==="counted"&&v.stock>0)||holds.some(o=>o.items.some(l=>l.productId===old.id&&l.variantId===v.id))))) throw fail("Shared menu cannot remove sizes with stock or active holds.",409);
    if(old)await c.query("UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind='product'",[JSON.stringify(data),data.id,s.organizationId,s.branchId]);
    else await c.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'product',$4)",[data.id,s.organizationId,s.branchId,JSON.stringify(data)]);
    if(data.available)published.push(data);
   }
   const categories=(await readRecords(c,s.organizationId,s.branchId,"category")).map(r=>r.data).filter(c=>c.active);
   const assignment={menuId:shared.id,version:shared.version,overrides:input.overrides,appliedAt:stamp()};
   await c.query("UPDATE mera_branches SET published_menu=$1,menu_version=menu_version+1,settings=jsonb_set(jsonb_set(settings,'{sharedMenu}',$2::jsonb),'{publishedCategories}',$3::jsonb) WHERE id=$4 AND organization_id=$5",[JSON.stringify(published),JSON.stringify(assignment),JSON.stringify(categories),b.id,s.organizationId]);
   await event(c,s,"shared_menu_published",req.user,{...assignment,publishedVersion:b.menu_version+1});
   return {version:b.menu_version+1,sharedMenu:assignment};
  }));
 });
}
