import { z } from "zod";
import { moneySchema } from "../../shared/mera-contracts.js";
import { assertCapability } from "./venue-access.js";
import { fail } from "./domain.js";
import {
  beginAccessOperation,
  recordAccessOperation,
} from "./access-attempts.js";
const B = "/organizations/:organizationId/branches/:branchId";
const fields = {
  tradingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(120),
  partySize: z.number().int().min(1).max(1000),
  host: z.string().trim().max(120).nullable().default(null),
  contact: z.string().trim().max(160).nullable().default(null),
  coverCharge: moneySchema.nullable().default(null),
  note: z.string().max(500).default(""),
};
export function mountMeraGuestList(
  router,
  { db, guard, scope, locked, record, readRecords, find, update, event },
) {
  router.get(B + "/guest-list", guard("door.manage"), async (req, res) => {
    const s = scope(req),
      b = (
        await db.query(
          "SELECT settings FROM mera_branches WHERE organization_id=$1 AND id=$2",
          [s.organizationId, s.branchId],
        )
      ).rows[0];
    if (!b) throw fail("Location not found.", 404);
    assertCapability(b, "guest_list");
    const query = z
      .object({ tradingDate: fields.tradingDate.optional() })
      .strict()
      .parse(req.query);
    res.json(
      (await readRecords(db, s.organizationId, s.branchId, "guest_list_entry"))
        .map((r) => r.data)
        .filter(
          (e) =>
            !e.deleted &&
            (!query.tradingDate || e.tradingDate === query.tradingDate),
        ),
    );
  });
  router.get(B + "/guest-list/:id", guard("door.manage"), async (req, res) => {
    const s = scope(req),
      b = (
        await db.query(
          "SELECT settings FROM mera_branches WHERE organization_id=$1 AND id=$2",
          [s.organizationId, s.branchId],
        )
      ).rows[0];
    if (!b) throw fail("Location not found.", 404);
    assertCapability(b, "guest_list");
    const entry = await find(db, s, "guest_list_entry", req.params.id);
    if (entry.deleted) throw fail("Guest list entry not found.", 404);
    res.json(entry);
  });
  async function write(req, res, operation) {
    const create = operation === "create",
      checkIn = operation === "check_in",
      remove = operation === "delete";
    const input = (
      create
        ? z.object({ ...fields, requestKey: z.string().uuid() })
        : checkIn
          ? z.object({
              requestKey: z.string().uuid(),
              version: z.number().int().positive(),
              count: z.number().int().min(1).max(1000),
            })
          : remove
            ? z.object({
                requestKey: z.string().uuid(),
                version: z.number().int().positive(),
              })
            : z.object({
                ...Object.fromEntries(
                  Object.entries(fields).map(([k, v]) => [k, v.optional()]),
                ),
                status: z
                  .enum(["expected", "arrived", "turned_away"])
                  .optional(),
                requestKey: z.string().uuid(),
                version: z.number().int().positive(),
              })
    )
      .strict()
      .parse(req.body);
    const s = scope(req);
    const result = await locked(s, async (c, b) => {
      const attempt = {
        requestKey: input.requestKey,
        operation: "guest_list_" + operation,
        targetId: req.params.id || null,
        intent: { branchId: s.branchId, ...input },
      };
      const prior = await beginAccessOperation(c, req, attempt);
      if (prior) return prior;
      assertCapability(b, "guest_list");
      let entry;
      if (create)
        entry = await record(c, s, "guest_list_entry", {
          ...input,
          status: "expected",
          arrivedCount: 0,
          createdBy: req.user.id,
          updatedAt: new Date().toISOString(),
          version: 1,
        });
      else {
        entry = await find(c, s, "guest_list_entry", req.params.id);
        if (entry.deleted) throw fail("Guest list entry not found.", 404);
        if (entry.version !== input.version)
          throw fail(
            "Guest list entry changed. Refresh before editing.",
            409,
            "STALE_VERSION",
          );
        if (
          checkIn &&
          (entry.status === "turned_away" ||
            entry.arrivedCount + input.count > entry.partySize)
        )
          throw fail(
            "Check-in count exceeds the expected party or the entry was turned away.",
            409,
          );
        const { requestKey, version, ...changes } = input;
        entry = {
          ...entry,
          ...(!checkIn && !remove ? changes : {}),
          ...(checkIn
            ? {
                arrivedCount: entry.arrivedCount + input.count,
                status: "arrived",
              }
            : {}),
          ...(remove ? { deleted: true } : {}),
          updatedAt: new Date().toISOString(),
          version: entry.version + 1,
        };
        await update(c, s, "guest_list_entry", entry.id, entry);
      }
      await event(c, s, "guest_list_" + operation, req.user, {
        entryId: entry.id,
      });
      await recordAccessOperation(c, req, attempt, entry);
      return entry;
    });
    res.status(create ? 201 : 200).json(result);
  }
  router.post(B + "/guest-list", guard("door.manage"), (req, res) =>
    write(req, res, "create"),
  );
  router.patch(B + "/guest-list/:id", guard("door.manage"), (req, res) =>
    write(req, res, "update"),
  );
  router.delete(B + "/guest-list/:id", guard("door.manage"), (req, res) =>
    write(req, res, "delete"),
  );
  router.post(
    B + "/guest-list/:id/check-in",
    guard("door.manage"),
    (req, res) => write(req, res, "check_in"),
  );
}
