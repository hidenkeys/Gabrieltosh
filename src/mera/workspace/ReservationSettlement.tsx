import Combobox from "../ui/Combobox";
import Segmented from "../ui/Segmented";
import MoneyInput from "../ui/MoneyInput";
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
          <MoneyInput
            label="Deposit already received (naira)"
            min={0.01}
            required
            value={String(form.amount || "")}
            onChange={(value) => setForm({ ...form, amount: value })}
          />
          <Segmented
            label="Deposit method"
            value={form.method || "cash"}
            onChange={(value) => setForm({ ...form, method: value })}
            options={[
              { value: "cash", label: "Cash" },
              { value: "external_pos", label: "External POS" },
              {
                value: "external_transfer",
                label: "Verified external transfer",
              },
            ]}
          />
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
          <Combobox
            label="Seat at table"
            required
            value={form.tableId || ""}
            onChange={(value) => setForm({ ...form, tableId: value })}
            options={tables.map((table) => ({
              value: table.id,
              label: table.name,
              description: `${table.capacity} seats`,
            }))}
            placeholder="Choose table"
          />
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
