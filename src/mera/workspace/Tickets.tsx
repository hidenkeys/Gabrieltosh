import React, { useState, useRef, useEffect } from "react";
import OrderInstructions from "./OrderInstructions";
type Save = (
  path: string,
  method: string,
  body: any,
  message: string,
) => Promise<any>;
type Props = {
  base: string;
  tickets: any[] | null;
  orders: any[] | null;
  disabled: boolean;
  save: Save;
  stationScope?: string;
  loading?: boolean;
  loadError?: string;
  onRefresh?: () => Promise<any>;
  refreshDisabled?: boolean;
  onViewOrders?: () => void;
  payLater?: boolean;
  serverTime?: string;
};
type Intent = { path: string; body: any; ticketId: string; message: string };
export default function Tickets(props: Props) {
  return (
    <ScopedTickets
      key={props.base + ":" + (props.stationScope || "all")}
      {...props}
    />
  );
}
function ScopedTickets({
  base,
  tickets,
  orders,
  disabled,
  save,
  stationScope,
  loading = false,
  loadError = "",
  onRefresh,
  refreshDisabled = false,
  onViewOrders,
  payLater,
  serverTime,
}: Props) {
  const [station, setStation] = useState(""),
    [view, setView] = useState("active"),
    [quantities, setQuantities] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [pending, setPending] = useState<Intent | null>(null),
    [denied, setDenied] = useState(false);
  const active = useRef(true),
    flight = useRef(false),
    pendingRef = useRef<Intent | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const validItem = (item: any) =>
    item &&
    typeof item === "object" &&
    Number.isSafeInteger(item.quantity) &&
    item.quantity >= 0 &&
    (item.preparedQuantity === undefined ||
      (Number.isSafeInteger(item.preparedQuantity) &&
        item.preparedQuantity >= 0 &&
        item.preparedQuantity <= item.quantity));
  const valid =
    Array.isArray(tickets) &&
    Array.isArray(orders) &&
    tickets.every(
      (ticket) =>
        ticket &&
        typeof ticket.id === "string" &&
        typeof ticket.station === "string",
    ) &&
    new Set(tickets.map((ticket) => ticket?.id)).size === tickets.length &&
    orders.every(
      (row) => row && typeof row === "object" && typeof row.id === "string",
    ) &&
    tickets
      .filter((ticket) => !stationScope || ticket?.station === stationScope)
      .every(
        (ticket) =>
          ticket &&
          typeof ticket.id === "string" &&
          typeof ticket.station === "string" &&
          ["queued", "preparing", "ready", "cancelled"].includes(
            ticket.status,
          ) &&
          Array.isArray(ticket.items) &&
          ticket.items.every(validItem),
      );
  const permitted = Array.isArray(tickets)
    ? tickets.filter(
        (ticket) =>
          ticket && (!stationScope || ticket.station === stationScope),
      )
    : [];
  const rows = permitted.filter(
    (ticket) =>
      (!station || ticket.station === station) &&
      (view === "all" ||
        (view === "ready"
          ? ticket.status === "ready"
          : !["ready", "cancelled"].includes(ticket.status))),
  );
  const newer =
    pending &&
    permitted.find(
      (ticket) =>
        ticket.id === pending.ticketId &&
        Number.isInteger(ticket.version) &&
        ticket.version > pending.body.version,
    );
  const now =
    serverTime && Number.isFinite(Date.parse(serverTime))
      ? Date.parse(serverTime)
      : NaN;
  const write = async (requested: Intent) => {
    if (disabled || flight.current || denied) return;
    const intent = pendingRef.current || requested;
    flight.current = true;
    setWorking(true);
    setError("");
    try {
      await save(intent.path, "POST", intent.body, intent.message);
      if (!active.current) return;
      pendingRef.current = null;
      setPending(null);
      setQuantities((old) =>
        Object.fromEntries(
          Object.entries(old).filter(
            ([key]) => !key.startsWith(intent.ticketId + ":"),
          ),
        ),
      );
    } catch (failure: any) {
      if (!active.current) return;
      if (pendingRef.current || !failure.status || failure.status >= 500) {
        pendingRef.current = intent;
        setPending(intent);
      }
      if ([401, 403, 404].includes(failure.status)) {
        setDenied(true);
        setQuantities({});
      }
      setError(
        failure.message || "The preparation update could not be confirmed.",
      );
    } finally {
      flight.current = false;
      if (active.current) setWorking(false);
    }
  };
  const refresh = async () => {
    if (!onRefresh || flight.current || denied || refreshDisabled) return;
    flight.current = true;
    setWorking(true);
    setError("");
    try {
      await onRefresh();
    } catch (failure: any) {
      if (active.current) {
        if ([401, 403, 404].includes(failure.status)) setDenied(true);
        setError("Tickets could not be refreshed. Try again.");
      }
    } finally {
      flight.current = false;
      if (active.current) setWorking(false);
    }
  };
  if (denied)
    return (
      <section className="mw-preparation">
        <h2>Station preparation</h2>
        <p role="alert">
          Preparation access needs checking. Refresh the workspace or sign in
          again before continuing.
        </p>
      </section>
    );
  return (
    <section className="mw-preparation" aria-label="Station preparation">
      <header className="mw-preparation-toolbar">
        <div>
          <h2>
            {stationScope
              ? stationScope[0]?.toUpperCase() +
                stationScope.slice(1) +
                " tickets"
              : "Station preparation"}
          </h2>
          <p>Prepare each item, then mark the station ready for service.</p>
        </div>
        <div className="mw-preparation-tools">
          {onRefresh && (
            <button
              type="button"
              className="secondary"
              disabled={refreshDisabled || working || loading}
              onClick={() => void refresh()}
            >
              Refresh tickets
            </button>
          )}
          {onViewOrders && (
            <button type="button" className="secondary" onClick={onViewOrders}>
              View orders
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="mw-preparation-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <section
          className="mw-preparation-recovery"
          aria-label="Unconfirmed preparation update"
        >
          <h3>Preparation update unconfirmed</h3>
          <p>
            Keep the original update while you check the latest ticket. Retrying
            sends the same prepared count and ticket version.
          </p>
          <button
            type="button"
            disabled={disabled || working}
            onClick={() => void write(pending)}
          >
            Retry original preparation update
          </button>
          {newer && (
            <>
              <p>
                A newer ticket has arrived. Review its displayed counts before
                continuing; the original version can no longer change this
                ticket.
              </p>
              <button
                type="button"
                disabled={disabled || working}
                onClick={() => {
                  if (flight.current) return;
                  pendingRef.current = null;
                  setPending(null);
                  setQuantities((old) =>
                    Object.fromEntries(
                      Object.entries(old).filter(
                        ([key]) => !key.startsWith(newer.id + ":"),
                      ),
                    ),
                  );
                  setError("");
                }}
              >
                Use latest ticket
              </button>
            </>
          )}
        </section>
      )}
      <div className="mw-preparation-filters">
        {!stationScope && (
          <label>
            Preparation station
            <select
              value={station}
              onChange={(event) => setStation(event.target.value)}
            >
              <option value="">All authorized stations</option>
              {Array.from(new Set(permitted.map((ticket) => ticket.station)))
                .filter((value) => typeof value === "string")
                .map((value) => (
                  <option key={value}>{value}</option>
                ))}
            </select>
          </label>
        )}
        <label>
          Ticket view
          <select
            value={view}
            onChange={(event) => setView(event.target.value)}
          >
            <option value="active">Active tickets</option>
            <option value="ready">Ready for service</option>
            <option value="all">All tickets</option>
          </select>
        </label>
      </div>
      {!Number.isFinite(now) && (
        <p className="mw-preparation-waiting">
          Waiting times are unavailable until the branch clock is refreshed.
        </p>
      )}
      {loading ? (
        <p role="status">Loading preparation tickets…</p>
      ) : loadError ? (
        <div role="alert">
          <p>{loadError}</p>
          {onRefresh && (
            <button
              type="button"
              disabled={refreshDisabled || working}
              onClick={() => void refresh()}
            >
              Retry loading tickets
            </button>
          )}
        </div>
      ) : !valid ? (
        <p role="status">
          Preparation tickets are unavailable. Refresh records to try again.
        </p>
      ) : !rows.length ? (
        <div className="mw-preparation-empty">
          <h3>
            {permitted.length
              ? "No tickets in this view"
              : "No preparation tickets for this branch."}
          </h3>
          <p>
            {view === "ready"
              ? "Ready station tickets will appear here."
              : "Accepted orders will appear when items are routed to your station."}
          </p>
        </div>
      ) : null}
      {valid && (
        <div className="mw-preparation-grid" hidden={loading || !!loadError}>
          {permitted.map((ticket) => {
            const order = orders?.find((row) => row?.id === ticket.orderId),
              closed = ["ready", "cancelled"].includes(ticket.status);
            const inactive =
              !order ||
              order.historicalReadOnly ||
              !["accepted", "preparing"].includes(order.status) ||
              order.holdExpired ||
              (payLater === false && order.paymentStatus !== "paid");
            const locked =
              disabled ||
              working ||
              !!pending ||
              closed ||
              inactive ||
              !Number.isInteger(ticket.version) ||
              ticket.version < 1;
            const at = ticket.createdAt || order?.createdAt,
              minutes =
                typeof at === "string" && Number.isFinite(Date.parse(at))
                  ? Math.floor((now - Date.parse(at)) / 60000)
                  : null;
            const actor = Array.isArray(order?.history)
              ? [...order.history]
                  .reverse()
                  .find(
                    (event) =>
                      event?.ticketId === ticket.id &&
                      typeof event.actorName === "string" &&
                      event.actorName.trim(),
                  )?.actorName
              : null;
            const status =
              (
                {
                  queued: "Queued",
                  preparing: "Preparing",
                  ready: "Ready for service",
                  cancelled: "Cancelled",
                } as Record<string, string>
              )[ticket.status] || "Status unavailable";
            return (
              <article
                className="mw-preparation-ticket"
                key={ticket.id}
                hidden={!rows.includes(ticket)}
              >
                <header>
                  <div>
                    <span className="mw-preparation-station">
                      {ticket.station}
                    </span>
                    <h3>{order?.reference || "Order reference unavailable"}</h3>
                    {order?.displayName && <p>{order.displayName}</p>}
                  </div>
                  <span className="mw-preparation-status">{status}</span>
                </header>
                <div className="mw-preparation-meta">
                  <time dateTime={typeof at === "string" ? at : undefined}>
                    {minutes !== null && minutes >= 0
                      ? `${minutes} min since ${ticket.createdAt ? "ticket received" : "order placed"}`
                      : "Time unavailable"}
                  </time>
                  {actor ? (
                    <span>Updated by {actor}</span>
                  ) : order?.handlerName ? (
                    <span>Order handler: {order.handlerName}</span>
                  ) : null}
                </div>
                <OrderInstructions order={order} />
                {(!Number.isInteger(ticket.version) || ticket.version < 1) && (
                  <p className="mw-preparation-waiting">
                    Refresh this older ticket before updating preparation.
                  </p>
                )}
                {inactive && !closed && (
                  <p className="mw-preparation-waiting">
                    {order?.status === "submitted"
                      ? "Awaiting order acceptance"
                      : order?.holdExpired
                        ? "Order requires review before preparation"
                        : payLater === false && order?.paymentStatus !== "paid"
                          ? "Awaiting payment confirmation"
                          : "This order is not in active preparation."}
                  </p>
                )}
                <div className="mw-preparation-items">
                  {(Array.isArray(ticket.items) ? ticket.items : []).map(
                    (item: any, index: number) => {
                      const key = ticket.id + ":" + (item.orderLineId || index);
                      return (
                        <form
                          key={key}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const raw =
                                quantities[key] ??
                                String(item.preparedQuantity ?? 0),
                              count = raw.trim() === "" ? NaN : Number(raw);
                            if (
                              locked ||
                              !item.orderLineId ||
                              !Number.isSafeInteger(count) ||
                              count < (item.preparedQuantity ?? 0) ||
                              count > item.quantity
                            )
                              return;
                            void write({
                              path:
                                base +
                                "/tickets/" +
                                ticket.id +
                                "/items/" +
                                encodeURIComponent(item.orderLineId),
                              body: {
                                preparedQuantity: count,
                                version: ticket.version,
                              },
                              ticketId: ticket.id,
                              message: "Prepared item quantity updated.",
                            });
                          }}
                        >
                          <div className="mw-preparation-item-heading">
                            <strong>
                              {item.quantity} × {item.name}
                              {item.size ? " · " + item.size : ""}
                            </strong>
                            <span>
                              {item.preparedQuantity || 0} / {item.quantity}{" "}
                              prepared
                            </span>
                          </div>
                          {!!item.cancelledQuantity && (
                            <p>{item.cancelledQuantity} cancelled</p>
                          )}
                          <OrderInstructions item={item} />
                          {!item.orderLineId ? (
                            <p>
                              Individual preparation counts are unavailable for
                              this older ticket.
                            </p>
                          ) : (
                            !closed && (
                              <div className="mw-preparation-progress">
                                <label>
                                  Prepared quantity
                                  <input
                                    aria-label={`Prepared quantity for ${item.name} on ${ticket.station}`}
                                    type="number"
                                    min={item.preparedQuantity || 0}
                                    max={item.quantity}
                                    step={1}
                                    required
                                    value={
                                      quantities[key] ??
                                      item.preparedQuantity ??
                                      0
                                    }
                                    disabled={locked}
                                    onInput={(event) => {
                                      const value = event.currentTarget.value;
                                      setQuantities((old) => ({
                                        ...old,
                                        [key]: value,
                                      }));
                                    }}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setQuantities((old) => ({
                                        ...old,
                                        [key]: value,
                                      }));
                                    }}
                                  />
                                </label>
                                <button className="secondary" disabled={locked}>
                                  Save prepared quantity
                                </button>
                              </div>
                            )
                          )}
                        </form>
                      );
                    },
                  )}
                </div>
                {!closed && (
                  <footer>
                    <button
                      type="button"
                      className="primary"
                      disabled={locked}
                      onClick={() =>
                        void write({
                          path: base + "/tickets/" + ticket.id + "/status",
                          body: {
                            status:
                              ticket.status === "queued"
                                ? "preparing"
                                : "ready",
                            version: ticket.version,
                          },
                          ticketId: ticket.id,
                          message:
                            ticket.status === "queued"
                              ? "Station preparation started."
                              : "Station ticket marked ready.",
                        })
                      }
                    >
                      {ticket.status === "queued"
                        ? "Start station preparation"
                        : "Mark station ready"}
                    </button>
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
