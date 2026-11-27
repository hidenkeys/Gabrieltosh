export default function OrderProgress({ order }: { order: any }) {
  const table = order.fulfillment === "table_service";
  const steps = [
    "Received",
    "Preparing",
    "Ready",
    table ? "Served" : "Collected",
  ];
  const index = (
    {
      submitted: 0,
      received: 0,
      accepted: 0,
      preparing: 1,
      ready: 2,
      completed: 3,
      collected: 3,
      served: 3,
    } as Record<string, number>
  )[order.status];
  if (index === undefined) return null;
  const next = [
    "Your order is with the team. Wait here for updates.",
    "The team is preparing your order. We’ll update this page when it’s ready.",
    table
      ? "Your order is ready. Staff will bring it to your table."
      : "Your order is ready. Please collect it from the counter.",
    table
      ? "Your order has been served. Enjoy your meal."
      : "Your order has been collected. Enjoy your meal.",
  ];
  return (
    <section aria-label="Order progress" aria-live="polite">
      <ol className="mc-order-steps">
        {steps.map((step, i) => (
          <li key={step} aria-current={i === index ? "step" : undefined}>
            {step}
            {i < index ? " ✓" : ""}
          </li>
        ))}
      </ol>
      <p>{next[index]}</p>
    </section>
  );
}
