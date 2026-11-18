import React, { useState } from "react";
import { uuid } from "../../api";
import { WorkspaceError } from "./api";
export default function VisitTables({
  base,
  visit,
  tables,
  visits,
  disabled,
  save,
}: {
  base: string;
  visit: any;
  tables: any[];
  visits: any[];
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const current: string[] = visit.tableIds || [visit.tableId];
  const [selected, setSelected] = useState<string[]>(current);
  const [primary, setPrimary] = useState(visit.tableId || current[0]);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<any>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const heldElsewhere = new Set(
    visits
      .filter((row) => row.id !== visit.id && row.status === "open")
      .flatMap((row) => row.tableIds || [row.tableId]),
  );
  const perform = async () => {
    const body = pending || {
      requestKey: uuid(),
      version: visit.version || 1,
      primaryTableId: primary,
      tableIds: selected,
      reason,
    };
    setWorking(true);
    setError("");
    try {
      const result = await save(
        base + "/visits/" + visit.id + "/tables",
        "POST",
        body,
        "Visit tables changed. Guest access and bills were retained.",
      );
      setPending(null);
      setSelected(result.tableIds);
      setPrimary(result.tableId);
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
    <details>
      <summary>Move or combine this party’s tables</summary>
      <p className="mw-note">
        Choose available tables for this existing visit. Another party’s visit
        cannot be joined or merged here. Released tables move to cleaning; this
        party keeps its bills and guest access.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void perform();
        }}
      >
        <fieldset
          disabled={disabled || working || !!pending || visit.status !== "open"}
          style={{ border: 0, padding: 0 }}
        >
          <legend>Tables for this party</legend>
          <div className="mw-grid">
            {tables.map((table) => {
              const selectedHere = selected.includes(table.id);
              const unavailable =
                heldElsewhere.has(table.id) ||
                (!current.includes(table.id) && table.status !== "available");
              return (
                <label className="mw-row" key={table.id}>
                  <span>
                    {table.name} · {table.capacity} seats ·{" "}
                    {current.includes(table.id) ? "this party" : table.status}
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedHere}
                    disabled={
                      unavailable || (!selectedHere && selected.length >= 12)
                    }
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selected, table.id]
                        : selected.filter((id) => id !== table.id);
                      setSelected(next);
                      if (!next.includes(primary)) setPrimary(next[0] || "");
                    }}
                  />
                </label>
              );
            })}
          </div>
          <div className="mw-form">
            <label>
              Primary table
              <select
                required
                value={primary}
                onChange={(event) => setPrimary(event.target.value)}
              >
                <option value="">Choose primary table</option>
                {tables
                  .filter((table) => selected.includes(table.id))
                  .map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Table change reason
              <input
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          <button
            className="secondary"
            disabled={!selected.length || !selected.includes(primary)}
          >
            Save this party’s tables
          </button>
        </fieldset>
      </form>
      {pending && (
        <div className="mw-note">
          <p>
            Table change not confirmed. Retry the original request to check its
            result safely.
          </p>
          <button disabled={disabled || working} onClick={() => void perform()}>
            Retry original table change
          </button>
        </div>
      )}
    </details>
  );
}
