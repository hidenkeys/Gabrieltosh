import { useEffect, useRef, useState } from "react";
import { customerRequest, requestId } from "./client";
export default function HelpRequests({
  prefix,
  ensureGuest,
  hasGuest,
  displayName,
  onName,
  orderId,
  visitId,
  nameLocked = false,
}: {
  prefix: string;
  ensureGuest: () => Promise<any>;
  hasGuest: boolean;
  displayName: string;
  onName: (value: string) => void;
  orderId?: string;
  visitId?: string;
  nameLocked?: boolean;
}) {
  const [requests, setRequests] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [category, setCategory] = useState("service"),
    [message, setMessage] = useState(""),
    [context, setContext] = useState(""),
    [pending, setPending] = useState<any>(null);
  const currentScope = useRef(prefix);
  currentScope.current = prefix;
  async function load() {
    const scope = prefix;
    try {
      const result = await customerRequest(prefix + "/help-requests");
      if (currentScope.current === scope) setRequests(result.requests);
    } catch (e) {
      if (currentScope.current !== scope) return;
      if ([401, 403, 404].includes((e as any).status)) setRequests([]);
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setRequests([]);
    setPending(null);
    setError("");
  }, [prefix]);
  useEffect(() => {
    if (hasGuest) void load();
  }, [prefix, hasGuest]);
  async function send() {
    setBusy(true);
    setError("");
    const attempt = pending || {
      requestKey: requestId(),
      category,
      message,
      ...(context === "order" && orderId
        ? { orderId }
        : context === "visit" && visitId
          ? { visitId }
          : {}),
    };
    try {
      await ensureGuest();
      if (currentScope.current !== prefix) return;
      await customerRequest(prefix + "/help-requests", "POST", attempt);
      if (currentScope.current !== prefix) return;
      setPending(null);
      setMessage("");
      await load();
    } catch (e) {
      if (currentScope.current !== prefix) return;
      if (!(e as any).status || (e as any).status >= 500) setPending(attempt);
      else setPending(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mc-panel mc-help">
      <h2>Ask the team for help</h2>
      <p>
        Your request appears inside the venue’s workspace. Email, SMS and push
        notifications are not sent. For urgent assistance, speak to staff.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <fieldset
          disabled={busy || !!pending}
          style={{ border: 0, padding: 0 }}
        >
          <label>
            Your name
            <input
              required
              maxLength={100}
              value={displayName}
              disabled={nameLocked}
              onChange={(event) => onName(event.target.value)}
            />
          </label>
          <label>
            Help topic
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="service">Service</option>
              <option value="payment">Payment</option>
              <option value="reservation">Reservation</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Related to
            <select
              value={context}
              onChange={(event) => setContext(event.target.value)}
            >
              <option value="">General request</option>
              {orderId && <option value="order">My current order</option>}
              {visitId && <option value="visit">My joined table visit</option>}
            </select>
          </label>
          <label>
            How can staff help?
            <textarea
              required
              minLength={1}
              maxLength={500}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <button
            className="mc-primary"
            disabled={!message.trim() || !displayName.trim()}
          >
            Send help request
          </button>
        </fieldset>
      </form>
      {pending && (
        <>
          <p>
            Delivery to the workspace is not confirmed. Retry the original
            request before sending another.
          </p>
          <button
            className="mc-secondary"
            disabled={busy}
            onClick={() => void send()}
          >
            Retry original help request
          </button>
        </>
      )}
      {hasGuest && (
        <button
          className="mc-secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh help status
        </button>
      )}
      <h3>Your requests in this guest session</h3>
      {requests.length === 0 ? (
        <p>No help requests shown in this session.</p>
      ) : (
        requests.map((request) => (
          <article key={request.id}>
            <h4>
              {request.reference} · {request.category}
            </h4>
            <p>{request.message}</p>
            <p>Status: {request.status}</p>
            {request.customerReply && (
              <p>Venue reply: {request.customerReply}</p>
            )}
          </article>
        ))
      )}
    </section>
  );
}
