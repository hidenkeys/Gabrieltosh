import MoneyInput from "../ui/MoneyInput";
import ReasonInput from "../ui/ReasonInput";
import Segmented from "../ui/Segmented";
import Combobox from "../ui/Combobox";
import { formatMoney } from "./api";
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
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const selectedOrder = orders.find((order) => order.id === orderId);
  const available = selectedOrder
    ? Math.max(0, (selectedOrder.paid || 0) - (selectedOrder.refunded || 0))
    : 0;
  const refundLines = Array.isArray(selectedOrder?.items)
    ? selectedOrder.items.filter(
        (line: any) =>
          typeof line.orderLineId === "string" &&
          Number.isSafeInteger(line.total) &&
          line.total > 0,
      )
    : [];
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
            <Combobox
              label="Order"
              required
              value={orderId}
              onChange={(value) => {
                setOrder(value);
                setSelectedLines([]);
                setAmount("");
              }}
              options={orders
                .filter(
                  (order) =>
                    !order.historicalReadOnly &&
                    (order.paid || 0) > (order.refunded || 0),
                )
                .map((order) => ({
                  value: order.id,
                  label: order.reference || "Order",
                  description: `${order.displayName || ""} · ${formatMoney((order.paid || 0) - (order.refunded || 0))} available`,
                  searchText: order.tableName || "",
                }))}
              disabled={disabled}
            />
            <MoneyInput
              label="Requested return (₦)"
              required
              min={0.01}
              max={selectedOrder ? available / 100 : undefined}
              value={amount}
              onChange={(value) => {
                setAmount(value);
                setSelectedLines([]);
              }}
              disabled={disabled}
            />
            {selectedOrder && (
              <div
                className="mi-quick-values"
                aria-label="Quick return amounts"
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setAmount((available / 100).toFixed(2));
                    setSelectedLines([]);
                  }}
                >
                  Full amount
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setAmount((Math.floor(available / 2) / 100).toFixed(2));
                    setSelectedLines([]);
                  }}
                >
                  Half amount
                </button>
              </div>
            )}
            {!!refundLines.length && (
              <fieldset disabled={disabled}>
                <legend>Choose returned items</legend>
                <p>
                  Item values exclude order-level charges and discounts. Review
                  the requested amount before submitting.
                </p>
                {refundLines.map((line: any) => (
                  <label className="mw-row" key={line.orderLineId}>
                    <input
                      type="checkbox"
                      checked={selectedLines.includes(line.orderLineId)}
                      onChange={(event) => {
                        const chosen = event.target.checked
                          ? [...selectedLines, line.orderLineId]
                          : selectedLines.filter(
                              (id) => id !== line.orderLineId,
                            );
                        setSelectedLines(chosen);
                        setAmount(
                          (
                            refundLines
                              .filter((item: any) =>
                                chosen.includes(item.orderLineId),
                              )
                              .reduce(
                                (sum: number, item: any) => sum + item.total,
                                0,
                              ) / 100
                          ).toFixed(2),
                        );
                      }}
                    />
                    {line.quantity} × {line.name} · {formatMoney(line.total)}
                  </label>
                ))}
              </fieldset>
            )}
            <ReasonInput
              label="Reason"
              required
              minLength={10}
              maxLength={500}
              value={reason}
              onChange={setReason}
              disabled={disabled}
              presets={[
                "Wrong item received",
                "Quality issue",
                "Overcharged amount",
                "Duplicate payment",
                "Service issue",
              ]}
            />
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
          <ReasonInput
            label="Review reason"
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={setReason}
            disabled={disabled}
            presets={[
              "Wrong item received",
              "Quality issue",
              "Overcharged amount",
              "Duplicate payment",
              "Service issue",
              "Request could not be verified",
            ]}
          />
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
          <Segmented
            label="Actual completed return method"
            value={method}
            onChange={setMethod}
            disabled={disabled}
            options={[
              { value: "cash", label: "Cash" },
              { value: "external_pos", label: "External POS" },
              { value: "external_transfer", label: "External transfer" },
            ]}
          />
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
