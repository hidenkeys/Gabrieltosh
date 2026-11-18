import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
import ReportDetails from "./ReportDetails";
export default function ReportExplorer({
  base,
  disabled,
}: {
  base: string;
  disabled: boolean;
}) {
  const [date, setDate] = useState(""),
    [selected, setSelected] = useState(""),
    [report, setReport] = useState<any>(null),
    [window, setWindow] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const version = ++generation.current;
    setReport(null);
    setWindow(null);
    setError("");
    if (!selected) return;
    const controller = new AbortController();
    setLoading(true);
    workspaceApi(
      base + "/workspace?date=" + encodeURIComponent(selected),
      "GET",
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (version !== generation.current) return;
        if (!data.report || typeof data.report !== "object")
          throw new Error("The selected date report is unavailable.");
        setReport(data.report);
        setWindow(data.reportWindow);
      })
      .catch((e) => {
        if (version === generation.current && e.name !== "AbortError")
          setError(e.message);
      })
      .finally(() => {
        if (version === generation.current) setLoading(false);
      });
    return () => {
      generation.current++;
      controller.abort();
    };
  }, [base, selected, revision]);
  return (
    <section className="mw-card">
      <h2>Browse a business date</h2>
      <p>
        Dates follow the branch timezone and trading-day cutoff. This report
        does not replace the current operational queue.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSelected(date);
          setRevision((value) => value + 1);
        }}
      >
        <label>
          Business date
          <input
            required
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <button disabled={disabled || loading}>Load date report</button>
      </form>
      {loading && <p role="status">Loading date report…</p>}
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <p>
            {window?.timezone ? `Branch timezone: ${window.timezone}. ` : ""}
            {window?.from ? `From ${window.from} ` : ""}
            {window?.to ? `until ${window.to}.` : ""}
          </p>
          <ReportDetails report={report} />
        </>
      )}
    </section>
  );
}
