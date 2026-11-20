import {
  companyAcknowledgementSchema,
  consultancyEnquirySchema,
  travelInterestSchema,
  companyDocumentLimit,
} from "../../../shared/mera-company-contracts.js";
export type CompanyKind = "consultancy" | "travel_interest";
export type CompanyDocument = { filename: string; mime: string; data: string };
export type CompanyReceipt = {
  kind: CompanyKind;
  reference: string;
  status: "received";
  externalDelivery: false;
  emailDelivery: "not_sent";
  receivedAt: string;
};
export type PendingSubmission = {
  version: 1;
  kind: CompanyKind;
  state: "pending";
  body: Record<string, any>;
};
export type ConfirmedSubmission = {
  version: 1;
  kind: CompanyKind;
  state: "confirmed";
  receipt: CompanyReceipt;
};
export type CompanyJournal = PendingSubmission | ConfirmedSubmission;
export const companyJournalKey = (kind: CompanyKind) =>
  `mera:company-submission:v1:${kind}`;
export const maxCompanyJournalBytes = 800 * 1024;
export const submissionSchema = (kind: CompanyKind) =>
  kind === "consultancy" ? consultancyEnquirySchema : travelInterestSchema;
export const decodedSize = (document: CompanyDocument) =>
  (document.data.length / 4) * 3 -
  (document.data.endsWith("==") ? 2 : document.data.endsWith("=") ? 1 : 0);
export function validCompanyBody(kind: CompanyKind, body: unknown) {
  const parsed = submissionSchema(kind).safeParse(body);
  if (!parsed.success) return null;
  if (
    kind === "consultancy" &&
    parsed.data.documents.reduce(
      (sum: number, file: CompanyDocument) => sum + decodedSize(file),
      0,
    ) > companyDocumentLimit
  )
    return null;
  return parsed.data as Record<string, any>;
}
export function validCompanyReceipt(
  kind: CompanyKind,
  value: unknown,
): value is CompanyReceipt {
  const parsed = companyAcknowledgementSchema.safeParse(value);
  return parsed.success && parsed.data.kind === kind;
}
function serialize(value: CompanyJournal) {
  const raw = JSON.stringify(value);
  if (new TextEncoder().encode(raw).length > maxCompanyJournalBytes)
    throw new Error(
      "The temporary recovery copy is too large. Reduce the supporting documents before sending.",
    );
  return raw;
}
export function readCompanyJournal(kind: CompanyKind): CompanyJournal | null {
  const raw = window.sessionStorage.getItem(companyJournalKey(kind));
  if (raw === null) return null;
  if (new TextEncoder().encode(raw).length > maxCompanyJournalBytes)
    throw new Error("The saved submission cannot be read safely.");
  const value = JSON.parse(raw);
  if (value?.version !== 1 || value.kind !== kind)
    throw new Error("The saved submission needs review.");
  if (
    value.state === "pending" &&
    Object.keys(value).sort().join() === "body,kind,state,version" &&
    validCompanyBody(kind, value.body)
  )
    return value;
  if (
    value.state === "confirmed" &&
    Object.keys(value).sort().join() === "kind,receipt,state,version" &&
    validCompanyReceipt(kind, value.receipt)
  )
    return value;
  throw new Error("The saved submission needs review.");
}
export function saveCompanyPending(
  kind: CompanyKind,
  body: Record<string, any>,
): PendingSubmission {
  const parsed = validCompanyBody(kind, body);
  if (!parsed)
    throw new Error(
      "Review the brief and supporting documents before sending.",
    );
  if (readCompanyJournal(kind))
    throw new Error("This tab already has a submission to review.");
  const journal: PendingSubmission = {
    version: 1,
    kind,
    state: "pending",
    body: parsed,
  };
  const raw = serialize(journal);
  window.sessionStorage.setItem(companyJournalKey(kind), raw);
  if (window.sessionStorage.getItem(companyJournalKey(kind)) !== raw)
    throw new Error(
      "A recovery copy could not be confirmed. No request was sent.",
    );
  return journal;
}
export function sameCompanyPending(
  kind: CompanyKind,
  expected: PendingSubmission,
) {
  const current = readCompanyJournal(kind);
  return (
    current?.state === "pending" && serialize(current) === serialize(expected)
  );
}
export function completeCompanyJournal(
  kind: CompanyKind,
  pending: PendingSubmission,
  receipt: CompanyReceipt,
) {
  if (!validCompanyReceipt(kind, receipt) || !sameCompanyPending(kind, pending))
    throw new Error(
      "The saved submission changed; its private copy was not cleared.",
    );
  const raw = serialize({ version: 1, kind, state: "confirmed", receipt });
  window.sessionStorage.setItem(companyJournalKey(kind), raw);
  if (window.sessionStorage.getItem(companyJournalKey(kind)) !== raw)
    throw new Error("The temporary private copy could not be cleared.");
}
export function rejectCompanyJournal(
  kind: CompanyKind,
  pending: PendingSubmission,
) {
  if (!sameCompanyPending(kind, pending))
    throw new Error(
      "The saved submission changed. Review it before sending again.",
    );
  window.sessionStorage.removeItem(companyJournalKey(kind));
  if (window.sessionStorage.getItem(companyJournalKey(kind)) !== null)
    throw new Error("The saved submission could not be cleared.");
}
