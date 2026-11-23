import ReasonInput from "../ui/ReasonInput";
import MoneyInput from "../ui/MoneyInput";
import React, { useState } from "react";
import { uuid } from "../../api";
import { formatMoney, WorkspaceError } from "./api";
export default function WriteOff({
  base,
  order,
  disabled,
  save,
}: {
  base: string;
  order: any;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [approved, setApproved] = useState(false);
  const [pending, setPending] = useState<any>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const balance =
    order.outstandingBalance ??
    Math.max(
      0,
      order.total -
        (order.effectivePaid ?? order.paid ?? 0) -
        (order.writtenOff || 0),
    );
  const perform = async () => {
    const body = pending || {
      requestKey: uuid(),
      version: order.version,
      amount: Math.round(Number(amount) * 100),
      reason,
    };
    setWorking(true);
    setError("");
    try {
      await save(
        base + "/orders/" + order.id + "/writeoffs",
        "POST",
        body,
        "Non-cash debt write-off recorded. No collection or refund occurred.",
      );
      setPending(null);
      setAmount("");
      setReason("");
      setApproved(false);
    } catch (e) {
      if (e instanceof WorkspaceError && (!e.status || e.status >= 500))
        setPending(body);
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  if (
    order.historicalReadOnly ||
    !["collected", "completed"].includes(order.status)
  )
    return null;
  return (
    <details>
      <summary>Review outstanding debt</summary>
      <p>
        Outstanding {formatMoney(balance)} · Already written off{" "}
        {formatMoney(order.writtenOff || 0)}
      </p>
      <p className="mw-note">
        Record an approved non-cash bad-debt expense. Payment status, cash
        collected, sales and stock remain unchanged. Only collected or completed
        orders with outstanding debt qualify.
      </p>
      {error && <p role="alert">{error}</p>}
      {balance > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform();
          }}
        >
          <fieldset
            disabled={disabled || working || !!pending}
            style={{ border: 0, padding: 0 }}
          >
            <div className="mw-form">
              <MoneyInput
                label="Debt write-off amount (naira)"
                min={0.01}
                max={balance / 100}
                required
                value={String(amount)}
                onChange={(value) => setAmount(value)}
              />
              <ReasonInput
                label="Debt write-off reason"
                required
                minLength={10}
                maxLength={500}
                value={reason}
                onChange={setReason}
                presets={[
                  "Unrecoverable customer debt",
                  "Approved goodwill adjustment",
                  "Payment dispute reviewed",
                ]}
              />
            </div>
            <label className="mw-row">
              <span>
                I approve recording this amount as a non-cash debt expense.
              </span>
              <input
                type="checkbox"
                required
                checked={approved}
                onChange={(event) => setApproved(event.target.checked)}
              />
            </label>
            <button className="secondary" disabled={!approved}>
              Record approved debt write-off
            </button>
          </fieldset>
        </form>
      )}
      {pending && (
        <button disabled={disabled || working} onClick={() => void perform()}>
          Retry original debt write-off
        </button>
      )}
    </details>
  );
}
