import { useState } from "react";
import { uuid } from "../../api";
import { formatMoney } from "./api";
export default function ReservationSettlement({
  reservation,
  tables,
  base,
  disabled,
  canPay,
  save,
  onVisitOpened,
  onVisitOpening,
}: {
  onVisitOpened?: (visit: any) => void;
  onVisitOpening?: () => void;
  reservation: any;
  tables: any[];
  base: string;
  disabled: boolean;
  canPay: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState("");
  const perform = (suffix: string, body: any, message: string) => {
    setError("");
    if (suffix === "seat") onVisitOpening?.();
    void save(
      base + `/reservations/${reservation.id}/` + suffix,
      "POST",
      body,
      message,
    )
      .then((result) => {
        if (suffix === "seat" && result?.visit?.joiningCode)
          onVisitOpened?.(result.visit);
        setForm({});
      })
      .catch((e) => setError(e.message));
  };
  return (
    <details>
      <summary>
        Deposit & seating · confirmed deposit{" "}
        {formatMoney(reservation.depositAmount)}
      </summary>
      {canPay && (
        <form
          className="mw-form"
          onSubmit={(e) => {
            e.preventDefault();
            perform(
              "deposits",
              {
                requestKey: uuid(),
                amount: Math.round(Number(form.amount) * 100),
                method: form.method || "cash",
                reference: form.reference || "",
              },
              "Reservation deposit recorded.",
            );
          }}
        >
          <label>
            Deposit already received (naira)
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={form.amount || ""}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label>
            Deposit method
            <select
              value={form.method || "cash"}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
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
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </label>
          <div className="mw-wide">
            <button className="secondary" disabled={disabled}>
              Record deposit
            </button>
          </div>
        </form>
      )}
      {["arrived", "confirmed"].includes(reservation.status) && (
        <form
          className="mw-form"
          onSubmit={(e) => {
            e.preventDefault();
            perform(
              "seat",
              { tableId: form.tableId, displayName: reservation.displayName },
              "Reservation seated. Confirmed deposit allocated once.",
            );
          }}
        >
          <label>
            Seat at table
            <select
              required
              value={form.tableId || ""}
              onChange={(e) => setForm({ ...form, tableId: e.target.value })}
            >
              <option value="">Choose table</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name} · {table.capacity} seats
                </option>
              ))}
            </select>
          </label>
          <div className="mw-wide">
            <button className="primary" disabled={disabled}>
              Seat reservation
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="mw-note mw-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
