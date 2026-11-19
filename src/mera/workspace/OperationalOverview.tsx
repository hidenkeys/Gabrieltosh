import { useRef } from "react";
import {
  serviceState,
  overviewTime,
  overviewText,
} from "./overviewPresentation";
import { orderStatusLabel } from "./LiveOrderCard";
import { DataRegion } from "../ui/OperationalPrimitives";
import OverviewAttention from "./OverviewAttention";
import OverviewActivity from "./OverviewActivity";
import { formatMoney } from "./api";
import ReportDetails from "./ReportDetails";
import ReportExplorer from "./ReportExplorer";
const money = (value: any) =>
  Number.isSafeInteger(value)
    ? formatMoney(value)
    : value === null
      ? "Unresolved"
      : "Unavailable";
export default function OperationalOverview({
  data,
  orders,
  base,
  disabled,
  canCreate,
  canViewOrders,
  onNavigate,
  canNavigate = () => false,
  canViewAudit = false,
  canViewShifts = false,
  staff = [],
  onExportDate,
  onReviewOrders,
  onReviewSection,
  stale = false,
}: {
  data: any;
  orders?: any[];
  base: string;
  disabled: boolean;
  canCreate: boolean;
  canViewOrders: boolean;
  onNavigate: (id: string) => void;
  canNavigate?: (id: string) => boolean;
  canViewAudit?: boolean;
  canViewShifts?: boolean;
  staff?: { id: string; name: string }[];
  onExportDate?: (date: string) => void;
  onReviewOrders?: (
    reference?: string,
    queue?: "all" | "active" | "delayed",
  ) => void;
  onReviewSection?: (section: string, recordId?: string) => void;
  stale?: boolean;
}) {
  const dateReports = useRef<HTMLDetailsElement>(null);
  const report =
      data.report &&
      typeof data.report === "object" &&
      !Array.isArray(data.report)
        ? data.report
        : {},
    flow = ["submitted", "accepted", "preparing", "ready"],
    available = canViewOrders && Array.isArray(orders),
    loaded = Array.isArray(orders) ? orders : [],
    active = available
      ? loaded.filter(
          (order) => serviceState(order, data.serverTime) === "active",
        )
      : [],
    expired = available
      ? loaded.filter(
          (order) => serviceState(order, data.serverTime) === "expired",
        )
      : [],
    uncertain =
      available &&
      loaded.some(
        (order) => serviceState(order, data.serverTime) === "unavailable",
      );
  return (
    <div className="mw-overview">
      {stale && (
        <p role="status" className="mw-note">
          Showing previously loaded records. Refresh the workspace to confirm
          current service and totals.
        </p>
      )}
      <div className="mw-overview-toolbar">
        <p>
          {typeof report.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(report.date)
            ? report.date
            : "Date unavailable"}{" "}
          · Branch trading day
          {typeof data.branch?.timezone === "string"
            ? ` · ${data.branch.timezone}`
            : ""}
        </p>
        <div className="mw-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (dateReports.current) {
                dateReports.current.open = true;
                dateReports.current.querySelector("summary")?.focus();
                dateReports.current.scrollIntoView({ block: "start" });
              }
            }}
          >
            Reports by date
          </button>
          {canViewOrders && (
            <button
              className="secondary"
              onClick={() =>
                onReviewOrders
                  ? onReviewOrders(undefined, "all")
                  : onNavigate("orders")
              }
            >
              View orders
            </button>
          )}
          {canCreate && (
            <button
              className="primary"
              disabled={disabled}
              onClick={() => onNavigate("counter")}
            >
              New order
            </button>
          )}
        </div>
      </div>
      <div className="metric-grid mw-overview-metrics">
        {[
          [
            "Net sales",
            money(report.netSales),
            "Completed service, less returns",
          ],
          [
            "Collections",
            money(report.collections),
            "Money received, including deposits",
          ],
          [
            "Outstanding",
            money(report.outstanding),
            "Unsettled balances on this day’s orders",
          ],
          [
            "Orders",
            Number.isSafeInteger(report.orders) && report.orders >= 0
              ? report.orders
              : "Unavailable",
            "Orders placed this trading day",
          ],
        ].map(([label, value, note]) => (
          <section className="mw-card mw-stat" key={label}>
            <div>{label}</div>
            <strong>{value}</strong>
            <small>{note}</small>
            {label === "Outstanding" &&
              (canNavigate("payments") || canViewOrders) && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    onNavigate(canNavigate("payments") ? "payments" : "orders")
                  }
                >
                  {canNavigate("payments")
                    ? "View transactions"
                    : "Review orders"}
                </button>
              )}
          </section>
        ))}
      </div>
      <OverviewAttention
        data={data}
        canNavigate={canNavigate}
        onNavigate={onNavigate}
        onReviewSection={onReviewSection}
        onReviewOrders={
          onReviewOrders
            ? (reference) => onReviewOrders(reference, "delayed")
            : undefined
        }
      />
      <div className="mw-overview-columns">
        <section className="mw-card">
          <div className="mw-overview-section-heading">
            <h2>Service in progress</h2>
            <span>
              {available
                ? uncertain
                  ? "Service count needs checking"
                  : `${active.length} active`
                : "Order activity unavailable"}
            </span>
          </div>
          {available && (
            <div className="mw-flow">
              {flow.map((status) => (
                <div key={status}>
                  <strong>
                    {uncertain
                      ? "Unavailable"
                      : active.filter((o) => o.status === status).length}
                  </strong>
                  <span>
                    {status === "submitted"
                      ? "New"
                      : status[0].toUpperCase() + status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {available && expired.length > 0 && (
            <p>
              {expired.length} expired{" "}
              {expired.length === 1 ? "order is" : "orders are"} excluded from
              current service. Review them in Orders if follow-up is needed.
            </p>
          )}
          {uncertain && (
            <p role="status">
              Some order hold details are unavailable. Current service counts
              cannot be confirmed.
            </p>
          )}
          {!available && (
            <p>
              {canViewOrders
                ? "Order records are unavailable. Refresh the workspace before reviewing service."
                : "Your account does not have access to order activity."}
            </p>
          )}
          {available && (
            <>
              {active.length ? (
                <div>
                  <p className="mw-overview-scroll-hint">
                    Swipe or scroll the service table to see each order’s
                    details and review action.
                  </p>
                  <DataRegion
                    label="Current service orders"
                    className="mw-table-wrap"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Customer</th>
                          <th>Status</th>
                          <th>Handler</th>
                          <th>Placed</th>
                          <th>Total</th>
                          {onReviewOrders && <th>Review</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {active.slice(0, 5).map((o) => (
                          <tr key={o.id}>
                            <td>
                              {overviewText(
                                o.reference,
                                "Reference unavailable",
                              )}
                            </td>
                            <td>
                              {overviewText(
                                o.displayName,
                                "Customer name not recorded",
                              )}
                            </td>
                            <td>{orderStatusLabel(o.status)}</td>
                            <td>
                              {overviewText(
                                o.handlerName,
                                o.handlerId ? "Assigned staff" : "Unassigned",
                              )}
                            </td>
                            <td>
                              {overviewTime(o.createdAt, data.branch?.timezone)}
                            </td>
                            <td>{money(o.total)}</td>
                            {onReviewOrders && (
                              <td>
                                {typeof o.reference === "string" &&
                                o.reference.trim() ? (
                                  <button
                                    className="secondary"
                                    type="button"
                                    onClick={() =>
                                      onReviewOrders(o.reference, "active")
                                    }
                                  >
                                    Open {o.reference}
                                  </button>
                                ) : (
                                  "Reference unavailable"
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataRegion>
                </div>
              ) : (
                <p className="mw-empty">
                  {uncertain
                    ? "Current service needs checking."
                    : "No orders waiting. New orders will appear here."}
                </p>
              )}
              {active.length > 5 && (
                <p>{active.length - 5} more active orders.</p>
              )}
              {onReviewOrders && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => onReviewOrders(undefined, "active")}
                >
                  View active orders
                </button>
              )}
            </>
          )}
        </section>
        <section className="mw-card">
          <h2>Payment breakdown</h2>
          {(!report.paymentMethods ||
            typeof report.paymentMethods !== "object" ||
            Array.isArray(report.paymentMethods)) && (
            <p>Payment-method breakdown is unavailable.</p>
          )}
          {Object.entries(
            report.paymentMethods &&
              typeof report.paymentMethods === "object" &&
              !Array.isArray(report.paymentMethods)
              ? report.paymentMethods
              : {},
          ).map(([method, amount]) => (
            <div className="mw-row" key={method}>
              <span>
                {(
                  {
                    cash: "Cash",
                    external_pos: "Card / POS",
                    external_transfer: "External transfer",
                  } as any
                )[method] || "Other recorded method"}
              </span>
              <b>{money(amount)}</b>
            </div>
          ))}
          <div className="mw-row">
            <strong>Total collections</strong>
            <strong>{money(report.collections)}</strong>
          </div>
          <p>
            Collections may include deposits and payments for earlier orders.
          </p>
        </section>
      </div>
      <OverviewActivity
        audit={data.audit}
        shifts={data.shifts}
        staff={staff}
        canViewAudit={canViewAudit}
        canViewShifts={canViewShifts}
        allowedDestinations={[
          "onboarding",
          "menu",
          "orders",
          "payments",
          "reservations",
          "tables",
          "shifts",
          "printing",
        ].filter(canNavigate)}
        onNavigate={onNavigate}
        timezone={data.branch?.timezone}
      />
      <details className="mw-card">
        <summary>Sales, tax and product breakdown</summary>
        <ReportDetails report={report} />
      </details>
      <details className="mw-card" ref={dateReports}>
        <summary>Reports for another trading day</summary>
        <ReportExplorer
          base={base}
          disabled={disabled}
          initialDate={report.date}
          onExportDate={onExportDate}
        />
      </details>
      <details className="mw-card">
        <summary>Order value and connection details</summary>
        <div className="mw-row">
          <span>Order value</span>
          <strong>{money(report.grossOrderValue ?? report.grossSales)}</strong>
        </div>
        <div className="mw-row">
          <span>Recognized sales before returns</span>
          <strong>{money(report.grossSales)}</strong>
        </div>
        {Object.entries(data.providers || {}).map(([name, state]: any) => (
          <div className="mw-row" key={name}>
            <span>{name}</span>
            <span>
              {typeof state === "string"
                ? state
                : state.state || state.status || "Not configured"}
            </span>
          </div>
        ))}
      </details>
    </div>
  );
}
