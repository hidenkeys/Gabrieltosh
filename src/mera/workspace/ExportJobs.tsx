import React, { useEffect, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi } from "./api";
export default function ExportJobs({
  base,
  disabled,
  save,
}: {
  base: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const load = async () => {
    const result = await workspaceApi(base + "/jobs");
    setJobs(Array.isArray(result) ? result : result.jobs || []);
  };
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () =>
      workspaceApi(base + "/jobs", "GET", undefined, controller.signal)
        .then((result) => {
          setJobs(Array.isArray(result) ? result : result.jobs || []);
          setError("");
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [base]);
  return (
    <section className="mw-card">
      <h2>Report exports</h2>
      <p>
        Generate a branch-scoped report for a business date. Exports remain
        permission controlled; a queued job is not a completed download.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setWorking(true);
          setError("");
          try {
            await save(
              base + "/exports",
              "POST",
              { date, requestKey: uuid() },
              "Report export queued.",
            );
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setWorking(false);
          }
        }}
      >
        <div className="mw-form">
          <label>
            Business date
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button className="primary" disabled={disabled || working || loading}>
            Queue report export
          </button>
        </div>
      </form>
      {loading ? (
        <p role="status">Loading export jobs…</p>
      ) : !jobs.length ? (
        <p>No jobs for this branch.</p>
      ) : (
        jobs.map((job) => (
          <article className="mw-card" key={job.id}>
            <h3>
              {job.type?.replaceAll("_", " ")} · {job.status}
            </h3>
            <p>
              {new Date(job.createdAt).toLocaleString()} · {job.attempts || 0}{" "}
              attempts
            </p>
            {job.error && <p>{job.error}</p>}
            {job.status === "complete" && job.artifactId && (
              <a
                href={`/api/mera/v1${base}/exports/${encodeURIComponent(job.artifactId)}/download`}
                download
              >
                Download report CSV
              </a>
            )}
            {job.status === "failed" && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setWorking(true);
                  setError("");
                  try {
                    await save(
                      base + "/jobs/" + job.id + "/retry",
                      "POST",
                      { reason: reasons[job.id] },
                      "Job retry queued.",
                    );
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                <label>
                  Retry reason
                  <input
                    minLength={3}
                    maxLength={300}
                    required
                    value={reasons[job.id] || ""}
                    onChange={(e) =>
                      setReasons({ ...reasons, [job.id]: e.target.value })
                    }
                  />
                </label>
                <button disabled={disabled || working}>Retry failed job</button>
              </form>
            )}
          </article>
        ))
      )}
    </section>
  );
}
