/** Customer-facing labels never echo unknown internal state values. */
const orderStates: Record<string, string> = {
  submitted: "Sent to the venue",
  pending: "Awaiting confirmation",
  accepted: "Accepted",
  preparing: "Being prepared",
  ready: "Ready",
  served: "Served",
  collected: "Collected",
  completed: "Completed",
  rejected: "Not accepted",
  cancelled: "Cancelled",
};
const paymentStates: Record<string, string> = {
  unpaid: "Payment not yet confirmed",
  pending: "Payment awaiting confirmation",
  partially_paid: "Partly paid",
  paid: "Payment confirmed",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  failed: "Payment failed",
  expired: "Payment expired",
  cancelled: "Payment cancelled",
};
const activities: Record<string, string> = {
  ...orderStates,
  assigned: "Order handler updated",
  payment_recorded: "Payment recorded",
  refund_recorded: "Refund recorded",
  refund_requested: "Refund requested",
  items_handed_over: "Items handed over",
  item_cancelled: "Item cancelled",
  item_cancellation: "Item cancellation recorded",
  deposit_applied: "Deposit applied",
  writeoff_recorded: "Balance adjustment recorded",
  balance_written_off: "Balance adjustment recorded",
  legacy_order_imported: "Previous order history imported",
  legacy_source_audit: "Previous order history recorded",
  prepared: "Preparation updated",
};
export const orderStateLabel = (value: unknown) =>
  typeof value === "string"
    ? orderStates[value] || "Status unavailable"
    : "Status unavailable";
export const paymentStateLabel = (value: unknown) =>
  typeof value === "string"
    ? paymentStates[value] || "Payment status unavailable"
    : "Payment status unavailable";
export const activityLabel = (value: unknown) =>
  typeof value === "string"
    ? activities[value] || "Order activity recorded"
    : "Order activity recorded";
export function customerDate(value: unknown, timeZone?: string) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    !Number.isFinite(Date.parse(value))
  )
    return "Time unavailable";
  const date = new Date(value);
  if (timeZone) {
    try {
      return (
        new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        }).format(date) +
        " · " +
        timeZone
      );
    } catch {
      /* Invalid branch configuration uses an explicitly labelled device clock. */
    }
  }
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date) + " · Device time"
  );
}
