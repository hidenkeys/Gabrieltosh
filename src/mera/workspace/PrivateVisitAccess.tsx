import React, { useEffect, useState } from "react";
export default function PrivateVisitAccess({
  visit,
  code,
  uncertain,
  disabled,
  canRotate,
  onClear,
  onRotate,
  onRefresh,
}: {
  visit: any;
  code?: string | null;
  uncertain?: boolean;
  disabled: boolean;
  canRotate: boolean;
  onClear: () => void;
  onRotate: (reason: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setRevealed(false);
    setReason("");
    setError("");
  }, [visit.id, code]);
  return (
    <section className="mw-card mw-private-access">
      <h2>Private access · {visit.displayName || "Current party"}</h2>
      <p>
        {visit.tableName || "Selected visit"} · Share this only with the current
        party. This code stays out of permanent menu QR codes and exports.
      </p>
      {error && <p role="alert">{error}</p>}
      {code && !uncertain ? (
        <>
          <div className="mw-row">
            <span>Current party joining code</span>
            <strong
              aria-label="Current party joining code"
              style={{ fontSize: 24, letterSpacing: 4, userSelect: "all" }}
            >
              {revealed ? code : "••••••"}
            </strong>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => setRevealed(!revealed)}
          >
            {revealed
              ? "Hide private joining code"
              : "Show private joining code"}
          </button>
        </>
      ) : (
        <p className="mw-note">
          No current joining code is confirmed. Refresh the visit, then
          explicitly generate a replacement. An uncertain request does not
          establish which code is current.
        </p>
      )}
      {canRotate && (
        <details>
          <summary>Generate a new code for this party</summary>
          <p>
            The previous joining code becomes invalid. Existing guest sessions
            stay active. This keeps the same visit, bills and party.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setError("");
              void onRotate(reason).catch((error) => setError(error.message));
            }}
          >
            <label>
              Joining-code replacement reason
              <input
                required
                minLength={3}
                maxLength={300}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="mw-actions">
              <button className="secondary" disabled={disabled}>
                Generate replacement private code
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  void onRefresh().catch((error) => setError(error.message))
                }
              >
                Refresh current visit
              </button>
            </div>
          </form>
        </details>
      )}
      <div className="mw-actions">
        <button type="button" disabled={disabled} onClick={onClear}>
          Clear private access panel
        </button>
      </div>
    </section>
  );
}
