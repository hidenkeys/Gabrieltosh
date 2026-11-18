import React, { useEffect, useState } from "react";
import { uuid } from "../../api";
import { formatMoney, workspaceApi, WorkspaceError } from "./api";
export default function ShiftActions({
  base,
  shift,
  canApprove,
  disabled,
  save,
}: {
  base: string;
  shift: any;
  canApprove: boolean;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [staff, setStaff] = useState<any[]>([]);
  const [toUserId, setToUserId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<any>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (shift.status !== "open") return;
    const controller = new AbortController();
    workspaceApi(base + "/shift-staff", "GET", undefined, controller.signal)
      .then(setStaff)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [base, shift.status]);
  const handover = async () => {
    const body = pending || { requestKey: uuid(), toUserId, reason };
    setWorking(true);
    setError("");
    try {
      await save(
        base + "/shifts/" + shift.id + "/handover",
        "POST",
        body,
        "Shift responsibility handed over.",
      );
      setPending(null);
      setReason("");
      setToUserId("");
    } catch (e) {
      if (e instanceof WorkspaceError && (!e.status || e.status >= 500))
        setPending(body);
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  if (shift.status === "closed")
    return (
      <>
        {shift.approvalReason && (
          <p>Variance approved: {shift.approvalReason}</p>
        )}
      </>
    );
  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {shift.status === "pending_approval" ? (
        <>
          <p className="mw-note">
            Cash variance {formatMoney(shift.variance)} awaits an organization
            administrator’s review.
          </p>
          {canApprove && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setWorking(true);
                setError("");
                try {
                  await save(
                    base + "/shifts/" + shift.id + "/approve",
                    "POST",
                    { reason },
                    "Shift variance reviewed and approved.",
                  );
                  setReason("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setWorking(false);
                }
              }}
            >
              <label>
                Variance approval reason
                <input
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button className="secondary" disabled={disabled || working}>
                Approve reconciled variance
              </button>
            </form>
          )}
        </>
      ) : (
        <details>
          <summary>Hand over this open shift</summary>
          <p>
            Responsibility changes are recorded; this does not transfer funds or
            close the till.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handover();
            }}
          >
            <fieldset
              disabled={disabled || working || !!pending}
              style={{ border: 0, padding: 0 }}
            >
              <div className="mw-form">
                <label>
                  Receiving staff
                  <select
                    required
                    value={toUserId}
                    onChange={(event) => setToUserId(event.target.value)}
                  >
                    <option value="">Choose an authorized staff member</option>
                    {staff.map((person) => (
                      <option key={person.userId} value={person.userId}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Handover reason
                  <input
                    required
                    minLength={3}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              </div>
              <button className="secondary" disabled={!staff.length}>
                Record shift handover
              </button>
            </fieldset>
          </form>
          {pending && (
            <button
              disabled={disabled || working}
              onClick={() => void handover()}
            >
              Retry original handover
            </button>
          )}
        </details>
      )}
    </div>
  );
}
