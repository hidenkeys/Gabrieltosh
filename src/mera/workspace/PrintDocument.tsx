import { useRef } from "react";
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
export function printDocumentHtml(job: any): string {
  const document = job.documentSnapshot;
  if (!document || !["receipt", "label"].includes(job.kind))
    throw new Error("This job has no supported immutable document snapshot.");
  const label = job.kind === "label";
  const width = Number(
    label ? document.template?.width : document.template?.paperWidth,
  );
  const height = Number(document.template?.height);
  if (
    !Number.isFinite(width) ||
    width < 20 ||
    width > 210 ||
    (label && (!Number.isFinite(height) || height < 10 || height > 300))
  )
    throw new Error("Document paper dimensions are invalid.");
  const money = (amount: number) =>
    escape(
      new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: document.currency || "NGN",
      }).format(Number(amount || 0) / 100),
    );
  const item = (line: any) =>
    `<p><strong>${escape(line.quantity)} × ${escape(line.name)} ${escape(line.size)}</strong>${label ? "" : ` · ${money(line.total)}`}<br>${escape(
      (line.modifiers || [])
        .map((modifier: any) => modifier.name)
        .filter(Boolean)
        .join(", "),
    )}${line.allergens?.length ? `<br>Allergens: ${escape(line.allergens.join(", "))}` : ""}</p>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(job.kind)} ${escape(document.reference)}</title><style>@page{size:${width}mm ${label ? `${height}mm` : "auto"};margin:0}*{box-sizing:border-box}body{width:${width}mm;margin:0;padding:3mm;font:12px Arial;color:#111;overflow-wrap:anywhere}h1{font-size:16px;margin:0 0 6px}p{margin:5px 0;white-space:pre-wrap}hr{border:0;border-top:1px dashed #333}</style><body><h1>${escape(document.businessName)}</h1><p>${escape(document.branchName)} · ${escape(document.reference)}</p>${job.duplicate ? "<strong>DUPLICATE</strong>" : ""}<p>${escape(document.customerName)}</p>${label ? item(document) + `<p>Unit ${escape(document.unitIndex)} / ${escape(document.unitCount)}</p>` : (document.items || []).map(item).join("") + `<hr><p><strong>Total ${money(document.total)}</strong></p><p>Applied payment ${money(document.appliedPaid)}</p>${document.template?.showStaff && document.staffName ? `<p>Staff: ${escape(document.staffName)}</p>` : ""}<p>${escape(document.template?.footer)}</p>`}<p>${escape(document.note)}</p></body></html>`;
}
export default function PrintDocument({
  job,
  disabled,
}: {
  job: any;
  disabled: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  let html = "";
  try {
    html = printDocumentHtml(job);
  } catch (error: any) {
    return <p role="alert">{error.message}</p>;
  }
  return (
    <details>
      <summary>
        Preview {job.kind} · {job.documentSnapshot.reference}
      </summary>
      <p>
        Saved payment-time document. Opening the browser dialog does not confirm
        printing.
      </p>
      <iframe
        ref={frame}
        title={`${job.kind} ${job.id}`}
        srcDoc={html}
        sandbox="allow-same-origin allow-modals"
        style={{ width: "100%", height: 300, border: 0 }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          frame.current?.contentWindow?.focus();
          frame.current?.contentWindow?.print();
        }}
      >
        Open browser print dialog
      </button>
    </details>
  );
}
