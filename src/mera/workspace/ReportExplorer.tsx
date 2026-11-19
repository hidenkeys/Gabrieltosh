import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
import { ReadState } from "../ui/OperationalPrimitives";
import ReportDetails, {
  businessDateLabel,
  validBusinessDate,
} from "./ReportDetails";
type Props = {
  base: string;
  disabled: boolean;
  initialDate?: string;
  onExportDate?: (date: string) => void;
};
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function windowTimes(value: unknown) {
  if (
    !object(value) ||
    typeof value.timezone !== "string" ||
    typeof value.from !== "string" ||
    typeof value.to !== "string" ||
    !Number.isFinite(Date.parse(value.from)) ||
    !Number.isFinite(Date.parse(value.to)) ||
    Date.parse(value.from) >= Date.parse(value.to)
  )
    return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: value.timezone,
    });
    return {
      from: formatter.format(new Date(value.from)),
      to: formatter.format(new Date(value.to)),
      timezone: value.timezone,
    };
  } catch {
    return null;
  }
}
export default function ReportExplorer(props: Props) {
  return <ScopedReportExplorer key={props.base} {...props} />;
}
function ScopedReportExplorer({
  base,
  disabled,
  initialDate = "",
  onExportDate,
}: Props) {
  const [date, setDate] = useState(
      validBusinessDate(initialDate) ? initialDate : "",
    ),
    [selected, setSelected] = useState(""),
    [report, setReport] = useState<any>(null),
    [reportWindow, setReportWindow] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const generation = useRef(0),
    errorRef = useRef<HTMLDivElement>(null),
    headingRef = useRef<HTMLHeadingElement>(null),
    requested = useRef(false);
  useEffect(() => {
    const current = ++generation.current;
    setReport(null);
    setReportWindow(null);
    setError("");
    if (!selected) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    workspaceApi<any>(
      base + "/workspace?date=" + encodeURIComponent(selected),
      "GET",
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted || current !== generation.current) return;
        if (!object(data.report))
          throw Error("The selected date report is unavailable.");
        if (data.report.date !== selected)
          throw Error(
            "The service returned a different trading day. Reload the selected date before using these totals.",
          );
        const match = /^\/organizations\/([^/]+)\/branches\/([^/]+)$/.exec(
          base,
        );
        if (
          (data.branch?.id && match && data.branch.id !== match[2]) ||
          (data.organization?.id && match && data.organization.id !== match[1])
        )
          throw Error(
            "The service returned another branch. Its report is not shown.",
          );
        setReport(data.report);
        setReportWindow({
          ...data.reportWindow,
          timezone:
            data.reportWindow?.timezone ||
            data.branch?.timezone ||
            data.report?.metadata?.timezone,
        });
      })
      .catch((failure) => {
        if (current === generation.current && failure.name !== "AbortError") {
          setReport(null);
          setReportWindow(null);
          setError(failure.message);
        }
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current++;
      controller.abort();
    };
  }, [selected, revision]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (report && !loading && requested.current) headingRef.current?.focus();
  }, [report, loading]);
  function loadDate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || loading) return;
    const value = String(
      new FormData(event.currentTarget).get("businessDate") || "",
    );
    if (!validBusinessDate(value)) {
      setError(
        "Choose a real business date between 1 January 1900 and 31 December 2999.",
      );
      return;
    }
    setDate(value);
    setError("");
    setReport(null);
    setReportWindow(null);
    requested.current = true;
    setSelected(value);
    setRevision((value) => value + 1);
  }
  const period = windowTimes(reportWindow);
  return (
    <section className="mw-card mw-report-explorer">
      <header>
        <h2>Browse a business date</h2>
        <p>
          Select the branch’s trading day. Its timezone and cutoff determine the
          reporting period; this is separate from the current service queue.
        </p>
      </header>
      <form className="mw-date-report-form" onSubmit={loadDate}>
        <label>
          Business date
          <input
            name="businessDate"
            required
            type="date"
            min="1900-01-01"
            max="2999-12-31"
            value={date}
            onInput={(event) => setDate(event.currentTarget.value)}
            onChange={(event) => setDate(event.target.value)}
            onInvalid={(event) => {
              event.preventDefault();
              setError(
                "Choose a real business date between 1 January 1900 and 31 December 2999.",
              );
            }}
            aria-describedby="mw-report-date-hint"
          />
        </label>
        <button
          type="submit"
          className="primary"
          disabled={disabled || loading}
        >
          Load date report
        </button>
      </form>
      <p id="mw-report-date-hint" className="mw-note">
        Choose the business date you want to review. Loading or exporting a
        report does not create an order or payment.
      </p>
      {loading && (
        <ReadState
          kind="loading"
          title={`Loading ${businessDateLabel(selected)} report…`}
        />
      )}
      {error && (
        <div ref={errorRef} tabIndex={-1}>
          <ReadState
            kind="error"
            title={error}
            retry={
              validBusinessDate(selected)
                ? () => {
                    if (!disabled && !loading) {
                      setRevision((value) => value + 1);
                      requested.current = true;
                    }
                  }
                : undefined
            }
            retryLabel="Retry selected date"
            pending={disabled || loading}
          />
        </div>
      )}
      {!selected && !error && !loading && (
        <ReadState
          kind="empty"
          title="Choose a business date to see its report."
        />
      )}
      {report && !error && !loading && (
        <>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="mw-selected-report-heading"
          >
            Selected trading day: {businessDateLabel(selected)}
          </h3>
          {typeof reportWindow?.timezone === "string" &&
            reportWindow.timezone && (
              <p>Branch timezone: {reportWindow.timezone}.</p>
            )}
          {period ? (
            <div className="mw-report-window">
              <p>
                <strong>Trading period:</strong> {period.from} to {period.to} ·{" "}
                {period.timezone}
              </p>
              <p>
                The start time is included. The end time belongs to the next
                trading day.
              </p>
            </div>
          ) : (
            <ReadState
              kind="unavailable"
              title="Trading-day window unavailable"
            >
              <p>
                Check the branch timezone and cutoff before relying on time
                comparisons.
              </p>
            </ReadState>
          )}
          {onExportDate && report.date === selected && date === selected && (
            <button
              type="button"
              className="secondary"
              disabled={disabled}
              onClick={() => onExportDate(selected)}
            >
              Export this trading day
            </button>
          )}
          <ReportDetails report={report} />
        </>
      )}
    </section>
  );
}
