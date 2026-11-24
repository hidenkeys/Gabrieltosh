import { useVenueWrite } from "./StockTransfers";
import { useEffect, useRef, useState } from "react";
import Stepper from "../ui/Stepper";
import MoneyInput from "../ui/MoneyInput";
import { workspaceApi } from "./api";
import { uuid } from "../../api";
export function guestTradingDate(branch: any, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: branch?.timezone || "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (key: string) =>
    parts.find((p) => p.type === key)?.value || "00";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  return Number(part("hour")) * 60 + Number(part("minute")) <
    (branch?.cutoff ?? 0)
    ? new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10)
    : date;
}
function GuestArrival({
  entry,
  disabled,
  checkIn,
  turnAway,
}: {
  entry: any;
  disabled: boolean;
  checkIn: (count: number) => void;
  turnAway: (reason: string) => void;
}) {
  const remaining = entry.partySize - entry.arrivedCount;
  const [count, setCount] = useState(Math.max(1, remaining));
  return (
    <div>
      {entry.status !== "turned_away" && remaining > 0 && (
        <>
          <Stepper
            label={`Check-in count for ${entry.name}`}
            value={Math.min(count, remaining)}
            min={1}
            max={remaining}
            onChange={setCount}
            disabled={disabled}
          />
          <button
            disabled={disabled}
            onClick={() => checkIn(Math.min(count, remaining))}
          >
            Check in {entry.name}
          </button>
          <details>
            <summary>Turn away {entry.name}</summary>
            {["At capacity", "Entry requirements", "Guest declined"].map(
              (reason) => (
                <button
                  key={reason}
                  disabled={disabled}
                  onClick={() => turnAway(reason)}
                >
                  {reason}
                </button>
              ),
            )}
          </details>
        </>
      )}
    </div>
  );
}
export default function DoorGuestList({
  base,
  actorId = "current-session",
  branch,
  disabled = false,
  onCollectEntry,
}: {
  base: string;
  actorId?: string;
  branch: any;
  disabled?: boolean;
  onCollectEntry?: (productId: string) => void;
}) {
  const tradingDate = guestTradingDate(branch),
    endpoint = base + "/guest-list";
  const [rows, setRows] = useState<any[]>([]),
    [name, setName] = useState(""),
    [partySize, setPartySize] = useState(1),
    [host, setHost] = useState(""),
    [contact, setContact] = useState(""),
    [cover, setCover] = useState(""),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [pending, setPending] = useState<any>(null);
  const durable = useVenueWrite(actorId, base + "/guest-list");
  const savedRequest = durable.pending || pending;
  const frozen = disabled || busy || durable.busy || !!savedRequest;
  const lock = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    workspaceApi(
      endpoint + "?tradingDate=" + tradingDate,
      "GET",
      undefined,
      c.signal,
    )
      .then((r) => {
        if (!c.signal.aborted) setRows(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [endpoint, tradingDate, revision]);
  async function write(path: string, method: string, body: any) {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const request = durable.pending ||
      pending || {
        path,
        method,
        body: { ...body, requestKey: uuid() },
      };
    setPending(request);
    try {
      await durable.write(request.path, request.method, request.body);
      setPending(null);
      if (request.path === endpoint) {
        setName("");
        setPartySize(1);
        setHost("");
        setContact("");
        setCover("");
      }
      setRevision((r) => r + 1);
    } catch (e: any) {
      setError(e.message);
      if (e.status && e.status < 500) setPending(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="mw-card mw-door-guest-list">
      <h2>Door & guest list</h2>
      <p>Tonight’s list · {tradingDate}</p>
      <p role="status">
        {rows.reduce((n, e) => n + e.arrivedCount, 0)} arrived ·{" "}
        {rows
          .filter((e) => e.status !== "turned_away")
          .reduce((n, e) => n + e.partySize - e.arrivedCount, 0)}{" "}
        expected
      </p>
      {(error || durable.error) && <p role="alert">{error || durable.error}</p>}
      {savedRequest?.blocked && (
        <p role="alert">
          A saved guest list request needs review before another entry can be
          sent.
        </p>
      )}
      {savedRequest && !busy && (
        <button
          disabled={disabled || savedRequest.blocked}
          onClick={() =>
            void write(
              savedRequest.path,
              savedRequest.method,
              savedRequest.body,
            )
          }
        >
          Retry original guest list request
        </button>
      )}
      <details>
        <summary>Add guest</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void write(endpoint, "POST", {
              tradingDate,
              name,
              partySize,
              host: host || null,
              contact: contact || null,
              coverCharge: cover ? Math.round(Number(cover) * 100) : null,
            });
          }}
        >
          <fieldset disabled={frozen} className="mw-form">
            <label>
              Guest name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <Stepper
              label="Party size"
              value={partySize}
              onChange={setPartySize}
              min={1}
              max={1000}
            />
            <label>
              Host (optional)
              <input
                value={host}
                maxLength={120}
                onChange={(e) => setHost(e.target.value)}
              />
            </label>
            <label>
              Contact (optional)
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </label>
            <MoneyInput
              label="Cover charge (naira, optional)"
              value={cover}
              onChange={setCover}
            />
            <button className="primary">Add entry</button>
          </fieldset>
        </form>
      </details>
      <label>
        Search guest list
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <button disabled={busy} onClick={() => setRevision((r) => r + 1)}>
        Refresh guest list
      </button>
      {loading && <p role="status">Loading tonight’s list…</p>}
      {!loading && !rows.length && (
        <p>Add the first guest to tonight’s list.</p>
      )}
      {rows
        .filter((e) =>
          `${e.name} ${e.host || ""} ${e.contact || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .map((entry) => (
          <article key={entry.id}>
            <h3>
              {entry.name} · {entry.partySize} guests
            </h3>
            <p>
              {entry.host && `Host: ${entry.host} · `}
              {entry.arrivedCount} arrived · {entry.status.replaceAll("_", " ")}
            </p>
            <GuestArrival
              key={entry.id + entry.version}
              entry={entry}
              disabled={frozen}
              checkIn={(count) =>
                void write(`${endpoint}/${entry.id}/check-in`, "POST", {
                  version: entry.version,
                  count,
                })
              }
              turnAway={(reason) => {
                if (window.confirm(`Turn away ${entry.name}?`))
                  void write(`${endpoint}/${entry.id}`, "PATCH", {
                    version: entry.version,
                    status: "turned_away",
                    note: reason,
                  });
              }}
            />
            {branch?.settings?.entryProductId && onCollectEntry && (
              <button
                disabled={disabled || busy}
                onClick={() => onCollectEntry(branch.settings.entryProductId)}
              >
                Collect entry
              </button>
            )}
          </article>
        ))}
    </section>
  );
}
