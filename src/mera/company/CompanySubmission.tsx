import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, RotateCw } from "lucide-react";
import {
  readCompanyJournal,
  saveCompanyPending,
  sameCompanyPending,
  completeCompanyJournal,
  rejectCompanyJournal,
  validCompanyReceipt,
  type CompanyKind,
  type CompanyJournal,
  type CompanyReceipt,
  type PendingSubmission,
} from "./submissionRecovery";
const endpoints: Record<CompanyKind, string> = {
  consultancy: "/api/mera/v1/public/company/enquiries",
  travel_interest: "/api/mera/v1/public/company/travel-interest",
};
function restore(kind: CompanyKind): {
  journal: CompanyJournal | null;
  blocked: boolean;
} {
  try {
    return { journal: readCompanyJournal(kind), blocked: false };
  } catch {
    return { journal: null, blocked: true };
  }
}
export function useCompanySubmission(kind: CompanyKind) {
  const [initial] = useState(() => restore(kind));
  const [pending, setPending] = useState<PendingSubmission | null>(
    initial.journal?.state === "pending" ? initial.journal : null,
  );
  const [receipt, setReceipt] = useState<CompanyReceipt | null>(
    initial.journal?.state === "confirmed" ? initial.journal.receipt : null,
  );
  const [blocked, setBlocked] = useState(initial.blocked),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [privateCopyWarning, setPrivateCopyWarning] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(false),
    alive = useRef(true);
  const statusHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (pending || receipt || blocked) statusHeading.current?.focus();
  }, [!!pending, !!receipt, blocked]);
  async function send(body?: Record<string, any>) {
    if (blocked || receipt || inFlight.current) return;
    const retry = !!pending;
    let intent = pending;
    try {
      if (!intent) {
        if (!body) return;
        intent = saveCompanyPending(kind, body);
      }
      if (!sameCompanyPending(kind, intent))
        throw Error("Saved request changed.");
    } catch {
      setBlocked(true);
      setError(
        "This browser could not safely keep your submission for recovery. No new request was sent. Keep this tab open and check its storage settings.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setFieldErrors({});
    setPending(intent);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(endpoints[kind], {
        method: "POST",
        credentials: "same-origin",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-POS-Request": "1" },
        body: JSON.stringify(intent.body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (!retry && [400, 413, 422].includes(response.status)) {
          rejectCompanyJournal(kind, intent);
          if (alive.current) {
            setPending(null);
            const issues: Record<string, string> = {};
            for (const issue of result?.issues || [])
              if (
                Array.isArray(issue.path) &&
                typeof issue.message === "string"
              )
                issues[String(issue.path[0])] = issue.message;
            setFieldErrors(issues);
            setError(
              typeof result?.error === "string"
                ? result.error
                : "Review the highlighted details and try again.",
            );
          }
          return;
        }
        throw Error("Submission not confirmed.");
      }
      if (!validCompanyReceipt(kind, result))
        throw Error("Receipt not confirmed.");
      try {
        completeCompanyJournal(kind, intent, result);
      } catch {
        if (alive.current) setPrivateCopyWarning(true);
      }
      if (alive.current) {
        setReceipt(result);
        setPending(null);
      }
    } catch {
      if (alive.current)
        setError(
          "We could not confirm whether your submission arrived. Your original details are kept in this tab. Retry the same submission to check it safely; do not send a second brief.",
        );
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function recheckStorage() {
    const current = restore(kind);
    setBlocked(current.blocked);
    if (current.journal?.state === "pending") setPending(current.journal);
    if (current.journal?.state === "confirmed")
      setReceipt(current.journal.receipt);
    if (!current.blocked) setError("");
  }
  return {
    pending,
    receipt,
    blocked,
    busy,
    error,
    fieldErrors,
    privateCopyWarning,
    statusHeading,
    send,
    recheckStorage,
  };
}
export function CompanySubmissionState({
  state,
  kind,
}: {
  state: ReturnType<typeof useCompanySubmission>;
  kind: CompanyKind;
}) {
  const title =
    kind === "consultancy"
      ? "Your project brief is received."
      : "Your interest is registered.";
  if (state.receipt)
    return (
      <div className="mera-company-confirmation">
        <CheckCircle2 size={35} aria-hidden="true" />
        <p className="mera-company-eyebrow">RECEIVED BY MERATECH</p>
        <h2 ref={state.statusHeading} tabIndex={-1}>
          {title}
        </h2>
        <p className="mera-company-reference">{state.receipt.reference}</p>
        <p>
          Keep this reference for your records. No confirmation email has been
          sent.
        </p>
        <p>
          {kind === "consultancy"
            ? "This is an enquiry for review, not project acceptance or a quotation. A member of the team can review your brief and any supporting documents."
            : "MeraTravel Suite is planned. Registering interest does not create a product account or promise a launch date."}
        </p>
        {state.privateCopyWarning && (
          <p role="alert">
            Your submission is received, but this browser could not clear its
            temporary private copy. Close this tab when you are finished.
          </p>
        )}
        <a href="/mera/products">
          Explore MeraTech offerings <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    );
  if (state.blocked)
    return (
      <div className="mera-company-recovery">
        <LockKeyhole size={28} aria-hidden="true" />
        <h2 ref={state.statusHeading} tabIndex={-1}>
          Check this tab before continuing
        </h2>
        <p role="alert">
          {state.error ||
            "A saved submission could not be read safely, or browser storage is unavailable. No new request has been sent. Do not clear a pending request until its outcome has been checked."}
        </p>
        <button
          type="button"
          className="secondary"
          onClick={state.recheckStorage}
        >
          Check saved submission
        </button>
      </div>
    );
  if (state.pending)
    return (
      <div className="mera-company-recovery">
        <RotateCw size={28} aria-hidden="true" />
        <p className="mera-company-eyebrow">ORIGINAL SUBMISSION KEPT</p>
        <h2 ref={state.statusHeading} tabIndex={-1}>
          {state.busy
            ? "Sending your details…"
            : "Let’s check your submission."}
        </h2>
        {state.error && <p role="alert">{state.error}</p>}
        <dl>
          <div>
            <dt>Submitted by</dt>
            <dd>{state.pending.body.name}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>{state.pending.body.email}</dd>
          </div>
          {state.pending.body.company && (
            <div>
              <dt>Company</dt>
              <dd>{state.pending.body.company}</dd>
            </div>
          )}
          {state.pending.body.documents?.length > 0 && (
            <div>
              <dt>Supporting documents</dt>
              <dd>
                {state.pending.body.documents
                  .map((file: any) => file.filename)
                  .join(", ")}
              </dd>
            </div>
          )}
        </dl>
        <p>
          Reloading will keep this original request. A retry uses exactly the
          same details; it does not create a new enquiry when the first one is
          already received.
        </p>
        <button
          type="button"
          className="primary"
          disabled={state.busy}
          onClick={() => void state.send()}
        >
          {state.busy
            ? "Waiting for confirmation…"
            : "Retry original submission"}
        </button>
      </div>
    );
  return null;
}
export function CompanyPrivacyNotice() {
  return (
    <p className="mera-company-storage-note">
      <LockKeyhole size={14} aria-hidden="true" />
      When you send, this tab temporarily keeps your details and attachments for
      safe retries. The private copy is removed once receipt is confirmed.
      Please do not include passwords, card details or confidential personal
      records.
    </p>
  );
}
