import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
const escape = (value: string) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export default function PrintStudio({
  base,
  disabled,
  canViewJobs,
  canReprint,
  save,
}: {
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
}) {
  const [templates, setTemplates] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    workspaceApi(base + "/templates", "GET", undefined, controller.signal)
      .then(setTemplates)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    const refresh = () =>
      workspaceApi(base + "/print-jobs", "GET", undefined, controller.signal)
        .then((response) =>
          setJobs(Array.isArray(response) ? response : response.jobs || []),
        )
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        });
    if (canViewJobs) void refresh();
    const timer = setInterval(() => {
      if (canViewJobs) void refresh();
    }, 2500);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [base, canViewJobs]);
  if (!templates)
    return (
      <section className="mw-card">
        <h2>Receipt & sticker studio</h2>
        <p role={error ? "alert" : "status"}>
          {error || "Loading branch templates…"}
        </p>
      </section>
    );
  const sample = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Receipt sample</title><style>@page{size:${templates.receipt.paperWidth}mm auto;margin:0}body{font:12px Arial;color:#111;width:${templates.receipt.paperWidth}mm;padding:4mm;box-sizing:border-box;margin:0}h1{font-size:18px;text-align:center}p{margin:8px 0}hr{border:0;border-top:1px dashed #333}</style><body><h1>${escape(templates.receipt.businessName)}</h1><p>SAMPLE — NOT A SALE</p><hr><p>Order #SAMPLE</p>${templates.receipt.showStaff ? "<p>Served by: sample staff</p>" : ""}<p>1 × Example drink <span style="float:right">₦1,000</span></p><hr><b>Total: ₦1,000</b><p>No payment recorded. Layout preview only.</p><p>${escape(templates.receipt.footer)}</p></body></html>`;
  return (
    <>
      <section className="mw-card">
        <h2>Receipt & sticker studio</h2>
        <p>
          Templates belong to this branch. Browser printing opens a dialog; no
          output is assumed physically printed.
        </p>
        <div className="mw-grid">
          <form
            className="mw-form"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              void save(
                base + "/templates",
                "PUT",
                templates,
                "Branch print templates saved.",
              ).catch((e) => setError(e.message));
            }}
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
                    receipt: { ...templates.receipt, footer: e.target.value },
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
          </form>
          <div>
            <iframe
              title="Receipt sample preview"
              ref={frame}
              srcDoc={sample}
              sandbox="allow-same-origin allow-modals"
              style={{
                width: "100%",
                height: 400,
                border: "1px solid #e9e6e2",
                borderRadius: 10,
                background: "white",
              }}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                frame.current?.contentWindow?.focus();
                frame.current?.contentWindow?.print();
              }}
            >
              Print sample through browser
            </button>
          </div>
        </div>
        {error && (
          <p className="mw-note mw-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="mw-card">
        <h2>Print jobs</h2>
        <p>
          Submission does not prove physical output. Original orders and
          preparation progress remain separate from printer state.
        </p>
        <label>
          Reason for reprint
          <input
            value={reason}
            minLength={3}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is a duplicate needed?"
          />
        </label>
        {jobs.length ? (
          jobs.map((job) => (
            <div className="mw-row" key={job.id}>
              <div>
                <b>
                  {job.kind} · {job.orderId?.slice(0, 8)}
                </b>
                <small>
                  {job.status} ·{" "}
                  {job.physicalConfirmed
                    ? "Device-confirmed output"
                    : "Physical output unconfirmed"}
                </small>
              </div>
              <button
                type="button"
                className="secondary"
                disabled={disabled || !canReprint || reason.trim().length < 3}
                onClick={() => {
                  setError("");
                  void save(
                    base + `/print-jobs/${job.id}/reprint`,
                    "POST",
                    { reason },
                    "Duplicate print job queued and audited.",
                  ).catch((e) => setError(e.message));
                }}
              >
                Queue marked duplicate
              </button>
            </div>
          ))
        ) : (
          <div className="mw-empty">No print jobs in this branch.</div>
        )}
        <div className="mw-note">
          Silent physical printing requires a verified local bridge or supported
          device integration. Hardware calibration remains a launch gate.
        </div>
      </section>
    </>
  );
}
