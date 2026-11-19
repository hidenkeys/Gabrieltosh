import { useRef } from "react";
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
}: {
  data: any;
  orders: any[];
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
}) {
  const dateReports = useRef<HTMLDetailsElement>(null);
  const report = data.report || {},
    flow = ["submitted", "accepted", "preparing", "ready"],
    active = orders.filter((o) => flow.includes(o.status));
  return (
    <div className="mw-overview">
      <div className="mw-overview-toolbar">
        <p>
          {report.date || "Date unavailable"} · Branch trading day
          {data.branch?.timezone ? ` · ${data.branch.timezone}` : ""}
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
            <button className="secondary" onClick={() => onNavigate("orders")}>
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
            "Unsettled order balances",
          ],
          [
            "Orders",
            report.orders ?? "Unavailable",
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
      />
      <div className="mw-overview-columns">
        <section className="mw-card">
          <div className="mw-overview-section-heading">
            <h2>Service in progress</h2>
            <span>{active.length} active</span>
          </div>
          <div className="mw-flow">
            {flow.map((status) => (
              <div key={status}>
                <strong>
                  {orders.filter((o) => o.status === status).length}
                </strong>
                <span>
                  {status === "submitted"
                    ? "New"
                    : status[0].toUpperCase() + status.slice(1)}
                </span>
              </div>
            ))}
          </div>
          {canViewOrders && (
            <>
              {active.length ? (
                <div className="mw-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Handler</th>
                        <th>Placed</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.slice(0, 5).map((o) => (
                        <tr key={o.id}>
                          <td>{o.reference}</td>
                          <td>{o.displayName}</td>
                          <td>{o.status.replaceAll("_", " ")}</td>
                          <td>
                            {o.handlerName ||
                              (o.handlerId ? "Assigned staff" : "Unassigned")}
                          </td>
                          <td>
                            {Number.isFinite(Date.parse(o.createdAt))
                              ? new Date(o.createdAt).toLocaleTimeString(
                                  "en-GB",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    ...(data.branch?.timezone
                                      ? { timeZone: data.branch.timezone }
                                      : {}),
                                  },
                                )
                              : "Unavailable"}
                          </td>
                          <td>{money(o.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mw-empty">
                  No orders waiting. New orders will appear here.
                </p>
              )}
            </>
          )}
        </section>
        <section className="mw-card">
          <h2>Payment breakdown</h2>
          {Object.entries(report.paymentMethods || {}).map(
            ([method, amount]) => (
              <div className="mw-row" key={method}>
                <span>
                  {(
                    {
                      cash: "Cash",
                      external_pos: "Card / POS",
                      external_transfer: "External transfer",
                    } as any
                  )[method] || method.replaceAll("_", " ")}
                </span>
                <b>{money(amount)}</b>
              </div>
            ),
          )}
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
