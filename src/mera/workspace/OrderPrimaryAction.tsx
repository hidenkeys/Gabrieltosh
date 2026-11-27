import { useEffect, useRef, useState } from "react";
const steps: Record<string, [string, string]> = {
  submitted: ["accepted", "Accept"],
  accepted: ["preparing", "Start preparing"],
  preparing: ["ready", "Ready"],
  ready: ["collected", "Collected"],
  collected: ["completed", "Complete"],
};
export default function OrderPrimaryAction({
  order,
  disabled,
  advance,
}: {
  order: any;
  disabled: boolean;
  advance: (status: string) => Promise<any>;
}) {
  const [status, setStatus] = useState(order.status);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const flight = useRef(false);
  useEffect(() => {
    if (!flight.current) setStatus(order.status);
  }, [order.status, order.version]);
  const next = steps[status];
  if (!next) return null;
  return (
    <div className="mw-primary-progress">
      <button
        type="button"
        className="primary"
        disabled={disabled || busy}
        onClick={async () => {
          if (flight.current || disabled) return;
          flight.current = true;
          setBusy(true);
          setError("");
          setStatus(next[0]);
          try {
            await advance(next[0]);
          } catch (failure) {
            setStatus(order.status);
            setError((failure as Error).message);
          } finally {
            flight.current = false;
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Saving…"
          : status === "ready" && order.fulfillment === "table_service"
            ? "Served"
            : next[1]}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
