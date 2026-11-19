import { useEffect, useRef, useState } from "react";
import { customerRequest } from "./client";
import {
  orderStateLabel,
  paymentStateLabel,
  customerDate,
} from "./orderPresentation";
export default function SessionOrders({
  ...props
}: Parameters<typeof ScopedSessionOrders>[0]) {
  return <ScopedSessionOrders key={props.prefix} {...props} />;
}
function ScopedSessionOrders({
  prefix,
  onSelect,
  onClear,
  hasUnconfirmedOrder = false,
  timeZone,
}: {
  prefix: string;
  onSelect: (order: any) => void;
  onClear: (message: string) => void;
  hasUnconfirmedOrder?: boolean;
  timeZone?: string;
}) {
  const [orders, setOrders] = useState<any[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [confirmEnd, setConfirmEnd] = useState(false);
  const generation = useRef(0),
    callbacks = useRef({ onSelect, onClear });
  callbacks.current = { onSelect, onClear };
  async function load(next?: string) {
    const current = generation.current;
    setBusy(true);
    setLoading(true);
    try {
      const result = await customerRequest(
        prefix +
          "/guest-orders?take=20" +
          (next ? "&cursor=" + encodeURIComponent(next) : ""),
      );
      if (current !== generation.current) return;
      setOrders((previous) =>
        next ? [...previous, ...result.orders] : result.orders,
      );
      setCursor(result.nextCursor || null);
      setError("");
    } catch (e) {
      if (current !== generation.current) return;
      setError((e as Error).message);
      if ([401, 403, 404].includes((e as any).status)) {
        setOrders([]);
        setCursor(null);
      }
      if ((e as any).status === 401) {
        callbacks.current.onClear(
          "This guest session expired. Enter your name to start a new session. Existing orders have not been cancelled.",
        );
      }
    } finally {
      if (current === generation.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    setOrders([]);
    setCursor(null);
    setConfirmEnd(false);
    void load();
    return () => {
      generation.current++;
    };
  }, [prefix]);
  return (
    <section className="mc-panel mc-session">
      <h2>Your recent orders</h2>
      <p>
        Orders at this branch in your current guest session. For an order placed
        on another device, please ask staff for help.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="mc-secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        Refresh session orders
      </button>
      {loading && <p role="status">Loading your orders…</p>}
      {orders.map((order) => (
        <article key={order.id}>
          <p>
            {order.reference || "Order reference unavailable"} ·{" "}
            {orderStateLabel(order.status)} ·{" "}
            {paymentStateLabel(order.paymentStatus)}
          </p>
          <p>{customerDate(order.createdAt, timeZone)}</p>
          <button
            className="mc-secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const current = generation.current;
              try {
                const canonical = await customerRequest(
                  "/public/orders/" + order.id,
                );
                if (current === generation.current)
                  callbacks.current.onSelect(canonical);
              } catch (e) {
                if (current !== generation.current) return;
                setError((e as Error).message);
                if ([401, 403, 404].includes((e as any).status)) {
                  setOrders([]);
                  setCursor(null);
                }
                if ((e as any).status === 401)
                  callbacks.current.onClear(
                    "This guest session expired. Existing orders have not been cancelled.",
                  );
              } finally {
                if (current === generation.current) setBusy(false);
              }
            }}
          >
            Open order {order.reference || "with unavailable reference"}
          </button>
        </article>
      ))}
      {!orders.length && !busy && !error && (
        <p>No orders in this guest session.</p>
      )}
      {cursor && (
        <button
          className="mc-secondary"
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          Load more session orders
        </button>
      )}
      {confirmEnd ? (
        <div className="mc-alert">
          <h3>End this organization’s guest session?</h3>
          <p>
            You will lose access to this session’s private order, reservation
            and visit history. This does not cancel orders, close a table visit
            or confirm any refund. Other venues’ guest sessions stay active.
          </p>
          {hasUnconfirmedOrder && (
            <p>
              An order still needs checking. Ending this session will not stop
              or cancel it, and you may need staff to review it before placing
              another order.
            </p>
          )}
          <button
            type="button"
            className="mc-secondary"
            disabled={busy}
            onClick={() => setConfirmEnd(false)}
          >
            Keep this guest session
          </button>
          <button
            type="button"
            className="mc-primary"
            disabled={busy}
            onClick={async () => {
              const current = generation.current;
              setBusy(true);
              try {
                const result = await customerRequest(
                  prefix + "/guest/end",
                  "POST",
                  {},
                );
                if (current !== generation.current) return;
                if (!result.ended)
                  throw Error(
                    "Session ending was not confirmed. Refresh before retrying.",
                  );
                setOrders([]);
                callbacks.current.onClear(
                  "Guest session ended. Existing orders and visits remain unchanged; no refund was confirmed. Enter your name for a new session.",
                );
              } catch (e) {
                if (current !== generation.current) return;
                setError((e as Error).message);
                if ((e as any).status === 401)
                  callbacks.current.onClear(
                    "This guest session already expired. Existing orders remain unchanged.",
                  );
              } finally {
                if (current === generation.current) setBusy(false);
              }
            }}
          >
            End this guest session
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="mc-secondary"
          disabled={busy}
          onClick={() => setConfirmEnd(true)}
        >
          End guest session…
        </button>
      )}
    </section>
  );
}
