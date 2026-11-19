import {withAccessLock,authorizeAccessTarget,beginAccessOperation,recordAccessOperation} from "./access-attempts.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { permissions,rolePermissions } from "../../shared/mera-contracts.js";
import { fail } from "./domain.js";
export async function resolveRole(db,org,id) {
  if (rolePermissions[id]) return {id,permissions:rolePermissions[id],active:true};
  const row=(await db.query("SELECT data FROM mera_records WHERE organization_id=$1 AND kind='custom_role' AND id=$2",[org,id])).rows[0];
  if (!row?.data.active) throw fail("Role is unavailable.",409);
  return row.data;
}
export function mountMeraRoles(router,{db,guard}) {
  const O="/organizations/:organizationId";
  const shape={requestKey:z.string().uuid().optional(),name:z.string().trim().min(2).max(70),permissions:z.array(z.enum(permissions)).min(1).max(permissions.length).transform(v=>[...new Set(v)].sort())};
  router.get(O+"/roles",guard("members.manage"),async(req,res)=>res.json({templates:Object.entries(rolePermissions).map(([id,p])=>({id,name:id.replaceAll("_"," "),permissions:p})),custom:(await db.query("SELECT data FROM mera_records WHERE organization_id=$1 AND kind='custom_role' ORDER BY created_at",[req.params.organizationId])).rows.map(r=>r.data)}));
  async function write(req,input,id) {
    return withAccessLock(db,req,async c=>{
      await authorizeAccessTarget(c,req,id?"role_update":"role_create",id||null,input);
      const branch=(await c.query("SELECT id FROM mera_branches WHERE organization_id=$1 ORDER BY id LIMIT 1",[req.params.organizationId])).rows[0];
      let old;
      if(id) {
        old=(await c.query("SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND kind='custom_role'",[id,req.params.organizationId])).rows[0]?.data;
        if(!old) throw fail("Role not found.",404);

        if(old.permissions.some(p=>!req.meraMembership.permissions.includes(p))) throw fail("Cannot edit a role beyond your authority.",403);
      }
      const intent={name:input.name,permissions:input.permissions,...(id?{active:input.active,version:input.version}:{})},attempt={requestKey:input.requestKey,operation:id?"role_update":"role_create",targetId:id||null,intent};
      const prior=await beginAccessOperation(c,req,attempt);if(prior)return prior;
      if(old&&old.version!==input.version)throw fail("Role changed. Refresh before editing.",409,"STALE_VERSION");
      const data={id:id||randomUUID(),name:input.name,permissions:input.permissions,version:(old?.version||0)+1,active:input.active??true,updatedAt:new Date().toISOString()};
      if(old) {
        await c.query("UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND kind='custom_role'",[JSON.stringify(data),data.id,req.params.organizationId]);
        await c.query("UPDATE mera_memberships SET permissions=$1,active=CASE WHEN $2 THEN active ELSE false END WHERE organization_id=$3 AND role=$4",[JSON.stringify(data.permissions),data.active,req.params.organizationId,data.id]);
        await c.query("UPDATE mera_invitations SET permissions=$1,revoked=CASE WHEN $2 THEN revoked ELSE true END WHERE organization_id=$3 AND role=$4 AND accepted=false",[JSON.stringify(data.permissions),data.active,req.params.organizationId,data.id]);
      } else await c.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'custom_role',$4)",[data.id,req.params.organizationId,branch.id,JSON.stringify(data)]);
      const audit={id:randomUUID(),action:"custom_role_updated",actorId:req.user.id,roleId:data.id,version:data.version,permissions:data.permissions,active:data.active,createdAt:new Date().toISOString()};
      await c.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'audit',$4)",[audit.id,req.params.organizationId,branch.id,JSON.stringify(audit)]);
      await recordAccessOperation(c,req,attempt,data);
      return data;
    });
  }
  router.post(O+"/roles",guard("members.manage"),async(req,res)=>res.status(201).json(await write(req,z.object(shape).strict().parse(req.body))));
  router.patch(O+"/roles/:id",guard("members.manage"),async(req,res)=>res.json(await write(req,z.object({...shape,active:z.boolean(),version:z.number().int().positive()}).strict().parse(req.body),req.params.id)));
}
