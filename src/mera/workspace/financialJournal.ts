export type FinancialKind =
  | "payment"
  | "refund"
  | "deposit"
  | "cash_movement"
  | "item_cancellation"
  | "writeoff"
  | "deposit_hold"
  | "deposit_refund"
  | "deposit_forfeiture";
export type FinancialIntent = {
  path: string;
  method: "POST";
  body: Record<string, any>;
  signature: string;
  restored?: boolean;
};
const prefix = "mera:financial:v1:";
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const id = "[a-f\\d-]{36}";
export function financialKind(path: string, body?: any): FinancialKind | null {
  if (/\/deposits\/[^/]+\/outcomes$/.test(path))
    return body?.outcome === "held"
      ? "deposit_hold"
      : body?.outcome === "manual_return"
        ? "deposit_refund"
        : body?.outcome === "forfeit"
          ? "deposit_forfeiture"
          : null;
  if (new RegExp(`/orders/${id}/items/${id}/cancel$`, "i").test(path))
    return "item_cancellation";
  if (/\/writeoffs$/.test(path)) return "writeoff";
  if (/\/payments$/.test(path)) return "payment";
  if (/\/refunds$/.test(path)) return "refund";
  if (/\/deposits$/.test(path)) return "deposit";
  if (/\/movements$/.test(path)) return "cash_movement";
  return null;
}
const methods = ["cash", "external_pos", "external_transfer"];
const money = (value: any) =>
  Number.isSafeInteger(value) && value > 0 && value <= 100000000000;
const text = (value: any, max: number, min = 0) =>
  typeof value === "string" && value.length >= min && value.length <= max;
function validBody(body: any, kind: FinancialKind) {
  if (
    !body ||
    Array.isArray(body) ||
    typeof body !== "object" ||
    !uuid.test(body.requestKey)
  )
    return false;
  const depositOutcome = [
    "deposit_hold",
    "deposit_refund",
    "deposit_forfeiture",
  ].includes(kind);
  const allowed = depositOutcome
    ? [
        "requestKey",
        "outcome",
        "expectedRemaining",
        "amount",
        "method",
        "reference",
        "reason",
        "policyReviewed",
        "taxAmount",
      ]
    : kind === "writeoff"
      ? ["requestKey", "version", "amount", "reason"]
      : kind === "item_cancellation"
        ? [
            "requestKey",
            "quantity",
            "version",
            "reason",
            "refundAllocations",
            "cancellationQuoteId",
          ]
        : kind === "cash_movement"
          ? ["requestKey", "direction", "amount", "reason"]
          : kind === "refund"
            ? [
                "requestKey",
                "amount",
                "method",
                "reason",
                "reference",
                "cancellationQuoteId",
                "refundRequestId",
              ]
            : ["requestKey", "amount", "method", "reference"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) return false;
  if (body.refundRequestId !== undefined && !uuid.test(body.refundRequestId))
    return false;
  if (
    body.cancellationQuoteId !== undefined &&
    !uuid.test(body.cancellationQuoteId)
  )
    return false;
  if (depositOutcome) {
    const expected =
      kind === "deposit_hold"
        ? "held"
        : kind === "deposit_refund"
          ? "manual_return"
          : "forfeit";
    if (
      body.outcome !== expected ||
      body.policyReviewed !== true ||
      !Number.isSafeInteger(body.expectedRemaining) ||
      body.expectedRemaining < 0 ||
      !text(body.reason, 500, 10) ||
      (body.reference !== undefined && !text(body.reference, 200))
    )
      return false;
    if (body.method !== undefined && !methods.includes(body.method))
      return false;
    if (
      body.taxAmount !== undefined &&
      body.taxAmount !== null &&
      (!Number.isSafeInteger(body.taxAmount) ||
        body.taxAmount < 0 ||
        body.taxAmount > body.amount)
    )
      return false;
    if (kind === "deposit_hold") return body.amount === 0;
    if (!money(body.amount) || body.amount > body.expectedRemaining)
      return false;
    if (kind === "deposit_refund")
      return (
        methods.includes(body.method) &&
        (body.method !== "external_transfer" || text(body.reference, 200, 1))
      );
    return (
      Object.hasOwn(body, "taxAmount") &&
      (body.taxAmount === null ||
        (Number.isSafeInteger(body.taxAmount) &&
          body.taxAmount >= 0 &&
          body.taxAmount <= body.amount))
    );
  }
  if (kind === "item_cancellation")
    return (
      Number.isSafeInteger(body.quantity) &&
      body.quantity > 0 &&
      body.quantity <= 100 &&
      Number.isSafeInteger(body.version) &&
      body.version > 0 &&
      text(body.reason, 300, 3) &&
      (body.refundAllocations === undefined ||
        (Array.isArray(body.refundAllocations) &&
          body.refundAllocations.length <= 100 &&
          body.refundAllocations.every(
            (row: any) =>
              row &&
              Object.keys(row).every((key) =>
                ["refundId", "amount"].includes(key),
              ) &&
              uuid.test(row.refundId) &&
              money(row.amount),
          )))
    );
  if (!money(body.amount)) return false;
  if (kind === "writeoff")
    return (
      Number.isSafeInteger(body.version) &&
      body.version > 0 &&
      text(body.reason, 500, 10)
    );
  if (kind === "cash_movement")
    return ["in", "out"].includes(body.direction) && text(body.reason, 300, 3);
  return (
    methods.includes(body.method) &&
    (body.reference === undefined || text(body.reference, 160)) &&
    (kind !== "refund" || text(body.reason, 300, 3))
  );
}
const key = (actor: string, org: string, branch: string) =>
  prefix + [actor, org, branch].join(":");
function validate(
  actor: string,
  org: string,
  branch: string,
  value: any,
): FinancialIntent | null {
  if (
    ![actor, org, branch].every((value) => uuid.test(value)) ||
    !value ||
    value.actor !== actor ||
    value.org !== org ||
    value.branch !== branch ||
    value.method !== "POST"
  )
    return null;
  const base = `/organizations/${org}/branches/${branch}`;
  const suffix =
    typeof value.path === "string" && value.path.startsWith(base)
      ? value.path.slice(base.length)
      : "";
  if (
    !new RegExp(
      `^/(?:orders/${id}/payments|bills/${id}/payments|orders/${id}/refunds|orders/${id}/writeoffs|reservations/${id}/deposits|shifts/${id}/movements|reservations/${id}/deposits/${id}/outcomes|orders/${id}/items/${id}/cancel)$`,
      "i",
    ).test(suffix)
  )
    return null;
  const kind = financialKind(value.path, value.body);
  if (!kind || !validBody(value.body, kind)) return null;
  const body = JSON.parse(JSON.stringify(value.body));
  return {
    path: value.path,
    method: "POST",
    body,
    signature:
      "POST" + value.path + JSON.stringify({ ...body, requestKey: undefined }),
    restored: true,
  };
}
export function storeFinancialIntent(
  actor: string,
  org: string,
  branch: string,
  intent: FinancialIntent,
) {
  try {
    const value = {
      actor,
      org,
      branch,
      method: intent.method,
      path: intent.path,
      body: intent.body,
    };
    if (!validate(actor, org, branch, value)) return false;
    const encoded = JSON.stringify(value);
    if (encoded.length > 20000) return false;
    sessionStorage.setItem(key(actor, org, branch), encoded);
    return true;
  } catch {
    return false;
  }
}
export function restoreFinancialIntent(
  actor: string,
  org: string,
  branch: string,
): FinancialIntent | null {
  try {
    const raw = sessionStorage.getItem(key(actor, org, branch));
    if (!raw) return null;
    if (raw.length > 20000) throw new Error();
    const parsed = validate(actor, org, branch, JSON.parse(raw));
    if (!parsed) sessionStorage.removeItem(key(actor, org, branch));
    return parsed;
  } catch {
    return null;
  }
}
export function removeFinancialIntent(
  actor: string,
  org: string,
  branch: string,
) {
  try {
    sessionStorage.removeItem(key(actor, org, branch));
  } catch {}
}
export function clearFinancialJournals(exceptActor?: string) {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const entry = sessionStorage.key(index);
      if (
        entry?.startsWith(prefix) &&
        (!exceptActor || !entry.startsWith(prefix + exceptActor + ":"))
      )
        sessionStorage.removeItem(entry);
    }
  } catch {}
}
