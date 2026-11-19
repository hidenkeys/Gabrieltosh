import { Action, Disclosure } from "../ui/OperationalPrimitives";
/** Compact global signal; branch queue and permissions remain authoritative. */
export default function ServiceAttention({
  orders: supplied,
  threshold,
  onReview,
  onReviewOrders,
}: {
  orders: any[];
  threshold?: number;
  onReview: () => void;
  onReviewOrders?: (reference?: string) => void;
}) {
  const valid =
    Array.isArray(supplied) &&
    supplied.every(
      (order) => order && typeof order === "object" && !Array.isArray(order),
    );
  if (!valid)
    return (
      <section
        className="mw-service-attention"
        aria-label="Waiting order attention"
      >
        <p>Waiting-time alerts are unavailable.</p>
        <Action
          onClick={() => (onReviewOrders ? onReviewOrders() : onReview())}
        >
          Review branch orders
        </Action>
      </section>
    );
  const orders = supplied;
  if (!orders.length) return null;
  const knownThreshold =
    Number.isSafeInteger(threshold) && Number(threshold) > 0;
  return (
    <section
      className="mw-service-attention"
      aria-label="Waiting order attention"
    >
      <div className="mw-service-attention-summary">
        <strong role="status">
          {orders.length} active{" "}
          {orders.length === 1 ? "order needs" : "orders need"} attention
        </strong>
        <Action
          onClick={() => (onReviewOrders ? onReviewOrders() : onReview())}
        >
          Review branch orders
        </Action>
      </div>
      <Disclosure summary="Waiting order details">
        <p>
          {knownThreshold
            ? `These orders have exceeded the ${threshold}-minute alert threshold.`
            : "These orders were flagged as waiting. The alert threshold is unavailable."}{" "}
          Review the current handoffs with your branch team.
        </p>
        <ul>
          {orders.slice(0, 10).map((order, index) => (
            <li key={typeof order.id === "string" ? order.id : index}>
              {typeof order.reference === "string" && order.reference.trim()
                ? order.reference
                : "Order reference unavailable"}{" "}
              ·{" "}
              {Number.isSafeInteger(order.ageMinutes) && order.ageMinutes >= 0
                ? `${order.ageMinutes} minutes`
                : "Waiting time unavailable"}
              {onReviewOrders &&
                typeof order.reference === "string" &&
                order.reference.trim() && (
                  <Action onClick={() => onReviewOrders(order.reference)}>
                    Review order {order.reference}
                  </Action>
                )}
            </li>
          ))}
        </ul>
        {orders.length > 10 && <p>{orders.length - 10} more delayed orders.</p>}
      </Disclosure>
    </section>
  );
}
