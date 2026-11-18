import { z } from "zod";
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status });
const publicVisit = (v) => ({
  id: v.id,
  tableId: v.tableId,
  tableIds: v.tableIds || [v.tableId],
  tableName: v.tableName,
  status: v.status,
  version: v.version || 1,
  displayName: v.displayName,
  createdAt: v.createdAt,
});
const schema = z
  .object({
    requestKey: z.string().uuid(),
    version: z.number().int().positive(),
    primaryTableId: z.string().uuid(),
    tableIds: z
      .array(z.string().uuid())
      .min(1)
      .max(12)
      .refine((v) => new Set(v).size === v.length, "Choose each table once."),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine(
    (v) => v.tableIds.includes(v.primaryTableId),
    "The main table must be included.",
  );
export function mountMeraTableService(
  router,
  { db, guard, scope, locked, record, readRecords, find, update, event },
) {
  router.post(
    "/organizations/:organizationId/branches/:branchId/visits/:id/tables",
    guard("tables.manage"),
    async (req, res) => {
      const input = schema.parse(req.body),
        s = scope(req),
        intent = JSON.stringify({
          ...input,
          tableIds: [...input.tableIds].sort(),
        });
      res.json(
        await locked(s, async (c) => {
          const prior = (
            await readRecords(
              c,
              s.organizationId,
              s.branchId,
              "visit_table_change",
            )
          ).find((r) => r.data.requestKey === input.requestKey);
          if (prior) {
            if (
              prior.data.intent !== intent ||
              prior.data.visitId !== req.params.id ||
              prior.data.actorId !== req.user.id
            )
              throw fail("This request key records a different table change.");
            return prior.data.result;
          }
          const visit = await find(
            c,
            s,
            "visit",
            z.string().uuid().parse(req.params.id),
          );
          if (visit.status !== "open")
            throw fail(
              "Only the current open visit can move or combine tables.",
            );
          if ((visit.version || 1) !== input.version)
            throw fail(
              "This visit changed. Refresh before changing its tables.",
            );
          const currentIds = visit.tableIds || [visit.tableId];
          const others = (
            await readRecords(c, s.organizationId, s.branchId, "visit")
          )
            .map((r) => r.data)
            .filter((v) => v.id !== visit.id && v.status === "open");
          if (
            others.some((v) =>
              (v.tableIds || [v.tableId]).some((id) =>
                input.tableIds.includes(id),
              ),
            )
          )
            throw fail(
              "Another active party already occupies a selected table.",
            );
          const target = [];
          for (const id of input.tableIds) {
            const table = await find(c, s, "table", id);
            if (!currentIds.includes(id) && table.status !== "available")
              throw fail(
                "Select available tables or tables already held by this visit.",
              );
            target.push(table);
          }
          const capacity = target.reduce((sum, t) => sum + t.capacity, 0);
          if (visit.partySize && capacity < visit.partySize)
            throw fail("The selected tables do not have enough capacity.");
          for (const id of currentIds.filter(
            (id) => !input.tableIds.includes(id),
          )) {
            const table = await find(c, s, "table", id);
            table.status = "cleaning";
            await update(c, s, "table", id, table);
          }
          for (const table of target) {
            table.status = "occupied";
            await update(c, s, "table", table.id, table);
          }
          const previousTables = currentIds;
          visit.tableId = input.primaryTableId;
          visit.tableIds = input.tableIds;
          visit.tableName = target.map((t) => t.name).join(" + ");
          visit.version = (visit.version || 1) + 1;
          visit.tableHistory = [
            ...(visit.tableHistory || []),
            {
              from: previousTables,
              to: input.tableIds,
              reason: input.reason,
              actorId: req.user.id,
              at: new Date().toISOString(),
            },
          ];
          await update(c, s, "visit", visit.id, visit);
          const result = publicVisit(visit);
          await record(c, s, "visit_table_change", {
            requestKey: input.requestKey,
            intent,
            visitId: visit.id,
            actorId: req.user.id,
            result,
            createdAt: new Date().toISOString(),
          });
          await event(c, s, "visit_tables_changed", req.user, {
            visitId: visit.id,
            from: previousTables,
            to: input.tableIds,
            reason: input.reason,
          });
          return result;
        }),
      );
    },
  );
}
