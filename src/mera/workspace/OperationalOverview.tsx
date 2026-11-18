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
}: {
  data: any;
  orders: any[];
  base: string;
  disabled: boolean;
  canCreate: boolean;
  canViewOrders: boolean;
  onNavigate: (id: string) => void;
}) {
  const report = data.report || {},
    flow = ["submitted", "accepted", "preparing", "ready"],
    active = orders.filter((o) => flow.includes(o.status));
  return (
    <div className="mw-overview">
      <div className="mw-overview-toolbar">
        <p>{report.date || "Today"} · Branch trading day</p>
        <div className="mw-actions">
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
            report.orders ?? orders.length,
            "Orders placed this trading day",
          ],
        ].map(([label, value, note]) => (
          <section className="mw-card mw-stat" key={label}>
            <div>{label}</div>
            <strong>{value}</strong>
            <small>{note}</small>
          </section>
        ))}
      </div>
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
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.slice(0, 5).map((o) => (
                        <tr key={o.id}>
                          <td>{o.reference}</td>
                          <td>{o.displayName}</td>
                          <td>{o.status.replaceAll("_", " ")}</td>
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
      <details className="mw-card">
        <summary>Sales, tax and product breakdown</summary>
        <ReportDetails report={report} />
      </details>
      <details className="mw-card">
        <summary>Reports for another trading day</summary>
        <ReportExplorer base={base} disabled={disabled} />
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
