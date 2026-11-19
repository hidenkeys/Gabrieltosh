import { useState, type ReactNode } from "react";
import { Action, DataRegion } from "../ui/OperationalPrimitives";
import {
  reservationArrivalEligible,
  reservationDate,
  reservationInstant,
  reservationStatusLabel,
} from "./reservationPresentation";
type Queue = "all" | "arrivals" | "requested" | "seated" | "closed";
type Props = {
  reservations?: any[];
  serverTime?: string;
  timeZone?: string;
  initialQueue?: "all" | "arrivals";
  initialReservationId?: string;
  renderRecord: (reservation: any) => ReactNode;
};
export default function ReservationDesk({
  reservations,
  serverTime,
  timeZone,
  initialQueue = "all",
  initialReservationId,
  renderRecord,
}: Props) {
  const [queue, setQueue] = useState<Queue>(initialQueue),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(initialReservationId || "");
  const seen = new Set<string>();
  let malformed = !Array.isArray(reservations);
  const records = (Array.isArray(reservations) ? reservations : []).filter(
    (row) => {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        typeof row.id !== "string" ||
        !row.id.trim() ||
        seen.has(row.id)
      ) {
        malformed = true;
        return false;
      }
      seen.add(row.id);
      return true;
    },
  );
  records.sort((a, b) => {
    const left = reservationInstant(a.startsAt),
      right = reservationInstant(b.startsAt);
    return Number.isFinite(left) && Number.isFinite(right)
      ? left - right
      : Number.isFinite(left)
        ? -1
        : Number.isFinite(right)
          ? 1
          : 0;
  });
  const clockKnown = Number.isFinite(reservationInstant(serverTime));
  const matches = (row: any) => {
    if (selected && row.id !== selected) return false;
    const name = typeof row.displayName === "string" ? row.displayName : "";
    if (
      query.trim() &&
      !name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    )
      return false;
    if (selected) return true;
    return (
      queue === "all" ||
      (queue === "arrivals" && reservationArrivalEligible(row, serverTime)) ||
      (queue === "requested" && row.status === "requested") ||
      (queue === "seated" && row.status === "seated") ||
      (queue === "closed" &&
        ["completed", "cancelled", "no-show"].includes(row.status))
    );
  };
  const count = records.filter(matches).length;
  const clear = () => {
    setQueue("all");
    setQuery("");
    setSelected("");
  };
  return (
    <section className="mw-reservation-desk" aria-label="Reservation desk">
      <header>
        <div>
          <h3>Reservation queue</h3>
          <p>
            Review arrivals and keep each party’s actions with their
            reservation.
          </p>
        </div>
        <span>
          {count} shown · {records.length}{" "}
          {malformed ? "available records" : "reservations"}
        </span>
      </header>
      <label className="mw-reservation-search">
        Search reservation names
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a party by name"
        />
      </label>
      <div
        className="mw-reservation-filters"
        role="group"
        aria-label="Reservation queues"
      >
        {(
          [
            ["all", "All"],
            ["arrivals", "Upcoming / arrived"],
            ["requested", "Requested"],
            ["seated", "Seated"],
            ["closed", "Closed"],
          ] as [Queue, string][]
        ).map(([id, label]) => (
          <Action
            key={id}
            aria-pressed={!selected && queue === id}
            onClick={() => {
              setQueue(id);
              setSelected("");
            }}
          >
            {label}
          </Action>
        ))}
      </div>
      {selected && <p>Showing the selected reservation.</p>}
      {(selected || query || queue !== "all") && (
        <Action onClick={clear}>Clear reservation filters</Action>
      )}
      {malformed && (
        <p role="alert">
          Some reservation details are unavailable. Refresh the workspace before
          treating this list as complete.
        </p>
      )}
      {!clockKnown && (
        <p>
          Arrival freshness is unavailable. Confirm current arrivals with the
          branch.
        </p>
      )}
      {!records.length && !malformed ? (
        <p>No reservations in this branch.</p>
      ) : (
        !count && (
          <p>
            {malformed
              ? "No matching reservation records are available; the list is incomplete."
              : "No reservations match these filters."}
          </p>
        )
      )}
      {!!records.length && (
        <DataRegion
          label="Reservation records"
          className="mw-reservation-records"
        >
          {records.map((row) => (
            <article
              className="mw-reservation-record"
              key={row.id}
              hidden={!matches(row)}
            >
              <header>
                <div>
                  <h4>
                    {typeof row.displayName === "string" &&
                    row.displayName.trim()
                      ? row.displayName
                      : "Reservation name unavailable"}
                  </h4>
                  <p>
                    {Number.isSafeInteger(row.partySize) && row.partySize > 0
                      ? `${row.partySize} ${row.partySize === 1 ? "guest" : "guests"}`
                      : "Party size unavailable"}
                  </p>
                </div>
                <span className="mw-pill">
                  {reservationStatusLabel(row.status)}
                </span>
              </header>
              <dl>
                <div>
                  <dt>Starts</dt>
                  <dd>{reservationDate(row.startsAt, timeZone)}</dd>
                </div>
                <div>
                  <dt>Ends</dt>
                  <dd>{reservationDate(row.endsAt, timeZone)}</dd>
                </div>
              </dl>
              {renderRecord(row)}
            </article>
          ))}
        </DataRegion>
      )}
    </section>
  );
}
