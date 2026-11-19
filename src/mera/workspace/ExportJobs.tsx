import React, { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi } from "./api";
import { DataRegion, Disclosure } from "../ui/OperationalPrimitives";
type Props = {
  base: string;
  disabled: boolean;
  timeZone?: string;
  initialDate?: string;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
const validBusinessDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !value.startsWith("0000-") &&
  Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
  new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
const statuses: Record<string, string> = {
  queued: "Queued",
  processing: "Preparing report",
  complete: "Ready to download",
  failed: "Needs attention",
  cancelled: "Cancelled",
};
export default function ExportJobs(props: Props) {
  return <ScopedExports key={props.base} {...props} />;
}
function ScopedExports({ base, disabled, save, timeZone, initialDate }: Props) {
  const [jobs, setJobs] = useState<any[]>([]),
    [date, setDate] = useState(() =>
      validBusinessDate(initialDate) ? initialDate! : "",
    ),
    [readError, setReadError] = useState(""),
    [writeError, setWriteError] = useState(""),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [reasons, setReasons] = useState<Record<string, string>>({}),
    [pending, setPending] = useState<any>(null),
    [uncertainRetries, setUncertainRetries] = useState<Record<string, boolean>>(
      {},
    );
  const [denied, setDenied] = useState(false);
  const active = useRef(true),
    generation = useRef(0),
    inFlight = useRef(false),
    pendingRef = useRef<any>(null),
    deniedRef = useRef(false),
    uncertainRef = useRef<Record<string, boolean>>({});
  function deny() {
    deniedRef.current = true;
    generation.current++;
    setDenied(true);
    setJobs([]);
    setPending(null);
    pendingRef.current = null;
    setDate("");
    setReasons({});
    setUncertainRetries({});
    uncertainRef.current = {};
    setReadError("");
    setWriteError("");
    setLoading(false);
  }
  const requestTime = (value: string) => {
    if (timeZone) {
      try {
        return (
          new Intl.DateTimeFormat("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone,
          }).format(new Date(value)) +
          " · " +
          timeZone
        );
      } catch {
        /* Use an explicitly labelled device clock if configuration is invalid. */
      }
    }
    return (
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value)) + " · Device time"
    );
  };
  const read = async (signal?: AbortSignal, quiet = false) => {
    if (deniedRef.current) return;
    const version = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const result = await workspaceApi(
        base + "/jobs",
        "GET",
        undefined,
        signal,
      );
      if (
        !active.current ||
        deniedRef.current ||
        signal?.aborted ||
        version !== generation.current
      )
        return;
      const rows = Array.isArray(result) ? result : result?.jobs;
      if (
        !Array.isArray(rows) ||
        rows.some((row: any) => !row || typeof row.id !== "string")
      )
        throw new Error("Invalid export response");
      setJobs(rows);
      setReadError("");
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === generation.current &&
        failure.name !== "AbortError"
      ) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else setReadError("Export jobs could not be loaded. Try again.");
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
    const timer = setInterval(() => {
      if (!document.hidden && !deniedRef.current)
        void read(controller.signal, true);
    }, 5000);
    return () => {
      active.current = false;
      generation.current++;
      controller.abort();
      clearInterval(timer);
    };
  }, [base]);
  const create = async (requestedBody: any) => {
    if (disabled || inFlight.current || deniedRef.current) return;
    const body = pendingRef.current || requestedBody;
    const retrying = !!pendingRef.current;
    inFlight.current = true;
    setWorking(true);
    setWriteError("");
    try {
      await save(base + "/exports", "POST", body, "Report export queued.");
      if (!active.current || deniedRef.current) return;
      pendingRef.current = null;
      setPending(null);
      await read();
    } catch (failure: any) {
      if (active.current && !deniedRef.current) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else {
          setWriteError(failure.message);
          if (retrying || !failure.status || failure.status >= 500) {
            pendingRef.current = body;
            setPending(body);
          }
        }
      }
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  };
  const retry = async (job: any) => {
    if (
      disabled ||
      inFlight.current ||
      deniedRef.current ||
      uncertainRef.current[job.id] ||
      pendingRef.current
    )
      return;
    inFlight.current = true;
    setWorking(true);
    setWriteError("");
    try {
      await save(
        base + "/jobs/" + job.id + "/retry",
        "POST",
        { reason: reasons[job.id] },
        "Job retry queued.",
      );
      if (active.current && !deniedRef.current) await read();
    } catch (failure: any) {
      if (active.current && !deniedRef.current) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else {
          setWriteError(failure.message);
          if (!failure.status || failure.status >= 500) {
            uncertainRef.current = { ...uncertainRef.current, [job.id]: true };
            setUncertainRetries(uncertainRef.current);
          }
        }
      }
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  };
  if (denied)
    return (
      <section
        className="mw-card mw-management-utility"
        aria-label="Branch report exports"
      >
        <h2>Report exports</h2>
        <p role="alert">
          Report export access needs checking. Refresh the workspace or sign in
          again before continuing.
        </p>
      </section>
    );
  return (
    <section
      className="mw-card mw-management-utility"
      aria-label="Branch report exports"
    >
      <header className="mw-utility-heading">
        <div>
          <h2>Report exports</h2>
          <p>
            Download completed reports or request one for a branch business
            date.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={working || loading}
          onClick={() => void read()}
        >
          Refresh export jobs
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
            Retry loading export jobs
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading export jobs…</p>
      ) : readError ? null : !jobs.length ? (
        <p>No jobs for this branch.</p>
      ) : (
        <DataRegion
          label="Report export records"
          className="mw-utility-records"
        >
          {jobs.map((job) => (
            <article className="mw-utility-record" key={job.id}>
              <header>
                <div>
                  <h3>
                    {job.type === "report_export"
                      ? "Business-day report"
                      : "Branch report"}
                    {job.date ? " · " + job.date : ""}
                  </h3>
                  <p>
                    {Object.prototype.hasOwnProperty.call(statuses, job.status)
                      ? statuses[job.status]
                      : "Status unavailable"}
                  </p>
                </div>
                {job.status === "complete" && job.artifactId && (
                  <a
                    className="secondary"
                    href={`/api/mera/v1${base}/exports/${encodeURIComponent(job.artifactId)}/download`}
                    download
                  >
                    Download report CSV
                  </a>
                )}
              </header>
              <p>
                {typeof job.createdAt === "string" &&
                job.createdAt.trim() &&
                Number.isFinite(Date.parse(job.createdAt)) ? (
                  <time dateTime={job.createdAt}>
                    Requested {requestTime(job.createdAt)}
                  </time>
                ) : (
                  "Request time unavailable"
                )}{" "}
                ·{" "}
                {Number.isSafeInteger(job.attempts) && job.attempts >= 0
                  ? job.attempts +
                    (job.attempts === 1 ? " attempt" : " attempts")
                  : "Attempt count unavailable"}
              </p>
              {job.error && (
                <Disclosure
                  summary="Failure details"
                  className="mw-utility-failure"
                >
                  <p className="mw-utility-warning">{job.error}</p>
                </Disclosure>
              )}
              {uncertainRetries[job.id] && (
                <p role="status">
                  The retry outcome is unconfirmed. Refresh the queue and ask an
                  administrator to reconcile it before requesting another retry.
                </p>
              )}
              {job.status === "failed" && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void retry(job);
                  }}
                >
                  <fieldset
                    disabled={
                      disabled ||
                      working ||
                      !!pending ||
                      !!uncertainRetries[job.id]
                    }
                    className="mw-utility-form"
                  >
                    <label>
                      Retry reason
                      <input
                        minLength={3}
                        maxLength={300}
                        required
                        value={reasons[job.id] || ""}
                        onChange={(event) =>
                          setReasons({
                            ...reasons,
                            [job.id]: event.target.value,
                          })
                        }
                      />
                    </label>
                    <button className="secondary">Retry failed job</button>
                  </fieldset>
                </form>
              )}
            </article>
          ))}
        </DataRegion>
      )}
      <section className="mw-utility-create" aria-label="Request a report">
        <h3>Request a report</h3>
        <p>
          A queued report is not a completed download. Downloads appear when
          processing finishes.
        </p>
        {pending && (
          <div role="status" className="mw-note">
            <strong>Export request unconfirmed</strong>
            <p>
              The original business date and request are retained. Retry that
              submission without choosing a new date.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={disabled || working}
              onClick={() => void create(pending)}
            >
              Retry original export request
            </button>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (
              pendingRef.current ||
              deniedRef.current ||
              inFlight.current ||
              readError ||
              loading ||
              disabled
            )
              return;
            const form = event.currentTarget;
            const input = form.elements.namedItem(
              "businessDate",
            ) as HTMLInputElement | null;
            const businessDate = input?.value || "";
            if (!form.reportValidity() || !validBusinessDate(businessDate)) {
              setWriteError(
                "Choose a valid business date before requesting a report.",
              );
              return;
            }
            setDate(businessDate);
            void create({ date: businessDate, requestKey: uuid() });
          }}
        >
          <fieldset
            disabled={
              disabled || working || loading || !!readError || !!pending
            }
            className="mw-utility-form"
          >
            <label>
              Business date
              <input
                type="date"
                name="businessDate"
                required
                value={date}
                onInput={(event) => setDate(event.currentTarget.value)}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <button className="primary">Queue report export</button>
          </fieldset>
        </form>
      </section>
    </section>
  );
}
