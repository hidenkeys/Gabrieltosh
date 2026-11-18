import { z } from "zod";
const kinds={payment:{permission:"payments.record",actor:"recordedBy"},deposit:{permission:"payments.record",actor:"recordedBy"},refund:{permission:"refunds.approve",actor:"approvedBy"},cash_movement:{permission:"shifts.manage",actor:"actorId"},item_cancellation:{permission:"orders.fulfill",actor:"actorId"}};
export function mountMeraFinancialRequests(router,{db,guard}) {
 router.get("/organizations/:organizationId/branches/:branchId/financial-requests/:requestKey",guard([...new Set(Object.values(kinds).map(k=>k.permission))]),async(req,res)=>{
  const key=z.string().uuid().parse(req.params.requestKey);
  const rows=(await db.query("SELECT id,kind,data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind=ANY($3::text[]) AND data->>'requestKey'=$4",[req.params.organizationId,req.params.branchId,Object.keys(kinds),key])).rows;
  const own=rows.find(r=>req.meraMembership.permissions.includes(kinds[r.kind].permission)&&r.data[kinds[r.kind].actor]===req.user.id);
  res.set("Cache-Control","no-store").json(own?{status:"recorded",kind:own.kind,id:own.id}:{status:"not_found"});
 });
}
