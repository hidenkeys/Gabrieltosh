import Segmented from "../ui/Segmented";
import Combobox from "../ui/Combobox";
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
        <Segmented
          label="Fulfillment"
          required
          disabled={disabled}
          value={unavailableTableSelection ? "" : draft.fulfillment}
          onChange={(value) =>
            onChange({ fulfillment: value, visitId: undefined })
          }
          options={[
            { value: "counter_pickup", label: "Counter pickup" },
            { value: "takeaway", label: "Takeaway" },
            ...(canUseTables
              ? [{ value: "table_service", label: "Table service" }]
              : []),
          ]}
        />
        {canUseTables && draft.fulfillment === "table_service" && (
          <div>
            <Combobox
              label="Open table visit"
              value={draft.visitId || ""}
              onChange={(value) => onChange({ visitId: value })}
              required
              disabled={disabled}
              options={openVisits.map((visit) => ({
                value: visit.id,
                label:
                  knownTables
                    .filter((table) =>
                      (visit.tableIds || [visit.tableId]).includes(table.id),
                    )
                    .map((table) => table.name)
                    .join(" + ") || "Table",
                description: visit.displayName || "Current party",
              }))}
            />
            {!openVisits.length && (
              <span className="mw-pos-context-empty">
                No open visits. Open a table visit before adding a table order.
              </span>
            )}
          </div>
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
