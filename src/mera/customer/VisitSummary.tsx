type Amount = number | null | undefined;
type Charge = {
  id: string;
  name: string;
  quantity: number | null;
  amount: number;
};
type Bill = {
  id: string;
  name?: string;
  total: number;
  paid: number;
  balance: number;
  charges?: Charge[];
};
type Line = {
  quantity: number;
  name: string;
  size?: string;
  modifiers?: { name: string }[];
  total?: number;
  lineTotal?: number;
};
type Round = {
  id: string;
  reference?: string;
  displayName?: string;
  status: string;
  total: number;
  paid: number;
  effectivePaid?: number;
  writtenOff?: number;
  balance?: number;
  items?: Line[];
};
export type CustomerVisitSummary = {
  visit: { id: string; tableName?: string; status: string };
  balance: number;
  bills?: Bill[];
  orders?: Round[];
  minimumSpend?: {
    policy?: { enabled: boolean; amount: number; disclosure?: string } | null;
    summary?: { netPaid: number; waived: number; shortfall: number } | null;
  };
};
type Props = {
  data: CustomerVisitSummary;
  refreshing: boolean;
  refreshError?: string;
  disabled?: boolean;
  onRefresh: () => void;
  onOrderMore?: () => void;
};
const valid = (value: Amount): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
const money = (value: Amount) =>
  valid(value)
    ? new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
      }).format(value / 100)
    : "Unavailable";
function statusLabel(status: string) {
  const labels: Record<string, string> = {
    submitted: "Sent to the venue",
    pending: "Awaiting confirmation",
    accepted: "Accepted",
    preparing: "Being prepared",
    ready: "Ready",
    collected: "Collected",
    completed: "Completed",
    cancelled: "Cancelled",
    rejected: "Not accepted",
  };
  return labels[status] || "Status unavailable";
}
function Balance({
  amount,
  label = "Outstanding",
}: {
  amount: Amount;
  label?: string;
}) {
  if (!valid(amount))
    return <p>Balance unavailable. Please ask staff to confirm it.</p>;
  return (
    <p className="mc-visit-balance">
      <span>{amount < 0 ? "Unused deposit credit" : label}</span>
      <strong>{money(Math.abs(amount))}</strong>
    </p>
  );
}
export default function VisitSummary({
  data,
  refreshing,
  refreshError,
  disabled = false,
  onRefresh,
  onOrderMore,
}: Props) {
  const minimum = data.minimumSpend?.policy;
  const summary = data.minimumSpend?.summary;
  const hasSummary =
    !!summary &&
    [summary.netPaid, summary.waived, summary.shortfall].every(
      (value) => valid(value) && value >= 0,
    );
  return (
    <div className="mc-visit-summary">
      <header className="mc-visit-summary-heading">
        <div>
          <p className="mc-visit-eyebrow">Your joined table</p>
          <h3>{data.visit.tableName || "Your table"}</h3>
          <p>
            {data.visit.status === "open"
              ? "Table open"
              : "Please check this visit with staff"}
          </p>
        </div>
        <button
          type="button"
          className="mc-secondary"
          disabled={disabled || refreshing}
          onClick={onRefresh}
        >
          {refreshing ? "Checking your bill…" : "Refresh bill"}
        </button>
      </header>
      {refreshing && <p role="status">Checking the latest recorded bill…</p>}
      {refreshError && (
        <p className="mc-alert" role="alert">
          Updates interrupted. The last confirmed bill is shown. {refreshError}
        </p>
      )}
      <div className="mc-visit-balance-card">
        <Balance amount={data.balance} label="Outstanding on orders" />
        <p>
          This is the venue’s recorded balance for orders at this table. Bill
          allocations and any unused deposit credit are shown separately below.
        </p>
        <p>
          Please ask staff to confirm a payment or split your bill. Online
          payment is not available.
        </p>
        {onOrderMore && (
          <button
            type="button"
            className="mc-primary"
            disabled={disabled}
            onClick={onOrderMore}
          >
            Add another round
          </button>
        )}
      </div>
      {!!data.bills?.length && (
        <section aria-label="Your table bills">
          <h3>Your bills</h3>
          <p>
            Staff arrange how charges are split. These are the latest recorded
            allocations.
          </p>
          <div className="mc-visit-bill-grid">
            {data.bills.map((bill) => (
              <article className="mc-visit-detail-card" key={bill.id}>
                <h4>{bill.name || "Table bill"}</h4>
                <dl>
                  <div>
                    <dt>Bill total</dt>
                    <dd>{money(bill.total)}</dd>
                  </div>
                  <div>
                    <dt>Recorded payments</dt>
                    <dd>{money(bill.paid)}</dd>
                  </div>
                </dl>
                <Balance amount={bill.balance} />
                {bill.balance < 0 && (
                  <p>
                    Unused deposit credit is not available for withdrawal. Ask
                    staff about your deposit and any refund request.
                  </p>
                )}
                <details>
                  <summary>
                    View charges for {bill.name || "table bill"}
                  </summary>
                  {bill.charges?.length ? (
                    <ul>
                      {bill.charges.map((charge) => (
                        <li key={charge.id}>
                          <span>
                            {charge.quantity !== null && charge.quantity > 0
                              ? `${charge.quantity} × `
                              : ""}
                            {charge.name}
                          </span>
                          <strong>{money(charge.amount)}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No charges listed on this bill.</p>
                  )}
                </details>
              </article>
            ))}
          </div>
        </section>
      )}
      <section aria-label="Orders at your table">
        <h3>Your table’s orders</h3>
        {!data.orders?.length ? (
          <p>
            No orders have been linked to this table yet. You can add a round or
            ask staff for help.
          </p>
        ) : (
          <div className="mc-visit-rounds">
            {data.orders.map((order) => (
              <article className="mc-visit-detail-card" key={order.id}>
                <header>
                  <h4>{order.reference || "Table order"}</h4>
                  <p>{statusLabel(order.status)}</p>
                </header>
                {order.displayName && <p>Placed by {order.displayName}</p>}
                <dl>
                  <div>
                    <dt>Order total</dt>
                    <dd>{money(order.total)}</dd>
                  </div>
                  <div>
                    <dt>Recorded payments</dt>
                    <dd>{money(order.paid)}</dd>
                  </div>
                  {valid(order.effectivePaid) &&
                    order.effectivePaid !== order.paid && (
                      <div>
                        <dt>Payments applied to this order</dt>
                        <dd>{money(order.effectivePaid)}</dd>
                      </div>
                    )}
                  {valid(order.writtenOff) && order.writtenOff > 0 && (
                    <div>
                      <dt>Staff-approved adjustment</dt>
                      <dd>{money(order.writtenOff)}</dd>
                    </div>
                  )}
                </dl>
                {!["cancelled", "rejected"].includes(order.status) && (
                  <Balance amount={order.balance} />
                )}
                <details>
                  <summary>
                    View items for {order.reference || "this order"}
                  </summary>
                  {order.items?.length ? (
                    <ul>
                      {order.items.map((line, index) => (
                        <li key={index}>
                          <span>
                            {line.quantity} × {line.name}
                            {line.size && <small>{line.size}</small>}
                            {!!line.modifiers?.length && (
                              <small>
                                {line.modifiers
                                  .map((item) => item.name)
                                  .join(", ")}
                              </small>
                            )}
                          </span>
                          <strong>{money(line.total ?? line.lineTotal)}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No item details available. Please ask staff to check this
                      order.
                    </p>
                  )}
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
      {minimum?.enabled && (
        <section className="mc-visit-minimum" aria-label="Agreed table minimum">
          <h3>Your agreed minimum spend</h3>
          <p>
            Minimum for this visit: <strong>{money(minimum.amount)}</strong>
          </p>
          {minimum.disclosure && <p>{minimum.disclosure}</p>}
          {hasSummary && summary ? (
            <>
              <dl>
                <div>
                  <dt>Payments counted toward the minimum</dt>
                  <dd>{money(summary.netPaid)}</dd>
                </div>
                <div>
                  <dt>Reduction agreed by staff</dt>
                  <dd>{money(summary.waived)}</dd>
                </div>
                <div>
                  <dt>Still to meet</dt>
                  <dd>{money(summary.shortfall)}</dd>
                </div>
              </dl>
              {summary.shortfall > 0 ? (
                <p>
                  Please speak to staff before ending your visit. You can place
                  more orders or ask staff to review the remaining amount.
                </p>
              ) : (
                <p>
                  No further qualifying spend is currently required for this
                  minimum.
                </p>
              )}
            </>
          ) : (
            <p>
              The venue could not provide the minimum-spend progress. Please ask
              staff to confirm it.
            </p>
          )}
          <p>
            This does not add an automatic charge to your bill. The original
            agreed terms apply.
          </p>
        </section>
      )}
      <p className="mc-visit-privacy-note">
        This bill is shared with guests who joined this visit. A table QR alone
        does not open it. Joining your table does not make a payment.
      </p>
    </div>
  );
}
