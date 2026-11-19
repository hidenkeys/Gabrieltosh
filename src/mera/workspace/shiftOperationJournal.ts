import { z } from "zod";
const id = z.string().uuid(),
  amount = z.number().safe().int().min(0).max(100000000000);
export const shiftOperationScopeSchema = z
  .object({ actorId: id, organizationId: id, branchId: id })
  .strict();
export type ShiftOperationScope = z.infer<typeof shiftOperationScopeSchema>;
const openBody = z.object({ requestKey: id, openingFloat: amount }).strict(),
  closeBody = z
    .object({
      requestKey: id,
      countedCash: amount,
      reason: z.string().trim().max(300),
    })
    .strict();
const base = shiftOperationScopeSchema.extend({
  version: z.literal(1),
  requestKey: id,
});
export const shiftOperationJournalSchema = z
  .discriminatedUnion("operation", [
    base
      .extend({
        referenceOnly: z.literal(false),
        operation: z.literal("open"),
        shiftId: z.null(),
        body: openBody,
      })
      .strict(),
    base
      .extend({
        referenceOnly: z.literal(false),
        operation: z.literal("close"),
        shiftId: id,
        body: closeBody,
      })
      .strict(),
  ])
  .refine(
    (record) => record.requestKey === record.body.requestKey,
    "Request key mismatch.",
  );
const markerSchema = base
  .extend({
    referenceOnly: z.literal(true),
    operation: z.enum(["open", "close"]),
    shiftId: id.nullable(),
  })
  .strict()
  .refine((value) =>
    value.operation === "open" ? value.shiftId === null : !!value.shiftId,
  );
export type ShiftOperationJournal = z.infer<typeof shiftOperationJournalSchema>;
export type ShiftOperationMarker = z.infer<typeof markerSchema>;
export type ShiftOperationRecord = ShiftOperationJournal | ShiftOperationMarker;
const prefix = "mera:shift-operation:v1:";
function key(scope: ShiftOperationScope) {
  const s = shiftOperationScopeSchema.parse({
    actorId: scope.actorId,
    organizationId: scope.organizationId,
    branchId: scope.branchId,
  });
  return prefix + [s.actorId, s.organizationId, s.branchId].join(":");
}
const event = () =>
  window.dispatchEvent(new window.Event("mera:shift-recovery"));
export function readShiftOperationJournal(
  scope: ShiftOperationScope,
): ShiftOperationRecord | null {
  const raw = window.sessionStorage.getItem(key(scope));
  if (raw === null) return null;
  if (new TextEncoder().encode(raw).length > 16384)
    throw Error("Saved shift request is too large.");
  const value = JSON.parse(raw),
    record =
      value?.referenceOnly === true
        ? markerSchema.parse(value)
        : shiftOperationJournalSchema.parse(value);
  if (
    record.actorId !== scope.actorId ||
    record.organizationId !== scope.organizationId ||
    record.branchId !== scope.branchId
  )
    throw Error("Shift request belongs to another account or branch.");
  return record;
}
export function saveShiftOperationJournal(value: ShiftOperationJournal) {
  const record = shiftOperationJournalSchema.parse(value),
    old = readShiftOperationJournal(record),
    raw = JSON.stringify(record);
  if (old && JSON.stringify(old) !== raw)
    throw Error("Resolve the original shift operation first.");
  if (new TextEncoder().encode(raw).length > 16384)
    throw Error("Shift request is too large.");
  window.sessionStorage.setItem(key(record), raw);
  if (window.sessionStorage.getItem(key(record)) !== raw)
    throw Error("This tab could not safely save shift recovery details.");
  event();
  return record;
}
export function clearShiftOperationJournal(
  scope: ShiftOperationScope,
  requestKey: string,
) {
  const old = readShiftOperationJournal(scope);
  if (old && old.requestKey !== requestKey)
    throw Error("A different shift request needs checking.");
  window.sessionStorage.removeItem(key(scope));
  if (window.sessionStorage.getItem(key(scope)) !== null)
    throw Error(
      "The result is known but recovery details could not be cleared.",
    );
  event();
}
export function hasShiftOperationJournals(actor?: string) {
  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (
        k?.startsWith(prefix) &&
        (!actor || k.startsWith(prefix + actor + ":"))
      )
        return true;
    }
    return false;
  } catch {
    return true;
  }
}
export function redactShiftOperationJournals(actorToKeep?: string) {
  try {
    const store = window.sessionStorage,
      keys = Array.from({ length: store.length }, (_, i) =>
        store.key(i),
      ).filter((v): v is string => !!v && v.startsWith(prefix));
    for (const k of keys) {
      const [actorId, organizationId, branchId] = k
        .slice(prefix.length)
        .split(":");
      if (actorToKeep === actorId) continue;
      const full = JSON.parse(store.getItem(k) || "null"),
        marker = markerSchema.parse({
          version: 1,
          referenceOnly: true,
          actorId,
          organizationId,
          branchId,
          requestKey: full?.requestKey,
          operation: full?.operation,
          shiftId: full?.shiftId,
        }),
        raw = JSON.stringify(marker);
      store.setItem(k, raw);
      if (store.getItem(k) !== raw) return false;
    }
    event();
    return true;
  } catch {
    return false;
  }
}
export function parseShiftAmount(value: string): number {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim()))
    throw Error("Enter a cash amount with no more than two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  return amount.parse(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}
export function parseShiftOperationAttempt(
  value: any,
  record: ShiftOperationRecord,
) {
  const proof = shiftOperationScopeSchema
    .extend({
      requestKey: id,
      operation: z.enum(["open", "close"]),
      shiftId: id.nullable(),
      status: z.enum(["recorded", "not_found", "abandoned"]),
      resolutionId: id.optional(),
      shift: z.record(z.unknown()).optional(),
      resultBasis: z.string().optional(),
      operationRecord: z.record(z.unknown()).optional(),
    })
    .parse(value);
  for (const field of [
    "actorId",
    "organizationId",
    "branchId",
    "requestKey",
    "operation",
    "shiftId",
  ] as const)
    if (proof[field] !== record[field])
      throw Error("This shift result belongs to a different request.");
  if (proof.status === "abandoned" && !proof.resolutionId)
    throw Error("Stopping this shift request is unconfirmed.");
  if (proof.status === "recorded") {
    const op = proof.operationRecord,
      shift = proof.shift;
    if (
      proof.resultBasis !== "recorded_operation_snapshot" ||
      !op ||
      !shift ||
      !id.safeParse(op.id).success ||
      !id.safeParse(shift.id).success ||
      op.shiftId !== shift.id ||
      op.operation !== record.operation ||
      op.actorId !== record.actorId ||
      op.requestKey !== record.requestKey ||
      !z.string().datetime().safeParse(op.createdAt).success
    )
      throw Error("Original shift operation could not be verified.");
    if (record.operation === "close" && shift.id !== record.shiftId)
      throw Error("Original shift target differs.");
    const operationIntent =
      record.operation === "open"
        ? z.object({ openingFloat: amount }).strict().parse(op.intent)
        : z
            .object({
              countedCash: amount,
              reason: z.string().max(300),
              shiftId: id,
            })
            .strict()
            .parse(op.intent);
    if (
      record.operation === "close" &&
      (operationIntent as any).shiftId !== record.shiftId
    )
      throw Error("Recorded close target differs.");
    if (!record.referenceOnly) {
      const expected =
        record.operation === "open"
          ? { openingFloat: record.body.openingFloat }
          : {
              countedCash: record.body.countedCash,
              reason: record.body.reason,
              shiftId: record.shiftId,
            };
      const actual = op.intent;
      if (
        !actual ||
        typeof actual !== "object" ||
        Object.keys(actual).length !== Object.keys(expected).length ||
        Object.entries(expected).some(([k, v]) => (actual as any)[k] !== v)
      )
        throw Error(
          "The recorded operation does not match the original cash details.",
        );
    }
  }
  return proof;
}
