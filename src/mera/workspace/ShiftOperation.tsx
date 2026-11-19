import { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { reservationDate } from "./reservationPresentation";
import { workspaceApi, formatMoney } from "./api";
import { Action, Disclosure } from "../ui/OperationalPrimitives";
import {
  readShiftOperationJournal,
  saveShiftOperationJournal,
  clearShiftOperationJournal,
  redactShiftOperationJournals,
  parseShiftAmount,
  parseShiftOperationAttempt,
  type ShiftOperationRecord,
} from "./shiftOperationJournal";
type Props = {
  userId: string;
  organizationId: string;
  branchId: string;
  disabled: boolean;
  canManage: boolean;
  shifts?: unknown;
  timeZone?: string;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
  onRecorded?: (shift: any) => void;
  onPendingChange?: (pending: boolean) => void;
};
export default function ShiftOperation(props: Props) {
  return (
    <ScopedShiftOperation
      key={[props.userId, props.organizationId, props.branchId].join("|")}
      {...props}
    />
  );
}
function ScopedShiftOperation(props: Props) {
  const { userId, organizationId, branchId, disabled, canManage, save } = props,
    scope = { actorId: userId, organizationId, branchId },
    base = `/organizations/${organizationId}/branches/${branchId}`;
  const [record, setRecord] = useState<ShiftOperationRecord | null>(null),
    [ready, setReady] = useState(false),
    [blocked, setBlocked] = useState(false),
    [busy, setBusy] = useState(false),
    [cash, setCash] = useState(""),
    [reason, setReason] = useState(""),
    [stopReason, setStopReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const active = useRef(true),
    flight = useRef(false),
    pending = useRef<ShiftOperationRecord | null>(null),
    auth = useRef(canManage),
    denied = useRef(false),
    callbacks = useRef(props);
  auth.current = canManage;
  callbacks.current = props;
  const allowed = () => active.current && auth.current && !denied.current;
  const rows = Array.isArray(props.shifts) ? props.shifts : [],
    valid =
      Array.isArray(props.shifts) &&
      rows.every(
        (row) =>
          row &&
          typeof row === "object" &&
          typeof row.id === "string" &&
          /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(
            row.id,
          ) &&
          ["open", "pending_approval", "closed", "approved"].includes(
            row.status,
          ),
      ),
    opens = rows.filter((row) => row?.status === "open"),
    safe = valid && opens.length <= 1;
  const targetKey = safe
    ? opens.length
      ? "close:" + opens[0].id
      : "open"
    : "unavailable";
  const freshTarget = useRef(targetKey);
  useEffect(() => {
    if (freshTarget.current !== targetKey) {
      freshTarget.current = targetKey;
      if (!pending.current) {
        setCash("");
        setReason("");
        setError("");
      }
    }
  }, [targetKey]);
  const store = (value: ShiftOperationRecord | null) => {
    pending.current = value;
    setRecord(value);
    callbacks.current.onPendingChange?.(!!value);
  };
  function fail(e: any) {
    if (!active.current) return;
    if ([401, 403, 404].includes(e.status)) {
      denied.current = true;
      setBlocked(true);
      const redacted = redactShiftOperationJournals();
      try {
        pending.current = redacted ? readShiftOperationJournal(scope) : null;
      } catch {
        pending.current = null;
      }
      setRecord(null);
      setCash("");
      setReason("");
      setStopReason("");
      setConfirmed(false);
      setError(
        "Shift access needs checking. Refresh the workspace or sign in again.",
      );
    } else
      setError(
        pending.current
          ? "This shift operation is unconfirmed. Check its original result before starting another."
          : "No shift operation was sent. Enter a valid cash amount, and ensure this tab can save recovery details.",
      );
  }
  const attemptPath = (r: ShiftOperationRecord) =>
    base +
    (r.operation === "open"
      ? "/shifts/open-attempts/"
      : `/shifts/${r.shiftId}/close-attempts/`) +
    r.requestKey;
  async function lookup(r: ShiftOperationRecord) {
    return parseShiftOperationAttempt(
      await workspaceApi(attemptPath(r), "GET", undefined, undefined, {
        expectedActorId: userId,
      }),
      r,
    );
  }
  function finish(result: any, r: ShiftOperationRecord) {
    if (result.status === "not_found") return false;
    clearShiftOperationJournal(scope, r.requestKey);
    if (!allowed()) return true;
    store(null);
    setCash("");
    setReason("");
    setStopReason("");
    setConfirmed(false);
    setNotice(
      result.status === "recorded"
        ? "The original shift operation is recorded. The acknowledgement reflects that operation, not a new cash count."
        : "The unconfirmed operation was stopped. No recorded shift or cash entry was reversed.",
    );
    if (result.status === "recorded")
      callbacks.current.onRecorded?.(result.shift);
    return true;
  }
  async function check() {
    if (disabled || flight.current || !allowed()) return;
    const r = pending.current;
    if (!r) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const proof = await lookup(r);
      if (!allowed()) return;
      if (!finish(proof, r))
        setError(
          "This operation has not been recorded yet. That does not prove failure. Keep its original details or explicitly stop it.",
        );
    } catch (e) {
      fail(e);
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    active.current = true;
    try {
      store(readShiftOperationJournal(scope));
      setReady(true);
      if (pending.current) void check();
    } catch {
      setBlocked(true);
      setError(
        "Saved shift recovery details could not be verified. Ask an administrator to recover the original operation.",
      );
      callbacks.current.onPendingChange?.(true);
    }
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!canManage) {
      denied.current = true;
      redactShiftOperationJournals();
      pending.current = null;
      setRecord(null);
      setCash("");
      setReason("");
      setStopReason("");
    }
  }, [canManage]);
  async function submit() {
    if (disabled || flight.current || !allowed() || !ready || blocked) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let r = pending.current;
      if (r?.referenceOnly) throw Error("Private original details unavailable");
      if (!r) {
        if (!safe || freshTarget.current !== targetKey)
          throw Error("Current shifts unavailable");
        const amount = parseShiftAmount(cash),
          requestKey = uuid();
        r = saveShiftOperationJournal(
          opens.length
            ? {
                version: 1,
                ...scope,
                referenceOnly: false,
                requestKey,
                operation: "close",
                shiftId: opens[0].id,
                body: {
                  requestKey,
                  countedCash: amount,
                  reason: reason.trim(),
                },
              }
            : {
                version: 1,
                ...scope,
                referenceOnly: false,
                requestKey,
                operation: "open",
                shiftId: null,
                body: { requestKey, openingFloat: amount },
              },
        );
        store(r);
      } else {
        const proof = await lookup(r);
        if (!allowed()) return;
        if (finish(proof, r)) return;
      }
      await save(
        base +
          (r.operation === "open" ? "/shifts" : `/shifts/${r.shiftId}/close`),
        "POST",
        r.body,
        "Shift operation submitted; checking its recorded acknowledgement.",
      );
      const proof = await lookup(r);
      finish(proof, r);
      if (proof.status === "not_found" && allowed())
        setError(
          "The operation result has not been recorded yet. Keep the original request for checking.",
        );
    } catch (e) {
      fail(e);
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function stop() {
    if (
      disabled ||
      flight.current ||
      !allowed() ||
      !confirmed ||
      stopReason.trim().length < 3
    )
      return;
    const r = pending.current;
    if (!r) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const proof = parseShiftOperationAttempt(
        await workspaceApi(
          attemptPath(r) + "/abandon",
          "POST",
          { reason: stopReason.trim() },
          undefined,
          { expectedActorId: userId },
        ),
        r,
      );
      if (!allowed()) return;
      if (!finish(proof, r)) throw Error("Stop unconfirmed");
    } catch (e) {
      fail(e);
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (!canManage || denied.current)
    return (
      <section className="mw-shift-operation">
        <p role="alert">{error || "Shift access needs checking."}</p>
      </section>
    );
  return (
    <section className="mw-shift-operation" aria-label="Open and close shifts">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {record ? (
        <Disclosure summary="Check an unconfirmed shift operation" defaultOpen>
          <h3>
            Original{" "}
            {record.operation === "open" ? "shift opening" : "shift closing"}
          </h3>
          {record.operation === "close" && record.shiftId && (
            <p>
              Shift reference:{" "}
              <code>{record.shiftId.slice(0, 8).toUpperCase()}</code>
            </p>
          )}
          {record.referenceOnly ? (
            <p>
              Private cash details were cleared when the staff session ended.
              This reference can be checked or stopped, but cannot be resent
              without the original details.
            </p>
          ) : (
            <>
              <p>
                Original{" "}
                {record.operation === "open" ? "opening float" : "counted cash"}
                :{" "}
                <strong>
                  {formatMoney(
                    record.operation === "open"
                      ? record.body.openingFloat
                      : record.body.countedCash,
                  )}
                </strong>
              </p>
              {record.operation === "close" && record.body.reason && (
                <p>Original variance explanation: {record.body.reason}</p>
              )}
              <p>
                The original amount and target stay unchanged even if the
                current shift or cash totals change.
              </p>
            </>
          )}
          <div className="mw-actions">
            <Action
              pending={busy}
              disabled={disabled}
              onClick={() => void check()}
            >
              Check original shift operation
            </Action>
            {!record.referenceOnly && (
              <Action disabled={disabled || busy} onClick={() => void submit()}>
                Retry original shift operation
              </Action>
            )}
          </div>
          <Disclosure summary="Stop the unconfirmed shift request">
            <p>
              This stops only an operation that has not been recorded. It does
              not reverse an accepted shift or cash entry.
            </p>
            <label>
              Reason for stopping
              <input
                maxLength={500}
                value={stopReason}
                disabled={disabled || busy}
                onChange={(e) => setStopReason(e.target.value)}
              />
            </label>
            <label className="mw-row">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={disabled || busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I want to stop this unconfirmed shift operation.
            </label>
            <Action
              disabled={
                disabled || busy || !confirmed || stopReason.trim().length < 3
              }
              onClick={() => void stop()}
            >
              Check and stop original shift operation
            </Action>
          </Disclosure>
        </Disclosure>
      ) : (
        <Disclosure
          summary={
            opens.length === 1
              ? "Close and reconcile the open shift"
              : "Open a shift"
          }
        >
          <h3>
            {opens.length === 1
              ? "Close the current open shift"
              : "Opening cash float"}
          </h3>
          {safe && opens.length === 0 && (
            <p>
              Record the cash float physically present at the start of service.
            </p>
          )}
          {!safe && (
            <p>
              Current shift records are unavailable or need review. Refresh
              before opening or closing a shift.
            </p>
          )}
          {opens.length === 1 && (
            <p>
              This closes the current open shift (opened{" "}
              {reservationDate(
                opens[0].openedAt || opens[0].createdAt,
                props.timeZone,
              )}
              ). Count the cash actually held before submitting; a manager may
              need to review any variance.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset disabled={disabled || busy || blocked || !ready || !safe}>
              <label>
                {opens.length === 1
                  ? "Counted cash (naira)"
                  : "Opening float (naira)"}
                <input
                  required
                  inputMode="decimal"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  onInput={(e) => setCash(e.currentTarget.value)}
                  placeholder="0.00"
                />
              </label>
              {opens.length === 1 && (
                <label>
                  Variance explanation
                  <input
                    maxLength={300}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              )}
              <Action type="submit" variant="primary">
                {opens.length === 1 ? "Close & reconcile" : "Open shift"}
              </Action>
            </fieldset>
          </form>
        </Disclosure>
      )}
    </section>
  );
}
