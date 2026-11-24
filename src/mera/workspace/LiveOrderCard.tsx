import ItemContents from "../customer/ItemContents";
import type { ReactNode } from "react";
import { formatMoney } from "./api";
export const orderStatusLabel = (value: string) =>
  (
    ({
      submitted: "New order",
      accepted: "Accepted",
      preparing: "Preparing",
      ready: "Ready for service",
      collected: "Collected",
      completed: "Completed",
      rejected: "Rejected",
      cancelled: "Cancelled",
    }) as Record<string, string>
  )[value] || "Status unavailable";
export const paymentStatusLabel = (value: string) =>
  (
    ({
      unpaid: "Unpaid",
      pending: "Awaiting confirmation",
      partially_paid: "Partly paid",
      paid: "Paid",
      partially_refunded: "Partly refunded",
      refunded: "Refunded",
      failed: "Payment failed",
      expired: "Payment expired",
    }) as Record<string, string>
  )[value] || "Payment status unavailable";
const readable = (value: unknown) => {
  if (value === "customer_qr") return "Customer QR";
  const text = String(value || "Not recorded").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const placed = (value: unknown, zone?: string) => {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  try {
    return (
      date.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        ...(zone ? { timeZone: zone } : {}),
      }) + (zone ? ` · ${zone}` : " · device time")
    );
  } catch {
    return date.toISOString() + " · UTC";
  }
};
export default function LiveOrderCard({
  order,
  timeZone,
  children,
  actions,
  hidden = false,
}: {
  order: any;
  timeZone?: string;
  children: ReactNode;
  actions: ReactNode;
  hidden?: boolean;
}) {
  return (
    <article
      hidden={hidden}
      className="mw-live-order"
      aria-label={`Order ${order.reference || "reference unavailable"}`}
    >
      <header className="mw-live-order-heading">
        <div>
          <h3>{order.reference || "Reference unavailable"}</h3>
          <p>{order.displayName || "Customer name not recorded"}</p>
        </div>
        <span className="mw-pill">{orderStatusLabel(order.status)}</span>
      </header>
      <dl className="mw-live-order-facts">
        <div>
          <dt>Total</dt>
          <dd>
            {Number.isSafeInteger(order.total)
              ? formatMoney(order.total)
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>{paymentStatusLabel(order.paymentStatus)}</dd>
        </div>
        <div>
          <dt>Handler</dt>
          <dd>
            {order.handlerName ||
              (order.handlerId || order.assignedTo
                ? "Staff name unavailable"
                : "Unassigned")}
          </dd>
        </div>
        <div>
          <dt>Placed</dt>
          <dd>{placed(order.createdAt, timeZone)}</dd>
        </div>
        <div>
          <dt>Channel</dt>
          <dd>{readable(order.source)}</dd>
        </div>
        <div>
          <dt>Service</dt>
          <dd>{order.tableName || readable(order.fulfillment)}</dd>
        </div>
      </dl>
      <div className="mw-live-order-actions">{actions}</div>
      {(order.items || [])
        .filter((item: any) => item.components?.length)
        .map((item: any, i: number) => (
          <div key={i}>
            <strong>{item.name}</strong>
            <ItemContents item={item} />
          </div>
        ))}
      {children}
    </article>
  );
}
