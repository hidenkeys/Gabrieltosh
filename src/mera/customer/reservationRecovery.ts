import { z } from "zod";
const id = z.string().uuid();
const money = z.number().int().safe().min(0).max(100000000000);
export const reservationIntentSchema = z
  .object({
    requestKey: id,
    displayName: z.string().min(1).max(100),
    contact: z.string().min(3).max(160),
    partySize: z.number().int().min(1).max(100),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    tableId: id.optional(),
    notes: z.string().max(500),
    minimumSpendAcknowledged: z.boolean().optional(),
    minimumSpendPolicyVersion: z.string().max(120).optional(),
  })
  .strict()
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "The reservation end must follow its start.",
  );
const minimum = z.object({
  enabled: z.boolean(),
  approved: z.boolean(),
  amount: money,
  basis: z.literal("net_paid_bill"),
  shortfallTreatment: z.literal("manager_review"),
  disclosure: z.string().max(500),
  version: z.string().max(120),
});
const deposit = z.object({
  amount: money,
  cancellationCutoffHours: z.number().int().min(0).max(720),
  refundRule: z.enum(["refundable_before_cutoff", "non_refundable"]),
  approved: z.boolean(),
});
const review = z
  .object({
    timezone: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en-GB", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "The original reservation timezone is invalid."),
    minimumSpendPolicy: minimum.nullable(),
    depositPolicy: deposit.nullable(),
  })
  .strict();
export const reservationJournalSchema = z
  .object({
    version: z.literal(1),
    organizationId: id,
    branchId: id,
    sessionRef: id,
    intent: reservationIntentSchema,
    review,
  })
  .strict()
  .superRefine((v, context) => {
    if (
      v.review.minimumSpendPolicy?.enabled &&
      (!v.intent.minimumSpendAcknowledged ||
        v.intent.minimumSpendPolicyVersion !==
          v.review.minimumSpendPolicy.version)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Original booking terms do not match the request.",
      });
  });
export type ReservationJournal = z.infer<typeof reservationJournalSchema>;
export type ReservationScope = { organizationId: string; branchId: string };
export function reservationScope(
  organizationId: unknown,
  branchId: unknown,
  menuBranchId: unknown,
): ReservationScope {
  const value = z
    .object({ organizationId: id, branchId: id })
    .parse({ organizationId, branchId });
  if (value.branchId !== menuBranchId)
    throw Error("The booking branch could not be verified.");
  return value;
}
export const reservationJournalKey = (scope: ReservationScope) =>
  `mera:reservation:tab:v1:${scope.organizationId}:${scope.branchId}`;
export function readReservationJournal(
  scope: ReservationScope,
): ReservationJournal | null {
  const raw = window.sessionStorage.getItem(reservationJournalKey(scope));
  if (!raw) return null;
  if (new TextEncoder().encode(raw).length > 65536)
    throw Error("Saved reservation is too large to recover safely.");
  const value = reservationJournalSchema.parse(JSON.parse(raw));
  if (
    value.organizationId !== scope.organizationId ||
    value.branchId !== scope.branchId
  )
    throw Error("Saved reservation belongs to a different venue.");
  return value;
}
export function saveReservationJournal(value: ReservationJournal) {
  const record = reservationJournalSchema.parse(value),
    raw = JSON.stringify(record),
    old = readReservationJournal(record);
  if (
    old &&
    (JSON.stringify(old.intent) !== JSON.stringify(record.intent) ||
      old.sessionRef !== record.sessionRef)
  )
    throw Error(
      "The earlier reservation must be checked before making another request.",
    );
  if (new TextEncoder().encode(raw).length > 65536)
    throw Error(
      "The reservation is too large to save safely. No booking request was sent.",
    );
  window.sessionStorage.setItem(reservationJournalKey(record), raw);
  if (window.sessionStorage.getItem(reservationJournalKey(record)) !== raw)
    throw Error(
      "This tab could not save the reservation safely. No booking request was sent.",
    );
  return record;
}
export function clearReservationJournal(record: ReservationJournal) {
  const old = readReservationJournal(record);
  if (old && old.intent.requestKey !== record.intent.requestKey)
    throw Error("Another reservation still needs checking.");
  const key = reservationJournalKey(record);
  window.sessionStorage.removeItem(key);
  if (window.sessionStorage.getItem(key))
    throw Error(
      "The result is known, but this tab could not clear the saved reservation. Check its original result before booking again.",
    );
}
export function reservationSession(response: unknown): string {
  return z.object({ sessionRef: id }).parse(response).sessionRef;
}
export function assertReservationSession(
  record: ReservationJournal,
  response: unknown,
) {
  if (reservationSession(response) !== record.sessionRef)
    throw Error(
      "This guest session changed. The saved reservation has not been retried. Ask staff to check it before booking again.",
    );
}
export function buildReservationJournal(
  scope: ReservationScope,
  sessionRef: string,
  intent: unknown,
  policy: any,
  timezone: string,
): ReservationJournal {
  return reservationJournalSchema.parse({
    version: 1,
    ...scope,
    sessionRef,
    intent,
    review: {
      timezone,
      minimumSpendPolicy: policy?.minimumSpendPolicy
        ? minimum.parse(policy.minimumSpendPolicy)
        : null,
      depositPolicy:
        policy?.depositRequired && policy?.depositPolicy?.approved
          ? deposit.parse(policy.depositPolicy)
          : null,
    },
  });
}

const proofSchema = z.object({
  sessionRef: id,
  organizationId: id,
  branchId: id,
});
const recordedReservation = z.object({
  id,
  displayName: z.string().max(100),
  partySize: z.number().int().min(1).max(100),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z.string().min(1).max(60),
  depositAmount: money.optional(),
  depositRequired: money.optional(),
  minimumSpendPolicy: minimum.nullable().optional(),
  tableId: id.nullable().optional(),
  visitId: id.nullable().optional(),
});
export function parseReservationAttempt(
  value: unknown,
  record: ReservationJournal,
) {
  const outcome = z
    .intersection(
      proofSchema,
      z.discriminatedUnion("status", [
        z.object({
          status: z.literal("recorded"),
          reservation: recordedReservation,
        }),
        z.object({ status: z.literal("not_found") }),
        z.object({ status: z.literal("abandoned"), resolutionId: id }),
      ]),
    )
    .parse(value);
  if (
    outcome.sessionRef !== record.sessionRef ||
    outcome.organizationId !== record.organizationId ||
    outcome.branchId !== record.branchId
  )
    throw Error(
      "The saved reservation belongs to another guest session or venue. It has not been retried.",
    );
  return outcome;
}
