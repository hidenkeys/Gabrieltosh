import { z } from "zod";
import { reservationIntentSchema } from "../customer/reservationRecovery";
export const staffReservationScopeSchema = z
  .object({
    actorId: z.string().uuid(),
    organizationId: z.string().uuid(),
    branchId: z.string().uuid(),
  })
  .strict();
export const staffReservationIntentSchema = reservationIntentSchema;
const money = z.number().int().safe().min(0).max(100000000000);
const minimum = z
  .object({
    enabled: z.boolean(),
    approved: z.boolean(),
    amount: money.nullable(),
    basis: z.literal("net_paid_bill").nullable(),
    shortfallTreatment: z.literal("manager_review"),
    disclosure: z.string().max(500),
    version: z.string().max(120),
  })
  .strict();
const deposit = z
  .object({
    enabled: z.boolean().optional(),
    amount: money,
    cancellationCutoffHours: z.number().int().min(0).max(720),
    refundRule: z.enum(["refundable_before_cutoff", "non_refundable"]),
    approved: z.boolean(),
  })
  .strict();
const timing = z
  .object({
    enabled: z.boolean(),
    approved: z.boolean().optional(),
    version: z.string().uuid().optional(),
    refundHandling: z.literal("manual_review").optional(),
    noShowHandling: z.literal("manual_review").optional(),
    minimumLeadMinutes: z.number().int().nonnegative().optional(),
    maximumAdvanceDays: z.number().int().nonnegative().optional(),
    bufferBeforeMinutes: z.number().int().nonnegative().optional(),
    bufferAfterMinutes: z.number().int().nonnegative().optional(),
    cancellationCutoffMinutes: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional(),
    lateAfterMinutes: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();
const review = z
  .object({
    branchName: z.string().max(160).nullable(),
    timezone: z
      .string()
      .max(120)
      .nullable()
      .refine((value) => {
        if (value === null) return true;
        try {
          new Intl.DateTimeFormat("en-GB", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
    minimumSpendPolicy: minimum.nullable(),
    depositPolicy: deposit.nullable(),
    reservationPolicy: timing.nullable(),
  })
  .strict();
export const staffReservationJournalSchema = staffReservationScopeSchema
  .extend({
    version: z.literal(1),
    referenceOnly: z.literal(false),
    requestKey: z.string().uuid(),
    intent: staffReservationIntentSchema,
    review,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.requestKey !== value.intent.requestKey ||
      (value.review.minimumSpendPolicy?.enabled &&
        (!value.review.minimumSpendPolicy.approved ||
          !value.review.minimumSpendPolicy.amount ||
          value.review.minimumSpendPolicy.basis !== "net_paid_bill" ||
          !value.intent.minimumSpendAcknowledged ||
          value.intent.minimumSpendPolicyVersion !==
            value.review.minimumSpendPolicy.version))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The original request and booking terms do not match.",
      });
  });
const markerSchema = staffReservationScopeSchema
  .extend({
    version: z.literal(1),
    referenceOnly: z.literal(true),
    requestKey: z.string().uuid(),
  })
  .strict();
export type StaffReservationScope = z.infer<typeof staffReservationScopeSchema>;
export type StaffReservationJournal = z.infer<
  typeof staffReservationJournalSchema
>;
export type StaffReservationMarker = z.infer<typeof markerSchema>;
export type StaffReservationRecord =
  StaffReservationJournal | StaffReservationMarker;
const prefix = "mera:staff-reservation:v1:";
const key = (scope: StaffReservationScope) => {
  const s = staffReservationScopeSchema.parse({
    actorId: scope.actorId,
    organizationId: scope.organizationId,
    branchId: scope.branchId,
  });
  return prefix + [s.actorId, s.organizationId, s.branchId].join(":");
};
const event = () =>
  window.dispatchEvent(new window.Event("mera:reservation-recovery"));
export function readStaffReservationJournal(
  scope: StaffReservationScope,
): StaffReservationRecord | null {
  const raw = window.sessionStorage.getItem(key(scope));
  if (raw === null) return null;
  if (new TextEncoder().encode(raw).length > 65536)
    throw Error("Saved reservation is too large to recover safely.");
  const value = JSON.parse(raw),
    record =
      value?.referenceOnly === true
        ? markerSchema.parse(value)
        : staffReservationJournalSchema.parse(value);
  if (
    record.actorId !== scope.actorId ||
    record.organizationId !== scope.organizationId ||
    record.branchId !== scope.branchId
  )
    throw Error(
      "Saved reservation belongs to another staff account or branch.",
    );
  return record;
}
export function saveStaffReservationJournal(value: StaffReservationJournal) {
  const record = staffReservationJournalSchema.parse(value),
    old = readStaffReservationJournal(record),
    raw = JSON.stringify(record);
  if (old && JSON.stringify(old) !== raw)
    throw Error("Resolve the earlier reservation before requesting another.");
  if (new TextEncoder().encode(raw).length > 65536)
    throw Error("Reservation details are too large. No request was sent.");
  window.sessionStorage.setItem(key(record), raw);
  if (window.sessionStorage.getItem(key(record)) !== raw)
    throw Error(
      "This tab could not save the reservation safely. No request was sent.",
    );
  event();
  return record;
}
export function clearStaffReservationJournal(
  scope: StaffReservationScope,
  requestKey: string,
) {
  const old = readStaffReservationJournal(scope);
  if (old && old.requestKey !== requestKey)
    throw Error("A different reservation still needs checking.");
  window.sessionStorage.removeItem(key(scope));
  if (window.sessionStorage.getItem(key(scope)) !== null)
    throw Error(
      "The result is known, but the saved request could not be cleared.",
    );
  event();
}
export function hasStaffReservationJournals(actor?: string) {
  try {
    for (let index = 0; index < window.sessionStorage.length; index++) {
      const item = window.sessionStorage.key(index);
      if (
        item?.startsWith(prefix) &&
        (!actor || item.startsWith(prefix + actor + ":"))
      )
        return true;
    }
    return false;
  } catch {
    return true;
  }
}
export function redactStaffReservationJournals(actorToKeep?: string) {
  try {
    const storage = window.sessionStorage,
      keys = Array.from({ length: storage.length }, (_, index) =>
        storage.key(index),
      ).filter((item): item is string => !!item && item.startsWith(prefix));
    for (const item of keys) {
      const [actorId, organizationId, branchId] = item
        .slice(prefix.length)
        .split(":");
      if (actorToKeep && actorId === actorToKeep) continue;
      const value = JSON.parse(storage.getItem(item) || "null"),
        marker = markerSchema.parse({
          version: 1,
          referenceOnly: true,
          actorId,
          organizationId,
          branchId,
          requestKey: value?.requestKey,
        });
      const raw = JSON.stringify(marker);
      storage.setItem(item, raw);
      if (storage.getItem(item) !== raw)
        throw Error(
          "Private reservation details could not be redacted safely.",
        );
    }
    event();
    return true;
  } catch {
    return false;
  }
}
export function buildStaffReservationJournal(
  scope: StaffReservationScope,
  intent: unknown,
  originalReview: unknown,
): StaffReservationJournal {
  const parsed = staffReservationIntentSchema.parse(intent);
  return staffReservationJournalSchema.parse({
    ...scope,
    version: 1,
    referenceOnly: false,
    requestKey: parsed.requestKey,
    intent: parsed,
    review: (() => {
      const source = originalReview as any;
      return {
        ...source,
        minimumSpendPolicy: source?.minimumSpendPolicy
          ? minimum.strip().parse(source.minimumSpendPolicy)
          : null,
        depositPolicy: source?.depositPolicy
          ? deposit.strip().parse(source.depositPolicy)
          : null,
        reservationPolicy: source?.reservationPolicy
          ? timing.strip().parse(source.reservationPolicy)
          : null,
      };
    })(),
  });
}
export function parseStaffReservationAttempt(
  value: any,
  record: StaffReservationRecord,
) {
  const proof = staffReservationScopeSchema
    .extend({
      requestKey: z.string().uuid(),
      status: z.enum(["recorded", "not_found", "abandoned"]),
      resolutionId: z.string().uuid().optional(),
      reservation: z.record(z.unknown()).optional(),
    })
    .parse(value);
  if (
    proof.actorId !== record.actorId ||
    proof.organizationId !== record.organizationId ||
    proof.branchId !== record.branchId ||
    proof.requestKey !== record.requestKey
  )
    throw Error(
      "The reservation result belongs to a different request or staff account.",
    );
  if (proof.status === "abandoned" && !proof.resolutionId)
    throw Error("Stopping this request could not be confirmed.");
  if (proof.status === "recorded") {
    const r = proof.reservation;
    if (
      !r ||
      !z.string().uuid().safeParse(r.id).success ||
      r.requestKey !== record.requestKey ||
      r.createdBy !== record.actorId ||
      r.guestId !== null
    )
      throw Error("The original reservation could not be verified.");
    if (!record.referenceOnly) {
      for (const field of [
        "displayName",
        "contact",
        "partySize",
        "startsAt",
        "endsAt",
        "notes",
      ] as const)
        if (r[field] !== record.intent[field])
          throw Error(
            "The saved reservation does not match the original details.",
          );
      if ((r.tableId || null) !== (record.intent.tableId || null))
        throw Error("The original reservation table does not match.");
    }
  }
  return proof;
}
