import { allowedCurrencies } from "../../../shared/mera-money.js";
import { z } from "zod";
// Bounds mirror shared/mera-contracts.js orderInputSchema/moneySchema. This is
// validation of untrusted tab storage, never pricing or authorization.
const money = z.number().int().safe().min(0).max(100000000000);
const item = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(100),
    variantId: z.string().max(100).optional(),
    modifiers: z.array(z.string().max(100)).max(30),
    choices: z
      .array(
        z
          .object({
            groupId: z.string().min(1),
            productId: z.string().uuid(),
            variantId: z.string().nullable().optional(),
          })
          .strict(),
      )
      .max(240)
      .optional(),
  })
  .strict();
export const checkoutIntentSchema = z
  .object({
    requestKey: z.string().uuid(),
    menuVersion: z.number().int().positive(),
    quoteId: z.string().uuid().optional(),
    displayName: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => value.trim() === value),
    fulfillment: z.enum(["counter_pickup", "takeaway", "table_service"]),
    visitId: z.string().uuid().optional(),
    tableId: z.string().uuid().optional(),
  qrId: z.string().uuid().optional(),
    reservationId: z.string().uuid().optional(),
    items: z.array(item).min(1).max(100),
    note: z.string().max(500),
  })
  .strict();
export const basketLineSchema = z
  .object({
    key: z.string().min(1).max(5000),
    productId: z.string().uuid(),
    name: z.string().min(1).max(120),
    quantity: z.number().int().min(1).max(100),
    unitPrice: money,
    variantId: z.string().max(100).optional(),
    modifiers: z.array(z.string().max(100)).max(30),
    choices: z
      .array(
        z
          .object({
            groupId: z.string().min(1),
            productId: z.string().uuid(),
            variantId: z.string().nullable().optional(),
          })
          .strict(),
      )
      .max(240)
      .optional(),
    summary: z.string().max(4000),
  })
  .strict();
const quote = z
  .object({
    id: z.string().uuid(),
    expiresAt: z.string().datetime(),
    menuVersion: z.number().int().positive(),
    currency: z.enum(allowedCurrencies),
    subtotal: money,
    discount: money,
    serviceCharge: money,
    tax: money,
    total: money,
    lines: z
      .array(
        z
          .object({
            type: z.string().max(60),
            label: z.string().max(120),
            amount: z
              .number()
              .int()
              .safe()
              .min(-100000000000)
              .max(100000000000),
          })
          .strict(),
      )
      .max(20),
    policyVersion: z.string().max(120).nullable(),
  })
  .strict();
const scopeSchema = z
  .object({ organizationId: z.string().uuid(), branchId: z.string().uuid() })
  .strict();
export type CheckoutScope = z.infer<typeof scopeSchema>;
export const checkoutJournalSchema = z
  .object({
    version: z.literal(1),
    organizationId: z.string().uuid(),
    branchId: z.string().uuid(),
    sessionRef: z.string().uuid(),
    savedAt: z.string().datetime(),
    intent: checkoutIntentSchema,
    review: z
      .object({ lines: z.array(basketLineSchema).min(1).max(100), quote: quote.nullable() })
      .strict(),
  })
  .strict()
  .superRefine((record, context) => {
    const problem = (message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, message });
    // Table orders come from a joined visit or a scanned table QR.
    if (
      record.intent.fulfillment === "table_service" &&
      !record.intent.visitId &&
      !record.intent.tableId
    )
      problem("Table orders require the original visit or table context.");
    if (record.review.lines.length !== record.intent.items.length)
      problem("Saved item review does not match the original order.");
    record.intent.items.forEach((item, index) => {
      const line = record.review.lines[index];
      if (
        !line ||
        item.productId !== line.productId ||
        item.quantity !== line.quantity ||
        item.variantId !== line.variantId ||
        JSON.stringify(item.modifiers) !== JSON.stringify(line.modifiers)
      )
        problem("Saved item review does not match the original order.");
    });
    if (
      new Set(record.review.lines.map((line) => line.key)).size !==
      record.review.lines.length
    )
      problem("Duplicate saved line identity.");
    const estimate = record.review.lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );
    if (!Number.isSafeInteger(estimate) || estimate > 100000000000)
      problem("Saved review amount exceeds the supported range.");
    if (record.intent.quoteId) {
      if (
        !record.review.quote ||
        record.review.quote.id !== record.intent.quoteId ||
        record.review.quote.menuVersion !== record.intent.menuVersion
      )
        problem("Original quote review is missing.");
    } else if (record.review.quote) problem("Unexpected quote review.");
    if (record.review.quote) {
      const q = record.review.quote;
      if (
        q.discount > q.subtotal ||
        q.subtotal - q.discount + q.serviceCharge + q.tax !== q.total
      )
        problem("Saved quote amounts do not reconcile.");
    }
  });
export type CheckoutJournal = z.infer<typeof checkoutJournalSchema>;
export type TabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const MAX_CHECKOUT_JOURNAL_BYTES = 512 * 1024;
export class CheckoutRecoveryError extends Error {}
const canonical = (value: any): any =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export function checkoutJournalKey(scope: CheckoutScope) {
  const parsed = scopeSchema.parse(scope);
  return (
    "mera:checkout:tab:v1:" + parsed.organizationId + ":" + parsed.branchId
  );
}
function storageOrThrow(storage?: TabStorage) {
  try {
    return storage || window.sessionStorage;
  } catch {
    throw new CheckoutRecoveryError(
      "This tab cannot access saved order recovery. Keep it open and ask staff to check before placing another order.",
    );
  }
}
function validated(record: unknown, scope: CheckoutScope) {
  const parsed = checkoutJournalSchema.safeParse(record);
  if (
    !parsed.success ||
    parsed.data.organizationId !== scope.organizationId ||
    parsed.data.branchId !== scope.branchId
  )
    throw new CheckoutRecoveryError(
      "The saved order could not be read safely for this venue. It has not been resubmitted. Ask staff to review it before ordering again.",
    );
  return parsed.data;
}
export function readCheckoutJournal(
  scope: CheckoutScope,
  storage?: TabStorage,
): CheckoutJournal | null {
  const target = storageOrThrow(storage);
  let raw: string | null;
  try {
    raw = target.getItem(checkoutJournalKey(scope));
  } catch {
    throw new CheckoutRecoveryError(
      "This tab could not read saved order recovery. No order has been resubmitted.",
    );
  }
  if (raw === null) return null;
  if (
    raw.length > MAX_CHECKOUT_JOURNAL_BYTES ||
    new TextEncoder().encode(raw).length > MAX_CHECKOUT_JOURNAL_BYTES
  )
    throw new CheckoutRecoveryError(
      "The saved order is too large to restore safely. Ask staff to review it before ordering again.",
    );
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    throw new CheckoutRecoveryError(
      "The saved order is damaged. It has not been resubmitted. Ask staff to review it before ordering again.",
    );
  }
  return validated(record, scope);
}
export function buildCheckoutJournal(input: {
  scope: CheckoutScope;
  sessionRef: string;
  intent: unknown;
  lines: unknown[];
  quote: any;
}): CheckoutJournal {
  const safeQuote =
    input.intent &&
    typeof input.intent === "object" &&
    "quoteId" in input.intent &&
    input.quote
      ? Object.fromEntries(
          [
            "id",
            "expiresAt",
            "menuVersion",
            "currency",
            "subtotal",
            "discount",
            "serviceCharge",
            "tax",
            "total",
            "lines",
            "policyVersion",
          ].map((key) => [key, input.quote[key]]),
        )
      : null;
  const record = {
    version: 1,
    ...input.scope,
    sessionRef: input.sessionRef,
    savedAt: new Date().toISOString(),
    intent: JSON.parse(JSON.stringify(input.intent)),
    review: {
      lines: JSON.parse(JSON.stringify(input.lines)),
      quote: safeQuote,
    },
  };
  return validated(record, input.scope);
}
export function saveCheckoutJournal(
  record: CheckoutJournal,
  storage?: TabStorage,
) {
  const scope = {
      organizationId: record.organizationId,
      branchId: record.branchId,
    },
    safe = validated(record, scope),
    target = storageOrThrow(storage),
    prior = readCheckoutJournal(scope, target);
  if (
    prior &&
    (prior.sessionRef !== safe.sessionRef ||
      JSON.stringify(canonical(prior.intent)) !==
        JSON.stringify(canonical(safe.intent)))
  )
    throw new CheckoutRecoveryError(
      "An earlier order is still unresolved in this tab. Its original request will not be replaced.",
    );
  const raw = JSON.stringify(safe);
  if (new TextEncoder().encode(raw).length > MAX_CHECKOUT_JOURNAL_BYTES)
    throw new CheckoutRecoveryError(
      "This order is too large to save safely for retries. No order was sent.",
    );
  try {
    target.setItem(checkoutJournalKey(scope), raw);
    if (target.getItem(checkoutJournalKey(scope)) !== raw)
      throw Error("Storage verification failed");
  } catch {
    throw new CheckoutRecoveryError(
      "This tab could not save the original order for recovery. No new order was sent. Keep this page open and try again.",
    );
  }
  return safe;
}
export function clearCheckoutJournal(
  scope: CheckoutScope,
  requestKey: string,
  storage?: TabStorage,
) {
  const target = storageOrThrow(storage),
    prior = readCheckoutJournal(scope, target);
  if (!prior) return;
  if (prior.intent.requestKey !== requestKey)
    throw new CheckoutRecoveryError(
      "A different saved order is unresolved. Its recovery details were not removed.",
    );
  try {
    target.removeItem(checkoutJournalKey(scope));
    if (target.getItem(checkoutJournalKey(scope)) !== null)
      throw Error("Storage verification failed");
  } catch {
    throw new CheckoutRecoveryError(
      "This tab could not clear its saved order. Review its status before starting another order.",
    );
  }
}
export function assertCheckoutSession(
  record: CheckoutJournal,
  response: unknown,
) {
  const parsed = z
    .object({ sessionRef: z.string().uuid() })
    .passthrough()
    .safeParse(response);
  if (!parsed.success || parsed.data.sessionRef !== record.sessionRef)
    throw new CheckoutRecoveryError(
      "The saved order belongs to a different or expired guest session. It has not been resubmitted. Ask staff to review it before ordering again.",
    );
}
export function currentSessionRef(response: unknown) {
  const parsed = z
    .object({ sessionRef: z.string().uuid() })
    .passthrough()
    .safeParse(response);
  if (!parsed.success)
    throw new CheckoutRecoveryError(
      "This venue could not verify this tab’s guest session for safe order recovery. No order was sent.",
    );
  return parsed.data.sessionRef;
}
export function checkoutScopeFromMenu(
  organizationId: unknown,
  branchId: unknown,
  menuBranchId: unknown,
): CheckoutScope {
  const parsed = scopeSchema.safeParse({ organizationId, branchId });
  if (!parsed.success || parsed.data.branchId !== menuBranchId)
    throw new CheckoutRecoveryError(
      "This venue context could not be verified for safe order recovery. No order was resubmitted.",
    );
  return parsed.data;
}
const attemptOrder = z
  .object({
    id: z.string().uuid(),
    reference: z.string().min(1).max(100),
    status: z.string().min(1).max(60),
    paymentStatus: z.string().min(1).max(60),
    total: money,
    paid: money,
  })
  .passthrough();
const attemptResolutionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("recorded"), order: attemptOrder }).strict(),
  z.object({ status: z.literal("not_found") }).strict(),
  z
    .object({ status: z.literal("abandoned"), resolutionId: z.string().uuid() })
    .strict(),
]);
export function parseAttemptResolution(value: unknown) {
  const result = attemptResolutionSchema.safeParse(value);
  if (!result.success)
    throw new CheckoutRecoveryError(
      "The venue could not confirm this request’s outcome. Its original recovery details remain saved.",
    );
  return result.data;
}
