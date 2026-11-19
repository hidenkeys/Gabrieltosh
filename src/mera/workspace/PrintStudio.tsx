import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
import { Disclosure, DataRegion } from "../ui/OperationalPrimitives";
import PrintDocument, { printDocumentHtml } from "./PrintDocument";
type Props = {
  base: string;
  disabled: boolean;
  canViewJobs: boolean;
  canReprint: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
function validTemplate(value: any) {
  return (
    value &&
    typeof value.receipt?.businessName === "string" &&
    typeof value.receipt.footer === "string" &&
    typeof value.receipt.showStaff === "boolean" &&
    [58, 80].includes(value.receipt.paperWidth) &&
    Number.isFinite(value.label?.width) &&
    value.label.width >= 20 &&
    value.label.width <= 60 &&
    Number.isFinite(value.label?.height) &&
    value.label.height >= 15 &&
    value.label.height <= 150
  );
}
export default function PrintStudio(props: Props) {
  return <ScopedPrintStudio key={props.base} {...props} />;
}
function ScopedPrintStudio({
  base,
  disabled,
  canViewJobs,
  canReprint,
  save,
}: Props) {
  const [templates, setTemplates] = useState<any>(null),
    [jobs, setJobs] = useState<any[]>([]),
    [formatError, setFormatError] = useState(""),
    [jobsError, setJobsError] = useState(""),
    [writeError, setWriteError] = useState(""),
    [writeTarget, setWriteTarget] = useState("formats"),
    [formatLoading, setFormatLoading] = useState(true),
    [jobsLoading, setJobsLoading] = useState(canViewJobs),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState("receipt"),
    [formatUnknown, setFormatUnknown] = useState<any>(null),
    [savedReview, setSavedReview] = useState<any>(null),
    [reprintUnknown, setReprintUnknown] = useState(false),
    [limit, setLimit] = useState(20);
  const frame = useRef<HTMLIFrameElement>(null),
    active = useRef(true),
    formatsGeneration = useRef(0),
    jobsGeneration = useRef(0);
  const readTemplates = async (signal?: AbortSignal) => {
    const version = ++formatsGeneration.current;
    setFormatLoading(true);
    setFormatError("");
    try {
      const result = await workspaceApi(
        base + "/templates",
        "GET",
        undefined,
        signal,
      );
      if (
        !active.current ||
        signal?.aborted ||
        version !== formatsGeneration.current
      )
        return;
      if (!validTemplate(result)) throw new Error("Invalid format response");
      if (!formatUnknown) setTemplates(result);
      else setSavedReview(result);
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === formatsGeneration.current &&
        failure.name !== "AbortError"
      )
        setFormatError("Saved formats could not be loaded. Try again.");
    } finally {
      if (
        active.current &&
        !signal?.aborted &&
        version === formatsGeneration.current
      )
        setFormatLoading(false);
    }
  };
  const readJobs = async (signal?: AbortSignal, quiet = false) => {
    if (!canViewJobs) return;
    const version = ++jobsGeneration.current;
    if (!quiet) setJobsLoading(true);
    try {
      const result = await workspaceApi(
        base + "/print-jobs",
        "GET",
        undefined,
        signal,
      );
      if (
        !active.current ||
        signal?.aborted ||
        version !== jobsGeneration.current
      )
        return;
      const rows = Array.isArray(result) ? result : result?.jobs;
      if (
        !Array.isArray(rows) ||
        rows.some((row: any) => !row || typeof row.id !== "string")
      )
        throw new Error("Invalid queue response");
      setJobs(rows);
      setJobsError("");
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === jobsGeneration.current &&
        failure.name !== "AbortError"
      )
        setJobsError("Print jobs could not be loaded. Try again.");
    } finally {
      if (
        active.current &&
        !signal?.aborted &&
        version === jobsGeneration.current
      )
        setJobsLoading(false);
    }
  };
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void readTemplates(controller.signal);
    if (canViewJobs) void readJobs(controller.signal);
    const timer = setInterval(() => {
      if (canViewJobs) void readJobs(controller.signal, true);
    }, 2500);
    return () => {
      active.current = false;
      formatsGeneration.current++;
      jobsGeneration.current++;
      controller.abort();
      clearInterval(timer);
    };
  }, [base, canViewJobs]);
  const saveFormat = async () => {
    if (disabled || busy || formatUnknown || !templates) return;
    const body = JSON.parse(JSON.stringify(templates));
    setBusy(true);
    setWriteError("");
    setWriteTarget("formats");
    try {
      const result = await save(
        base + "/templates",
        "PUT",
        body,
        "Branch print templates saved.",
      );
      if (!active.current) return;
      if (validTemplate(result)) setTemplates(result);
    } catch (failure: any) {
      if (active.current) {
        setWriteError(failure.message);
        if (!failure.status || failure.status >= 500) setFormatUnknown(body);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const reprint = async (job: any) => {
    if (
      disabled ||
      busy ||
      reprintUnknown ||
      !canReprint ||
      reason.trim().length < 3
    )
      return;
    setBusy(true);
    setWriteError("");
    setWriteTarget("jobs");
    try {
      await save(
        base + `/print-jobs/${job.id}/reprint`,
        "POST",
        { reason },
        "Duplicate print job queued and audited.",
      );
      if (active.current) await readJobs();
    } catch (failure: any) {
      if (active.current) {
        setWriteError(failure.message);
        if (!failure.status || failure.status >= 500) setReprintUnknown(true);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  };
  let sample = "";
  const sampleError =
    templates && !validTemplate(templates)
      ? "Enter valid paper dimensions to preview this layout."
      : "";
  if (templates && !sampleError) {
    const common = {
      businessName: templates.receipt.businessName,
      branchName: "Layout preview",
      reference: "SAMPLE",
      currency: "NGN",
      customerName: "SAMPLE — NOT A SALE",
      staffName: "Sample staff",
      note: "Layout preview only. No payment recorded.",
    };
    sample = printDocumentHtml({
      kind: preview,
      documentSnapshot:
        preview === "receipt"
          ? {
              ...common,
              template: templates.receipt,
              items: [
                {
                  name: "Example drink",
                  quantity: 1,
                  total: 100000,
                  modifiers: [],
                },
              ],
              total: 100000,
              appliedPaid: 0,
            }
          : {
              ...common,
              template: templates.label,
              name: "Example drink",
              quantity: 1,
              unitIndex: 1,
              unitCount: 1,
              modifiers: [],
            },
    });
  }
  const sorted = [...jobs].sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
  );
  return (
    <div className="mw-printing-qr">
      <section className="mw-card">
        <header className="mw-print-heading">
          <div>
            <h2>Receipts & stickers</h2>
            <p>
              Preview your documents, adjust their format and review the queue.
            </p>
          </div>
        </header>
        {writeError && writeTarget === "formats" && (
          <p role="alert">{writeError}</p>
        )}
        {formatError && (
          <div role="alert">
            <p>{formatError}</p>
            <button
              type="button"
              className="secondary"
              disabled={busy || formatLoading}
              onClick={() => void readTemplates()}
            >
              Retry loading formats
            </button>
          </div>
        )}
        {formatLoading && !templates ? (
          <p role="status">Loading branch templates…</p>
        ) : !templates ? null : (
          <>
            <div className="mw-print-preview">
              <div className="mw-print-switch" aria-label="Document preview">
                <button
                  type="button"
                  aria-pressed={preview === "receipt"}
                  onClick={() => setPreview("receipt")}
                >
                  Receipt
                </button>
                <button
                  type="button"
                  aria-pressed={preview === "label"}
                  onClick={() => setPreview("label")}
                >
                  Sticker
                </button>
              </div>
              <p>
                Sample layout preview ·{" "}
                {preview === "receipt"
                  ? templates.receipt.paperWidth + " mm roll"
                  : templates.label.width +
                    " × " +
                    templates.label.height +
                    " mm sticker"}
              </p>
              {sampleError && <p role="alert">{sampleError}</p>}
              <iframe
                title={
                  preview === "receipt"
                    ? "Receipt sample preview"
                    : "Sticker sample preview"
                }
                ref={frame}
                srcDoc={sample}
                sandbox="allow-same-origin allow-modals"
              />
              <button
                type="button"
                disabled={!!sampleError}
                className="secondary"
                onClick={() => {
                  frame.current?.contentWindow?.focus();
                  frame.current?.contentWindow?.print();
                }}
              >
                Print sample through browser
              </button>
              <p className="mw-print-note">
                A browser dialog does not confirm physical printing.
              </p>
            </div>
            <Disclosure
              className="mw-print-format"
              summary="Edit receipt & sticker format"
            >
              {formatUnknown && (
                <div className="mw-note" role="status">
                  <strong>Format save unconfirmed</strong>
                  <p>
                    Your original format is retained and further edits are
                    paused. Ask an administrator to reconcile the saved format
                    before sending another update.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || formatLoading}
                    onClick={() => void readTemplates()}
                  >
                    Read latest saved format
                  </button>
                  {savedReview && (
                    <p>
                      Latest saved heading: {savedReview.receipt.businessName} ·
                      Version {savedReview.version ?? "unavailable"}. Reading it
                      does not cancel a delayed save.
                    </p>
                  )}
                </div>
              )}{" "}
              <form
                className="mw-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveFormat();
                }}
              >
                <fieldset
                  disabled={disabled || busy || !!formatUnknown}
                  className="mw-print-format-fields"
                >
                  <label>
                    Business heading
                    <input
                      required
                      maxLength={100}
                      value={templates.receipt.businessName}
                      onChange={(e) =>
                        setTemplates({
                          ...templates,
                          receipt: {
                            ...templates.receipt,
                            businessName: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Receipt roll
                    <select
                      value={templates.receipt.paperWidth}
                      onChange={(e) =>
                        setTemplates({
                          ...templates,
                          receipt: {
                            ...templates.receipt,
                            paperWidth: Number(e.target.value),
                          },
                        })
                      }
                    >
                      <option value="58">58 mm</option>
                      <option value="80">80 mm</option>
                    </select>
                  </label>
                  <label>
                    Footer
                    <textarea
                      maxLength={300}
                      value={templates.receipt.footer}
                      onChange={(e) =>
                        setTemplates({
                          ...templates,
                          receipt: {
                            ...templates.receipt,
                            footer: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Show staff
                    <select
                      value={String(templates.receipt.showStaff)}
                      onChange={(e) =>
                        setTemplates({
                          ...templates,
                          receipt: {
                            ...templates.receipt,
                            showStaff: e.target.value === "true",
                          },
                        })
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </label>
                  {(["width", "height"] as const).map((key) => (
                    <label key={key}>
                      Sticker {key} (mm)
                      <input
                        type="number"
                        required
                        min={key === "width" ? 20 : 15}
                        max={key === "width" ? 60 : 150}
                        value={templates.label[key]}
                        onChange={(e) =>
                          setTemplates({
                            ...templates,
                            label: {
                              ...templates.label,
                              [key]: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  <div className="mw-wide">
                    <button className="primary" disabled={disabled}>
                      Save templates
                    </button>
                  </div>
                </fieldset>
              </form>
            </Disclosure>
          </>
        )}
      </section>
      <section className="mw-card" aria-label="Branch print queue">
        <header className="mw-print-heading">
          <div>
            <h2>Print jobs</h2>
            <p>
              Queued documents and their reported status. Printing does not
              change preparation progress.
            </p>
          </div>
          {canViewJobs && (
            <button
              type="button"
              className="secondary"
              disabled={busy || jobsLoading}
              onClick={() => void readJobs()}
            >
              Refresh print jobs
            </button>
          )}
        </header>
        {writeError && writeTarget === "jobs" && (
          <p role="alert">{writeError}</p>
        )}
        {!canViewJobs ? (
          <p>Order access is required to view this branch’s print queue.</p>
        ) : jobsLoading ? (
          <p role="status">Loading print jobs…</p>
        ) : jobsError ? (
          <div role="alert">
            <p>{jobsError}</p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void readJobs()}
            >
              Retry loading print jobs
            </button>
          </div>
        ) : (
          <>
            {reprintUnknown && (
              <div role="status" className="mw-note">
                <strong>Duplicate request unconfirmed</strong>
                <p>
                  Check the refreshed queue with an administrator before
                  requesting another duplicate. No repeat request will be sent
                  automatically.
                </p>
              </div>
            )}
            {canReprint && (
              <label>
                Reason for reprint
                <input
                  value={reason}
                  minLength={3}
                  maxLength={300}
                  disabled={disabled || busy || reprintUnknown}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why is a duplicate needed?"
                />
              </label>
            )}
            {!jobs.length ? (
              <p>No print jobs in this branch.</p>
            ) : (
              <DataRegion
                label="Recent print jobs"
                className="mw-print-job-list"
              >
                {sorted.slice(0, limit).map((job) => (
                  <article className="mw-print-job" key={job.id}>
                    <header>
                      <div>
                        <h3>
                          {job.kind === "label"
                            ? "Sticker"
                            : job.kind === "receipt"
                              ? "Receipt"
                              : "Document"}{" "}
                          ·{" "}
                          {job.documentSnapshot?.reference ||
                            "Order reference unavailable"}
                        </h3>
                        <p>
                          {String(
                            job.status || "Status unavailable",
                          ).replaceAll("_", " ")}{" "}
                          ·{" "}
                          {job.physicalConfirmed
                            ? "Device-confirmed output"
                            : "Physical output unconfirmed"}
                          {job.duplicate ? " · Duplicate" : ""}
                        </p>
                      </div>
                      {canReprint && (
                        <button
                          type="button"
                          className="secondary"
                          disabled={
                            disabled ||
                            busy ||
                            reprintUnknown ||
                            reason.trim().length < 3
                          }
                          onClick={() => void reprint(job)}
                        >
                          Queue marked duplicate
                        </button>
                      )}
                    </header>
                    {job.documentSnapshot && (
                      <PrintDocument job={job} disabled={disabled} />
                    )}
                  </article>
                ))}
              </DataRegion>
            )}
            {jobs.length > limit && (
              <button
                type="button"
                className="secondary"
                onClick={() => setLimit((value) => value + 20)}
              >
                Show more print jobs
              </button>
            )}
          </>
        )}
        <Disclosure className="mw-print-limits" summary="Printing requirements">
          <p>
            Silent printing requires a tested local printer connection. Receipt
            and sticker calibration still need hardware testing.
          </p>
        </Disclosure>
      </section>
    </div>
  );
}
