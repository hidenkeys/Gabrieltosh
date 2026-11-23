import ChoiceField from "../ui/ChoiceField";
import { useEffect, useRef, useState } from "react";
type CareRecord = {
  id: string;
  category?: string;
  rating?: number;
  text?: string;
  status: string;
  orderId?: string;
  orderReference?: string;
  createdAt?: string;
  updatedAt?: string;
  resolution?: string;
};
type Draft = { status: string; resolution: string };
type Props = {
  base: string;
  complaints?: unknown;
  disabled: boolean;
  timezone?: string;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
const labels: Record<string, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved: "Resolved",
};
const topics: Record<string, string> = {
  feedback: "General feedback",
  service: "Service",
  food: "Food or drink",
  payment: "Payment",
  other: "Other",
};
function formatDate(value?: string, timezone?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(value));
  } catch {
    return "Date unavailable";
  }
}
export default function CustomerCare(props: Props) {
  return <ScopedCustomerCare key={props.base} {...props} />;
}
function ScopedCustomerCare({
  base,
  complaints,
  disabled,
  timezone,
  save,
}: Props) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false),
    [unknown, setUnknown] = useState<{ id: string; draft: Draft } | null>(null),
    [accessDenied, setAccessDenied] = useState(false);
  const mounted = useRef(true),
    inFlight = useRef(false),
    unknownRef = useRef<{ id: string; draft: Draft } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const available =
    Array.isArray(complaints) &&
    complaints.every(
      (row) =>
        row && typeof row.id === "string" && typeof row.status === "string",
    );
  const records: CareRecord[] = available ? (complaints as CareRecord[]) : [];
  const rows = records.filter(
    (row) =>
      (filter === "all" || row.status === filter) &&
      `${topics[row.category || "feedback"] || "Feedback"} ${row.text || ""} ${row.orderReference || ""} ${row.resolution || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const chosen = rows.find((row) => row.id === selected) || rows[0];
  const draft = chosen
    ? drafts[chosen.id] || {
        status: chosen.status,
        resolution: chosen.resolution || "",
      }
    : null;
  function change(next: Partial<Draft>) {
    if (!chosen || !draft || working || unknownRef.current) return;
    setDrafts((values) => ({ ...values, [chosen.id]: { ...draft, ...next } }));
    setNotice("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      disabled ||
      inFlight.current ||
      unknownRef.current ||
      !chosen ||
      !draft ||
      accessDenied
    )
      return;
    const attempt = { id: chosen.id, draft: { ...draft } };
    inFlight.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await save(
        base + "/complaints/" + attempt.id,
        "PATCH",
        attempt.draft,
        "Customer care record updated.",
      );
      if (!mounted.current) return;
      setDrafts((current) => {
        const next = { ...current };
        delete next[attempt.id];
        return next;
      });
      setNotice("Customer care record updated. No message or refund was sent.");
    } catch (failure) {
      if (!mounted.current) return;
      setError((failure as Error).message);
      if ([401, 403].includes((failure as any).status)) {
        setAccessDenied(true);
        setDrafts({});
      }
      if (
        !(failure as any).status ||
        (failure as any).status >= 500 ||
        (failure as Error).name === "AbortError"
      ) {
        unknownRef.current = attempt;
        setUnknown(attempt);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  if (accessDenied)
    return (
      <section className="mw-card mw-customer-care">
        <h2>Customer care</h2>
        <p role="alert">
          Access to this branch’s customer feedback is no longer available. The
          previous update has not been retried.
        </p>
      </section>
    );
  return (
    <section className="mw-card mw-customer-care">
      <header className="mw-care-heading">
        <h2>Customer care</h2>
        <p>
          Review private feedback and record how your team handled it. Saving a
          care record does not send a message or issue a refund.
        </p>
      </header>
      {error && (
        <p role="alert" className="mw-care-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mw-care-notice">
          {notice}
        </p>
      )}
      {unknown && (
        <div className="mw-care-uncertain" role="status">
          <h3>This update still needs checking</h3>
          <p>
            The change may already have been saved. Editing is paused to avoid
            overwriting it with another update.
          </p>
          <p>
            Review the latest record with an administrator before making another
            change. Refreshing this page does not cancel the earlier update.
            This screen cannot safely retry or discard it.
          </p>
          <dl>
            <div>
              <dt>Submitted status</dt>
              <dd>{labels[unknown.draft.status] || "Status unavailable"}</dd>
            </div>
            <div>
              <dt>Submitted private resolution</dt>
              <dd>{unknown.draft.resolution || "No resolution notes"}</dd>
            </div>
          </dl>
        </div>
      )}
      {!!records.length && (
        <div className="mw-care-toolbar">
          <label>
            Find feedback
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Feedback, topic or order reference"
            />
          </label>
          <ChoiceField
            label={<>Filter care records</>}
            value={filter}
            onChange={(nextValue) => setFilter(nextValue)}
          >
            <option value="all">All statuses</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </ChoiceField>
          <p role="status">
            {rows.length} of {records.length} records shown
          </p>
        </div>
      )}
      {!available ? (
        <div className="mw-care-empty" role="status">
          <h3>Customer feedback is unavailable</h3>
          <p>
            The latest care records were not provided. Refresh the workspace or
            check your branch access before relying on this list.
          </p>
        </div>
      ) : !records.length ? (
        <div className="mw-care-empty">
          <h3>No customer feedback shown</h3>
          <p>
            Private ratings and feedback submitted for this branch will appear
            here. Customer service requests are handled separately under
            Customer requests.
          </p>
        </div>
      ) : !rows.length ? (
        <div className="mw-care-empty">
          <h3>No matching feedback</h3>
          <p>Try another word or status.</p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Clear feedback filters
          </button>
        </div>
      ) : (
        <div className="mw-care-layout">
          <nav className="mw-care-list" aria-label="Feedback records">
            {rows.map((row) => (
              <button
                type="button"
                key={row.id}
                aria-pressed={chosen?.id === row.id}
                onClick={() => {
                  setSelected(row.id);
                  setError("");
                  setNotice("");
                }}
              >
                <span className="mw-care-row-heading">
                  <strong>
                    {topics[row.category || "feedback"] || "Feedback"}
                  </strong>
                  <span>{labels[row.status] || "Status unavailable"}</span>
                </span>
                <span>{row.text || "No written feedback"}</span>
                <small>
                  {Number.isInteger(row.rating) &&
                  row.rating! >= 1 &&
                  row.rating! <= 5
                    ? `${row.rating} / 5`
                    : "Rating unavailable"}{" "}
                  · {formatDate(row.createdAt, timezone)}
                </small>
              </button>
            ))}
          </nav>
          {chosen && draft && (
            <article className="mw-care-record">
              <header>
                <h3>{topics[chosen.category || "feedback"] || "Feedback"}</h3>
                <p>
                  {labels[chosen.status] || "Status unavailable"} ·{" "}
                  {Number.isInteger(chosen.rating) &&
                  chosen.rating! >= 1 &&
                  chosen.rating! <= 5
                    ? `${chosen.rating} / 5`
                    : "Rating unavailable"}
                </p>
              </header>
              <p className="mw-care-feedback">
                {chosen.text || "No written feedback"}
              </p>
              <dl className="mw-care-metadata">
                <div>
                  <dt>Received</dt>
                  <dd>{formatDate(chosen.createdAt, timezone)}</dd>
                </div>
                {chosen.orderReference && (
                  <div>
                    <dt>Order reference</dt>
                    <dd>{chosen.orderReference}</dd>
                  </div>
                )}
                {chosen.orderId && !chosen.orderReference && (
                  <div>
                    <dt>Source</dt>
                    <dd>Order-linked feedback</dd>
                  </div>
                )}
                {chosen.updatedAt && (
                  <div>
                    <dt>Last updated</dt>
                    <dd>{formatDate(chosen.updatedAt, timezone)}</dd>
                  </div>
                )}
              </dl>
              <p className="mw-care-timezone">
                {timezone
                  ? `Times shown in ${timezone}.`
                  : "Times shown in your device’s timezone."}
              </p>
              <form key={chosen.id} onSubmit={submit}>
                <fieldset disabled={disabled || working || !!unknown}>
                  <legend>Private investigation & resolution</legend>
                  <p>
                    These resolution notes stay with your staff. The customer
                    can see the feedback status, but not these private notes.
                  </p>
                  <ChoiceField
                    label={<>Case status</>}
                    value={draft.status}
                    onChange={(nextValue) => change({ status: nextValue })}
                  >
                    {Object.entries(labels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </ChoiceField>
                  <label>
                    Resolution
                    <textarea
                      maxLength={1000}
                      required={draft.status === "resolved"}
                      value={draft.resolution}
                      onChange={(event) =>
                        change({ resolution: event.target.value })
                      }
                      aria-describedby="mw-care-resolution-hint"
                    />
                  </label>
                  <p id="mw-care-resolution-hint">
                    Describe what your team checked and the outcome. A
                    resolution is required before marking the record resolved.
                  </p>
                  <button className="secondary">
                    {working ? "Saving care record…" : "Update care record"}
                  </button>
                </fieldset>
              </form>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
