import { useState } from "react";
import { uuid } from "../../api";
import { WorkspaceError } from "./api";
export default function ItemFulfillment({
  order,
  tickets,
  base,
  disabled,
  save,
}: {
  order: any;
  tickets: any[];
  base: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [lineId, setLineId] = useState(""),
    [quantity, setQuantity] = useState(1),
    [reason, setReason] = useState(""),
    [pending, setPending] = useState<any>(null),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lines = (order.items || []).filter(
      (line: any) => line.orderLineId && line.quantity > 0,
    ),
    line = lines.find((line: any) => line.orderLineId === lineId);
  const served = line?.fulfilledQuantity || 0;
  const prepared = tickets
    .filter(
      (ticket) => ticket.orderId === order.id && ticket.status !== "cancelled",
    )
    .flatMap((ticket) =>
      (ticket.items || []).map((item: any) => ({
        ...item,
        prepared:
          ticket.status === "ready"
            ? item.quantity
            : item.preparedQuantity || 0,
      })),
    )
    .filter((item) => item.orderLineId === lineId)
    .reduce((sum, item) => sum + item.prepared, 0);
  const limit = Math.min(line?.quantity || 0, prepared),
    blocked = !["accepted", "preparing", "ready"].includes(order.status);
  async function perform() {
    const attempt = pending || {
      path:
        base +
        `/orders/${order.id}/items/${encodeURIComponent(lineId)}/fulfillment`,
      body: {
        requestKey: uuid(),
        version: order.version,
        fulfilledQuantity: quantity,
        reason,
      },
    };
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await save(
        attempt.path,
        "POST",
        attempt.body,
        "Item handoff recorded. Order collection remains a separate action.",
      );
      setPending(null);
      setLineId("");
      setReason("");
      setNotice(
        result?.allItemsHandedOver
          ? "All items are handed over. Mark the whole order collected separately after checking it; this handoff does not recognize the sale."
          : "Partial item handoff recorded. The whole order has not been marked collected.",
      );
    } catch (e) {
      if (!(e instanceof WorkspaceError) || !e.status || e.status >= 500)
        setPending(attempt);
      else setPending(null);
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <details>
      <summary>Hand over prepared items</summary>
      <p className="mw-note">
        Record the total quantity handed over so far, including earlier
        handoffs. Only prepared items may be handed over; payment or the venue’s
        approved pay-later policy is checked by the server. Final order
        collection remains separate.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
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
          <label>
            Item to hand over
            <select
              required
              value={lineId}
              onChange={(event) => {
                const selected = lines.find(
                  (item: any) => item.orderLineId === event.target.value,
                );
                setLineId(event.target.value);
                setQuantity((selected?.fulfilledQuantity || 0) + 1);
              }}
            >
              <option value="">Choose a prepared item</option>
              {lines.map((item: any) => (
                <option key={item.orderLineId} value={item.orderLineId}>
                  {item.name} · {item.fulfilledQuantity || 0} / {item.quantity}{" "}
                  handed over
                </option>
              ))}
            </select>
          </label>
          {line && (
            <p>
              Already handed over: {served}. Prepared: {prepared}. Total
              ordered: {line.quantity}.
            </p>
          )}
          <label>
            Total handed over after this action
            <input
              type="number"
              required
              min={served + 1}
              max={limit}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <label>
            Handoff note (optional)
            <input
              value={reason}
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={
              !line ||
              !Number.isInteger(quantity) ||
              quantity <= served ||
              quantity > limit
            }
          >
            Record item handoff
          </button>
        </fieldset>
      </form>
      {blocked && !pending && (
        <p>This order is not at an active handoff stage.</p>
      )}
      {pending && (
        <div className="mw-note">
          <p>
            Handoff is not confirmed. The original quantity, order version and
            request key are preserved. Retry that request before recording
            another handoff.
          </p>
          <button
            type="button"
            disabled={disabled || working}
            onClick={() => void perform()}
          >
            Retry original handoff
          </button>
        </div>
      )}
    </details>
  );
}
