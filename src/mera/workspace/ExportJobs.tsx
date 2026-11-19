import React, { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi } from "./api";
import { DataRegion, Disclosure } from "../ui/OperationalPrimitives";
type Props = {
  base: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
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
function ScopedExports({ base, disabled, save }: Props) {
  const [jobs, setJobs] = useState<any[]>([]),
    [date, setDate] = useState(""),
    [readError, setReadError] = useState(""),
    [writeError, setWriteError] = useState(""),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [reasons, setReasons] = useState<Record<string, string>>({}),
    [pending, setPending] = useState<any>(null),
    [uncertainRetries, setUncertainRetries] = useState<Record<string, boolean>>(
      {},
    );
  const active = useRef(true),
    generation = useRef(0);
  const read = async (signal?: AbortSignal, quiet = false) => {
    const version = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const result = await workspaceApi(
        base + "/jobs",
        "GET",
        undefined,
        signal,
      );
      if (!active.current || signal?.aborted || version !== generation.current)
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
      )
        setReadError("Export jobs could not be loaded. Try again.");
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
      if (!document.hidden) void read(controller.signal, true);
    }, 5000);
    return () => {
      active.current = false;
      generation.current++;
      controller.abort();
      clearInterval(timer);
    };
  }, [base]);
  const create = async (body: any) => {
    if (disabled || working) return;
    setWorking(true);
    setWriteError("");
    try {
      await save(base + "/exports", "POST", body, "Report export queued.");
      if (!active.current) return;
      setPending(null);
      await read();
    } catch (failure: any) {
      if (active.current) {
        setWriteError(failure.message);
        if (pending || !failure.status || failure.status >= 500)
          setPending(body);
      }
    } finally {
      if (active.current) setWorking(false);
    }
  };
  const retry = async (job: any) => {
    if (disabled || working || uncertainRetries[job.id]) return;
    setWorking(true);
    setWriteError("");
    try {
      await save(
        base + "/jobs/" + job.id + "/retry",
        "POST",
        { reason: reasons[job.id] },
        "Job retry queued.",
      );
      if (active.current) await read();
    } catch (failure: any) {
      if (active.current) {
        setWriteError(failure.message);
        if (!failure.status || failure.status >= 500)
          setUncertainRetries((current) => ({ ...current, [job.id]: true }));
      }
    } finally {
      if (active.current) setWorking(false);
    }
  };
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
                {Number.isFinite(Date.parse(job.createdAt)) ? (
                  <time dateTime={job.createdAt}>
                    Requested {new Date(job.createdAt).toLocaleString()}
                  </time>
                ) : (
                  "Request time unavailable"
                )}{" "}
                ·{" "}
                {Number.isSafeInteger(job.attempts) && job.attempts >= 0
                  ? job.attempts + " attempts"
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
                    disabled={disabled || working || !!uncertainRetries[job.id]}
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
            if (pending || readError || loading || disabled || working) return;
            const form = event.currentTarget;
            const input = form.elements.namedItem(
              "businessDate",
            ) as HTMLInputElement | null;
            const businessDate = input?.value || "";
            if (
              !form.reportValidity() ||
              !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)
            ) {
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
