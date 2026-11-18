import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { assertFinancialRequestActive } from "./financial-requests.js";
const fail = (message, status = 409, code = "WRITEOFF_REVIEW_REQUIRED") =>
  Object.assign(new Error(message), { status, code });
export function mountMeraWriteoffs(
  router,
  {
    guard,
    scope,
    locked,
    find,
    readRecords,
    record,
    update,
    event,
    orderBalance,
  },
) {
  const B = "/organizations/:organizationId/branches/:branchId";
  router.post(
    B + "/orders/:id/writeoffs",
    guard("refunds.approve"),
    async (req, res) => {
      const input = z
          .object({
            requestKey: z.string().uuid(),
            version: z.number().int().positive(),
            amount: z.number().int().safe().positive().max(100000000000),
            reason: z.string().trim().min(10).max(500),
          })
          .strict()
          .parse(req.body),
        s = scope(req);
      const intentHash = createHash("sha256")
        .update(
          JSON.stringify({
            ...input,
            orderId: req.params.id,
            actorId: req.user.id,
          }),
        )
        .digest("hex");
      res.json(
        await locked(s, async (c) => {
          const previous = (
            await readRecords(c, s.organizationId, s.branchId, "writeoff")
          ).find((r) => r.data.requestKey === input.requestKey)?.data;
          if (previous) {
            if (previous.intentHash !== intentHash)
              throw fail(
                "This key records a different write-off.",
                409,
                "IDEMPOTENCY_CONFLICT",
              );
            return previous;
          }
          await assertFinancialRequestActive(
            c,
            s,
            input.requestKey,
            "writeoff",
            req.user.id,
          );
          const order = await find(
            c,
            s,
            "order",
            z.string().uuid().parse(req.params.id),
          );
          if (order.historicalReadOnly)
            throw fail("Imported historical orders are read-only.");
          if (order.version !== input.version)
            throw fail(
              "This order changed. Review its current outstanding amount.",
              409,
              "STALE_VERSION",
            );
          if (
            !["collected", "completed"].includes(order.status) ||
            !order.collectedAt
          )
            throw fail(
              "A receivable write-off is available only after the goods have been collected.",
            );
          if (input.amount > orderBalance(order))
            throw fail("The write-off exceeds the outstanding receivable.");
          const id = randomUUID(),
            at = new Date().toISOString();
          let remaining = input.amount;
          const bills = (
            await readRecords(c, s.organizationId, s.branchId, "bill")
          )
            .map((r) => r.data)
            .filter(
              (b) =>
                b.status === "open" &&
                b.charges.some((l) => l.orderId === order.id),
            );
          for (const bill of bills) {
            const due =
              bill.charges
                .filter((l) => l.orderId === order.id)
                .reduce((n, l) => n + l.amount, 0) -
              bill.allocations
                .filter((a) => a.orderId === order.id)
                .reduce((n, a) => n + a.amount, 0);
            const balance =
                bill.charges.reduce((n, l) => n + l.amount, 0) -
                bill.allocations.reduce((n, a) => n + a.amount, 0),
              part = Math.min(
                remaining,
                Math.max(0, due),
                Math.max(0, balance),
              );
            if (!part) continue;
            bill.charges.push({
              id: randomUUID(),
              orderId: order.id,
              lineIndex: null,
              quantity: null,
              unitPrice: 0,
              amount: -part,
              name: "Approved receivable write-off",
              writeoffId: id,
            });
            bill.total = bill.charges.reduce((n, l) => n + l.amount, 0);
            bill.paid = bill.allocations.reduce((n, a) => n + a.amount, 0);
            bill.balance = bill.total - bill.paid;
            await update(c, s, "bill", bill.id, bill);
            remaining -= part;
            if (!remaining) break;
          }
          if (remaining)
            throw fail(
              "Resolve unused deposits or inconsistent bill allocations before approving this write-off.",
            );
          const writeoff = await record(
            c,
            s,
            "writeoff",
            {
              ...input,
              intentHash,
              orderId: order.id,
              approvedBy: req.user.id,
              source: "noncash_receivable_outcome",
              createdAt: at,
            },
            id,
          );
          await record(c, s, "ledger", {
            orderId: order.id,
            writeoffId: id,
            type: "receivable_writeoff",
            postings: [
              { account: "bad_debts", debit: input.amount, credit: 0 },
              {
                account: "merchant_receivable",
                debit: 0,
                credit: input.amount,
              },
            ],
            createdAt: at,
          });
          order.writtenOff = (order.writtenOff || 0) + input.amount;
          order.version++;
          order.settlementOutcome =
            orderBalance(order) === 0
              ? "settled_with_writeoff"
              : "partially_written_off";
          order.history.push({
            action: "balance_written_off",
            amount: input.amount,
            reason: input.reason,
            actorId: req.user.id,
            actorName: req.user.name,
            at,
          });
          await update(c, s, "order", order.id, order);
          await event(c, s, "receivable_written_off", req.user, {
            orderId: order.id,
            writeoffId: id,
            amount: input.amount,
            reason: input.reason,
          });
          return writeoff;
        }),
      );
    },
  );
}
