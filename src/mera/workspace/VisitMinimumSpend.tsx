import React, { useEffect, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi, formatMoney, WorkspaceError } from "./api";
export default function VisitMinimumSpend({
  base,
  visitId,
  updatedKey,
  disabled,
  canWaive,
  save,
}: {
  base: string;
  visitId: string;
  updatedKey: string;
  disabled: boolean;
  canWaive: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const path = base + "/visits/" + visitId + "/minimum-spend";
  const [data, setData] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [pending, setPending] = useState<any>(null);
  useEffect(() => {
    const controller = new AbortController();
    workspaceApi(path, "GET", undefined, controller.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [path, updatedKey]);
  const perform = async () => {
    const body = pending || {
      requestKey: uuid(),
      version: data.version,
      expectedShortfall: data.summary.shortfall,
      reason,
    };
    setWorking(true);
    setError("");
    try {
      await save(
        path + "/waive",
        "POST",
        body,
        "Minimum-spend shortfall review recorded. No payment, fee or ledger entry was created.",
      );
      setData(await workspaceApi(path));
      setPending(null);
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
  return (
    <details>
      <summary>Minimum-spend commitment</summary>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p role="status">Loading original visit terms…</p>
      ) : !data.summary.enabled ? (
        <p>No minimum-spend terms are attached to this visit.</p>
      ) : (
        <>
          <p>{data.summary.disclosure}</p>
          <div className="mw-note">
            <p>
              Original target {formatMoney(data.summary.target)} · Net paid bill{" "}
              {formatMoney(data.summary.netPaid)} · Manager waivers{" "}
              {formatMoney(data.summary.waived)}
            </p>
            <strong>
              Commitment shortfall: {formatMoney(data.summary.shortfall)}
            </strong>
            <p>
              Add ordinary orders or request a manager’s review. This shortfall
              is separate from unpaid order debt; no fee is created. Later
              refunds may reopen a shortfall.
            </p>
          </div>
          {data.summary.shortfall > 0 &&
            (canWaive ? (
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
                  <label>
                    Minimum-spend waiver reason
                    <input
                      required
                      minLength={10}
                      maxLength={500}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <label className="mw-row">
                    <span>
                      I approve waiving the current disclosed commitment
                      shortfall.
                    </span>
                    <input
                      type="checkbox"
                      required
                      checked={approved}
                      onChange={(event) => setApproved(event.target.checked)}
                    />
                  </label>
                  <button className="secondary" disabled={!approved}>
                    Waive current commitment shortfall
                  </button>
                </fieldset>
              </form>
            ) : (
              <p>An authorized manager must review a waiver.</p>
            ))}
        </>
      )}
      {pending && (
        <button disabled={disabled || working} onClick={() => void perform()}>
          Retry original minimum-spend review
        </button>
      )}
    </details>
  );
}
