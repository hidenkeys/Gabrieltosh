import { z } from "zod";
import { fail,paidForBill,assertHistoricalWritable } from "./domain.js";
const stamp = () => new Date().toISOString();
export function mountMeraTickets(router, {guard,scope,locked,find,readRecords,event}) {
  const B = "/organizations/:organizationId/branches/:branchId";
  const save = (c,s,kind,id,data) => c.query("UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind=$5",[JSON.stringify(data),id,s.organizationId,s.branchId,kind]);
  async function change(req, input, itemId) {
    return locked(scope(req), async (c,b) => {
      const s=scope(req), ticket=await find(c,s,"ticket",req.params.id);
      const role=req.meraMembership.role;
      if (["kitchen","bar"].includes(role) && ticket.station!==role) throw fail("This ticket belongs to another station.",403);
      ticket.version ||= 1;
      if (ticket.version!==input.version) throw fail("This ticket changed. Refresh before continuing.",409,"STALE_VERSION");
      const order=assertHistoricalWritable(await find(c,s,"order",ticket.orderId));
      if (!["accepted","preparing"].includes(order.status)) throw fail("Only accepted active orders can be prepared.",409);
      if (order.holdExpired || (!b.settings.payLater && paidForBill(order)<order.total)) throw fail("Confirm payment before preparing this order.",409);
      if (["ready","cancelled"].includes(ticket.status)) throw fail("This ticket is already ready.",409);
      if (itemId) {
        const line=ticket.items.find(i=>i.orderLineId===itemId);
        if (!line) throw fail("Ticket item not found.",404);
        if (input.preparedQuantity>line.quantity || input.preparedQuantity<(line.preparedQuantity||0)) throw fail("Prepared quantity must increase within the ordered quantity.",409);
        line.preparedQuantity=input.preparedQuantity;
      } else if (input.status==="ready") {
        for (const line of ticket.items) line.preparedQuantity=line.quantity;
      }
      ticket.status=ticket.items.every(i=>(i.preparedQuantity||0)===i.quantity)?"ready":"preparing";
      ticket.version++;
      ticket.updatedAt=stamp(); ticket.updatedBy=req.user.id;
      await save(c,s,"ticket",ticket.id,ticket);
      const tickets=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='ticket' AND data->>'orderId'=$3",[s.organizationId,s.branchId,order.id])).rows.map(r=>r.data);
      order.status=tickets.length && tickets.every(t=>["ready","cancelled"].includes(t.status))?"ready":"preparing";
      order.version++; order.handlerId=req.user.id; order.handlerName=req.user.name;
      order.history.push({action:order.status,actorId:req.user.id,actorName:req.user.name,station:ticket.station,ticketId:ticket.id,at:stamp()});
      await save(c,s,"order",order.id,order);
      await event(c,s,"station_ticket_updated",req.user,{ticketId:ticket.id,orderId:order.id,station:ticket.station,status:ticket.status,items:ticket.items.map(i=>({orderLineId:i.orderLineId,preparedQuantity:i.preparedQuantity}))});
      return {ticket,order};
    });
  }
  router.post(B+"/tickets/:id/status",guard("orders.prepare"),async(req,res)=>res.json(await change(req,z.object({status:z.enum(["preparing","ready"]),version:z.number().int().positive()}).strict().parse(req.body))));
  router.post(B+"/tickets/:id/items/:orderLineId",guard("orders.prepare"),async(req,res)=>res.json(await change(req,z.object({preparedQuantity:z.number().int().nonnegative(),version:z.number().int().positive()}).strict().parse(req.body),req.params.orderLineId)));
}
