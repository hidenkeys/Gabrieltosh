import { useRef } from "react";
import { Disclosure } from "../ui/OperationalPrimitives";
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const text = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value : fallback;
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
function savedTime(document: Record<string, any>) {
  if (
    typeof document.settledAt !== "string" ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(document.settledAt) ||
    !Number.isFinite(Date.parse(document.settledAt))
  )
    return "Time not recorded";
  const zone = object(document.branch) ? text(document.branch.timezone) : "";
  try {
    return (
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone || "UTC",
      }).format(new Date(document.settledAt)) +
      " · " +
      (zone || "UTC")
    );
  } catch {
    return "Time unavailable";
  }
}
/** Pure immutable-snapshot rendering. Never reads current menus, templates,
 * guest identity, printer settings, or the clock to fill historical gaps. */
export function printDocumentHtml(job: any): string {
  const document = job?.documentSnapshot;
  if (
    !object(document) ||
    !["receipt", "label"].includes(job?.kind) ||
    (job.documentVersion !== undefined && ![1, 2].includes(job.documentVersion))
  )
    throw Error("This job has no supported immutable document snapshot.");
  const label = job.kind === "label",
    template = object(document.template) ? document.template : {},
    width = label ? template.width : template.paperWidth,
    height = template.height;
  if (
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    (label
      ? width < 20 ||
        width > 60 ||
        typeof height !== "number" ||
        !Number.isFinite(height) ||
        height < 15 ||
        height > 150
      : ![58, 80].includes(width))
  )
    throw Error("Document paper dimensions are invalid.");
  const money = (value: unknown) => {
    if (
      !integer(value) ||
      typeof document.currency !== "string" ||
      !/^[A-Z]{3}$/.test(document.currency)
    )
      return "Amount unavailable";
    try {
      return escape(
        new Intl.NumberFormat("en-NG", {
          style: "currency",
          currency: document.currency,
        }).format(value / 100),
      );
    } catch {
      return "Amount unavailable";
    }
  };
  const row = (name: string, value: unknown) =>
    `<p class="amount-row"><span>${escape(name)}</span><strong>${money(value)}</strong></p>`;
  const context = object(document.context) ? document.context : null;
  const fulfillment: Record<string, string> = {
    counter_pickup: "Counter pickup",
    takeaway: "Takeaway",
    table_service: "Table service",
  };
  const service =
    context && fulfillment[context.fulfillment]
      ? `<p class="service">${escape(fulfillment[context.fulfillment])}${context.fulfillment === "table_service" ? ` · ${escape(text(context.tableName, "Table name not recorded"))}` : ""}</p>`
      : label
        ? ""
        : '<p class="muted">Pickup/table context not recorded</p>';
  const branch = object(document.branch) ? document.branch : null;
  const modifiers = (line: Record<string, any>) =>
    Array.isArray(line.modifiers)
      ? line.modifiers
          .filter(object)
          .map((item) => text(item.name))
          .filter(Boolean)
          .join(", ")
      : "";
  const strings = (value: unknown) =>
    Array.isArray(value)
      ? value
          .filter((item) => typeof item === "string" && item.trim())
          .join(", ")
      : "";
  const item = (value: unknown) => {
    if (!object(value)) return "<p>Item detail unavailable</p>";
    const options = modifiers(value),
      allergens = strings(value.allergens),
      dietary = strings(value.dietary);
    return `<section class="item"><p class="item-heading"><strong>${integer(value.quantity) && value.quantity >= 0 ? escape(value.quantity) : "Quantity unavailable"} × ${escape(text(value.name, "Item name unavailable"))}</strong>${text(value.size) ? `<span class="size">${escape(value.size)}</span>` : ""}</p>${!label ? row("Item value", value.total) : ""}${options ? `<p class="modifiers">${escape(options)}</p>` : ""}${allergens ? `<p class="allergens"><strong>Allergens:</strong> ${escape(allergens)}</p>` : ""}${dietary ? `<p class="dietary">Dietary: ${escape(dietary)}</p>` : ""}</section>`;
  };
  let pricing = "";
  if (!label) {
    if (object(document.pricing)) {
      const price = document.pricing,
        lines = Array.isArray(price.lines) ? price.lines.filter(object) : [];
      pricing =
        row("Subtotal", price.subtotal) +
        lines
          .map((line) => row(text(line.label, "Recorded charge"), line.amount))
          .join("");
      const has = (type: string) => lines.some((line) => line.type === type);
      if (!has("discount"))
        pricing += row(
          "Discount",
          integer(price.discount) && price.discount >= 0
            ? price.discount === 0
              ? 0
              : -price.discount
            : undefined,
        );
      if (!has("service_charge"))
        pricing += row("Service charge", price.serviceCharge);
      if (!has("tax")) pricing += row("Tax", price.tax);
    } else
      pricing = '<p class="muted">Tax and charge breakdown not recorded</p>';
  }
  const summary = object(document.paymentSummary)
    ? document.paymentSummary
    : null;
  const payment = label
    ? ""
    : `<section class="totals">${pricing}<hr>${row("Total", document.total)}${row("Applied payment", summary ? summary.appliedPaid : document.appliedPaid)}${row("Lifetime collected", summary ? summary.lifetimeCollected : document.lifetimeCollected)}${row("Recorded refunds", summary ? summary.refunded : document.refunded)}<p class="muted">Payment-method breakdown not recorded in this document.</p></section>`;
  const business = escape(
      text(document.businessName, "Business name unavailable"),
    ),
    reference = escape(text(document.reference, "Reference unavailable"));
  const brand = `<h1>${business}</h1>${text(document.branchName) ? `<p class="branch">${escape(document.branchName)}</p>` : label ? "" : "<p>Branch name unavailable</p>"}`;
  const identity = `<p class="reference">Reference: <strong>${reference}</strong></p>${job.duplicate === true ? '<p class="duplicate"><strong>DUPLICATE</strong></p>' : ""}`;
  const customer = text(document.customerName)
    ? `<p>Customer: ${escape(document.customerName)}</p>`
    : "";
  const notes = text(document.note)
    ? `<section class="notes"><strong>Order note</strong><p>${escape(document.note)}</p></section>`
    : "";
  const unit =
    integer(document.unitIndex) &&
    document.unitIndex > 0 &&
    integer(document.unitCount) &&
    document.unitCount > 0 &&
    document.unitIndex <= document.unitCount
      ? `Unit ${document.unitIndex} / ${document.unitCount}`
      : "Unit numbering not recorded";
  const receiptLines = Array.isArray(document.items)
    ? document.items.length
      ? document.items.map(item).join("")
      : "<p>No item lines in this saved document.</p>"
    : "<p>Item detail unavailable</p>";
  const staff =
    !label && template.showStaff === true
      ? `<p>Staff: ${escape(text(document.staffName, "Staff name not recorded"))}</p>`
      : "";
  const recordedBy =
    !label && text(document.recordedByName)
      ? `<p>Payment recorded by: ${escape(document.recordedByName)}</p>`
      : "";
  const footer =
    !label && text(template.footer)
      ? `<footer><p>${escape(template.footer)}</p></footer>`
      : "";
  const contacts =
    !label && branch
      ? `${text(branch.address) ? `<p>${escape(branch.address)}</p>` : ""}${text(branch.publicContact) ? `<p>${escape(branch.publicContact)}</p>` : ""}`
      : "";
  const content = label
    ? `${identity}${service}${item(document)}<p class="unit">${escape(unit)}</p>${customer}${notes}<footer>${brand}</footer>`
    : `<header>${brand}${contacts}${identity}${service}${customer}<p class="recorded-time">Recorded: ${escape(savedTime(document))}</p></header><hr>${receiptLines}${payment}${staff}${recordedBy}${notes}${footer}`;
  const compact = label && width < 40,
    padding = label ? (compact ? 1 : 2) : 3,
    font = label ? (compact ? 9 : 11) : 12;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${label ? "Sticker" : "Receipt"} ${reference}</title><style>@page{size:${width}mm ${label ? `${height}mm` : "auto"};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{width:${width}mm;padding:${padding}mm;font:${font}px/1.35 Arial,Helvetica,sans-serif;color:#111;background:#fff;overflow-wrap:anywhere;word-break:break-word}h1{font-size:${label ? (compact ? 10 : 12) : 16}px;line-height:1.2;margin:0 0 1mm}p{margin:${label ? "0.6" : "1.3"}mm 0;white-space:pre-wrap}hr{border:0;border-top:1px dashed #333;margin:2mm 0}.reference{font-size:${label ? (compact ? 10 : 13) : 14}px}.duplicate{border:1px solid #111;padding:0.5mm;font-weight:bold}.size{display:block}.item{margin-block:${label ? 1 : 2}mm;break-inside:${label ? "auto" : "avoid"}}.item-heading{margin-bottom:0.5mm}.modifiers,.allergens,.notes{white-space:pre-wrap}.amount-row{display:flex;justify-content:space-between;align-items:baseline;gap:2mm}.amount-row strong{font-variant-numeric:tabular-nums}.totals{border-top:1px dashed #333;padding-top:1mm}.muted,.recorded-time{font-size:${label ? font : 10}px}footer{margin-top:${label ? 1 : 3}mm;border-top:1px dashed #333;padding-top:1mm}.notes{margin-top:1.5mm}@media screen{html{background:#f8f7f4}body{margin:8px auto;outline:1px solid #e9e6e2}}@media print{body{margin:0;outline:0}}</style></head><body data-kind="${job.kind}" data-paper-width-mm="${width}"${label ? ` data-paper-height-mm="${height}"` : ""}>${content}</body></html>`;
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
  } catch (error) {
    return <p role="alert">{(error as Error).message}</p>;
  }
  const label = job.kind === "label",
    reference = text(job.documentSnapshot.reference, "Reference unavailable");
  return (
    <Disclosure
      summary={
        <>
          Preview {label ? "sticker" : "receipt"} · {reference}
        </>
      }
    >
      <p>
        Saved payment-time document. Opening the browser dialog does not confirm
        physical printing.
      </p>
      {label && (
        <p>
          All saved text is retained. Small labels may span pages; check the
          preview and calibrate the actual printer before use.
        </p>
      )}
      <iframe
        ref={frame}
        title={`${label ? "Sticker" : "Receipt"} ${reference}`}
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
    </Disclosure>
  );
}
