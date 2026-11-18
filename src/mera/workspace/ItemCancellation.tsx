import React, { useState } from "react";
import { uuid } from "../../api";
import { WorkspaceError, formatMoney } from "./api";
export default function ItemCancellation({
  base,
  order,
  tickets,
  disabled,
  save,
  refunds = [],
  canRefund = false,
}: {
  refunds?: any[];
  canRefund?: boolean;
  base: string;
  order: any;
  tickets: any[];
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [lineId, setLineId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<any>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const lines = (order.items || []).filter(
    (line: any) => line.orderLineId && line.quantity > 0,
  );
  const line = lines.find((row: any) => row.orderLineId === lineId);
  const prepared =
    tickets
      .filter((ticket) => ticket.orderId === order.id)
      .flatMap((ticket) => ticket.items)
      .find((item) => item.orderLineId === lineId)?.preparedQuantity || 0;
  const blocked =
    (order.paid > 0 && !canRefund) ||
    !["submitted", "accepted", "preparing"].includes(order.status);
  const credits = refunds.filter(
    (refund) =>
      refund.orderId === order.id &&
      refund.amount - (refund.cancellationAppliedAmount || 0) > 0,
  );
  const refundAllocations = Object.entries(allocations)
    .map(([refundId, amount]) => ({
      refundId,
      amount: Math.round(Number(amount) * 100),
    }))
    .filter((allocation) => allocation.amount > 0);
  const requiredCredit = (line?.unitPrice || 0) * quantity;
  const allocated = refundAllocations.reduce((sum, row) => sum + row.amount, 0);
  const perform = async () => {
    const attempt = pending || {
      path:
        base +
        "/orders/" +
        order.id +
        "/items/" +
        encodeURIComponent(lineId) +
        "/cancel",
      body: {
        requestKey: uuid(),
        quantity,
        version: order.version,
        reason,
        ...(order.paid > 0 ? { refundAllocations } : {}),
      },
    };
    setWorking(true);
    setError("");
    try {
      await save(
        attempt.path,
        "POST",
        attempt.body,
        "Unprepared item cancellation recorded.",
      );
      setPending(null);
      setLineId("");
      setReason("");
      setQuantity(1);
      setAllocations({});
    } catch (e) {
      if (e instanceof WorkspaceError && (!e.status || e.status >= 500))
        setPending(attempt);
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <details>
      <summary>Cancel unprepared items</summary>
      <p className="mw-note">
        Cancel only unprepared quantities. Paid item cancellation needs existing
        approved refund credits and refund approval permission. This screen
        allocates those credits; it never initiates a payout. Prepared goods are
        never returned to stock automatically.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void perform();
        }}
      >
        <fieldset
          disabled={disabled || working || !!pending || blocked}
          style={{ border: 0, padding: 0 }}
        >
          <div className="mw-form">
            <label>
              Item to cancel
              <select
                required
                value={lineId}
                onChange={(event) => {
                  setLineId(event.target.value);
                  setQuantity(1);
                }}
              >
                <option value="">Choose an unprepared item</option>
                {lines.map((row: any) => (
                  <option key={row.orderLineId} value={row.orderLineId}>
                    {row.name} · {row.quantity} remaining
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity to cancel
              <input
                type="number"
                min={1}
                max={Math.max(0, (line?.quantity || 0) - prepared)}
                required
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </label>
            <label>
              Cancellation reason
              <input
                required
                minLength={3}
                maxLength={300}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          {order.paid > 0 && canRefund && (
            <fieldset>
              <legend>Existing approved refund credits</legend>
              <p>
                Required: {formatMoney(requiredCredit)} · Allocated:{" "}
                {formatMoney(allocated)}
              </p>
              {!credits.length ? (
                <p>
                  Record an approved refund first. No unused credit is available
                  for this order.
                </p>
              ) : (
                credits.map((refund) => (
                  <label key={refund.id}>
                    Allocate refund {refund.reference || refund.id.slice(0, 8)}{" "}
                    ·{" "}
                    {formatMoney(
                      refund.amount - (refund.cancellationAppliedAmount || 0),
                    )}{" "}
                    unused
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      max={
                        (refund.amount -
                          (refund.cancellationAppliedAmount || 0)) /
                        100
                      }
                      value={allocations[refund.id] || ""}
                      onChange={(event) =>
                        setAllocations({
                          ...allocations,
                          [refund.id]: event.target.value,
                        })
                      }
                    />
                  </label>
                ))
              )}
            </fieldset>
          )}
          <button
            type="submit"
            disabled={
              !line ||
              quantity > (line?.quantity || 0) - prepared ||
              (order.paid > 0 && allocated !== requiredCredit)
            }
          >
            Cancel selected quantity
          </button>
        </fieldset>
      </form>
      {blocked && !pending && (
        <p>
          This order requires financial review or is beyond the supported
          cancellation stage.
        </p>
      )}
      {pending && (
        <div className="mw-note">
          <p>
            Cancellation not confirmed. The original request is preserved; retry
            it to resolve uncertainty without applying a second cancellation.
          </p>
          <button
            type="button"
            disabled={disabled || working}
            onClick={() => void perform()}
          >
            Retry original cancellation
          </button>
        </div>
      )}
    </details>
  );
}
