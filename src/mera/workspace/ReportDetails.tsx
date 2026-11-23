import { formatMoney } from "./api";
import { DataRegion, Disclosure, ReadState } from "../ui/OperationalPrimitives";
const record = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
export function validBusinessDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > "2999-12-31"
  )
    return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function businessDateLabel(value: unknown) {
  return validBusinessDate(value)
    ? new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(value + "T12:00:00Z"))
    : "Date unavailable";
}
function amount(value: unknown) {
  return integer(value)
    ? formatMoney(value)
    : value === null
      ? "Not available"
      : value === undefined
        ? "Not reported"
        : "Unavailable";
}
function quantity(value: unknown) {
  return integer(value) && value >= 0
    ? String(value)
    : value === null
      ? "Not available"
      : value === undefined
        ? "Not reported"
        : "Unavailable";
}
function productRows(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows = new Map<
    string,
    { name: string; quantity: number; value: number }
  >();
  for (const line of value) {
    if (
      !record(line) ||
      typeof line.productId !== "string" ||
      !line.productId ||
      typeof line.name !== "string" ||
      !line.name ||
      (line.size !== undefined &&
        line.size !== null &&
        typeof line.size !== "string") ||
      (line.variantId !== undefined &&
        line.variantId !== null &&
        typeof line.variantId !== "string") ||
      !integer(line.quantity) ||
      line.quantity < 0 ||
      !integer(line.total)
    )
      return null;
    const key = JSON.stringify([
      line.productId,
      line.variantId || null,
      line.name,
      line.size || null,
    ]);
    const previous = rows.get(key) || {
      name:
        line.name +
        (typeof line.size === "string" && line.size ? " · " + line.size : ""),
      quantity: 0,
      value: 0,
    };
    const next = {
      ...previous,
      quantity: previous.quantity + line.quantity,
      value: previous.value + line.total,
    };
    if (!integer(next.quantity) || !integer(next.value)) return null;
    rows.set(key, next);
  }
  return [...rows.values()];
}
const methodLabels: Record<string, string> = {
  cash: "Cash",
  external_pos: "External POS",
  external_transfer: "External transfer",
};
const stateLabels: Record<string, string> = {
  submitted: "Submitted",
  pending: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  collected: "Collected",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};
const actorLabels: Record<string, string> = {
  staff: "Staff name unavailable",
  guest: "Guest name unavailable",
  system: "System",
  unknown: "Recorded name unavailable",
};
const actionLabels: Record<string, string> = {
  submitted: "Order submitted",
  accepted: "Order accepted",
  preparing: "Preparation started",
  ready: "Marked ready",
  collected: "Collected",
  completed: "Completed",
  cancelled: "Order cancelled",
  rejected: "Order rejected",
  assigned: "Handler updated",
  payment_recorded: "Payment recorded",
  refund_recorded: "Refund recorded",
  refund_requested: "Refund requested",
  items_handed_over: "Items handed over",
  item_cancelled: "Item cancellation recorded",
  balance_written_off: "Balance adjustment recorded",
  legacy_imported: "Historical record imported",
};
function stateRows(value: unknown) {
  if (
    !record(value) ||
    value.basis !== "current_state_of_orders_created_on_trading_day" ||
    !record(value.counts) ||
    !integer(value.total) ||
    value.total < 0
  )
    return null;
  const entries = Object.entries(value.counts);
  if (
    entries.some(([, count]) => !integer(count) || count < 0) ||
    entries.reduce((sum, [, count]) => sum + count, 0) !== value.total
  )
    return null;
  return { total: value.total, entries };
}
function activityRows(value: unknown) {
  if (
    !record(value) ||
    value.basis !== "recorded_order_history_events_on_trading_day" ||
    !Array.isArray(value.entries) ||
    !integer(value.unattributedEvents) ||
    value.unattributedEvents < 0
  )
    return null;
  let total = 0;
  for (const entry of value.entries) {
    if (
      !record(entry) ||
      (entry.name !== null &&
        (typeof entry.name !== "string" || !entry.name.trim())) ||
      typeof entry.actorType !== "string" ||
      !integer(entry.eventCount) ||
      entry.eventCount < 0 ||
      !record(entry.actions) ||
      Object.values(entry.actions).some(
        (count) => !integer(count) || count < 0,
      ) ||
      Object.values(entry.actions).reduce(
        (sum: number, count: any) => sum + count,
        0,
      ) !== entry.eventCount
    )
      return null;
    total += entry.eventCount;
  }
  if (!integer(total) || value.unattributedEvents > total) return null;
  return value as {
    entries: {
      name: string | null;
      actorType: string;
      eventCount: number;
      actions: Record<string, number>;
    }[];
    unattributedEvents: number;
  };
}
const accountingFields = [
  ["Recognized sales returns", "salesReturns"],
  ["Net revenue excluding tax", "netRevenueExTax"],
  ["Sales revenue excluding tax", "salesRevenueExTax"],
  ["Net tax liability", "netTaxLiability"],
  ["Money returned today (including deposits)", "refunds"],
  ["Discounts on recognized orders", "discounts"],
  ["Service charges on recognized orders", "serviceCharges"],
  ["Tax on recognized orders", "recognizedTax"],
  ["Deposits received today (included in collections)", "deposits"],
  ["Deposit money returned today", "depositReturns"],
  ["Deposit forfeitures (non-product income)", "depositForfeitures"],
  ["Reservation deposit liability", "reservationLiability"],
  ["Non-product income excluding tax", "nonProductIncomeExTax"],
  ["Non-cash debt write-offs (separate expense)", "writeOffs"],
];
export default function ReportDetails({ report }: { report: unknown }) {
  if (!record(report))
    return (
      <ReadState kind="unavailable" title="Trading-day report unavailable">
        <p>
          Refresh the selected business date before relying on these totals.
        </p>
      </ReadState>
    );
  const products = productRows(report.products),
    methods = record(report.paymentMethods)
      ? Object.entries(report.paymentMethods)
      : null;
  const states = stateRows(report.orderStates),
    activity = activityRows(report.staffActivity);
  const history = Array.isArray(report.historicalRecognitionBases)
    ? report.historicalRecognitionBases
    : [];
  const basisLabels: Record<string, string> = {
    legacy_paid_basis: "legacy paid-date evidence",
    fulfilled_only: "recorded fulfillment evidence",
  };
  return (
    <section className="mw-card mw-report-details">
      <header className="mw-report-heading">
        <h2>
          Trading day detail
          {report.date ? " · " + businessDateLabel(report.date) : ""}
        </h2>
        <p>
          For ordinary orders, recognized sales follow the recorded collection
          or completion date. Collections count money received during this
          trading day, including deposits and payments for orders from other
          days.
        </p>
      </header>
      <div className="mw-report-metrics">
        {[
          ["Recognized sales", report.grossSales],
          ["Net sales", report.netSales],
          ["Collections", report.collections],
          ["Outstanding on orders placed this day", report.outstanding],
          ["Orders placed", report.orders],
        ].map(([label, value]) => (
          <article key={String(label)}>
            <h3>{String(label)}</h3>
            <p>{label === "Orders placed" ? quantity(value) : amount(value)}</p>
          </article>
        ))}
      </div>
      <p className="mw-report-definition">
        Outstanding is the current recorded unpaid balance on orders placed on
        this date. It is not a reconstructed balance at the end of that day. The
        order count is for orders placed that day, not the live queue.
      </p>
      {!!history.length && (
        <div className="mw-note">
          <strong>Includes imported source history</strong>
          <p>
            Imported sales follow{" "}
            {history
              .map((value) =>
                typeof value === "string"
                  ? basisLabels[value] ||
                    "an additional recorded basis requiring review"
                  : "an unreported recognition basis",
              )
              .join(", ")}
            , rather than assuming a new collection occurred on this date.
            {report.historicalTaxStatus
              ? " Source tax details are not available; totals that depend on tax cannot be shown."
              : ""}
          </p>
        </div>
      )}
      {report.taxBreakdownStatus === "unresolved" &&
        !report.historicalTaxStatus && (
          <div className="mw-note">
            <strong>Tax breakdown needs review</strong>
            <p>
              Some source tax amounts are not yet recorded. Revenue and
              liability totals that depend on them cannot be shown until
              reviewed.
            </p>
          </div>
        )}
      <div className="mw-report-breakdowns">
        <section>
          <h3>Products in recognized sales</h3>
          <p className="mw-report-definition">
            These are recorded item-line values. Recognized order totals include
            their recorded discounts, charges and tax, so product values may not
            add up to net sales.
          </p>
          {products === null ? (
            <ReadState
              kind="unavailable"
              title="Product quantities unavailable"
            >
              <p>
                The report did not provide a complete valid product breakdown.
              </p>
            </ReadState>
          ) : !products.length ? (
            <ReadState
              kind="empty"
              title="No products recognized as sold for this trading day."
            />
          ) : (
            <DataRegion
              label="Products recognized for the selected trading day"
              className="mw-report-data"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Recorded item value</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((row, index) => (
                    <tr key={index}>
                      <th scope="row">{row.name}</th>
                      <td>{row.quantity}</td>
                      <td>{amount(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataRegion>
          )}
        </section>
        <section>
          <h3>Collections by payment method</h3>
          {methods === null ? (
            <ReadState
              kind="unavailable"
              title="Payment-method breakdown unavailable"
            />
          ) : !methods.length ? (
            <ReadState
              kind="unavailable"
              title="No payment-method breakdown was reported."
            />
          ) : (
            <dl className="mw-report-methods">
              {methods.map(([method, value]) => (
                <div key={method}>
                  <dt>
                    {methodLabels[method] || "Unrecognized payment method"}
                  </dt>
                  <dd>{amount(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
      <div className="mw-report-breakdowns">
        <section>
          <h3>Orders placed this day: current status</h3>
          <p className="mw-report-definition">
            These are the current states of orders created on the selected day,
            not a reconstruction of their status at day-end.
          </p>
          {states === null ? (
            <ReadState
              kind="unavailable"
              title="Order-status breakdown unavailable"
            />
          ) : states.total === 0 ? (
            <ReadState
              kind="empty"
              title="No orders were placed on this trading day."
            />
          ) : (
            <dl className="mw-report-methods">
              {states.entries.map(([status, count]) => (
                <div key={status}>
                  <dt>{stateLabels[status] || "Status unavailable"}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
        <section>
          <h3>Recorded order activity</h3>
          <p className="mw-report-definition">
            Order-history events recorded during this trading day, including
            activity on older orders. This is not a complete register of staff
            payments, refunds or shifts.
          </p>
          {activity === null ? (
            <ReadState kind="unavailable" title="Order activity unavailable" />
          ) : !activity.entries.length ? (
            <ReadState
              kind="empty"
              title="No order-history events were recorded for this trading day."
            />
          ) : (
            <>
              <DataRegion
                label="Recorded order history by actor"
                className="mw-report-data"
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Recorded name</th>
                      <th scope="col">Events</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.entries.map((entry, index) => (
                      <tr key={index}>
                        <th scope="row">
                          {entry.name ||
                            actorLabels[entry.actorType] ||
                            "Recorded name unavailable"}
                        </th>
                        <td>{entry.eventCount}</td>
                        <td>
                          {Object.entries(entry.actions).map(
                            ([action, count]) => (
                              <p key={action}>
                                {actionLabels[action] ||
                                  "Other recorded order event"}
                                : {count}
                              </p>
                            ),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataRegion>
              <p className="mw-report-definition">
                Events without a recorded name: {activity.unattributedEvents}.
                Names are recorded snapshots, not verified customer identities.
              </p>
            </>
          )}
        </section>
      </div>
      <Disclosure summary="Accounting details" className="mw-report-accounting">
        <p>
          These figures are separate measures. Deposits received are included in
          collections; do not add them to collections again. Tax-dependent
          amounts may be unavailable.
        </p>
        <p>
          <strong>
            Mera platform fees:{" "}
            {record(report.platformFees) &&
            report.platformFees.status === "unavailable"
              ? "Unavailable"
              : report.platformFees === undefined
                ? "Not reported"
                : "Unavailable"}
            .
          </strong>{" "}
          They are not inferred from customer collections or payment fees.
        </p>
        <dl>
          {accountingFields.map(([label, key]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{amount(report[key])}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>
    </section>
  );
}
