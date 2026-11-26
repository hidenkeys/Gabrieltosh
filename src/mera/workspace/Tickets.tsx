import ItemContents from "../customer/ItemContents";
import React, { useState, useRef, useEffect } from "react";
import {
  Bell,
  BellOff,
  Check,
  LoaderCircle,
  Maximize,
  Minimize,
  Plus,
} from "lucide-react";
import { Segmented } from "../ui/Segmented";
import { Chips } from "../ui/Chips";
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
type Intent = {
  path: string;
  body: any;
  ticketId: string;
  message: string;
  itemKey?: string;
  quantity?: number;
};
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
    [phoneStatus, setPhoneStatus] = useState("active"),
    [narrow, setNarrow] = useState(
      () =>
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 999px)").matches,
    ),
    [optimistic, setOptimistic] = useState<
      Record<string, { quantity: number; version: number }>
    >({}),
    [receipts, setReceipts] = useState<Record<string, any>>({}),
    [error, setError] = useState(""),
    [errorTicket, setErrorTicket] = useState(""),
    [working, setWorking] = useState(false),
    [busyTicket, setBusyTicket] = useState(""),
    [pending, setPending] = useState<Intent | null>(null),
    [denied, setDenied] = useState(false),
    [chime, setChime] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [toolError, setToolError] = useState(""),
    [clockTick, setClockTick] = useState(0);
  const active = useRef(true),
    flight = useRef(false),
    pendingRef = useRef<Intent | null>(null),
    surface = useRef<HTMLElement>(null),
    audio = useRef<AudioContext | null>(null),
    previousIds = useRef<Set<string> | null>(null),
    clockAnchor = useRef({ serverTime, received: Date.now() });
  if (clockAnchor.current.serverTime !== serverTime)
    clockAnchor.current = { serverTime, received: Date.now() };
  useEffect(() => {
    active.current = true;
    const timer = window.setInterval(
      () => setClockTick((tick) => tick + 1),
      30000,
    );
    const change = () =>
      setFullscreen(document.fullscreenElement === surface.current);
    document.addEventListener("fullscreenchange", change);
    return () => {
      active.current = false;
      window.clearInterval(timer);
      document.removeEventListener("fullscreenchange", change);
      void audio.current?.close().catch(() => {});
    };
  }, []);
  const validItem = (item: any) =>
    item &&
    typeof item === "object" &&
    Number.isSafeInteger(item.quantity) &&
    item.quantity >= 0 &&
    (item.cancelledQuantity === undefined ||
      (Number.isSafeInteger(item.cancelledQuantity) &&
        item.cancelledQuantity >= 0)) &&
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
    ? tickets
        .filter(
          (ticket) =>
            ticket && (!stationScope || ticket.station === stationScope),
        )
        .map((ticket) => {
          const receipt = receipts[ticket.id];
          return receipt && receipt.version > ticket.version ? receipt : ticket;
        })
    : [];
  const shown = narrow ? phoneStatus : view;
  const stationTickets = permitted.filter(
    (ticket) => !station || ticket.station === station,
  );
  const rows = stationTickets.filter(
    (ticket) =>
      shown === "all" ||
      (shown === "active"
        ? ticket.status !== "cancelled"
        : ticket.status === shown),
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 999px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
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
      ? Date.parse(serverTime) +
        Math.max(0, Date.now() - clockAnchor.current.received)
      : NaN;
  void clockTick;
  useEffect(() => {
    if (!valid || loading || loadError) return;
    const ids = new Set(permitted.map((ticket) => ticket.id));
    if (
      chime &&
      previousIds.current &&
      [...ids].some((id) => !previousIds.current!.has(id)) &&
      audio.current?.state === "running"
    ) {
      const context = audio.current,
        oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.3);
    }
    previousIds.current = ids;
  }, [tickets, stationScope, valid, loading, loadError, chime]);
  async function toggleChime() {
    if (chime) {
      setChime(false);
      return;
    }
    try {
      audio.current ||= new AudioContext();
      await audio.current.resume();
      if (active.current) {
        setChime(true);
        setToolError("");
      }
    } catch {
      setToolError(
        "Sound is unavailable in this browser. Tickets will still appear here.",
      );
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === surface.current)
        await document.exitFullscreen();
      else if (surface.current?.requestFullscreen)
        await surface.current.requestFullscreen();
      else throw Error();
      setToolError("");
    } catch {
      setToolError(
        "Fullscreen is unavailable. Use your browser's fullscreen option instead.",
      );
    }
  }
  const clearOptimistic = (intent: Intent) =>
    setOptimistic((old) =>
      Object.fromEntries(
        Object.entries(old).filter(([key]) => key !== intent.itemKey),
      ),
    );
  const write = async (requested: Intent) => {
    if (disabled || flight.current || denied || loading || loadError || !valid)
      return;
    const intent = pendingRef.current || requested;
    flight.current = true;
    setWorking(true);
    setBusyTicket(intent.ticketId);
    setError("");
    setErrorTicket(intent.ticketId);
    if (intent.itemKey && intent.quantity !== undefined)
      setOptimistic((old) => ({
        ...old,
        [intent.itemKey!]: {
          quantity: intent.quantity!,
          version: intent.body.version,
        },
      }));
    try {
      const result = await save(
        intent.path,
        "POST",
        intent.body,
        intent.message,
      );
      if (!active.current) return;
      if (
        result?.ticket?.id === intent.ticketId &&
        Number.isInteger(result.ticket.version) &&
        result.ticket.version > intent.body.version &&
        Array.isArray(result.ticket.items) &&
        result.ticket.items.every(validItem)
      ) {
        setReceipts((old) => ({ ...old, [intent.ticketId]: result.ticket }));
        clearOptimistic(intent);
      }
      pendingRef.current = null;
      setPending(null);
    } catch (failure: any) {
      if (!active.current) return;
      clearOptimistic(intent);
      if (pendingRef.current || !failure.status || failure.status >= 500) {
        pendingRef.current = intent;
        setPending(intent);
      }
      if ([401, 403, 404].includes(failure.status)) {
        setDenied(true);
        setOptimistic({});
      }
      setError(
        failure.message ||
          "This update could not be confirmed. Check the ticket, then retry.",
      );
    } finally {
      flight.current = false;
      if (active.current) {
        setWorking(false);
        setBusyTicket("");
      }
    }
  };
  const refresh = async () => {
    if (!onRefresh || flight.current || denied || refreshDisabled) return;
    flight.current = true;
    setWorking(true);
    setError("");
    setErrorTicket("");
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
  const recovery = (ticketId: string, waiting?: string) => {
    const affected = pending?.ticketId === ticketId;
    if (!affected && !(error && errorTicket === ticketId) && !waiting)
      return null;
    return (
      <div
        className="mw-preparation-banner"
        role={error && errorTicket === ticketId ? "alert" : "status"}
      >
        {error && errorTicket === ticketId ? (
          <p>{error}</p>
        ) : waiting ? (
          <p>{waiting}</p>
        ) : null}
        {affected && (
          <>
            <p>Check this update before preparing more items.</p>
            <button
              type="button"
              className="secondary"
              disabled={disabled || working || loading || !!loadError}
              onClick={() => void write(pending!)}
            >
              Retry original preparation update
            </button>
            {newer && (
              <button
                type="button"
                className="secondary"
                disabled={disabled || working}
                onClick={() => {
                  if (flight.current) return;
                  clearOptimistic(pending!);
                  pendingRef.current = null;
                  setPending(null);
                  setError("");
                }}
              >
                Use latest ticket
              </button>
            )}
          </>
        )}
      </div>
    );
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
  const statuses = [
    "queued",
    "preparing",
    "ready",
    ...(shown === "all" ? ["cancelled"] : []),
  ];
  return (
    <section
      ref={surface}
      className="mw-preparation"
      aria-label="Station preparation"
    >
      <header className="mw-preparation-toolbar">
        <div>
          <h2>
            {stationScope
              ? stationScope[0]?.toUpperCase() +
                stationScope.slice(1) +
                " tickets"
              : "Station preparation"}
          </h2>
          <p>Tap items as they are prepared.</p>
        </div>
        <div className="mw-preparation-tools">
          <button
            type="button"
            className="secondary"
            aria-pressed={chime}
            onClick={() => void toggleChime()}
          >
            {chime ? (
              <Bell size={16} aria-hidden="true" />
            ) : (
              <BellOff size={16} aria-hidden="true" />
            )}{" "}
            New ticket sound {chime ? "on" : "off"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? (
              <Minimize size={16} aria-hidden="true" />
            ) : (
              <Maximize size={16} aria-hidden="true" />
            )}
            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
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
      {toolError && (
        <p role="status" className="mw-preparation-banner">
          {toolError}
        </p>
      )}
      {error && !errorTicket && (
        <p role="alert" className="mw-preparation-banner">
          {error}
        </p>
      )}
      <div className="mw-preparation-filters">
        {!stationScope && (
          <Chips
            label="Preparation station"
            value={station}
            onChange={setStation}
            options={[
              { value: "", label: "All stations", count: permitted.length },
              ...Array.from(
                new Set(permitted.map((ticket) => ticket.station)),
              ).map((value) => ({
                value,
                label: value,
                count: permitted.filter((ticket) => ticket.station === value)
                  .length,
              })),
            ]}
          />
        )}
        <Segmented
          className="mw-preparation-desktop-view"
          label="Show tickets"
          value={view}
          onChange={setView}
          options={[
            { value: "active", label: "Active" },
            { value: "ready", label: "Ready" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      <div className="mw-preparation-phone-filter">
        <Chips
          label="Preparation status"
          value={phoneStatus}
          onChange={setPhoneStatus}
          options={[
            {
              value: "active",
              label: "Active",
              count: stationTickets.filter(
                (ticket) => ticket.status !== "cancelled",
              ).length,
            },
            ...["queued", "preparing", "ready"].map((value) => ({
              value,
              label: value[0].toUpperCase() + value.slice(1),
              count: stationTickets.filter((ticket) => ticket.status === value)
                .length,
            })),
            { value: "all", label: "All", count: stationTickets.length },
          ]}
        />
      </div>
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
          <p>New orders appear here when items are sent to your station.</p>
        </div>
      ) : null}
      {pending &&
        !permitted.some((ticket) => ticket.id === pending.ticketId) &&
        recovery(pending.ticketId)}
      {valid && (
        <div className="mw-preparation-grid" hidden={loading || !!loadError}>
          {statuses.map((status) => (
            <div
              className="mw-preparation-lane-heading"
              key={status}
              data-lane={status}
              aria-hidden="true"
            >
              {status[0].toUpperCase() + status.slice(1)}{" "}
              <span>
                {rows.filter((ticket) => ticket.status === status).length}
              </span>
            </div>
          ))}
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
              loading ||
              !!loadError ||
              !Number.isInteger(ticket.version) ||
              ticket.version < 1;
            const at = ticket.createdAt || order?.createdAt,
              minutes =
                typeof at === "string" &&
                Number.isFinite(Date.parse(at)) &&
                Number.isFinite(now)
                  ? Math.max(0, Math.floor((now - Date.parse(at)) / 60000))
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
            const waiting =
              !Number.isInteger(ticket.version) || ticket.version < 1
                ? "Refresh this ticket before preparing items."
                : inactive && !closed
                  ? order?.status === "submitted"
                    ? "Awaiting order acceptance"
                    : order?.holdExpired
                      ? "Review this order before preparing it."
                      : payLater === false && order?.paymentStatus !== "paid"
                        ? "Awaiting payment confirmation"
                        : "This order is not in active preparation."
                  : undefined;
            const keepRecovery =
              pending?.ticketId === ticket.id ||
              (error && errorTicket === ticket.id);
            return (
              <article
                className="mw-preparation-ticket"
                key={ticket.id}
                data-lane={ticket.status}
                hidden={!rows.includes(ticket) && !keepRecovery}
                aria-label={`${order?.reference || "Order"} · ${ticket.station} · ${ticket.status}`}
              >
                <header>
                  <div>
                    <span className="mw-preparation-station">
                      {ticket.station}
                    </span>
                    <h3>{order?.reference || "Order reference unavailable"}</h3>
                    {order?.displayName && <p>{order.displayName}</p>}
                    {order?.tableName && (
                      <p className="mw-preparation-table">Serve at {order.tableName}</p>
                    )}
                    {!order?.tableName && order?.fulfillment === "takeaway" && (
                      <p className="mw-preparation-table">Takeaway</p>
                    )}
                  </div>
                  <div className="mw-preparation-ticket-state">
                    <time
                      dateTime={typeof at === "string" ? at : undefined}
                      className={`mw-preparation-elapsed ${minutes !== null && minutes >= 15 ? "is-late" : minutes !== null && minutes >= 8 ? "is-waiting" : ""}`}
                      aria-label={
                        minutes === null
                          ? "Waiting time unavailable"
                          : `${minutes} min since ${ticket.createdAt ? "ticket received" : "order placed"}`
                      }
                    >
                      {minutes === null ? "Time unavailable" : `${minutes} min`}
                    </time>
                    <span className="mw-preparation-status">
                      {ticket.status === "ready"
                        ? "Ready for service"
                        : ticket.status[0].toUpperCase() +
                          ticket.status.slice(1)}
                    </span>
                  </div>
                </header>
                {(actor || order?.handlerName) && (
                  <p className="mw-preparation-meta">
                    {actor
                      ? `Updated by ${actor}`
                      : `Handled by ${order.handlerName}`}
                  </p>
                )}
                <OrderInstructions order={order} compactNote />
                {recovery(ticket.id, waiting)}
                <div className="mw-preparation-items">
                  {ticket.items.map((item: any, index: number) => {
                    const key = ticket.id + ":" + (item.orderLineId || index),
                      count =
                        optimistic[key]?.version === ticket.version
                          ? optimistic[key].quantity
                          : item.preparedQuantity || 0,
                      itemLocked =
                        locked || !item.orderLineId || count >= item.quantity;
                    const prepare = () => {
                      if (
                        itemLocked ||
                        flight.current ||
                        !Number.isSafeInteger(count + 1) ||
                        count < (item.preparedQuantity || 0)
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
                          preparedQuantity: count + 1,
                          version: ticket.version,
                        },
                        ticketId: ticket.id,
                        message: "Prepared item quantity updated.",
                        itemKey: key,
                        quantity: count + 1,
                      });
                    };
                    const label = (
                      <>
                        <span className="mw-preparation-quantity">
                          {item.quantity}×
                        </span>
                        <span className="mw-preparation-item-copy">
                          <strong>{item.name}</strong>
                          <ItemContents item={item} />
                          {item.size && <small>{item.size}</small>}
                        </span>
                      </>
                    );
                    return (
                      <div
                        key={key}
                        className="mw-preparation-item"
                        aria-busy={
                          busyTicket === ticket.id &&
                          optimistic[key] !== undefined
                        }
                      >
                        {item.quantity === 1 && !closed ? (
                          <button
                            type="button"
                            className="mw-preparation-single"
                            disabled={itemLocked}
                            aria-label={`Prepare ${item.name} on ${ticket.station}`}
                            onClick={prepare}
                          >
                            {label}
                            <span className="mw-preparation-item-mark">
                              {count ? (
                                <Check size={20} aria-hidden="true" />
                              ) : (
                                <Plus size={20} aria-hidden="true" />
                              )}
                            </span>
                          </button>
                        ) : (
                          <div className="mw-preparation-item-heading">
                            {label}
                          </div>
                        )}
                        <OrderInstructions item={item} />
                        <div className="mw-preparation-progress">
                          <output
                            aria-label={`Prepared quantity for ${item.name} on ${ticket.station}`}
                            aria-live="polite"
                            aria-disabled={locked}
                          >
                            {count} / {item.quantity}
                          </output>
                          {item.quantity > 1 && (
                            <span
                              className="mw-preparation-dots"
                              aria-hidden="true"
                            >
                              {Array.from(
                                { length: Math.min(item.quantity, 12) },
                                (_, dot) => (
                                  <span
                                    key={dot}
                                    data-prepared={
                                      dot < count ? "true" : undefined
                                    }
                                  >
                                    ●
                                  </span>
                                ),
                              )}
                              {item.quantity > 12 && "…"}
                            </span>
                          )}
                          {busyTicket === ticket.id &&
                            optimistic[key] !== undefined && (
                              <LoaderCircle
                                size={16}
                                className="mw-preparation-saving"
                                aria-label="Saving prepared quantity"
                              />
                            )}
                          {!!item.cancelledQuantity && (
                            <span
                              className="mw-preparation-cancelled"
                              aria-label={`${item.cancelledQuantity} cancelled`}
                            >
                              <s aria-hidden="true">
                                {"●".repeat(
                                  Math.min(item.cancelledQuantity, 12),
                                )}
                              </s>
                              {item.cancelledQuantity > 12 && (
                                <span aria-hidden="true">
                                  {" "}
                                  +{item.cancelledQuantity - 12}
                                </span>
                              )}
                            </span>
                          )}
                          {item.quantity > 1 && !closed && (
                            <button
                              type="button"
                              className="secondary mw-preparation-add"
                              disabled={itemLocked}
                              aria-label={`Prepare one more ${item.name} on ${ticket.station}`}
                              onClick={prepare}
                            >
                              <Plus size={18} aria-hidden="true" />
                              <span>Prepare one</span>
                            </button>
                          )}
                          {!item.orderLineId && !closed && (
                            <small>
                              Refresh this ticket to prepare individual items.
                            </small>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                        ? "Start preparing"
                        : "Mark ready"}
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
