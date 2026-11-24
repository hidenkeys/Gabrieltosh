import { z } from "zod";
import { fail } from "./domain.js";
import { permissions } from "../../shared/mera-contracts.js";
const O = "/organizations/:organizationId/stock-transfers";
const key = z.string().uuid();
const identity = {
  code: z.string().trim().min(1).max(100),
  variantName: z.string().trim().min(1).max(100).nullable().default(null),
};
const lineKey = (l) => JSON.stringify([l.code, l.variantName ?? null]);
const distinct = (lines) => new Set(lines.map(lineKey)).size === lines.length;
const sendSchema = z
  .object({
    requestKey: key,
    fromBranchId: key,
    toBranchId: key,
    lines: z
      .array(
        z
          .object({
            ...identity,
            quantity: z.number().int().positive().max(1000000),
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .refine(distinct, "Transfer lines must be distinct"),
    note: z.string().trim().max(500).default(""),
  })
  .strict();
const actionSchema = z
  .object({
    requestKey: key,
    version: z.number().int().positive(),
    lines: z
      .array(
        z
          .object({
            ...identity,
            receivedQuantity: z.number().int().min(0).max(1000000),
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .refine(distinct)
      .optional(),
  })
  .strict();
const stamp = () => new Date().toISOString();
export function mountMeraStockTransfers(
  router,
  { db, membership, record, update, event },
) {
  const scope = (org, branch) => ({ organizationId: org, branchId: branch });
  async function transaction(org, branches, fn) {
    return db.transaction(async (c) => {
      const organization = (
        await c.query(
          "SELECT id FROM mera_organizations WHERE id=$1 FOR UPDATE",
          [org],
        )
      ).rows[0];
      if (!organization) throw fail("Organization not found.", 404);
      for (const branch of [...new Set(branches)].sort()) {
        if (
          !(
            await c.query(
              "SELECT id FROM mera_branches WHERE id=$1 AND organization_id=$2 FOR UPDATE",
              [branch, org],
            )
          ).rows.length
        )
          throw fail("Branch not found.", 404);
      }
      return fn(c);
    });
  }
  async function products(c, s) {
    return (
      await c.query(
        "SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='product' ORDER BY id",
        [s.organizationId, s.branchId],
      )
    ).rows.map((r) => r.data);
  }
  function target(items, line) {
    const matches = items.filter(
      (p) => p.code === line.code && (p.kind ?? "single") === "single",
    );
    if (matches.length !== 1)
      throw fail(
        "Transfer code must match one single product at this location.",
        409,
        "TRANSFER_PRODUCT_REQUIRED",
      );
    const product = matches[0],
      variants =
        line.variantName == null
          ? [product]
          : (product.variants || []).filter((v) => v.name === line.variantName);
    if (variants.length !== 1 || variants[0].stockMode !== "counted")
      throw fail(
        "Transfer requires a matching counted product or size.",
        409,
        "TRANSFER_PRODUCT_REQUIRED",
      );
    return {
      product,
      balance: variants[0],
      variantId: line.variantName == null ? null : variants[0].id,
    };
  }
  async function move(
    c,
    s,
    items,
    line,
    delta,
    reason,
    req,
    transferId,
    loss = 0,
  ) {
    const { product, balance, variantId } = target(items, line),
      before = balance.stock ?? 0,
      after = before + delta;
    if (!Number.isSafeInteger(after) || after < 0 || after > 1000000)
      throw fail(
        "Transfer exceeds available stock or its limit.",
        409,
        "OUT_OF_STOCK",
      );
    balance.stock = after;
    await update(c, s, "product", product.id, product);
    await record(c, s, "stock_movement", {
      productId: product.id,
      variantId,
      transferId,
      type: reason,
      reason,
      quantity: loss ? -loss : delta,
      delta,
      before,
      after,
      actorId: req.user.id,
      actorName: req.user.name,
      createdAt: stamp(),
    });
  }
  function replay(old, action, input, req) {
    const saved = old?.[action];
    if (!saved || saved.requestKey !== input.requestKey) return false;
    if (saved.actorId !== req.user.id || saved.input !== JSON.stringify(input))
      throw fail(
        "This request key belongs to a different transfer action.",
        409,
        "REQUEST_KEY_CONFLICT",
      );
    return true;
  }
  async function usedKey(c, org, requestKey, except) {
    const rows = (
      await c.query(
        "SELECT data FROM mera_records WHERE organization_id=$1 AND kind='stock_transfer' ORDER BY id",
        [org],
      )
    ).rows;
    if (
      rows.some(
        ({ data: t }) =>
          t.id !== except &&
          [
            t.requestKey,
            t.receiveRequest?.requestKey,
            t.cancelRequest?.requestKey,
          ].includes(requestKey),
      )
    )
      throw fail(
        "This request key belongs to another transfer.",
        409,
        "REQUEST_KEY_CONFLICT",
      );
  }
  router.post(O, async (req, res) => {
    const input = sendSchema.parse(req.body),
      org = req.params.organizationId;
    await membership(req, org, input.fromBranchId, "stock.transfer");
    if (input.fromBranchId === input.toBranchId)
      throw fail("Choose a different receiving location.", 409);
    res.status(201).json(
      await transaction(
        org,
        [input.fromBranchId, input.toBranchId],
        async (c) => {
          const old = (
            await c.query(
              "SELECT data FROM mera_records WHERE organization_id=$1 AND kind='stock_transfer' AND data->>'requestKey'=$2 LIMIT 1",
              [org, input.requestKey],
            )
          ).rows[0]?.data;
          if (old) {
            if (!replay(old, "sendRequest", input, req))
              throw fail("Request key conflict.", 409);
            return { transfer: old, replayed: true };
          }
          await usedKey(c, org, input.requestKey);
          const s = scope(org, input.fromBranchId),
            items = await products(c, s);
          const lines = input.lines.map((l) => {
            const { product, balance } = target(items, l);
            return {
              ...l,
              name: product.name,
              unitCost: balance.unitCost ?? product.unitCost ?? null,
              receivedQuantity: null,
            };
          });
          const transfer = await record(c, s, "stock_transfer", {
            ...input,
            lines,
            status: "sent",
            sentBy: req.user.id,
            sentByName: req.user.name || null,
            sentAt: stamp(),
            receivedBy: null,
            receivedAt: null,
            cancelledBy: null,
            cancelledAt: null,
            version: 1,
            sendRequest: {
              requestKey: input.requestKey,
              actorId: req.user.id,
              input: JSON.stringify(input),
            },
          });
          for (const line of lines)
            await move(
              c,
              s,
              items,
              line,
              -line.quantity,
              "transfer_out",
              req,
              transfer.id,
            );
          await event(c, s, "stock_transfer_sent", req.user, {
            transferId: transfer.id,
            toBranchId: input.toBranchId,
          });
          return { transfer, replayed: false };
        },
      ),
    );
  });
  for (const action of ["receive", "cancel"])
    router.post(O + "/:id/" + action, async (req, res) => {
      const input = actionSchema.parse(req.body),
        org = req.params.organizationId;
      if (action === "cancel" && input.lines)
        throw fail("Cancellation does not accept received quantities.", 400);
      if (!req.user) throw fail("Sign in to continue.", 401);
      const initial = (
        await db.query(
          "SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND kind='stock_transfer'",
          [req.params.id, org],
        )
      ).rows[0]?.data;
      if (!initial) throw fail("Transfer not found.", 404);
      await membership(
        req,
        org,
        action === "receive" ? initial.toBranchId : initial.fromBranchId,
        action === "receive" ? "stock.receive" : "stock.transfer",
      );
      res.json(
        await transaction(
          org,
          [initial.fromBranchId, initial.toBranchId],
          async (c) => {
            const transfer = (
              await c.query(
                "SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND kind='stock_transfer'",
                [req.params.id, org],
              )
            ).rows[0]?.data;
            if (!transfer) throw fail("Transfer not found.", 404);
            if (replay(transfer, action + "Request", input, req))
              return { transfer, replayed: true };
            await usedKey(c, org, input.requestKey, transfer.id);
            if (
              [
                transfer.requestKey,
                transfer.receiveRequest?.requestKey,
                transfer.cancelRequest?.requestKey,
              ].includes(input.requestKey)
            )
              throw fail(
                "This key belongs to a different transfer action.",
                409,
                "REQUEST_KEY_CONFLICT",
              );
            if (transfer.version !== input.version)
              throw fail(
                "Transfer changed. Refresh first.",
                409,
                "STALE_VERSION",
              );
            if (transfer.status !== "sent")
              throw fail(
                "Only a sent transfer can be received or cancelled.",
                409,
              );
            if (
              input.lines &&
              (input.lines.length !== transfer.lines.length ||
                input.lines.some(
                  (l) => !transfer.lines.some((t) => lineKey(t) === lineKey(l)),
                ))
            )
              throw fail("Received quantities must match all sent lines.", 400);
            const source = scope(org, transfer.fromBranchId),
              destination = scope(org, transfer.toBranchId),
              sourceItems = await products(c, source),
              destinationItems =
                action === "receive" ? await products(c, destination) : [];
            for (const line of transfer.lines) {
              if (action === "cancel")
                await move(
                  c,
                  source,
                  sourceItems,
                  line,
                  line.quantity,
                  "transfer_cancel",
                  req,
                  transfer.id,
                );
              else {
                const quantity =
                  input.lines?.find((l) => lineKey(l) === lineKey(line))
                    ?.receivedQuantity ?? line.quantity;
                if (quantity > line.quantity)
                  throw fail(
                    "Received quantity cannot exceed sent quantity.",
                    400,
                  );
                await move(
                  c,
                  destination,
                  destinationItems,
                  line,
                  quantity,
                  "transfer_in",
                  req,
                  transfer.id,
                );
                if (quantity < line.quantity)
                  await move(
                    c,
                    source,
                    sourceItems,
                    line,
                    0,
                    "transfer_loss",
                    req,
                    transfer.id,
                    line.quantity - quantity,
                  );
                line.receivedQuantity = quantity;
              }
            }
            transfer.status = action === "receive" ? "received" : "cancelled";
            transfer[action === "receive" ? "receivedBy" : "cancelledBy"] =
              req.user.id;
            transfer[action === "receive" ? "receivedAt" : "cancelledAt"] =
              stamp();
            transfer.version++;
            transfer[action + "Request"] = {
              requestKey: input.requestKey,
              actorId: req.user.id,
              input: JSON.stringify(input),
            };
            await update(c, source, "stock_transfer", transfer.id, transfer);
            await event(
              c,
              source,
              "stock_transfer_" + transfer.status,
              req.user,
              { transferId: transfer.id },
            );
            return { transfer, replayed: false };
          },
        ),
      );
    });
  router.get(O, async (req, res) => {
    const query = z
        .object({
          status: z.enum(["sent", "received", "cancelled"]).optional(),
        })
        .strict()
        .parse(req.query),
      org = req.params.organizationId;
    if (!req.user) throw fail("Sign in to continue.", 401);
    const branches = (
      await db.query(
        "SELECT id,name,timezone FROM mera_branches WHERE organization_id=$1 ORDER BY id",
        [org],
      )
    ).rows;
    const visible = new Set();
    for (const b of branches)
      try {
        await membership(req, org, b.id, permissions);
        visible.add(b.id);
      } catch (e) {
        if (e.status !== 403) throw e;
      }
    if (!visible.size)
      throw fail(
        "You do not have access to these transfers.",
        403,
        "FORBIDDEN",
      );
    const transfers = (
      await db.query(
        "SELECT data FROM mera_records WHERE organization_id=$1 AND kind='stock_transfer' ORDER BY created_at DESC,id DESC",
        [org],
      )
    ).rows
      .map((r) => r.data)
      .filter(
        (t) =>
          (visible.has(t.fromBranchId) || visible.has(t.toBranchId)) &&
          (!query.status || t.status === query.status),
      );
    // Receivers may not have the sending branch in their workspace context.
    // Expose names only for already-authorized transfer records, never a staff directory.
    const missingSenders = [...new Set(transfers.filter((t) => !t.sentByName && t.sentBy).map((t) => t.sentBy))];
    const senders = missingSenders.length
      ? (await db.query("SELECT id,name FROM users WHERE id::text=ANY($1::text[])", [missingSenders])).rows
      : [];
    const projected = transfers.map((t) => {
      const source = branches.find((b) => b.id === t.fromBranchId);
      const destination = branches.find((b) => b.id === t.toBranchId);
      return { ...t, fromBranchName: source?.name || null, toBranchName: destination?.name || null,
        timeZone: source?.timezone || destination?.timezone || "UTC",
        sentByName: t.sentByName || senders.find((u) => String(u.id) === String(t.sentBy))?.name || null };
    });
    res.set("Cache-Control", "no-store").json({ transfers: projected });
  });
}
