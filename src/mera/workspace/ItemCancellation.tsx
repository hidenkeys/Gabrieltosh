import { useMoney } from "../ui/Currency";
import ReasonInput from "../ui/ReasonInput";
import MoneyInput from "../ui/MoneyInput";
import Stepper from "../ui/Stepper";
import Segmented from "../ui/Segmented";
import Combobox from "../ui/Combobox";
import React, { useState } from "react";
import { uuid } from "../../api";
import { WorkspaceError } from "./api";
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
  const formatMoney = useMoney();
  const [lineId, setLineId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [review, setReview] = useState<any>(null);
  const [refundMethod, setRefundMethod] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const [pending, setPending] = useState<any>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const lines = (order.items || []).filter(
    (line: any) => line.orderLineId && line.quantity > 0,
  );
  const line = lines.find((row: any) => row.orderLineId === lineId);
  const stationPrepared =
    tickets
      .filter((ticket) => ticket.orderId === order.id)
      .flatMap((ticket) => ticket.items)
      .find((item) => item.orderLineId === lineId)?.preparedQuantity || 0;
  const prepared = Math.max(stationPrepared, line?.fulfilledQuantity || 0);
  const reviewIntent = JSON.stringify({
    lineId,
    quantity,
    total: order.total,
    lineQuantity: line?.quantity,
    policyVersion: order.pricing?.policyVersion,
  });
  const validReview =
    review?.intent === reviewIntent &&
    new Date(review.quote.expiresAt).getTime() > Date.now();
  const requiresReview = !!order.pricing?.policySnapshot?.enabled;
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
  const requiredCredit = validReview
    ? review.quote.creditRequired
    : (line?.unitPrice || 0) * quantity;
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
        ...(validReview ? { cancellationQuoteId: review.quote.id } : {}),
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
      setReview(null);
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
            <Combobox
              label="Item to cancel"
              required
              value={lineId}
              onChange={(value) => {
                setLineId(value);
                setQuantity(1);
                setReview(null);
                setAllocations({});
              }}
              placeholder="Choose an unprepared item"
              options={lines.map((row: any) => ({
                value: row.orderLineId,
                label: row.name,
                description: `${row.quantity} remaining`,
              }))}
            />
            <Stepper
              label="Quantity to cancel"
              min={1}
              max={Math.max(0, (line?.quantity || 0) - prepared)}
              disabled={!line || line.quantity <= prepared}
              required
              value={quantity}
              onChange={(value) => {
                setQuantity(value);
                setReview(null);
                setAllocations({});
              }}
            />
            <ReasonInput
              label="Cancellation reason"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={setReason}
              presets={[
                "Customer changed mind",
                "Item unavailable",
                "Wrong item entered",
                "Took too long",
              ]}
            />
          </div>
          {requiresReview && (
            <div className="mw-note">
              <button
                type="button"
                disabled={!line || quantity > (line?.quantity || 0) - prepared}
                onClick={async () => {
                  setWorking(true);
                  setError("");
                  try {
                    const quote = await save(
                      base +
                        "/orders/" +
                        order.id +
                        "/items/" +
                        encodeURIComponent(lineId) +
                        "/cancel-quote",
                      "POST",
                      { quantity, version: order.version },
                      "Original-policy cancellation quote prepared. No refund or cancellation was recorded.",
                    );
                    setReview({ intent: reviewIntent, quote });
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Review cancellation total
              </button>
              {review && (
                <>
                  <p>
                    {validReview
                      ? "Reviewed original order pricing"
                      : "Review changed or expired; request a new quote"}
                  </p>
                  <dl>
                    <dt>Previous order total</dt>
                    <dd>{formatMoney(review.quote.previousTotal)}</dd>
                    <dt>New order total</dt>
                    <dd>{formatMoney(review.quote.newTotal)}</dd>
                    <dt>Required refund credit</dt>
                    <dd>{formatMoney(review.quote.creditRequired)}</dd>
                    <dt>Tax included in refund credit</dt>
                    <dd>{formatMoney(review.quote.refundTaxAmount)}</dd>
                  </dl>
                </>
              )}
            </div>
          )}
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
                  <MoneyInput
                    key={refund.id}
                    label={`Allocate refund ${refund.reference || "credit"} · ${formatMoney(refund.amount - (refund.cancellationAppliedAmount || 0))} unused`}
                    min={0}
                    max={
                      (refund.amount -
                        (refund.cancellationAppliedAmount || 0)) /
                      100
                    }
                    value={allocations[refund.id] || ""}
                    onChange={(value) =>
                      setAllocations({ ...allocations, [refund.id]: value })
                    }
                  />
                ))
              )}
            </fieldset>
          )}
          <button
            type="submit"
            disabled={
              !line ||
              (requiresReview && !validReview) ||
              quantity > (line?.quantity || 0) - prepared ||
              (order.paid > 0 && allocated !== requiredCredit)
            }
          >
            Cancel selected quantity
          </button>
        </fieldset>
      </form>
      {requiresReview &&
        validReview &&
        requiredCredit > 0 &&
        order.paid > 0 &&
        canRefund && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setWorking(true);
              setError("");
              try {
                const refund = await save(
                  base + "/orders/" + order.id + "/refunds",
                  "POST",
                  {
                    requestKey: uuid(),
                    amount: review.quote.creditRequired,
                    method: refundMethod,
                    reason: refundReason,
                    cancellationQuoteId: review.quote.id,
                  },
                  "Verified manual refund recorded. No payout was initiated.",
                );
                setAllocations({ [refund.id]: String(refund.amount / 100) });
                setRefundMethod("");
                setRefundReason("");
                setRefundConfirmed(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setWorking(false);
              }
            }}
          >
            <fieldset
              disabled={disabled || working || !!pending}
              style={{ border: 0, padding: 0 }}
            >
              <legend>
                Record a manually paid refund for this reviewed cancellation
              </legend>
              <p>
                Amount {formatMoney(review.quote.creditRequired)}. Use an
                existing approved refund credit above if it has already been
                recorded. This action records money returned outside Mera.
              </p>
              <div className="mw-form">
                <Segmented
                  label="Reviewed cancellation refund method"
                  required
                  value={refundMethod}
                  onChange={setRefundMethod}
                  options={[
                    { value: "cash", label: "Cash returned" },
                    { value: "external_pos", label: "External POS refund" },
                    {
                      value: "external_transfer",
                      label: "External transfer returned",
                    },
                  ]}
                />
                <ReasonInput
                  label="Reviewed cancellation refund reason"
                  required
                  minLength={3}
                  maxLength={300}
                  value={refundReason}
                  onChange={setRefundReason}
                  presets={[
                    "Customer changed mind",
                    "Item unavailable",
                    "Wrong item entered",
                    "Took too long",
                  ]}
                />
              </div>
              <label className="mw-row">
                <span>I verified this refund was already paid manually.</span>
                <input
                  type="checkbox"
                  required
                  checked={refundConfirmed}
                  onChange={(event) => setRefundConfirmed(event.target.checked)}
                />
              </label>
              <button
                className="secondary"
                disabled={
                  !refundConfirmed ||
                  credits.some(
                    (refund) => refund.cancellationQuoteId === review.quote.id,
                  )
                }
              >
                Record verified refund for this cancellation
              </button>
            </fieldset>
          </form>
        )}
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
