import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { customerRequest, requestId } from "./client";
import {
  readHelpJournal,
  saveHelpJournal,
  clearHelpJournal,
} from "./helpRecovery";
const sessionSchema = z.object({ sessionRef: z.string().uuid() });
const ownRequestSchema = z.object({
  id: z.string().uuid(),
  reference: z.string().min(1).max(100),
  category: z.enum(["service", "payment", "reservation", "other"]),
  message: z.string().max(500),
  status: z.enum(["open", "acknowledged", "resolved"]),
  customerReply: z.string().max(1000).optional(),
  createdAt: z.string().datetime().optional(),
});
type OwnRequest = z.infer<typeof ownRequestSchema>;
type Intent = {
  requestKey: string;
  category: string;
  message: string;
  orderId?: string;
  visitId?: string;
};
type Pending = {
  body: Intent;
  sessionRef: string | null;
  postStarted: boolean;
};
type Props = {
  prefix: string;
  ensureGuest: () => Promise<any>;
  hasGuest: boolean;
  displayName: string;
  onName: (value: string) => void;
  orderId?: string;
  visitId?: string;
  nameLocked?: boolean;
};
const topics: Record<string, string> = {
  service: "Service",
  payment: "Payment",
  reservation: "Reservation",
  other: "Other",
};
const statuses: Record<string, string> = {
  open: "Sent to the team",
  acknowledged: "Being reviewed",
  resolved: "Resolved",
};
class GuestProofError extends Error {}
export default function HelpRequests(props: Props) {
  return <ScopedHelpRequests key={props.prefix} {...props} />;
}
function ScopedHelpRequests({
  prefix,
  ensureGuest,
  hasGuest,
  displayName,
  onName,
  orderId,
  visitId,
  nameLocked = false,
}: Props) {
  const [requests, setRequests] = useState<OwnRequest[]>([]),
    [readError, setReadError] = useState(""),
    [writeError, setWriteError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [loaded, setLoaded] = useState(false),
    [category, setCategory] = useState("service"),
    [message, setMessage] = useState(""),
    [context, setContext] = useState(""),
    [pending, setPending] = useState<Pending | null>(null),
    [privateBlocked, setPrivateBlocked] = useState(false),
    [notice, setNotice] = useState(""),
    [journalReady, setJournalReady] = useState(false);
  const mounted = useRef(true),
    readGeneration = useRef(0),
    sendInFlight = useRef(false),
    recoveryBlocked = useRef(false),
    pendingRef = useRef<Pending | null>(null);
  function remember(value: Pending | null) {
    pendingRef.current = value;
    setPending(value);
  }
  function hidePrivate() {
    readGeneration.current++;
    setLoading(false);
    setRequests([]);
    setLoaded(false);
    setPrivateBlocked(true);
    setNotice("");
  }
  async function proveGuest() {
    const raw = await customerRequest(prefix + "/guest");
    const parsed = sessionSchema.safeParse(raw);
    if (!parsed.success)
      throw new GuestProofError(
        "This guest session could not be verified. The original request has not been retried. Please ask staff to check it.",
      );
    const original = pendingRef.current;
    if (original?.sessionRef && original.sessionRef !== parsed.data.sessionRef)
      throw new GuestProofError(
        "Your guest session changed. The original request has not been retried. Please ask staff to check it before sending another.",
      );
    return parsed.data.sessionRef;
  }
  function proofFailure(error: unknown) {
    return (
      error instanceof GuestProofError ||
      [401, 403, 404].includes((error as any)?.status)
    );
  }
  async function load() {
    if (recoveryBlocked.current) return;
    const generation = ++readGeneration.current;
    setLoading(true);
    setReadError("");
    try {
      await proveGuest();
      if (!mounted.current || generation !== readGeneration.current) return;
      const result = z
        .object({ requests: z.array(ownRequestSchema) })
        .parse(await customerRequest(prefix + "/help-requests"));
      if (!mounted.current || generation !== readGeneration.current) return;
      setRequests(result.requests);
      setLoaded(true);
      setPrivateBlocked(false);
    } catch (error) {
      if (!mounted.current || generation !== readGeneration.current) return;
      if (proofFailure(error)) hidePrivate();
      setReadError(
        proofFailure(error)
          ? (error as Error).message
          : "Your requests could not be refreshed. Check your connection and try again.",
      );
    } finally {
      if (mounted.current && generation === readGeneration.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = readHelpJournal(prefix);
      if (saved && !("body" in saved)) {
        throw Error(
          "Private help details were cleared when this session ended.",
        );
      }
      if (saved) {
        remember({
          body: saved.body,
          sessionRef: saved.sessionRef,
          postStarted: true,
        });
        setPrivateBlocked(true);
        setNotice(
          "An earlier help request needs checking. It has not been sent again automatically.",
        );
        void load();
      }
      setJournalReady(true);
    } catch {
      recoveryBlocked.current = true;
      setPrivateBlocked(true);
      setWriteError(
        "Saved help request details could not be verified. No replacement request will be sent. Ask staff to check the earlier request.",
      );
    }
    return () => {
      mounted.current = false;
      readGeneration.current++;
    };
  }, []);
  useEffect(() => {
    if (hasGuest) void load();
    else {
      readGeneration.current++;
      setRequests([]);
      setLoaded(false);
      setLoading(false);
      if (pendingRef.current?.postStarted) setPrivateBlocked(true);
    }
  }, [hasGuest]);
  async function send() {
    if (sendInFlight.current || !journalReady) return;
    sendInFlight.current = true;
    setBusy(true);
    setWriteError("");
    setNotice("");
    let attempt = pendingRef.current;
    const fresh = !attempt;
    if (!attempt) {
      attempt = {
        body: {
          requestKey: requestId(),
          category,
          message: message.trim(),
          ...(context === "order" && orderId
            ? { orderId }
            : context === "visit" && visitId
              ? { visitId }
              : {}),
        },
        sessionRef: null,
        postStarted: false,
      };
      remember(attempt);
    }
    try {
      // Creating/updating a guest is allowed only for a fresh help request.
      // A retry always proves the existing cookie and never creates an identity.
      if (fresh) await ensureGuest();
      if (!mounted.current) return;
      const sessionRef = await proveGuest();
      if (!mounted.current) return;
      saveHelpJournal({
        version: 1,
        prefix,
        sessionRef,
        body: attempt.body as any,
      });
      attempt = { ...attempt, sessionRef, postStarted: true };
      remember(attempt);
      setPrivateBlocked(false);
      const result = ownRequestSchema.parse(
        await customerRequest(prefix + "/help-requests", "POST", attempt.body),
      );
      if (!mounted.current) return;
      clearHelpJournal(prefix, attempt.body.requestKey);
      remember(null);
      setMessage("");
      setContext("");
      setWriteError("");
      setNotice(
        `Request ${result.reference} was sent to the team. Check its status and reply below.`,
      );
      await load();
    } catch (error) {
      if (!mounted.current) return;
      // Every retry retains the original intent, including after auth, rate or
      // domain errors. A list entry with similar text is never correlation proof.
      if (attempt) remember(attempt);
      if (proofFailure(error)) hidePrivate();
      setWriteError(
        error instanceof GuestProofError || (error as any)?.status
          ? (error as Error).message
          : attempt?.postStarted
            ? "We could not confirm the team received your request. Check your connection, then retry the same request."
            : "This tab could not safely save and verify your request, so no help request was sent. Check your connection and browser storage, then retry the same details.",
      );
    } finally {
      sendInFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="mc-panel mc-help">
      <header className="mc-help-heading">
        <h2>Ask the team for help</h2>
        <p>
          Send a request and check the team’s reply here. For urgent assistance,
          speak to staff. We will not send a text or email.
        </p>
        {!!requests.length && !privateBlocked && !pending && (
          <a
            className="mc-help-replies-link"
            href="#mc-help-requests-heading"
            onClick={(event) => {
              event.preventDefault();
              const heading = document.getElementById(
                "mc-help-requests-heading",
              );
              heading?.scrollIntoView?.({ block: "start", behavior: "auto" });
              heading?.focus({ preventScroll: true });
            }}
          >
            View requests and replies
          </a>
        )}
      </header>
      <div className="mc-help-layout">
        <section className="mc-help-compose" aria-label="Contact the team">
          <h3>
            {pending ? "Your request needs checking" : "What can we help with?"}
          </h3>
          {notice && (
            <p role="status" className="mc-help-notice">
              {notice}
            </p>
          )}
          {writeError && (
            <p role="alert" className="mc-help-error">
              {writeError}
            </p>
          )}
          {pending && (
            <div className="mc-help-pending">
              <p>
                {pending.postStarted
                  ? "The team may already have received this request. A retry sends the same details; it does not start another request."
                  : "Your request has not been sent. Verify this guest session to continue with the same details."}
              </p>
              <p>
                {pending.postStarted
                  ? "The original details are saved in this tab. After a refresh, this same guest session must be verified before you can retry."
                  : "No request was sent. This tab must save and verify the original details before sending."}{" "}
                For urgent help or a lost session, ask staff to check it.
              </p>
              {!privateBlocked && (
                <dl>
                  <div>
                    <dt>Topic</dt>
                    <dd>{topics[pending.body.category]}</dd>
                  </div>
                  <div>
                    <dt>Message</dt>
                    <dd>{pending.body.message}</dd>
                  </div>
                </dl>
              )}
            </div>
          )}
          {privateBlocked ? (
            <p className="mc-help-privacy" role="status">
              Your private request details are hidden until this guest session
              can be verified. No replacement request will be sent.
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <fieldset disabled={busy || !!pending || !journalReady}>
                <label>
                  Your name
                  <input
                    required
                    maxLength={100}
                    value={displayName}
                    disabled={nameLocked}
                    onChange={(event) => onName(event.target.value)}
                    autoComplete="given-name"
                  />
                </label>
                <div className="mc-help-form-row">
                  <label>
                    Help topic
                    <select
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    >
                      {Object.entries(topics).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Related to
                    <select
                      value={context}
                      onChange={(event) => setContext(event.target.value)}
                    >
                      <option value="">General request</option>
                      {orderId && (
                        <option value="order">My current order</option>
                      )}
                      {visitId && (
                        <option value="visit">My joined table visit</option>
                      )}
                    </select>
                  </label>
                </div>
                <label>
                  How can staff help?
                  <textarea
                    required
                    minLength={1}
                    maxLength={500}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    aria-describedby="mc-help-message-hint"
                  />
                </label>
                <p id="mc-help-message-hint" className="mc-help-hint">
                  Keep it brief. Do not include passwords or card details.
                </p>
                <button
                  className="mc-primary"
                  disabled={!message.trim() || !displayName.trim()}
                >
                  {busy ? "Sending request…" : "Send help request"}
                </button>
              </fieldset>
            </form>
          )}
          {pending && (
            <button
              type="button"
              className="mc-secondary"
              disabled={busy}
              onClick={() => void send()}
            >
              {busy ? "Checking your request…" : "Retry original help request"}
            </button>
          )}
        </section>
        <section className="mc-help-history" aria-label="Your help requests">
          <header>
            <div>
              <h3 id="mc-help-requests-heading" tabIndex={-1}>
                Your requests
              </h3>
              <p>
                Only requests from this guest session at this branch are shown.
              </p>
            </div>
            {hasGuest && (
              <button
                type="button"
                className="mc-secondary"
                disabled={busy || loading}
                onClick={() => void load()}
              >
                Refresh help status
              </button>
            )}
          </header>
          {loading && <p role="status">Checking your help requests…</p>}
          {readError && (
            <p role="alert" className="mc-help-error">
              {readError}
            </p>
          )}
          {!loading && !readError && !privateBlocked && !requests.length && (
            <p className="mc-help-empty">
              {loaded
                ? "No help requests in this guest session yet."
                : "Your requests will appear here after you send one."}
            </p>
          )}
          {!privateBlocked &&
            requests.map((request) => (
              <article key={request.id}>
                <header>
                  <h4>{request.reference}</h4>
                  <span className="mc-help-status">
                    {statuses[request.status]}
                  </span>
                </header>
                <p className="mc-help-topic">{topics[request.category]}</p>
                <p>{request.message}</p>
                {request.customerReply ? (
                  <div className="mc-help-reply">
                    <h5>Reply from the team</h5>
                    <p>{request.customerReply}</p>
                  </div>
                ) : (
                  <p className="mc-help-hint">
                    {request.status === "resolved"
                      ? "The team marked this request resolved. If you still need help, speak to staff."
                      : "No reply yet. For urgent help, speak to staff."}
                  </p>
                )}
              </article>
            ))}
        </section>
      </div>
    </section>
  );
}
