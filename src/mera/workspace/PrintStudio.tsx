import { Sparkles } from "lucide-react";
import UnitInput from "../ui/UnitInput";
import Segmented from "../ui/Segmented";
import Switch from "../ui/Switch";
import ReasonInput from "../ui/ReasonInput";
import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
import { uuid } from "../../api";
import {
  readPrintStudioMarker,
  savePrintStudioMarker,
  clearPrintStudioMarker,
  type PrintStudioMarker,
} from "./printStudioJournal";
import { Disclosure, DataRegion } from "../ui/OperationalPrimitives";
import PrintDocument, { printDocumentHtml } from "./PrintDocument";
type Props = {
  base: string;
  actorId: string;
  disabled: boolean;
  canViewJobs: boolean;
  canReprint: boolean;
  branchName?: string;
  timeZone?: string;
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
  return (
    <ScopedPrintStudio key={props.base + "|" + props.actorId} {...props} />
  );
}
function ScopedPrintStudio({
  base,
  actorId,
  disabled,
  canViewJobs,
  canReprint,
  branchName,
  timeZone,
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
    [limit, setLimit] = useState(20),
    [dirty, setDirty] = useState(false),
    [denied, setDenied] = useState(false),
    [marker, setMarker] = useState<PrintStudioMarker | null>(null),
    [recoveryReady, setRecoveryReady] = useState(false),
    [notice, setNotice] = useState("");
  const savedTemplateRef = useRef<any>(null);
  const markerRef = useRef<PrintStudioMarker | null>(null),
    originalRef = useRef<{ path: string; method: string; body: any } | null>(
      null,
    );
  const frame = useRef<HTMLIFrameElement>(null),
    active = useRef(true),
    formatsGeneration = useRef(0),
    jobsGeneration = useRef(0),
    inFlight = useRef(false),
    dirtyRef = useRef(false),
    unknownFormatRef = useRef<any>(null),
    unknownReprintRef = useRef(false),
    deniedRef = useRef(false),
    permissions = useRef({ canViewJobs, canReprint });
  permissions.current = { canViewJobs, canReprint };
  function editTemplates(value: any) {
    if (
      markerRef.current ||
      inFlight.current ||
      deniedRef.current ||
      !recoveryReady
    )
      return;
    dirtyRef.current = true;
    setDirty(true);
    setTemplates(value);
  }
  function deny() {
    savedTemplateRef.current = null;
    originalRef.current = null;
    deniedRef.current = true;
    formatsGeneration.current++;
    jobsGeneration.current++;
    setDenied(true);
    setTemplates(null);
    setJobs([]);
    setReason("");
    setSavedReview(null);
    setFormatUnknown(null);
    unknownFormatRef.current = null;
    setReprintUnknown(false);
    unknownReprintRef.current = false;
    dirtyRef.current = false;
    setDirty(false);
    setFormatError("");
    setJobsError("");
    setWriteError("");
    setFormatLoading(false);
    setJobsLoading(false);
  }
  function jobDate(value: unknown) {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      !Number.isFinite(Date.parse(value))
    )
      return "Time unavailable";
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
        /* Invalid branch zone uses a labelled device clock. */
      }
    }
    return (
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value)) + " · Device time"
    );
  }
  const readTemplates = async (signal?: AbortSignal) => {
    if (deniedRef.current) return;
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
        deniedRef.current ||
        signal?.aborted ||
        version !== formatsGeneration.current
      )
        return;
      if (!validTemplate(result)) throw new Error("Invalid format response");
      savedTemplateRef.current = result;
      if (!unknownFormatRef.current && !dirtyRef.current) setTemplates(result);
      else setSavedReview(result);
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === formatsGeneration.current &&
        failure.name !== "AbortError"
      ) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else setFormatError("Saved formats could not be loaded. Try again.");
      }
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
    if (!permissions.current.canViewJobs || deniedRef.current) return;
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
        deniedRef.current ||
        !permissions.current.canViewJobs ||
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
      ) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else if (permissions.current.canViewJobs)
          setJobsError("Print jobs could not be loaded. Try again.");
      }
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
    try {
      const saved = readPrintStudioMarker(actorId, base);
      markerRef.current = saved;
      setMarker(saved);
      setRecoveryReady(true);
      if (saved?.operation === "template_save") {
        unknownFormatRef.current = true;
        setFormatUnknown(true);
      }
      if (saved?.operation === "reprint") {
        unknownReprintRef.current = true;
        setReprintUnknown(true);
      }
    } catch {
      setWriteError(
        "Saved print-request references could not be read. Keep this tab open and ask a supervisor to review them.",
      );
    }
    const controller = new AbortController();
    void readTemplates(controller.signal);
    return () => {
      active.current = false;
      originalRef.current = null;
      formatsGeneration.current++;
      jobsGeneration.current++;
      controller.abort();
    };
  }, [base]);
  useEffect(() => {
    const controller = new AbortController();
    if (canViewJobs) void readJobs(controller.signal);
    else {
      jobsGeneration.current++;
      setJobs([]);
      setJobsError("");
      setJobsLoading(false);
      setReason("");
    }
    const timer = setInterval(() => {
      if (
        permissions.current.canViewJobs &&
        !deniedRef.current &&
        !document.hidden
      )
        void readJobs(controller.signal, true);
    }, 2500);
    return () => {
      jobsGeneration.current++;
      controller.abort();
      clearInterval(timer);
    };
  }, [base, canViewJobs]);
  useEffect(() => {
    if (!canReprint || !canViewJobs) {
      setReason("");
      if (markerRef.current?.operation === "reprint") {
        originalRef.current = null;
        setWriteError("");
      }
    }
  }, [canReprint, canViewJobs]);
  const canRecover = (m: PrintStudioMarker) =>
    m.operation === "template_save" ||
    (permissions.current.canViewJobs && permissions.current.canReprint);
  const proofPath = (m: PrintStudioMarker) =>
    base +
    (m.operation === "template_save"
      ? `/templates/save-attempts/${m.requestKey}`
      : `/print-jobs/${encodeURIComponent(m.targetId!)}/reprint-attempts/${m.requestKey}`);
  const normalize = (operation: string, body: any) =>
    operation === "reprint"
      ? { reason: body?.reason?.trim() }
      : {
          receipt: {
            businessName: body?.receipt?.businessName,
            footer: body?.receipt?.footer,
            showStaff: body?.receipt?.showStaff,
            paperWidth: body?.receipt?.paperWidth,
          },
          label: { width: body?.label?.width, height: body?.label?.height },
        };
  function proof(result: any, m: PrintStudioMarker) {
    const parts = base.split("/");
    if (
      !result ||
      result.requestKey !== m.requestKey ||
      result.actorId !== actorId ||
      result.organizationId !== parts[2] ||
      result.branchId !== parts[4] ||
      result.operation !== m.operation ||
      result.targetId !== m.targetId ||
      !["recorded", "not_found", "abandoned"].includes(result.status)
    )
      throw Error(
        "The print-request outcome could not be verified. Keep the saved reference and check again.",
      );
    if (result.status === "recorded") {
      const op = result.operationRecord,
        r = result.result;
      if (
        result.resultBasis !== "recorded_operation_snapshot" ||
        typeof op?.id !== "string" ||
        !op.id.trim() ||
        op.requestKey !== m.requestKey ||
        op.actorId !== actorId ||
        op.operation !== m.operation ||
        op.targetId !== m.targetId ||
        (m.operation === "template_save"
          ? !validTemplate(r) ||
            typeof r.id !== "string" ||
            !r.id.trim() ||
            !Number.isSafeInteger(r.version) ||
            r.version < 1
          : typeof r?.id !== "string" ||
            !r.id.trim() ||
            r.id === m.targetId ||
            r.originalJobId !== m.targetId ||
            r.status !== "queued" ||
            r.duplicate !== true ||
            r.physicalConfirmed !== false)
      )
        throw Error("The recorded print request could not be verified.");
      if (
        originalRef.current &&
        JSON.stringify(normalize(m.operation, originalRef.current.body)) !==
          JSON.stringify(normalize(m.operation, op.intent))
      )
        throw Error(
          "The recorded request differs from the original print request. Ask a supervisor to review it.",
        );
    }
    if (
      result.status === "abandoned" &&
      (typeof result.resolutionId !== "string" || !result.resolutionId.trim())
    )
      throw Error("The stopped print request could not be verified.");
    return result;
  }
  async function checkOutcome(m: PrintStudioMarker) {
    const result = proof(
      await workspaceApi(proofPath(m), "GET", undefined, undefined, {
        expectedActorId: actorId,
      }),
      m,
    );
    if (!active.current || deniedRef.current || !canRecover(m)) return;
    if (result.status === "not_found") {
      setNotice(
        "No completed request was found. This does not confirm that an in-flight request has stopped. Retry the original request or stop it before making a new one.",
      );
      return;
    }
    clearPrintStudioMarker(m);
    markerRef.current = null;
    originalRef.current = null;
    setMarker(null);
    unknownFormatRef.current = null;
    setFormatUnknown(null);
    unknownReprintRef.current = false;
    setReprintUnknown(false);
    if (m.operation === "template_save") {
      if (result.status === "recorded") {
        savedTemplateRef.current = result.result;
        setTemplates(result.result);
        dirtyRef.current = false;
        setDirty(false);
        setSavedReview(null);
      }
      await readTemplates();
    } else {
      setReason("");
      await readJobs();
    }
    if (active.current && !deniedRef.current)
      setNotice(
        result.status === "recorded"
          ? m.operation === "template_save"
            ? "The original format save was recorded. Review the latest saved format before editing again."
            : "The original duplicate request was recorded once. Check the queue for its current status; physical printing is still unconfirmed."
          : "The original print request is stopped. It cannot be applied later. Review the current records before making a new request.",
      );
  }
  async function perform(
    operation: "template_save" | "reprint",
    targetId: string | null,
    body: any,
    retry = false,
  ) {
    if (
      disabled ||
      inFlight.current ||
      deniedRef.current ||
      !recoveryReady ||
      (!retry && markerRef.current) ||
      (operation === "reprint" &&
        (!permissions.current.canReprint || !permissions.current.canViewJobs))
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setWriteError("");
    setNotice("");
    setWriteTarget(operation === "template_save" ? "formats" : "jobs");
    try {
      let current = markerRef.current,
        original = originalRef.current;
      if (!retry) {
        body = { ...JSON.parse(JSON.stringify(body)), requestKey: uuid() };
        try {
          current = savePrintStudioMarker({
            version: 1,
            actorId,
            base,
            operation,
            targetId,
            requestKey: body.requestKey,
          });
        } catch {
          setRecoveryReady(false);
          throw Error(
            "This tab could not save a recovery reference. No print request was sent. Reload and review saved references before continuing.",
          );
        }
        markerRef.current = current;
        setMarker(current);
        original = {
          path:
            base +
            (operation === "template_save"
              ? "/templates"
              : `/print-jobs/${targetId}/reprint`),
          method: operation === "template_save" ? "PUT" : "POST",
          body,
        };
        originalRef.current = original;
        if (operation === "template_save") {
          unknownFormatRef.current = body;
          setFormatUnknown(body);
        } else {
          unknownReprintRef.current = true;
          setReprintUnknown(true);
        }
      }
      if (!current || !original || !canRecover(current)) return;
      await save(
        original.path,
        original.method,
        original.body,
        "Print request received; checking its recorded outcome.",
      );
      if (active.current && !deniedRef.current && canRecover(current))
        await checkOutcome(current);
    } catch (failure: any) {
      if (active.current && !deniedRef.current) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else if (
          operation === "template_save" ||
          (permissions.current.canViewJobs && permissions.current.canReprint)
        )
          setWriteError(
            failure.message || "The print request could not be confirmed.",
          );
      }
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  const saveFormat = () => {
    if (!validTemplate(templates)) return;
    return perform(
      "template_save",
      null,
      normalize("template_save", templates),
    );
  };
  const reprint = (job: any) => {
    if (reason.trim().length < 3) return;
    return perform("reprint", job.id, { reason });
  };
  async function recover(stop = false) {
    const m = markerRef.current;
    if (
      !m ||
      disabled ||
      inFlight.current ||
      deniedRef.current ||
      !recoveryReady ||
      !canRecover(m)
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setWriteError("");
    setNotice("");
    setWriteTarget(m.operation === "template_save" ? "formats" : "jobs");
    try {
      if (stop)
        proof(
          await workspaceApi(
            proofPath(m) + "/abandon",
            "POST",
            {
              reason: "Staff explicitly stopped the unresolved print request.",
            },
            undefined,
            { expectedActorId: actorId },
          ),
          m,
        );
      if (active.current && !deniedRef.current && canRecover(m))
        await checkOutcome(m);
    } catch (failure: any) {
      if (active.current && !deniedRef.current) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else if (canRecover(m))
          setWriteError(
            failure.message || "The print request could not be checked.",
          );
      }
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (denied)
    return (
      <section className="mw-card">
        <h2>Receipts & stickers</h2>
        <p role="alert">
          Print access needs checking. Refresh the workspace or sign in again
          before continuing.
        </p>
      </section>
    );
  let sample = "";
  const sampleError =
    templates && !validTemplate(templates)
      ? "Enter valid paper dimensions to preview this layout."
      : "";
  if (templates && !sampleError) {
    const common = {
      businessName: templates.receipt.businessName,
      branchName: branchName
        ? branchName + " · Layout preview"
        : "Layout preview",
      reference: "SAMPLE",
      currency: "NGN",
      branch: { timezone: timeZone || null },
      context: { fulfillment: "counter_pickup", tableName: null },
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
              pricing: {
                subtotal: 100000,
                discount: 0,
                serviceCharge: 0,
                tax: 0,
                lines: [],
              },
              paymentSummary: {
                appliedPaid: 0,
                lifetimeCollected: 0,
                refunded: 0,
                methodBreakdownStatus: "unavailable",
              },
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
    <div className="mw-printing-qr mps-studio">
      {(marker || !recoveryReady) && (
        <section className="mw-card" aria-label="Print request recovery">
          <h2>Review the previous print request</h2>
          <p>
            A format save or duplicate request is not yet confirmed. Refreshing
            formats or jobs does not resolve it. This tab saves only a recovery
            reference, without the format, reason or document contents.
          </p>
          {writeError && <p role="alert">{writeError}</p>}
          {marker && (
            <div className="mw-actions">
              <button
                className="secondary"
                type="button"
                disabled={disabled || busy || !canRecover(marker)}
                onClick={() => void recover()}
              >
                Check print request outcome
              </button>
              {originalRef.current && canRecover(marker) && (
                <button
                  className="secondary"
                  type="button"
                  disabled={disabled || busy}
                  onClick={() =>
                    void perform(marker.operation, marker.targetId, {}, true)
                  }
                >
                  Retry original print request
                </button>
              )}
              <button
                className="secondary"
                type="button"
                disabled={disabled || busy || !canRecover(marker)}
                onClick={() => void recover(true)}
              >
                Stop original print request
              </button>
              {!canRecover(marker) && (
                <p>
                  The original account needs its print-queue and reprint access
                  restored to review this request.
                </p>
              )}
            </div>
          )}
        </section>
      )}
      {notice && (
        <p role="status" className="mw-note">
          {notice}
        </p>
      )}
      <section className="mps-editor" aria-label="Receipt and sticker studio">
        <header className="mps-banner">
          <span className="mps-banner-icon">
            <Sparkles size={24} aria-hidden="true" />
          </span>
          <div>
            <h2>Your brand, down to the last detail.</h2>
            <p>
              Design your customer receipt and product stickers. Saved templates
              apply to future print jobs.
            </p>
          </div>
        </header>
        {writeError &&
          !marker &&
          recoveryReady &&
          writeTarget === "formats" && <p role="alert">{writeError}</p>}
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
            <div className="mps-layout">
              <section className="mps-settings" aria-label="Template settings">
                <header className="mps-panel-heading">
                  <h3>Template settings</h3>
                  <span
                    className={`mps-badge ${dirty ? "mps-pending" : "mps-saved"}`}
                  >
                    {formatUnknown || marker?.operation === "template_save"
                      ? "Save unconfirmed"
                      : dirty
                        ? "Unsaved changes"
                        : "Saved"}
                  </span>
                </header>
                <div className="mw-print-format mps-settings-body">
                  {dirty && !formatUnknown && (
                    <p role="status">
                      Unsaved format changes. Refreshing saved formats will not
                      replace your draft.
                    </p>
                  )}
                  {dirty && !formatUnknown && (
                    <>
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
                          Latest saved heading:{" "}
                          {savedReview.receipt.businessName}. Your draft is
                          unchanged.
                        </p>
                      )}
                    </>
                  )}
                  {formatUnknown && (
                    <div className="mw-note" role="status">
                      <strong>Format save unconfirmed</strong>
                      <p>
                        Further edits are paused. Use the print-request recovery
                        controls to check, retry or stop the original save
                        before making a new one.
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
                          Latest saved heading:{" "}
                          {savedReview.receipt.businessName} · Version{" "}
                          {savedReview.version ?? "unavailable"}. Reading it
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
                      disabled={
                        disabled ||
                        busy ||
                        !!marker ||
                        !recoveryReady ||
                        !!formatUnknown
                      }
                      className="mw-print-format-fields"
                    >
                      <h4 className="mps-field-heading">Business details</h4>
                      <label>
                        Business heading
                        <input
                          required
                          maxLength={100}
                          value={templates.receipt.businessName}
                          onChange={(e) =>
                            editTemplates({
                              ...templates,
                              receipt: {
                                ...templates.receipt,
                                businessName: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <h4 className="mps-field-heading">
                        Receipt layout & content
                      </h4>
                      <Segmented
                        label="Receipt roll"
                        value={String(templates.receipt.paperWidth)}
                        onChange={(value) =>
                          editTemplates({
                            ...templates,
                            receipt: {
                              ...templates.receipt,
                              paperWidth: Number(value),
                            },
                          })
                        }
                        options={[
                          { value: "58", label: "58 mm" },
                          { value: "80", label: "80 mm" },
                        ]}
                      />
                      <label>
                        Footer
                        <textarea
                          maxLength={300}
                          value={templates.receipt.footer}
                          onChange={(e) =>
                            editTemplates({
                              ...templates,
                              receipt: {
                                ...templates.receipt,
                                footer: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <Switch
                        label="Show staff"
                        description="Include the staff member's name on receipts."
                        checked={templates.receipt.showStaff}
                        onChange={(value) =>
                          editTemplates({
                            ...templates,
                            receipt: { ...templates.receipt, showStaff: value },
                          })
                        }
                      />
                      <h4 className="mps-field-heading">Sticker stock</h4>
                      {(["width", "height"] as const).map((key) => (
                        <UnitInput
                          key={key}
                          label={`Sticker ${key} (mm)`}
                          unit="mm"
                          required
                          min={key === "width" ? 20 : 15}
                          max={key === "width" ? 60 : 150}
                          value={templates.label[key]}
                          onChange={(value) =>
                            editTemplates({
                              ...templates,
                              label: {
                                ...templates.label,
                                [key]: Number(value),
                              },
                            })
                          }
                          presets={(key === "width"
                            ? [40, 50, 60]
                            : [30, 50, 80]
                          ).map((value) => ({ value }))}
                        />
                      ))}
                      <div className="mw-wide mps-actions">
                        <button
                          className="primary"
                          disabled={disabled || !dirty}
                        >
                          {busy ? "Saving…" : "Save templates"}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={!dirty || !savedTemplateRef.current}
                          onClick={() => {
                            editTemplates(savedTemplateRef.current);
                            dirtyRef.current = false;
                            setDirty(false);
                            setSavedReview(null);
                          }}
                        >
                          Discard changes
                        </button>
                      </div>
                    </fieldset>
                  </form>
                </div>
              </section>
              <div className="mw-print-preview mps-preview">
                <header className="mps-preview-heading">
                  <span>Live preview</span>
                  <h3>
                    {preview === "receipt"
                      ? "The finishing touch."
                      : "A little label. A clear order."}
                  </h3>
                </header>
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
                {preview === "label" &&
                  !sampleError &&
                  (templates.label.width < 40 ||
                    templates.label.height < 30) && (
                    <p className="mw-print-note">
                      This small label may need more space; review all details
                      and test on the actual printer.
                    </p>
                  )}
                <div className="mps-preview-surface">
                  <iframe
                    title={
                      preview === "receipt"
                        ? "Receipt sample preview"
                        : "Sticker sample preview"
                    }
                    style={{
                      width: `min(100%, calc(${preview === "receipt" ? templates.receipt.paperWidth : templates.label.width}mm + 18px))`,
                    }}
                    ref={frame}
                    srcDoc={sample.replace(
                      "</head>",
                      `<style>@media screen { html { background: transparent; } body { max-width: calc(100% - 18px); font-family: "Courier New", monospace; } }</style></head>`,
                    )}
                    sandbox="allow-same-origin allow-modals"
                  />
                </div>
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
            </div>
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
        {canViewJobs &&
          canReprint &&
          writeError &&
          !marker &&
          recoveryReady &&
          writeTarget === "jobs" && <p role="alert">{writeError}</p>}
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
                  Use the print-request recovery controls before requesting
                  another duplicate. No repeat request is sent automatically. A
                  queued document does not confirm physical output.
                </p>
              </div>
            )}
            {canReprint && (
              <ReasonInput
                label="Reason for reprint"
                value={reason}
                minLength={3}
                maxLength={300}
                disabled={
                  disabled ||
                  busy ||
                  !!marker ||
                  !recoveryReady ||
                  reprintUnknown
                }
                onChange={setReason}
                presets={[
                  "Printer jammed",
                  "Customer asked for copy",
                  "Wrong details",
                ]}
              />
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
                          {(
                            {
                              queued: "Queued",
                              submitted: "Submission recorded",
                              processing: "Processing",
                              failed: "Needs attention",
                              cancelled: "Cancelled",
                              confirmed: "Device confirmed",
                            } as Record<string, string>
                          )[job.status] || "Status unavailable"}{" "}
                          ·{" "}
                          {job.physicalConfirmed === true
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
                            !!marker ||
                            !recoveryReady ||
                            reason.trim().length < 3
                          }
                          onClick={() => void reprint(job)}
                        >
                          Queue marked duplicate
                        </button>
                      )}
                    </header>
                    <p>{jobDate(job.createdAt)}</p>
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
