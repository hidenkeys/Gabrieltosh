import { formatMoney } from "./api";
const rows = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const readable = (value: unknown) =>
  typeof value === "string" ? value.replaceAll("_", " ") : "Unavailable";
export default function OverviewAttention({
  data,
  canNavigate,
  onNavigate,
}: {
  data: any;
  canNavigate: (id: string) => boolean;
  onNavigate: (id: string) => void;
}) {
  if (!["orders", "menu", "reservations", "shifts"].some(canNavigate))
    return null;
  const clock = Date.parse(data.serverTime);
  const timezone = data.branch?.timezone;
  const at = (value: string) => {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "Time unavailable";
    return new Date(timestamp).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    });
  };
  const arrivals = rows(data.reservations)
    .filter(
      (r) =>
        ["confirmed", "arrived"].includes(r.status) &&
        (!Number.isFinite(clock) || Date.parse(r.endsAt) >= clock),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const shifts = rows(data.shifts).filter((s) =>
    ["open", "pending_approval"].includes(s.status),
  );
  const link = (section: string, text: string) =>
    canNavigate(section) && (
      <button
        className="secondary"
        type="button"
        onClick={() => onNavigate(section)}
      >
        {text}
      </button>
    );
  return (
    <section
      className="mw-card mw-attention"
      aria-labelledby="mw-attention-title"
    >
      <div className="mw-overview-section-heading">
        <h2 id="mw-attention-title">Needs your attention</h2>
        <span>Current service</span>
      </div>
      <div className="mw-attention-grid">
        {canNavigate("orders") && (
          <section>
            <h3>Orders waiting</h3>
            {!Array.isArray(data.delayedOrders) ? (
              <p>Waiting-time alerts are unavailable.</p>
            ) : data.delayedOrders.length ? (
              <ul>
                {data.delayedOrders.slice(0, 3).map((o: any) => (
                  <li key={o.id}>
                    <strong>{o.reference}</strong>
                    <span>
                      {Number.isFinite(o.ageMinutes)
                        ? `${o.ageMinutes} min`
                        : "Waiting time unavailable"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No waiting-time alerts.</p>
            )}
            {link("orders", "Review orders")}
          </section>
        )}
        {canNavigate("menu") && (
          <section>
            <h3>Low stock</h3>
            {!Array.isArray(data.lowStockAlerts) ? (
              <p>Stock alerts are unavailable.</p>
            ) : data.lowStockAlerts.length ? (
              <ul>
                {data.lowStockAlerts.slice(0, 3).map((p: any) => (
                  <li key={p.productId + ":" + (p.variantId || "base")}>
                    <strong>
                      {p.name}
                      {p.size ? ` · ${p.size}` : ""}
                    </strong>
                    <span>
                      {Number.isSafeInteger(p.stock)
                        ? `${p.stock} left`
                        : "Stock unavailable"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No low-stock alerts.</p>
            )}
            {link("menu", "Review stock")}
          </section>
        )}
        {canNavigate("reservations") && (
          <section>
            <h3>Upcoming arrivals</h3>
            {!Array.isArray(data.reservations) ? (
              <p>Arrival details are unavailable.</p>
            ) : arrivals.length ? (
              <ul>
                {arrivals.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <strong>{r.displayName || "Reservation"}</strong>
                    <span>
                      {at(r.startsAt)} · {readable(r.status)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No confirmed arrivals waiting.</p>
            )}
            {link("reservations", "Review arrivals")}
          </section>
        )}
        {canNavigate("shifts") && (
          <section>
            <h3>Shift status</h3>
            {!Array.isArray(data.shifts) ? (
              <p>Shift details are unavailable.</p>
            ) : shifts.length ? (
              <ul>
                {shifts.slice(0, 3).map((s) => (
                  <li key={s.id}>
                    <strong>{readable(s.status)}</strong>
                    <span>
                      {s.status === "pending_approval" &&
                      Number.isSafeInteger(s.variance)
                        ? `Variance ${formatMoney(s.variance)}`
                        : at(s.openedAt || s.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No open shifts.</p>
            )}
            {link("shifts", "Review shifts")}
          </section>
        )}
      </div>
    </section>
  );
}
