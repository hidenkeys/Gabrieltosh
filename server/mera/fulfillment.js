import { z } from "zod";
const fail = (message, status = 409, code = "FULFILLMENT_CONFLICT") =>
  Object.assign(new Error(message), { status, code });
export function mountMeraFulfillment(
  router,
  {
    guard,
    scope,
    locked,
    record,
    readRecords,
    find,
    update,
    event,
    paidForBill,
  },
) {
  const B = "/organizations/:organizationId/branches/:branchId";
  router.post(
    B + "/orders/:id/items/:lineId/fulfillment",
    guard("orders.fulfill"),
    async (req, res) => {
      const input = z
          .object({
            requestKey: z.string().uuid(),
            version: z.number().int().positive(),
            fulfilledQuantity: z.number().int().min(1).max(100),
            reason: z.string().trim().max(300).default(""),
          })
          .strict()
          .parse(req.body),
        s = scope(req);
      res.json(
        await locked(s, async (c, b) => {
          const prior = (
            await readRecords(
              c,
              s.organizationId,
              s.branchId,
              "item_fulfillment",
            )
          ).find((r) => r.data.requestKey === input.requestKey)?.data;
          if (prior) {
            if (
              prior.actorId !== req.user.id ||
              prior.orderId !== req.params.id ||
              prior.orderLineId !== req.params.lineId ||
              ["requestKey", "version", "fulfilledQuantity", "reason"].some(
                (key) => prior.intent[key] !== input[key],
              )
            )
              throw fail("This key records a different service handoff.");
            return prior.result;
          }
          const order = await find(
            c,
            s,
            "order",
            z.string().uuid().parse(req.params.id),
          );
          if (order.version !== input.version)
            throw fail(
              "This order changed. Refresh before recording a handoff.",
            );
          if (!["accepted", "preparing", "ready"].includes(order.status))
            throw fail(
              "Only an active accepted order can be handed over in parts.",
            );
          if (!b.settings.payLater && paidForBill(order) < order.total)
            throw fail(
              "Payment must be confirmed before handing over items.",
              409,
              "PAYMENT_REQUIRED",
            );
          const line = order.items.find(
            (i) => i.orderLineId === req.params.lineId,
          );
          if (!line) throw fail("Order item not found.", 404);
          if (
            input.fulfilledQuantity <= (line.fulfilledQuantity || 0) ||
            input.fulfilledQuantity > line.quantity
          )
            throw fail(
              "Handed-over quantity must increase and stay within the current item quantity.",
            );
          const tickets = (
            await readRecords(c, s.organizationId, s.branchId, "ticket")
          )
            .map((r) => r.data)
            .filter((t) => t.orderId === order.id && t.status !== "cancelled");
          const prepared = tickets
            .flatMap((t) =>
              t.items.map((i) => ({
                quantity:
                  t.status === "ready" ? i.quantity : i.preparedQuantity || 0,
                id: i.orderLineId,
              })),
            )
            .filter((i) => i.id === line.orderLineId)
            .reduce((n, i) => n + i.quantity, 0);
          if (input.fulfilledQuantity > prepared)
            throw fail("Only prepared items can be handed over.");
          const added = input.fulfilledQuantity - (line.fulfilledQuantity || 0),
            at = new Date().toISOString();
          line.fulfilledQuantity = input.fulfilledQuantity;
          line.lastFulfilledAt = at;
          order.version++;
          order.history.push({
            action: "items_handed_over",
            orderLineId: line.orderLineId,
            quantity: added,
            actorId: req.user.id,
            actorName: req.user.name,
            reason: input.reason,
            at,
          });
          await update(c, s, "order", order.id, order);
          const result = {
            orderId: order.id,
            orderLineId: line.orderLineId,
            fulfilledQuantity: line.fulfilledQuantity,
            version: order.version,
            allItemsHandedOver: order.items.every(
              (i) => (i.fulfilledQuantity || 0) === i.quantity,
            ),
            recognitionBasis: "whole_order_collected",
          };
          await record(c, s, "item_fulfillment", {
            requestKey: input.requestKey,
            intent: input,
            orderId: order.id,
            orderLineId: line.orderLineId,
            actorId: req.user.id,
            result,
            createdAt: at,
          });
          await event(c, s, "order_items_handed_over", req.user, {
            orderId: order.id,
            orderLineId: line.orderLineId,
            quantity: added,
            reason: input.reason,
          });
          return result;
        }),
      );
    },
  );
}
