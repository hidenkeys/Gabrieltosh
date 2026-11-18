import { useState } from "react";
import { uuid } from "../../api";
import { formatMoney } from "./api";
type Props = {
  bills: any[];
  base: string;
  disabled: boolean;
  canPay: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export default function Bills({ bills, base, disabled, canPay, save }: Props) {
  const [form, setForm] = useState<any>({});
  const [items, setItems] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const current = bills.find((b) => b.id === form.billId);
  const update = (key: string, value: any) =>
    setForm({ ...form, [key]: value });
  const perform = (path: string, body: any, message: string) => {
    setError("");
    void save(base + path, "POST", body, message)
      .then(() => {
        setItems({});
        setForm({ billId: form.billId });
      })
      .catch((e) => setError(e.message));
  };
  return (
    <section className="mw-card">
      <h2>Shared bills & allocations</h2>
      <p>
        Split outstanding amounts or whole item units. Recorded payments stay
        attached; merging is limited to the same open visit.
      </p>
      {bills.length ? (
        bills.map((bill) => (
          <div className="mw-row" key={bill.id}>
            <div>
              <b>{bill.name || bill.id.slice(0, 8)}</b>
              <small>
                {bill.status} · {bill.charges?.length || 0} lines · Visit{" "}
                {bill.visitId?.slice(0, 8)}
              </small>
            </div>
            <span>
              Total {formatMoney(bill.total)}
              <small>
                Paid {formatMoney(bill.paid)} ·{" "}
                {bill.balance < 0
                  ? "Credit held " + formatMoney(-bill.balance)
                  : "Due " + formatMoney(bill.balance)}
              </small>
            </span>
          </div>
        ))
      ) : (
        <div className="mw-empty">Bills appear when visits receive orders.</div>
      )}
      <label className="mw-form">
        Bill to manage
        <select
          value={form.billId || ""}
          onChange={(e) => {
            setForm({ billId: e.target.value });
            setItems({});
          }}
        >
          <option value="">Select an open bill</option>
          {bills
            .filter((b) => b.status === "open")
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || b.id.slice(0, 8)} ·{" "}
                {b.balance < 0
                  ? "Credit " + formatMoney(-b.balance)
                  : formatMoney(b.balance)}
              </option>
            ))}
        </select>
      </label>
      {current && canPay && (
        <>
          <form
            className="mw-form"
            style={{ marginTop: 20 }}
            onSubmit={(e) => {
              e.preventDefault();
              const body =
                form.splitMode === "items"
                  ? {
                      items: Object.entries(items)
                        .filter(([, quantity]) => quantity > 0)
                        .map(([chargeId, quantity]) => ({
                          chargeId,
                          quantity,
                        })),
                      name: form.name,
                    }
                  : {
                      amount: Math.round(Number(form.amount) * 100),
                      name: form.name,
                    };
              perform(
                `/bills/${current.id}/split`,
                body,
                "Bill split. Original payment allocations preserved.",
              );
            }}
          >
            <label>
              New bill name
              <input
                required
                value={form.name || ""}
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <label>
              Split by
              <select
                value={form.splitMode || "amount"}
                onChange={(e) => update("splitMode", e.target.value)}
              >
                <option value="amount">Outstanding amount</option>
                <option value="items">Whole item units</option>
              </select>
            </label>
            {form.splitMode === "items" ? (
              <fieldset className="mw-wide">
                <legend>Items to move</legend>
                {current.charges?.map((charge: any) => (
                  <label className="mw-row" key={charge.id}>
                    <span>
                      {charge.name} · {formatMoney(charge.amount)}
                    </span>
                    <input
                      aria-label={"Move quantity of " + charge.name}
                      type="number"
                      min="0"
                      max={charge.quantity || 0}
                      disabled={!charge.quantity}
                      value={items[charge.id] || 0}
                      onChange={(e) =>
                        setItems({
                          ...items,
                          [charge.id]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </fieldset>
            ) : (
              <label>
                Amount to move (naira)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={form.amount || ""}
                  onChange={(e) => update("amount", e.target.value)}
                />
              </label>
            )}
            <div className="mw-wide">
              <button className="secondary" disabled={disabled}>
                Split bill
              </button>
            </div>
          </form>
          <form
            className="mw-form"
            style={{ marginTop: 20 }}
            onSubmit={(e) => {
              e.preventDefault();
              perform(
                `/bills/${current.id}/merge`,
                { sourceBillIds: [form.sourceBill] },
                "Bills merged with allocations retained.",
              );
            }}
          >
            <label>
              Merge another bill into this one
              <select
                required
                value={form.sourceBill || ""}
                onChange={(e) => update("sourceBill", e.target.value)}
              >
                <option value="">Choose another bill in this visit</option>
                {bills
                  .filter(
                    (b) =>
                      b.id !== current.id &&
                      b.status === "open" &&
                      b.visitId === current.visitId,
                  )
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name || b.id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="mw-wide">
              <button className="secondary" disabled={disabled}>
                Merge into selected bill
              </button>
            </div>
          </form>
          {canPay && (
            <form
              className="mw-form"
              style={{ marginTop: 20 }}
              onSubmit={(e) => {
                e.preventDefault();
                perform(
                  `/bills/${current.id}/payments`,
                  {
                    requestKey: uuid(),
                    amount: Math.round(Number(form.paymentAmount) * 100),
                    method: form.method || "cash",
                    reference: form.reference || "",
                  },
                  "Bill collection recorded.",
                );
              }}
            >
              <label>
                Amount received (naira)
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.paymentAmount || ""}
                  onChange={(e) => update("paymentAmount", e.target.value)}
                />
              </label>
              <label>
                Method
                <select
                  value={form.method || "cash"}
                  onChange={(e) => update("method", e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="external_pos">External POS</option>
                  <option value="external_transfer">
                    Verified external transfer
                  </option>
                </select>
              </label>
              <label>
                Verified reference
                <input
                  required={form.method === "external_transfer"}
                  value={form.reference || ""}
                  onChange={(e) => update("reference", e.target.value)}
                />
              </label>
              <div className="mw-wide">
                <button className="primary" disabled={disabled}>
                  Record bill collection
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {!canPay && (
        <p className="mw-note">
          Bill details are read-only for this role. Splitting, merging and
          recording payments require payment authority.
        </p>
      )}
      {error && (
        <p role="alert" className="mw-note mw-error">
          {error}
        </p>
      )}
    </section>
  );
}
