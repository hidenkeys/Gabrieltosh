import React from "react";
type Activity = {
  id?: string;
  action?: string;
  actorName?: string;
  createdAt?: string;
};
type Shift = {
  id?: string;
  status?: string;
  handlerId?: string;
  openedBy?: string;
  createdAt?: string;
};
type Props = {
  timezone?: string;
  audit?: Activity[] | null;
  shifts?: Shift[] | null;
  staff?: { id: string; name: string }[];
  canViewAudit: boolean;
  canViewShifts: boolean;
  allowedDestinations: string[];
  onNavigate: (destination: string) => void;
};
const labels: Record<string, [string, string]> = {
  order_submitted: ["Order placed", "orders"],
  order_status: ["Order status updated", "orders"],
  order_item_cancelled: ["Order item cancelled", "orders"],
  stock_hold_expired: ["Order stock hold expired", "orders"],
  reservation_requested: ["Reservation requested", "reservations"],
  reservation_status: ["Reservation status updated", "reservations"],
  reservation_seated: ["Reservation seated", "tables"],
  table_status_changed: ["Table status updated", "tables"],
  bill_split: ["Bill split", "tables"],
  bills_merged: ["Bills merged", "tables"],
  menu_published: ["Menu published", "menu"],
  product_created: ["Menu item added", "menu"],
  product_updated: ["Menu item updated", "menu"],
  branch_settings_updated: ["Branch settings updated", "onboarding"],
  print_template_updated: ["Receipt layout updated", "printing"],
  payment_recorded: ["Payment recorded", "payments"],
  bill_payment_recorded: ["Bill payment recorded", "payments"],
  refund_recorded: ["Refund recorded", "payments"],
  refund_requested: ["Refund requested", "orders"],
  refund_request_recorded: ["Refund request completed", "orders"],
  refund_request_rejected: ["Refund request declined", "orders"],
  deposit_recorded: ["Reservation deposit recorded", "reservations"],
  visit_opened: ["Table visit opened", "tables"],
  visit_closed: ["Table visit closed", "tables"],
  table_updated: ["Table updated", "tables"],
  shift_closed: ["Shift closed", "shifts"],
  shift_handed_over: ["Shift handed over", "shifts"],
  shift_variance_approved: ["Shift variance reviewed", "shifts"],
  paid_documents_queued: ["Receipt and stickers queued", "printing"],
  reprint_requested: ["Duplicate print requested", "printing"],
  stock_adjusted: ["Stock adjusted", "menu"],
};
const destinationLabels: Record<string, string> = {
  orders: "View orders",
  reservations: "View reservations",
  tables: "View tables",
  payments: "View transactions",
  menu: "Open menu",
  onboarding: "Open settings",
  printing: "View print jobs",
  shifts: "View shifts",
};
const name = (value: unknown) =>
  typeof value === "string" &&
  value.trim() &&
  !/^[a-f\d]{8}-[a-f\d-]{27}$/i.test(value.trim())
    ? value.trim()
    : null;
function Time({ value, timezone }: { value?: string; timezone: string }) {
  const valid = value && Number.isFinite(Date.parse(value));
  return valid ? (
    <time dateTime={value}>
      {new Intl.DateTimeFormat("en-NG", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
      }).format(new Date(value))}
    </time>
  ) : (
    <span>Time unavailable</span>
  );
}
export default function OverviewActivity({
  audit,
  shifts,
  timezone,
  staff = [],
  canViewAudit,
  canViewShifts,
  allowedDestinations,
  onNavigate,
}: Props) {
  if (!canViewAudit && !canViewShifts) return null;
  let timeZone = "UTC";
  let fallback = true;
  if (typeof timezone === "string" && timezone.trim()) {
    try {
      new Intl.DateTimeFormat("en-NG", { timeZone: timezone });
      timeZone = timezone;
      fallback = false;
    } catch {
      /* Explicit UTC fallback avoids device-local ambiguity. */
    }
  }
  const open =
    Array.isArray(shifts) &&
    shifts.every((shift) => shift && typeof shift === "object")
      ? shifts.filter(
          (shift) =>
            shift &&
            typeof shift === "object" &&
            ["open", "pending_approval"].includes(shift.status || ""),
        )
      : undefined;
  const recent =
    Array.isArray(audit) &&
    audit.every((event) => event && typeof event === "object")
      ? audit
          .filter((event) => event && typeof event === "object")
          .slice()
          .sort(
            (a, b) =>
              (Date.parse(b.createdAt || "") || 0) -
              (Date.parse(a.createdAt || "") || 0),
          )
          .slice(0, 6)
      : undefined;
  const knownStaff = Array.isArray(staff)
    ? staff.filter((person) => person && typeof person === "object")
    : [];
  const link = (destination: string, label: string) =>
    Array.isArray(allowedDestinations) &&
    allowedDestinations.includes(destination) ? (
      <button
        type="button"
        className="text-button"
        onClick={() => onNavigate(destination)}
      >
        {label}
      </button>
    ) : null;
  return (
    <section className="mw-card mw-overview-activity">
      <header className="mw-overview-section-heading">
        <h2>People & recent activity</h2>
      </header>
      <p className="mw-activity-timezone">
        Times shown in {timeZone}
        {fallback ? " (branch timezone unavailable)" : ""}.
      </p>
      {canViewShifts && (
        <section aria-label="Current shift responsibility">
          <div className="mw-overview-section-heading">
            <h3>Current shifts</h3>
            {link("shifts", "View shifts")}
          </div>
          {open === undefined ? (
            <p>Shift status unavailable.</p>
          ) : !open.length ? (
            <p>No open shifts.</p>
          ) : (
            open.map((shift, index) => {
              const responsible = name(
                knownStaff.find(
                  (person) => person.id === (shift.handlerId || shift.openedBy),
                )?.name,
              );
              return (
                <div className="mw-row" key={shift.id || index}>
                  <div>
                    <strong>
                      {shift.status === "pending_approval"
                        ? "Awaiting manager review"
                        : "Open shift"}
                    </strong>
                    <p>
                      {responsible
                        ? `Responsible: ${responsible}`
                        : "Staff responsibility not available"}
                    </p>
                  </div>
                  <Time value={shift.createdAt} timezone={timeZone} />
                </div>
              );
            })
          )}
        </section>
      )}
      {canViewAudit && (
        <section aria-label="Recent branch activity">
          <h3>Recent activity</h3>
          {recent === undefined ? (
            <p>Activity unavailable.</p>
          ) : !recent.length ? (
            <p>No recent branch activity.</p>
          ) : (
            <ul>
              {recent.map((event, index) => {
                const [label, destination] = labels[event.action || ""] || [
                  "Branch activity recorded",
                  "",
                ];
                const actor = name(event.actorName);
                return (
                  <li className="mw-row" key={event.id || index}>
                    <div>
                      <strong>{label}</strong>
                      <p>
                        {actor || "Staff name unavailable"} ·{" "}
                        <Time value={event.createdAt} timezone={timeZone} />
                      </p>
                    </div>
                    {destination &&
                      link(destination, destinationLabels[destination])}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
