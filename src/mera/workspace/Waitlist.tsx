import React, { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
import { DataRegion, Disclosure } from "../ui/OperationalPrimitives";
type Props = {
  base: string;
  disabled: boolean;
  timeZone?: string;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
const empty = { displayName: "", partySize: 2, contact: "", notes: "" };
const statuses: Record<string, string> = {
  waiting: "Waiting",
  notified: "Manually notified",
  seated: "Seated",
  cancelled: "Cancelled",
};
const stamp = (value: any) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? Date.parse(value)
    : null;
function arrival(value: any, zone?: string) {
  const at = stamp(value);
  if (at === null) return "Arrival time unavailable";
  let timeZone = zone || "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
  } catch {
    timeZone = "UTC";
  }
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(at)) +
    " · " +
    timeZone
  );
}
export default function Waitlist(props: Props) {
  return <ScopedWaitlist key={props.base} {...props} />;
}
function ScopedWaitlist({ base, disabled, timeZone, save }: Props) {
  const [rows, setRows] = useState<any[]>([]),
    [denied, setDenied] = useState(false),
    [draft, setDraft] = useState(empty),
    [view, setView] = useState("active"),
    [readError, setReadError] = useState(""),
    [writeError, setWriteError] = useState(""),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [unknownCreate, setUnknownCreate] = useState(false),
    [unknownUpdates, setUnknownUpdates] = useState<Record<string, boolean>>({});
  const active = useRef(true),
    generation = useRef(0),
    inFlight = useRef(false),
    accessDenied = useRef(false);
  function deny() {
    accessDenied.current = true;
    generation.current++;
    setDenied(true);
    setRows([]);
    setDraft(empty);
    setLoading(false);
    setWriteError("");
  }
  const read = async (signal?: AbortSignal) => {
    if (accessDenied.current) return;
    const version = ++generation.current;
    setLoading(true);
    try {
      const result = await workspaceApi(
        base + "/waitlist",
        "GET",
        undefined,
        signal,
      );
      if (!active.current || signal?.aborted || version !== generation.current)
        return;
      const values = Array.isArray(result) ? result : result?.waitlist;
      if (
        !Array.isArray(values) ||
        values.some(
          (row: any) =>
            !row ||
            typeof row.id !== "string" ||
            typeof row.displayName !== "string",
        )
      )
        throw new Error("Invalid waitlist response");
      setRows(values);
      setReadError("");
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === generation.current &&
        failure.name !== "AbortError"
      ) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else setReadError("The waitlist could not be loaded. Try again.");
      }
    } finally {
      if (active.current && !signal?.aborted && version === generation.current)
        setLoading(false);
    }
  };
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void read(controller.signal);
    return () => {
      active.current = false;
      generation.current++;
      controller.abort();
    };
  }, [base]);
  const create = async () => {
    if (
      disabled ||
      inFlight.current ||
      accessDenied.current ||
      unknownCreate ||
      loading ||
      readError
    )
      return;
    inFlight.current = true;
    setWorking(true);
    setWriteError("");
    try {
      await save(
        base + "/waitlist",
        "POST",
        draft,
        "Party added to the waitlist.",
      );
      if (!active.current || accessDenied.current) return;
      setDraft(empty);
      await read();
    } catch (failure: any) {
      if (active.current && !accessDenied.current) {
        if ([401, 403, 404].includes(failure.status)) {
          deny();
          return;
        }
        setWriteError(failure.message);
        if (!failure.status || failure.status >= 500) setUnknownCreate(true);
      }
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  };
  const change = async (id: string, status: string) => {
    if (
      disabled ||
      inFlight.current ||
      accessDenied.current ||
      unknownUpdates[id] ||
      loading ||
      readError
    )
      return;
    inFlight.current = true;
    setWorking(true);
    setWriteError("");
    try {
      await save(
        base + "/waitlist/" + encodeURIComponent(id),
        "PATCH",
        { status },
        "Waitlist updated.",
      );
      if (active.current && !accessDenied.current) await read();
    } catch (failure: any) {
      if (active.current && !accessDenied.current) {
        if ([401, 403, 404].includes(failure.status)) {
          deny();
          return;
        }
        setWriteError(failure.message);
        if (!failure.status || failure.status >= 500)
          setUnknownUpdates((current) => ({ ...current, [id]: true }));
      }
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  };
  if (denied)
    return (
      <section className="mw-card mw-frontdesk-waitlist">
        <h2>Front desk waitlist</h2>
        <p role="alert">
          Access to this branch’s waitlist is no longer available. Sign in again
          or ask your administrator to check access. No previous action has been
          retried.
        </p>
      </section>
    );
  const shown = rows
    .filter(
      (row) =>
        view === "all" ||
        (view === "active"
          ? ["waiting", "notified"].includes(row.status)
          : ["seated", "cancelled"].includes(row.status)),
    )
    .sort((a, b) => {
      const first = stamp(
          view === "history" ? a.updatedAt || a.createdAt : a.createdAt,
        ),
        second = stamp(
          view === "history" ? b.updatedAt || b.createdAt : b.createdAt,
        );
      if (first === null) return second === null ? 0 : 1;
      if (second === null) return -1;
      return view === "history" ? second - first : first - second;
    });
  return (
    <section
      className="mw-card mw-frontdesk-waitlist"
      aria-label="Branch waitlist"
    >
      <header className="mw-waitlist-heading">
        <div>
          <h2>Front desk waitlist</h2>
          <p>
            See waiting parties in recorded arrival order and update their next
            step.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={working || loading}
          onClick={() => void read()}
        >
          Refresh waitlist
        </button>
      </header>
      {writeError && <p role="alert">{writeError}</p>}
      {readError && (
        <div role="alert">
          <p>{readError}</p>
          <button
            type="button"
            className="secondary"
            disabled={working || loading}
            onClick={() => void read()}
          >
            Retry loading waitlist
          </button>
        </div>
      )}
      <label className="mw-waitlist-filter">
        Waitlist view
        <select value={view} onChange={(event) => setView(event.target.value)}>
          <option value="active">Waiting & notified</option>
          <option value="history">Seated & cancelled</option>
          <option value="all">All parties</option>
        </select>
      </label>
      {loading ? (
        <p role="status">Loading waitlist…</p>
      ) : readError ? null : !shown.length ? (
        <div className="mw-waitlist-empty">
          <h3>
            {view === "active"
              ? "No parties on the waitlist."
              : "No parties in this view."}
          </h3>
          <p>
            {view === "active"
              ? "Add a walk-in party below when they arrive."
              : "Choose another view to see other recorded parties."}
          </p>
        </div>
      ) : (
        <DataRegion label="Waitlist arrivals" className="mw-waitlist-records">
          {shown.map((row, index) => {
            const open = ["waiting", "notified"].includes(row.status),
              locked = disabled || working || !!unknownUpdates[row.id];
            return (
              <article className="mw-waitlist-party" key={row.id}>
                <header>
                  <div className="mw-waitlist-party-name">
                    <span
                      className="mw-waitlist-position"
                      aria-label="Arrival position"
                    >
                      {view === "active" && stamp(row.createdAt) !== null
                        ? index + 1
                        : "—"}
                    </span>
                    <div>
                      <h3>{row.displayName}</h3>
                      <p>
                        {Number.isInteger(row.partySize)
                          ? row.partySize + " guests"
                          : "Party size unavailable"}
                      </p>
                    </div>
                  </div>
                  <span className="mw-waitlist-status">
                    {Object.prototype.hasOwnProperty.call(statuses, row.status)
                      ? statuses[row.status]
                      : "Status unavailable"}
                  </span>
                </header>
                <p className="mw-waitlist-time">
                  <time
                    dateTime={
                      stamp(row.createdAt) !== null ? row.createdAt : undefined
                    }
                  >
                    Arrived: {arrival(row.createdAt, timeZone)}
                  </time>
                </p>
                {unknownUpdates[row.id] && (
                  <p className="mw-note" role="status">
                    This party’s update is unconfirmed. Refresh the list and
                    reconcile its status before updating it again.
                  </p>
                )}
                <Disclosure
                  summary="Contact & front desk note"
                  className="mw-waitlist-private"
                >
                  <p>
                    {typeof row.contact === "string" && row.contact.trim()
                      ? row.contact
                      : "No contact recorded"}
                  </p>
                  <p style={{ whiteSpace: "pre-wrap" }}>
                    {typeof row.notes === "string" && row.notes.trim()
                      ? row.notes
                      : "No front desk note"}
                  </p>
                </Disclosure>
                {open && (
                  <div className="mw-actions">
                    {row.status === "waiting" && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={locked}
                        onClick={() => void change(row.id, "notified")}
                      >
                        Mark manually notified
                      </button>
                    )}
                    <button
                      type="button"
                      className="primary"
                      disabled={locked}
                      onClick={() => void change(row.id, "seated")}
                    >
                      Mark seated
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={locked}
                      onClick={() => void change(row.id, "cancelled")}
                    >
                      Cancel waiting party
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </DataRegion>
      )}
      <p className="mw-waitlist-note">
        “Notified” records contact made by your team; no message is sent here.
        Marking a party seated does not open a table visit.
      </p>
      <Disclosure
        summary={
          unknownCreate ? "Review unconfirmed party submission" : "Add a party"
        }
        className="mw-waitlist-add"
      >
        {unknownCreate && (
          <div className="mw-note" role="status">
            <strong>Party submission unconfirmed</strong>
            <p>
              Your original draft is retained. Refresh the list and ask an
              administrator to reconcile it before adding the same party again.
              An empty list does not prove the request failed.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={working || loading}
              onClick={() => void read()}
            >
              Check waitlist
            </button>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (event.currentTarget.reportValidity()) void create();
          }}
        >
          <fieldset
            disabled={
              disabled || working || loading || !!readError || unknownCreate
            }
            className="mw-waitlist-fields"
          >
            <div className="mw-form">
              <label>
                Party name
                <input
                  required
                  maxLength={100}
                  value={draft.displayName}
                  onChange={(event) =>
                    setDraft({ ...draft, displayName: event.target.value })
                  }
                />
              </label>
              <label>
                Party size
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={draft.partySize}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      partySize: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Contact
                <input
                  maxLength={160}
                  value={draft.contact}
                  onChange={(event) =>
                    setDraft({ ...draft, contact: event.target.value })
                  }
                />
              </label>
              <label>
                Front desk note
                <textarea
                  maxLength={500}
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft({ ...draft, notes: event.target.value })
                  }
                />
              </label>
            </div>
            <button className="primary">Add waiting party</button>
          </fieldset>
        </form>
      </Disclosure>
    </section>
  );
}
