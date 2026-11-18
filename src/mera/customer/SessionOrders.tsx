import { useEffect, useRef, useState } from "react";
import { customerRequest } from "./client";
export default function SessionOrders({
  prefix,
  onSelect,
  onClear,
}: {
  prefix: string;
  onSelect: (order: any) => void;
  onClear: (message: string) => void;
}) {
  const [orders, setOrders] = useState<any[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmEnd, setConfirmEnd] = useState(false);
  const generation = useRef(0),
    callbacks = useRef({ onSelect, onClear });
  callbacks.current = { onSelect, onClear };
  async function load(next?: string) {
    const current = generation.current;
    setBusy(true);
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
      if ((e as any).status === 401) {
        setOrders([]);
        callbacks.current.onClear(
          "This guest session expired. Enter your name to start a new session. Existing orders have not been cancelled.",
        );
      }
    } finally {
      if (current === generation.current) setBusy(false);
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
      <h2>Orders in this guest session</h2>
      <p>
        This list belongs to your current organization and guest session. It
        does not provide verified cross-device history.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="mc-secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        Refresh session orders
      </button>
      {orders.map((order) => (
        <article key={order.id}>
          <p>
            {order.reference} · {order.status} · {order.paymentStatus}
          </p>
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
                if ((e as any).status === 401)
                  callbacks.current.onClear(
                    "This guest session expired. Existing orders have not been cancelled.",
                  );
              } finally {
                if (current === generation.current) setBusy(false);
              }
            }}
          >
            Open order {order.reference}
          </button>
        </article>
      ))}
      {!orders.length && !busy && <p>No orders in this guest session.</p>}
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
