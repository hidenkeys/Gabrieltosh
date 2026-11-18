import React from "react";
export type PosContextDraft = {
  displayName: string;
  fulfillment: string;
  visitId?: string;
  note: string;
};
type Props = {
  draft: PosContextDraft;
  visits: any[];
  tables: any[];
  canUseTables: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<PosContextDraft>) => void;
};
export default function PosOrderContext({
  draft,
  visits,
  tables,
  canUseTables,
  disabled = false,
  onChange,
}: Props) {
  const openVisits =
    canUseTables && Array.isArray(visits)
      ? visits.filter((visit) => visit && visit.status === "open")
      : [];
  const knownTables = Array.isArray(tables) ? tables : [];
  const unavailableTableSelection =
    draft.fulfillment === "table_service" && !canUseTables;
  const name = draft.displayName.trim();
  return (
    <div className="mw-pos-context">
      <div className="mw-pos-context-service">
        <label>
          Fulfillment
          <select
            required
            disabled={disabled}
            value={unavailableTableSelection ? "" : draft.fulfillment}
            onChange={(event) =>
              onChange({ fulfillment: event.target.value, visitId: undefined })
            }
          >
            {unavailableTableSelection && (
              <option value="">Choose fulfillment</option>
            )}
            <option value="counter_pickup">Counter pickup</option>
            <option value="takeaway">Takeaway</option>
            {canUseTables && (
              <option value="table_service">Table service</option>
            )}
          </select>
        </label>
        {canUseTables && draft.fulfillment === "table_service" && (
          <label>
            Open table visit
            <select
              required
              disabled={disabled}
              value={draft.visitId || ""}
              onChange={(event) => onChange({ visitId: event.target.value })}
            >
              <option value="">Select an open visit</option>
              {openVisits.map((visit) => {
                const tableIds = Array.isArray(visit.tableIds)
                  ? visit.tableIds
                  : [visit.tableId];
                const names = knownTables
                  .filter(
                    (table) =>
                      table &&
                      tableIds.includes(table.id) &&
                      typeof table.name === "string" &&
                      table.name.trim(),
                  )
                  .map((table) => table.name);
                const party =
                  typeof visit.displayName === "string" &&
                  visit.displayName.trim()
                    ? visit.displayName
                    : "Current party";
                return (
                  <option key={visit.id} value={visit.id}>
                    {names.join(" + ") || "Table"} · {party}
                  </option>
                );
              })}
            </select>
            {!openVisits.length && (
              <span className="mw-pos-context-empty">
                No open visits. Open a table visit before adding a table order.
              </span>
            )}
          </label>
        )}
      </div>
      <details className="mw-pos-context-extra">
        <summary>
          <span>Customer & order note</span>
          <span className="mw-pos-context-summary">
            {[
              name ? (name.length > 32 ? name.slice(0, 32) + "…" : name) : "",
              draft.note.trim() ? "Note added" : "",
            ]
              .filter(Boolean)
              .join(" · ") || "Optional"}
          </span>
        </summary>
        <div className="mw-pos-context-fields">
          <label>
            Customer name (optional)
            <input
              disabled={disabled}
              placeholder="Walk-in customer"
              maxLength={100}
              value={draft.displayName}
              onChange={(event) =>
                onChange({ displayName: event.target.value })
              }
            />
          </label>
          <label>
            Order note
            <input
              disabled={disabled}
              maxLength={500}
              value={draft.note}
              onChange={(event) => onChange({ note: event.target.value })}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
