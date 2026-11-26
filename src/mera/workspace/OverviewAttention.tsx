import { useMoney } from "../ui/Currency";

import { reservationArrivalEligible } from "./reservationPresentation";
const rows = (value: unknown): any[] =>
  Array.isArray(value)
    ? value.filter(
        (row) => row && typeof row === "object" && !Array.isArray(row),
      )
    : [];
const text = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;
const instant = (value: unknown) =>
  typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
export default function OverviewAttention({
  data: supplied,
  canNavigate,
  onNavigate,
  onReviewOrders,
  onReviewSection,
}: {
  data: any;
  canNavigate: (id: string) => boolean;
  onNavigate: (id: string) => void;
  onReviewOrders?: (reference?: string) => void;
  onReviewSection?: (section: string, recordId?: string) => void;
}) {
  const formatMoney = useMoney();
  if (!["orders", "menu", "reservations", "shifts"].some(canNavigate))
    return null;
  const data = supplied && typeof supplied === "object" ? supplied : {},
    clock = instant(data.serverTime),
    timezone = data.branch?.timezone;
  const at = (value: unknown) => {
    const timestamp = instant(value);
    if (!Number.isFinite(timestamp)) return "Time unavailable";
    if (typeof timezone === "string" && timezone.trim()) {
      try {
        return (
          new Intl.DateTimeFormat("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: timezone,
          }).format(timestamp) +
          " · " +
          timezone
        );
      } catch {
        /* Explicit UTC fallback keeps the instant truthful. */
      }
    }
    return (
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(timestamp) + " · UTC (branch timezone unavailable)"
    );
  };
  const validRows = (value: unknown) =>
    Array.isArray(value) &&
    value.every((row) => row && typeof row === "object" && !Array.isArray(row));
  const reservations = rows(data.reservations),
    arrivals = reservations
      .filter((row) => reservationArrivalEligible(row, data.serverTime))
      .sort((a, b) => {
        const left = instant(a.startsAt),
          right = instant(b.startsAt);
        return Number.isFinite(left) && Number.isFinite(right)
          ? left - right
          : Number.isFinite(left)
            ? -1
            : Number.isFinite(right)
              ? 1
              : 0;
      });
  const shifts = rows(data.shifts).filter((s) =>
    ["open", "pending_approval"].includes(s.status),
  );
  const delayed = rows(data.delayedOrders),
    stock = rows(data.lowStockAlerts);
  const hidden = (count: number, noun: string) =>
    count > 3 ? (
      <p>
        {count - 3} more {count === 4 ? noun.replace(/s$/, "") : noun}.
      </p>
    ) : null;
  const reviewOrders = (reference?: string) =>
    onReviewOrders ? onReviewOrders(reference) : onNavigate("orders");
  const link = (section: string, label: string) =>
    canNavigate(section) && (
      <button
        className="secondary"
        type="button"
        onClick={() =>
          section === "orders"
            ? reviewOrders()
            : onReviewSection
              ? onReviewSection(section)
              : onNavigate(section)
        }
      >
        {label}
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
            {!validRows(data.delayedOrders) ? (
              <p>Waiting-time alerts are unavailable.</p>
            ) : delayed.length ? (
              <>
                <ul>
                  {delayed.slice(0, 3).map((o, index) => (
                    <li key={typeof o.id === "string" ? o.id : index}>
                      <strong>
                        {text(o.reference, "Order reference unavailable")}
                      </strong>
                      <span>
                        {Number.isSafeInteger(o.ageMinutes) && o.ageMinutes >= 0
                          ? `${o.ageMinutes} min`
                          : "Waiting time unavailable"}
                      </span>
                      {onReviewOrders &&
                        typeof o.reference === "string" &&
                        o.reference.trim() && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => reviewOrders(o.reference)}
                          >
                            Review order {o.reference}
                          </button>
                        )}
                    </li>
                  ))}
                </ul>
                {hidden(delayed.length, "waiting orders")}
              </>
            ) : (
              <p>No waiting-time alerts.</p>
            )}
            {link("orders", "Review orders")}
          </section>
        )}
        {canNavigate("menu") && (
          <section>
            <h3>Low stock</h3>
            {!validRows(data.lowStockAlerts) ? (
              <p>Stock alerts are unavailable.</p>
            ) : stock.length ? (
              <>
                <ul>
                  {stock.slice(0, 3).map((p, index) => (
                    <li
                      key={
                        typeof p.productId === "string"
                          ? p.productId + ":" + (p.variantId || "base")
                          : index
                      }
                    >
                      <strong>
                        {text(p.name, "Product name unavailable")}
                        {typeof p.size === "string" && p.size.trim()
                          ? ` · ${p.size}`
                          : ""}
                      </strong>
                      <span>
                        {Number.isSafeInteger(p.stock)
                          ? `${p.stock} left`
                          : "Stock unavailable"}
                      </span>
                    </li>
                  ))}
                </ul>
                {hidden(stock.length, "stock alerts")}
              </>
            ) : (
              <p>No low-stock alerts.</p>
            )}
            {link("menu", "Review stock")}
          </section>
        )}
        {canNavigate("reservations") && (
          <section>
            <h3>Upcoming arrivals</h3>
            {!Number.isFinite(clock) && (
              <p>
                Arrival freshness is unavailable. Confirm current arrivals with
                the branch.
              </p>
            )}
            {!(
              validRows(data.reservations) &&
              data.reservations.every(
                (row: any) =>
                  typeof row.status === "string" && row.status.trim(),
              )
            ) ? (
              <p>Arrival details are unavailable.</p>
            ) : arrivals.length ? (
              <>
                <ul>
                  {arrivals.slice(0, 3).map((r, index) => (
                    <li key={typeof r.id === "string" ? r.id : index}>
                      <strong>
                        {text(r.displayName, "Reservation name unavailable")}
                      </strong>
                      <span>
                        {at(r.startsAt)} ·{" "}
                        {r.status === "arrived" ? "Arrived" : "Confirmed"}
                        {!Number.isFinite(instant(r.endsAt))
                          ? " · End time unavailable"
                          : ""}
                      </span>
                      {onReviewSection && typeof r.id === "string" && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => onReviewSection("reservations", r.id)}
                        >
                          Review reservation{" "}
                          {text(r.displayName, "Reservation")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {hidden(arrivals.length, "arrival records")}
              </>
            ) : Number.isFinite(clock) ? (
              <p>No confirmed arrivals waiting.</p>
            ) : (
              <p>
                No confirmed arrival records were returned; current arrival
                status is unverified.
              </p>
            )}
            {link("reservations", "Review arrivals")}
          </section>
        )}
        {canNavigate("shifts") && (
          <section>
            <h3>Shift status</h3>
            {!(
              validRows(data.shifts) &&
              data.shifts.every(
                (row: any) =>
                  typeof row.status === "string" && row.status.trim(),
              )
            ) ? (
              <p>Shift details are unavailable.</p>
            ) : shifts.length ? (
              <>
                <ul>
                  {shifts.slice(0, 3).map((s, index) => (
                    <li key={typeof s.id === "string" ? s.id : index}>
                      <strong>
                        {s.status === "pending_approval"
                          ? "Awaiting manager approval"
                          : "Open"}
                      </strong>
                      <span>
                        {s.status === "pending_approval"
                          ? Number.isSafeInteger(s.variance)
                            ? `Variance ${formatMoney(s.variance)}`
                            : "Variance unavailable"
                          : at(s.openedAt || s.createdAt)}
                      </span>
                      {onReviewSection && typeof s.id === "string" && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => onReviewSection("shifts", s.id)}
                        >
                          Review this shift
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {hidden(shifts.length, "shift records")}
              </>
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
