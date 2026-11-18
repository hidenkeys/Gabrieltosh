import React, { useState } from "react";
import { uuid } from "../../api";
import { WorkspaceError } from "./api";
export default function CashMovement({
  base,
  shiftId,
  disabled,
  save,
}: {
  base: string;
  shiftId: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [direction, setDirection] = useState("out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<any>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const perform = async () => {
    const body = pending || {
      requestKey: uuid(),
      direction,
      amount: Math.round(Number(amount) * 100),
      reason,
    };
    setWorking(true);
    setError("");
    try {
      await save(
        base + "/shifts/" + shiftId + "/movements",
        "POST",
        body,
        "Cash movement recorded.",
      );
      setPending(null);
      setAmount("");
      setReason("");
    } catch (e) {
      if (e instanceof WorkspaceError && (!e.status || e.status >= 500))
        setPending(body);
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <div>
      {error && <p role="alert">{error}</p>}
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
            <label>
              Cash movement
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
              >
                <option value="out">Cash out</option>
                <option value="in">Cash in</option>
              </select>
            </label>
            <label>
              Movement amount (naira)
              <input
                required
                min="0.01"
                type="number"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label>
              Movement reason
              <input
                required
                minLength={3}
                maxLength={300}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          <button className="secondary">Record cash movement</button>
        </fieldset>
      </form>
      {pending && (
        <div className="mw-note">
          <p>
            Cash movement not confirmed. This amount and reason remain locked
            until the original request is resolved.
          </p>
          <button disabled={disabled || working} onClick={() => void perform()}>
            Retry original cash movement
          </button>
        </div>
      )}
    </div>
  );
}
