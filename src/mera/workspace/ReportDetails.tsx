import { formatMoney } from "./api";
export default function ReportDetails({ report }: { report: any }) {
  const products = new Map<
    string,
    { name: string; quantity: number; value: number }
  >();
  for (const line of report?.products || []) {
    const key = line.productId + ":" + (line.variantId || line.name);
    const previous = products.get(key) || {
      name: line.name + (line.size ? " · " + line.size : ""),
      quantity: 0,
      value: 0,
    };
    products.set(key, {
      name: previous.name,
      quantity: previous.quantity + line.quantity,
      value: previous.value + line.total,
    });
  }
  return (
    <section className="mw-card">
      <h2>Trading day detail{report?.date ? " · " + report.date : ""}</h2>
      <p>
        Sales are recognized when an order is collected or completed, using the
        recorded fulfillment time. Collections are money received that day and
        may include payments for other days. Deposits are shown separately.
        Recognized totals include configured charges and tax; their breakdown is
        shown below.
      </p>
      <div className="mw-grid">
        <article>
          <h3>Sales & returns</h3>
          {[
            ["Recognized sales", report?.grossSales],
            ["Recognized sales returns", report?.salesReturns],
            ["Net sales", report?.netSales],
            ["Refunds paid today", report?.refunds],
            ["Discounts on recognized orders", report?.discounts],
            ["Service charges on recognized orders", report?.serviceCharges],
            ["Tax on recognized orders", report?.recognizedTax],
            ["Deposits received today", report?.deposits],
          ].map(([label, amount]) => (
            <div className="mw-row" key={String(label)}>
              <span>{label}</span>
              <b>
                {Number.isSafeInteger(amount)
                  ? formatMoney(Number(amount))
                  : "Not reported"}
              </b>
            </div>
          ))}
        </article>
        <article>
          <h3>Collections by payment method</h3>
          {Object.entries(report?.paymentMethods || {}).map(
            ([method, amount]) => (
              <div className="mw-row" key={method}>
                <span>{method.replaceAll("_", " ")}</span>
                <b>{formatMoney(Number(amount))}</b>
              </div>
            ),
          )}
        </article>
      </div>
      <h3>Products in recognized sales</h3>
      {!products.size ? (
        <p>No products recognized as sold for this trading day.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Sales value</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(products.entries()).map(([id, row]) => (
                <tr key={id}>
                  <td>{row.name}</td>
                  <td>{row.quantity}</td>
                  <td>{formatMoney(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
