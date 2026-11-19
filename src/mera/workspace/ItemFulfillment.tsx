import { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { Disclosure } from "../ui/OperationalPrimitives";
type Props = {
  order: any;
  tickets: unknown;
  base: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
type Pending = {
  path: string;
  body: {
    requestKey: string;
    version: number;
    fulfilledQuantity: number;
    reason: string;
  };
  review: { name: string; served: number; prepared: number; ordered: number };
};
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function preparedCount(
  tickets: unknown,
  orderId: string,
  lineId: string,
): number | null {
  if (!Array.isArray(tickets)) return null;
  let total = 0;
  for (const ticket of tickets) {
    if (!ticket || ticket.orderId !== orderId || ticket.status === "cancelled")
      continue;
    if (!Array.isArray(ticket.items)) return null;
    for (const item of ticket.items) {
      if (!item || typeof item !== "object") return null;
      if (item.orderLineId !== lineId) continue;
      const prepared =
        ticket.status === "ready"
          ? item.quantity
          : (item.preparedQuantity ?? 0);
      if (!count(prepared)) return null;
      total += prepared;
      if (!Number.isSafeInteger(total)) return null;
    }
  }
  return total;
}
export default function ItemFulfillment(props: Props) {
  return <ScopedItemFulfillment key={props.base + props.order.id} {...props} />;
}
function ScopedItemFulfillment({
  order,
  tickets,
  base,
  disabled,
  save,
}: Props) {
  const [lineId, setLineId] = useState(""),
    [quantity, setQuantity] = useState(1),
    [reason, setReason] = useState(""),
    [pending, setPending] = useState<Pending | null>(null),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [denied, setDenied] = useState(false);
  const mounted = useRef(true),
    inFlight = useRef(false),
    pendingRef = useRef<Pending | null>(null),
    deniedRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const available = Array.isArray(order.items),
    lines = available
      ? order.items
          .filter(
            (item: any) =>
              item &&
              item.orderLineId &&
              count(item.quantity) &&
              item.quantity > 0,
          )
          .map((item: any) => {
            const served = item.fulfilledQuantity ?? 0,
              prepared = preparedCount(tickets, order.id, item.orderLineId);
            return {
              ...item,
              served: count(served) ? served : null,
              prepared,
              limit:
                prepared === null ? null : Math.min(item.quantity, prepared),
            };
          })
      : [];
  const actionable = lines.filter(
      (item: any) =>
        item.served !== null && item.limit !== null && item.limit > item.served,
    ),
    line = lines.find((item: any) => item.orderLineId === lineId);
  const preparationKnown =
    Array.isArray(tickets) &&
    lines.every((item: any) => item.prepared !== null);
  const active = ["accepted", "preparing", "ready"].includes(order.status),
    versionKnown = Number.isSafeInteger(order.version) && order.version > 0;
  const validSelection =
    !!line &&
    active &&
    versionKnown &&
    Number.isInteger(quantity) &&
    line.served !== null &&
    line.limit !== null &&
    quantity > line.served &&
    quantity <= line.limit;
  async function perform() {
    if (disabled || inFlight.current || deniedRef.current) return;
    const original = pendingRef.current;
    if (!original && !validSelection) return;
    const attempt: Pending = original || {
      path:
        base +
        `/orders/${order.id}/items/${encodeURIComponent(lineId)}/fulfillment`,
      body: {
        requestKey: uuid(),
        version: order.version,
        fulfilledQuantity: quantity,
        reason,
      },
      review: {
        name: line.name,
        served: line.served,
        prepared: line.prepared,
        ordered: line.quantity,
      },
    };
    inFlight.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    // Freeze before awaiting parent mutation. Its later snapshot refresh may
    // fail even if the handoff itself was accepted; never replace this intent.
    pendingRef.current = attempt;
    setPending(attempt);
    try {
      const result = await save(
        attempt.path,
        "POST",
        attempt.body,
        "Item handoff recorded. Order collection remains a separate action.",
      );
      if (!mounted.current) return;
      if (typeof result?.allItemsHandedOver !== "boolean")
        throw Error(
          "The handoff result could not be verified. Check the order before retrying the original request.",
        );
      pendingRef.current = null;
      setPending(null);
      setLineId("");
      setReason("");
      setNotice(
        result.allItemsHandedOver
          ? "All items have been handed over. After checking the whole order, mark it collected separately."
          : "Item handoff recorded. The whole order has not been marked collected.",
      );
    } catch (failure) {
      if (!mounted.current) return;
      if ([401, 403, 404].includes((failure as any)?.status)) {
        deniedRef.current = true;
        setDenied(true);
      }
      setError(
        (failure as Error)?.message || "The handoff could not be confirmed.",
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  if (denied)
    return (
      <section className="mw-item-handoff">
        <p role="alert">
          Access to these handoff details is no longer available. The original
          request has not been retried. Refresh your workspace and ask a
          supervisor to check the order.
        </p>
      </section>
    );
  return (
    <Disclosure summary="Hand over prepared items" className="mw-item-handoff">
      <p className="mw-note">
        Record the total handed over so far, including earlier handoffs. Only
        prepared items can be handed over. The venue checks payment when you
        save; marking the whole order collected is a separate action.
      </p>
      {error && (
        <p role="alert" className="mw-item-handoff-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mw-note">
          {notice}
        </p>
      )}
      {!pending && (
        <>
          {!available ? (
            <p role="status">
              Order item details are unavailable. Refresh the workspace before
              recording a handoff.
            </p>
          ) : !lines.length ? (
            <p>No remaining items are listed for this order.</p>
          ) : (
            <ul
              className="mw-item-handoff-counts"
              aria-label="Preparation and handoff counts"
            >
              {lines.map((item: any) => (
                <li key={item.orderLineId}>
                  <strong>{item.name}</strong>
                  <span>
                    Ordered {item.quantity} · Prepared{" "}
                    {item.prepared === null ? "unavailable" : item.prepared} ·
                    Handed over{" "}
                    {item.served === null ? "unavailable" : item.served}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!active ? (
            <p>This order is not at an active handoff stage.</p>
          ) : !versionKnown ? (
            <p>
              The latest order details are unavailable. Refresh the workspace
              before recording a handoff.
            </p>
          ) : !preparationKnown ? (
            <p>
              Preparation details are unavailable. Refresh the workspace before
              recording a handoff.
            </p>
          ) : !actionable.length ? (
            <p>
              No prepared items are waiting to be handed over. Check preparation
              progress or refresh the order.
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform();
              }}
            >
              <fieldset disabled={disabled || working}>
                <label>
                  Item to hand over
                  <select
                    required
                    value={lineId}
                    onChange={(event) => {
                      const selected = actionable.find(
                        (item: any) => item.orderLineId === event.target.value,
                      );
                      setLineId(event.target.value);
                      setQuantity((selected?.served ?? 0) + 1);
                      setError("");
                    }}
                  >
                    <option value="">Choose a prepared item</option>
                    {actionable.map((item: any) => (
                      <option key={item.orderLineId} value={item.orderLineId}>
                        {item.name} · {item.served} / {item.quantity} handed
                        over
                      </option>
                    ))}
                  </select>
                </label>
                {line && (
                  <p className="mw-note">
                    Already handed over: {line.served}. Prepared:{" "}
                    {line.prepared}. Total ordered: {line.quantity}.
                  </p>
                )}
                <label>
                  Total handed over after this action
                  <input
                    type="number"
                    required
                    min={(line?.served ?? 0) + 1}
                    max={line?.limit ?? 0}
                    step={1}
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(Number(event.target.value))
                    }
                    aria-describedby="mw-item-handoff-quantity-hint"
                  />
                </label>
                <p
                  id="mw-item-handoff-quantity-hint"
                  className="mw-item-handoff-hint"
                >
                  Include items already handed over. This is the new total, not
                  the quantity being added.
                </p>
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
                  className="secondary"
                  disabled={!validSelection}
                >
                  Record item handoff
                </button>
              </fieldset>
            </form>
          )}
        </>
      )}
      {pending && (
        <div className="mw-item-handoff-pending">
          <p role="status">
            {working
              ? "Recording the original handoff…"
              : "This handoff is not yet confirmed. Retry the same request before recording another handoff."}
          </p>
          <dl>
            <div>
              <dt>Item</dt>
              <dd>{pending.review.name}</dd>
            </div>
            <div>
              <dt>Previously handed over</dt>
              <dd>{pending.review.served}</dd>
            </div>
            <div>
              <dt>Prepared at review</dt>
              <dd>{pending.review.prepared}</dd>
            </div>
            <div>
              <dt>Total handed over in this request</dt>
              <dd>
                {pending.body.fulfilledQuantity} of {pending.review.ordered}
              </dd>
            </div>
            {pending.body.reason && (
              <div>
                <dt>Original note</dt>
                <dd>{pending.body.reason}</dd>
              </div>
            )}
          </dl>
          <p className="mw-item-handoff-hint">
            Keep this page open. Leaving or refreshing does not save these retry
            details. A retry uses the original item and quantity, even if the
            order has since changed.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={disabled || working}
            onClick={() => void perform()}
          >
            {working ? "Recording…" : "Retry original handoff"}
          </button>
        </div>
      )}
    </Disclosure>
  );
}
