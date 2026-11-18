import { useEffect, useState } from "react";
import { workspaceApi } from "./api";
type Props = {
  base: string;
  userId: string;
  orders: any[];
  canRequest: boolean;
  canApprove: boolean;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export default function RefundRequests({
  base,
  userId,
  orders,
  canRequest,
  canApprove,
  disabled,
  save,
}: Props) {
  const [requests, setRequests] = useState<any[]>([]),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [loading, setLoading] = useState(true),
    [orderId, setOrder] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [revision, setRevision] = useState(0),
    [pending, setPending] = useState<any>(null);
  useEffect(() => {
    const controller = new AbortController();
    setRequests([]);
    setLoadError("");
    setLoading(true);
    workspaceApi(base + "/refund-requests", "GET", undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.requests))
          throw new Error("Refund request response is unavailable.");
        setRequests(result.requests);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError")
          setLoadError("Refund requests could not be loaded. Try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base, revision]);
  const send = async (path: string, body: any, message: string) => {
    setError("");
    try {
      await save(path, "POST", body, message);
      setPending(null);
      setRevision((v) => v + 1);
    } catch (e: any) {
      setError(e.message);
      if (!e.status || e.status >= 500) setPending({ path, body, message });
    }
  };
  return (
    <section className="mw-card">
      <h2>Refund requests & review</h2>
      <p>
        Requests move no money. Another authorized staff member must review
        them. Record a return only after money has actually been returned.
      </p>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading refund requests…</p>}
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            Retry loading requests
          </button>
        </div>
      )}
      {pending ? (
        <div className="mw-note">
          <p>
            Outcome unconfirmed. Retry the original request before entering a
            different action.
          </p>
          <button
            disabled={disabled}
            onClick={() =>
              void send(pending.path, pending.body, pending.message)
            }
          >
            Retry original request
          </button>
        </div>
      ) : (
        canRequest && (
          <form
            className="mw-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send(
                base + `/orders/${orderId}/refund-requests`,
                {
                  requestKey: crypto.randomUUID(),
                  amount: Math.round(Number(amount) * 100),
                  reason,
                },
                "Refund request submitted for another approver.",
              );
            }}
          >
            <label>
              Order
              <select
                required
                value={orderId}
                onChange={(e) => setOrder(e.target.value)}
              >
                <option value="">Choose order</option>
                {orders
                  .filter(
                    (o) =>
                      !o.historicalReadOnly &&
                      (o.paid || 0) > (o.refunded || 0),
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.reference}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Requested return (₦)
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Reason
              <input
                required
                minLength={10}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button disabled={disabled}>Submit refund request</button>
          </form>
        )
      )}
      {requests.map((request) => (
        <Request
          key={request.id + request.version}
          request={request}
          base={base}
          canReview={
            canApprove &&
            request.requestedBy !== userId &&
            request.status === "pending"
          }
          disabled={disabled || !!pending}
          send={send}
        />
      ))}
      {!loading && !loadError && !requests.length && (
        <p>No visible refund requests.</p>
      )}
    </section>
  );
}
function Request({ request, base, canReview, disabled, send }: any) {
  const [reason, setReason] = useState(""),
    [method, setMethod] = useState(""),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <article className="mw-card">
      <h3>
        {request.requestedByName || "Staff"} · ₦
        {(request.amount / 100).toFixed(2)}
      </h3>
      <p>
        {request.status} · {request.reason}
      </p>
      {canReview && (
        <>
          <label>
            Review reason
            <input
              minLength={10}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            disabled={disabled || reason.trim().length < 10}
            onClick={() =>
              void send(
                base + `/refund-requests/${request.id}/reject`,
                { version: request.version, reason },
                "Request rejected; no money moved.",
              )
            }
          >
            Reject request
          </button>
          <label>
            Actual completed return method
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Choose actual method</option>
              <option value="cash">Cash</option>
              <option value="external_pos">External POS</option>
              <option value="external_transfer">External transfer</option>
            </select>
          </label>
          <label>
            Return reference
            <input
              value={reference}
              maxLength={200}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Money has already been returned; record it now
          </label>
          <button
            disabled={
              disabled ||
              !confirmed ||
              !method ||
              reason.trim().length < 10 ||
              (method === "external_transfer" && !reference.trim())
            }
            onClick={() =>
              void send(
                base + `/orders/${request.orderId}/refunds`,
                {
                  requestKey: crypto.randomUUID(),
                  refundRequestId: request.id,
                  amount: request.amount,
                  method,
                  reference,
                  reason,
                },
                "Completed manual return recorded against request.",
              )
            }
          >
            Record completed return
          </button>
        </>
      )}
    </article>
  );
}
