import React, { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { formatMoney, WorkspaceError } from "./api";
import { Action } from "../ui/OperationalPrimitives";
import Segmented from "../ui/Segmented";
import MoneyInput from "../ui/MoneyInput";
import ReasonInput from "../ui/ReasonInput";
type Props = {
  base: string;
  shiftId: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export default function CashMovement(props: Props) {
  return (
    <ScopedCashMovement key={props.base + "|" + props.shiftId} {...props} />
  );
}
function ScopedCashMovement({ base, shiftId, disabled, save }: Props) {
  const [direction, setDirection] = useState("out"),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState("");
  const [pending, setPending] = useState<any>(null),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [denied, setDenied] = useState(false);
  const active = useRef(true),
    inFlight = useRef(false),
    pendingRef = useRef<any>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function perform() {
    if (disabled || inFlight.current || denied) return;
    const wasUnconfirmed = !!pendingRef.current,
      body = pendingRef.current || {
        requestKey: uuid(),
        direction,
        amount: Math.round(Number(amount) * 100),
        reason,
      };
    inFlight.current = true;
    setWorking(true);
    setError("");
    try {
      await save(
        base + "/shifts/" + shiftId + "/movements",
        "POST",
        body,
        "Cash movement recorded.",
      );
      if (!active.current) return;
      pendingRef.current = null;
      setPending(null);
      setAmount("");
      setReason("");
    } catch (e) {
      if (!active.current) return;
      if (
        wasUnconfirmed ||
        !(e instanceof WorkspaceError) ||
        !e.status ||
        e.status >= 500
      ) {
        pendingRef.current = body;
        setPending(body);
      }
      if ([401, 403, 404].includes((e as any).status)) setDenied(true);
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }
  return (
    <section className="fo-cash-movement" aria-label="Cash movement">
      <h4>Cash in or out</h4>
      <p className="fo-muted">
        Record a change to the cash held in this till. This does not record a
        sale.
      </p>
      {error && (
        <p className="fo-error" role="alert">
          {error}
        </p>
      )}
      {denied ? (
        <p role="status">
          Shift access needs checking. Refresh your workspace or sign in again
          before recording another movement.
        </p>
      ) : (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform();
            }}
          >
            <fieldset
              disabled={disabled || working || !!pending}
              className="fo-fieldset"
            >
              <div className="fo-form-grid">
                <Segmented
                  label="Cash movement"
                  value={direction}
                  onChange={setDirection}
                  options={[
                    { value: "out", label: "Cash out" },
                    { value: "in", label: "Cash in" },
                  ]}
                />
                <MoneyInput
                  label="Movement amount (naira)"
                  required
                  min={0.01}
                  value={amount}
                  onChange={setAmount}
                />
                <ReasonInput
                  label="Movement reason"
                  required
                  minLength={3}
                  maxLength={300}
                  value={reason}
                  onChange={setReason}
                  presets={[
                    "Float top-up",
                    "Bank drop",
                    "Supplier payment",
                    "Change for till",
                    "Tip payout",
                  ]}
                />
              </div>
              <Action type="submit" pending={working}>
                Record cash movement
              </Action>
            </fieldset>
          </form>
          {pending && (
            <div className="fo-pending" role="status">
              <strong>Cash movement not confirmed</strong>
              <p>
                Original {pending.direction === "in" ? "cash in" : "cash out"}:{" "}
                {formatMoney(pending.amount)} · {pending.reason}
              </p>
              <p>
                These details stay locked. Retry the original request or use the
                workspace’s request check before creating another movement.
              </p>
              <Action
                disabled={disabled}
                pending={working}
                onClick={() => void perform()}
              >
                Retry original cash movement
              </Action>
            </div>
          )}
        </>
      )}
    </section>
  );
}
