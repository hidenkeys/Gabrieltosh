import ChoiceField from "../ui/ChoiceField";
import { useState, type ReactNode } from "react";
import { Disclosure, ReadState } from "../ui/OperationalPrimitives";
const labels: Record<string, string> = {
  available: "Available",
  occupied: "Occupied",
  cleaning: "Cleaning",
  unavailable: "Unavailable",
  reserved: "Reserved",
  open: "Open",
  closed: "Closed",
};
function records(value: unknown): any[] | null {
  return Array.isArray(value) &&
    value.every((row) => row && typeof row.id === "string")
    ? value
    : null;
}
export default function TableServiceView({
  tables,
  visits,
  renderTableTools,
  renderPartyTools,
  openParty,
  setup,
}: {
  tables: unknown;
  visits: unknown;
  renderTableTools: (table: any, held: boolean) => ReactNode;
  renderPartyTools: (visit: any) => ReactNode;
  openParty: ReactNode;
  setup: ReactNode;
}) {
  const knownTables = records(tables),
    knownVisits = records(visits),
    [view, setView] = useState("open");
  const open = knownVisits?.filter((visit) => visit.status === "open");
  const shown = knownVisits?.filter(
    (visit) => view === "all" || visit.status === view,
  );
  return (
    <div className="mw-table-service">
      <section className="mw-card" aria-label="Branch tables">
        <header className="mw-table-heading">
          <div>
            <h2>Tables at a glance</h2>
            <p>Check service status before seating a party.</p>
          </div>
          {knownTables && (
            <p className="mw-table-count">
              {knownTables.length} tables ·{" "}
              {
                knownTables.filter((table) => table.status === "available")
                  .length
              }{" "}
              available
            </p>
          )}
        </header>
        {!knownTables ? (
          <ReadState
            kind="unavailable"
            title="Table records are unavailable. Refresh the workspace before seating anyone."
          />
        ) : !knownTables.length ? (
          <ReadState kind="empty" title="No tables created yet.">
            <p>Add tables in Floor layout and table setup below.</p>
          </ReadState>
        ) : (
          <div className="mw-table-grid">
            {knownTables.map((table) => {
              const parties = open?.filter((visit) =>
                (visit.tableIds || [visit.tableId]).includes(table.id),
              );
              return (
                <article className="mw-table-card" key={table.id}>
                  <header>
                    <h3>{table.name || "Table name unavailable"}</h3>
                    <span className="mw-pill">
                      {labels[table.status] || "Status unavailable"}
                    </span>
                  </header>
                  <p>
                    {table.zone || "Main floor"} ·{" "}
                    {Number.isSafeInteger(table.capacity)
                      ? `${table.capacity} seats`
                      : "Capacity unavailable"}
                  </p>
                  {parties?.map((party) => (
                    <p className="mw-table-party" key={party.id}>
                      {party.displayName || "Party name not recorded"}
                    </p>
                  ))}
                  {renderTableTools(table, !!parties?.length)}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="mw-card" aria-label="Table parties">
        <header className="mw-table-heading">
          <div>
            <h2>Parties & visits</h2>
            <p>Keep each party’s rounds, tables and access together.</p>
          </div>
          <ChoiceField
            label={<>Party view</>}
            value={view}
            onChange={(nextValue) => setView(nextValue)}
          >
            <option value="open">Open parties</option>
            <option value="closed">Closed visits</option>
            <option value="all">All visits</option>
          </ChoiceField>
        </header>
        {!knownVisits ? (
          <ReadState
            kind="unavailable"
            title="Visit records are unavailable. Refresh the workspace before continuing."
          />
        ) : (
          <>
            {!shown?.length && (
              <ReadState
                kind="empty"
                title={
                  view === "open"
                    ? "No open parties at this branch."
                    : "No visits in this view."
                }
              />
            )}
            <div
              className="mw-party-list"
              role="region"
              aria-label="Party records"
              tabIndex={0}
            >
              {knownVisits.map((visit) => {
                const ids = Array.isArray(visit.tableIds)
                  ? visit.tableIds
                  : [visit.tableId];
                const names = knownTables
                  ?.filter((table) => ids.includes(table.id))
                  .map((table) => table.name)
                  .filter(Boolean);
                return (
                  <article
                    className="mw-party-card"
                    key={visit.id}
                    hidden={view !== "all" && visit.status !== view}
                  >
                    <header>
                      <div>
                        <h3>
                          {visit.displayName || "Party name not recorded"}
                        </h3>
                        <p>{names?.join(" + ") || "Table name unavailable"}</p>
                      </div>
                      <span className="mw-pill">
                        {labels[visit.status] || "Status unavailable"}
                      </span>
                    </header>
                    {renderPartyTools(visit)}
                  </article>
                );
              })}
            </div>
          </>
        )}
        <Disclosure
          className="mw-table-open"
          summary="Open a table visit"
          defaultOpen={!!knownVisits && !open?.length}
        >
          {openParty}
        </Disclosure>
        <p className="mw-table-guidance">
          A table QR does not reveal a party’s bill. Private access is
          controlled separately. Settle outstanding balances before closing a
          visit.
        </p>
      </section>
      <Disclosure
        className="mw-card mw-table-setup"
        summary="Floor layout and table setup"
      >
        {setup}
      </Disclosure>
    </div>
  );
}
