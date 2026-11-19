import { Action, Disclosure } from "../ui/OperationalPrimitives";

/** Compact global signal; the actual branch queue and permissions remain authoritative. */
export default function ServiceAttention({
  orders,
  threshold,
  onReview,
}: {
  orders: any[];
  threshold?: number;
  onReview: () => void;
}) {
  if (!orders.length) return null;
  const minutes =
    Number.isFinite(threshold) && Number(threshold) > 0 ? threshold : 15;
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
        <Action onClick={onReview}>Review branch orders</Action>
      </div>
      <Disclosure summary="Waiting order details">
        <p>
          These orders have been waiting longer than the configured {minutes}
          -minute threshold. Review the current handoffs with your branch team.
        </p>
        <ul>
          {orders.slice(0, 10).map((order: any) => (
            <li key={order.id}>
              {order.reference || "Order reference unavailable"} ·{" "}
              {Number.isFinite(order.ageMinutes)
                ? `${order.ageMinutes} minutes`
                : "Waiting time unavailable"}
            </li>
          ))}
        </ul>
        {orders.length > 10 && <p>{orders.length - 10} more delayed orders.</p>}
      </Disclosure>
    </section>
  );
}
