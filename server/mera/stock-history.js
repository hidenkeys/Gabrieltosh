import { z } from "zod";
const B = "/organizations/:organizationId/branches/:branchId";
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status, code: "STOCK_REVIEW_REQUIRED" });
export function stockOutcome(current, type, quantity) {
  if (
    !Number.isSafeInteger(current) ||
    current < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  )
    throw fail("Review the counted stock and quantity.");
  const next = current + (type === "restock" ? quantity : -quantity);
  if (next < 0 || next > 1000000)
    throw fail("This movement exceeds available counted stock or its limit.");
  return next;
}
export function mountMeraStockHistory(
  router,
  { db, guard, scope, locked, find, record, update, event },
) {
  router.get(
    B + "/stock/movements",
    guard("stock.adjust"),
    async (req, res) => {
      const input = z
          .object({
            productId: z.string().uuid(),
            take: z.coerce.number().int().min(1).max(100).default(50),
          })
          .strict()
          .parse(req.query),
        s = scope(req);
      await find(db, s, "product", input.productId);
      const rows = (
        await db.query(
          "SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='stock_movement' AND data->>'productId'=$3 ORDER BY created_at DESC,id DESC LIMIT $4",
          [s.organizationId, s.branchId, input.productId, input.take + 1],
        )
      ).rows;
      res
        .set("Cache-Control", "no-store")
        .json({
          movements: rows.slice(0, input.take).map((r) => r.data),
          hasOlder: rows.length > input.take,
        });
    },
  );
  router.post(
    B + "/stock/movements",
    guard("stock.adjust"),
    async (req, res) => {
      const input = z
          .object({
            requestKey: z.string().uuid(),
            productId: z.string().uuid(),
            variantId: z.string().min(1).max(100).optional(),
            type: z.enum(["restock", "waste", "loss"]),
            quantity: z.number().int().safe().positive().max(1000000),
            expectedStock: z.number().int().nonnegative().max(1000000),
            reason: z.string().trim().min(10).max(500),
          })
          .strict()
          .parse(req.body),
        s = scope(req);
      res.json(
        await locked(s, async (c) => {
          const previous = (
            await c.query(
              "SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='stock_movement' AND data->>'requestKey'=$3 LIMIT 1",
              [s.organizationId, s.branchId, input.requestKey],
            )
          ).rows[0]?.data;
          if (previous) {
            for (const k of [
              "productId",
              "variantId",
              "type",
              "expectedStock",
              "reason",
            ])
              if ((previous[k] ?? null) !== (input[k] ?? null))
                throw fail("This key belongs to a different stock movement.");
            if (previous.requestedQuantity !== input.quantity)
              throw fail("This key belongs to a different stock quantity.");
            if (previous.actorId !== req.user.id)
              throw fail("This key belongs to another staff member.", 403);
            return { movement: previous, replayed: true };
          }
          const product = await find(c, s, "product", input.productId),
            target = input.variantId
              ? product.variants?.find((v) => v.id === input.variantId)
              : product;
          if (!target) throw fail("Variant not found.", 404);
          if (target.stockMode !== "counted")
            throw fail(
              "Set an opening counted balance before recording movements.",
            );
          const before = target.stock || 0;
          if (before !== input.expectedStock)
            throw fail(
              "Stock changed. Review the current balance before recording this movement.",
            );
          target.stock = stockOutcome(before, input.type, input.quantity);
          await update(c, s, "product", product.id, product);
          const movement = await record(c, s, "stock_movement", {
            ...input,
            requestedQuantity: input.quantity,
            quantity: target.stock - before,
            delta: target.stock - before,
            before,
            after: target.stock,
            actorId: req.user.id,
            actorName: req.user.name,
            createdAt: new Date().toISOString(),
          });
          await event(c, s, "stock_" + input.type, req.user, {
            productId: product.id,
            variantId: input.variantId || null,
            movementId: movement.id,
            quantity: input.quantity,
            delta: movement.delta,
            reason: input.reason,
          });
          return { movement, replayed: false };
        }),
      );
    },
  );
}
