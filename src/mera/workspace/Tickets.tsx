import React, { useState } from "react";
export default function Tickets({
  base,
  tickets,
  orders,
  disabled,
  save,
  stationScope,
}: {
  stationScope?: string;
  base: string;
  tickets: any[];
  orders: any[];
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  tickets = stationScope
    ? tickets.filter((ticket) => ticket.station === stationScope)
    : tickets;
  const [station, setStation] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  return (
    <section className="mw-card">
      <h2>Station preparation</h2>
      <p>
        Each station prepares its own items. Overall readiness follows all
        required station items. Orders must first be accepted and satisfy the
        branch payment policy.
      </p>
      {error && <p role="alert">{error}</p>}
      <label>
        Preparation station
        <select
          value={station}
          onChange={(event) => setStation(event.target.value)}
        >
          <option value="">All authorized stations</option>
          {Array.from(new Set(tickets.map((ticket) => ticket.station))).map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </label>
      {!tickets.length ? (
        <p>No preparation tickets for this branch.</p>
      ) : (
        tickets
          .filter((ticket) => !station || ticket.station === station)
          .map((ticket) => {
            const order = orders.find((row) => row.id === ticket.orderId);
            const closed = ["ready", "cancelled"].includes(ticket.status);
            const inactive =
              !order ||
              [
                "submitted",
                "collected",
                "completed",
                "rejected",
                "cancelled",
              ].includes(order.status);
            return (
              <article className="mw-card" key={ticket.id}>
                <h3>
                  {ticket.station} ·{" "}
                  {order?.reference || ticket.orderId.slice(0, 8)}
                </h3>
                <p>
                  {order?.displayName} · {ticket.status}
                </p>
                {inactive && (
                  <p className="mw-note">
                    {order?.status === "submitted"
                      ? "Awaiting order acceptance"
                      : "This order is not in active preparation."}
                  </p>
                )}
                {ticket.items.map((item: any, index: number) => {
                  const key = ticket.id + ":" + (item.orderLineId || index);
                  return (
                    <form
                      key={key}
                      onSubmit={async (event) => {
                        event.preventDefault();
                        setError("");
                        try {
                          await save(
                            base +
                              "/tickets/" +
                              ticket.id +
                              "/items/" +
                              encodeURIComponent(item.orderLineId),
                            "POST",
                            {
                              preparedQuantity: Number(
                                quantities[key] ?? item.preparedQuantity ?? 0,
                              ),
                              version: ticket.version,
                            },
                            "Prepared item quantity updated.",
                          );
                          setQuantities((current) => {
                            const next = { ...current };
                            delete next[key];
                            return next;
                          });
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      {!item.orderLineId && (
                        <p className="mw-note">
                          Historical ticket: individual preparation counts are
                          unavailable for this item.
                        </p>
                      )}
                      <div className="mw-form">
                        <label>
                          {item.name}
                          {item.size ? " · " + item.size : ""} · {item.quantity}{" "}
                          ordered{" "}
                          {item.cancelledQuantity
                            ? ` · ${item.cancelledQuantity} cancelled`
                            : ""}
                          <input
                            aria-label={`Prepared quantity for ${item.name} on ${ticket.station}`}
                            type="number"
                            min={item.preparedQuantity || 0}
                            max={item.quantity}
                            required
                            step={1}
                            value={
                              quantities[key] ?? item.preparedQuantity ?? 0
                            }
                            disabled={
                              disabled ||
                              inactive ||
                              !item.orderLineId ||
                              closed
                            }
                            onChange={(event) =>
                              setQuantities({
                                ...quantities,
                                [key]: event.target.value,
                              })
                            }
                          />
                        </label>
                        <button
                          disabled={
                            disabled || inactive || !item.orderLineId || closed
                          }
                          className="secondary"
                        >
                          Save prepared quantity
                        </button>
                      </div>
                    </form>
                  );
                })}
                <div className="mw-actions">
                  {!closed && (
                    <button
                      disabled={disabled || inactive}
                      onClick={async () => {
                        setError("");
                        try {
                          await save(
                            base + "/tickets/" + ticket.id + "/status",
                            "POST",
                            {
                              status:
                                ticket.status === "queued"
                                  ? "preparing"
                                  : "ready",
                              version: ticket.version,
                            },
                            ticket.status === "queued"
                              ? "Station preparation started."
                              : "Station ticket marked ready.",
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      {ticket.status === "queued"
                        ? "Start station preparation"
                        : "Mark station ready"}
                    </button>
                  )}
                </div>
              </article>
            );
          })
      )}
    </section>
  );
}
