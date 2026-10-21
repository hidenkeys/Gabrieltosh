import { readFileSync } from "node:fs";
const receiptLogo =
  "data:image/png;base64," +
  readFileSync(
    new URL("../public/brand/brand-logo.png", import.meta.url),
  ).toString("base64");
import { money } from "./domain.js";
export const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function renderPrint(job) {
  const p = job.payload,
    t = p.template,
    e = escapeHtml;
  const base = `<meta charset="utf-8"><style>@page{margin:0;size:${job.kind === "receipt" ? t.paperWidth + "mm auto" : t.labelWidth + "mm " + t.labelHeight + "mm"}}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#000;margin:0;padding:3mm;width:${job.kind === "receipt" ? t.paperWidth : t.labelWidth}mm;font-size:10px}h1{font-size:${t.headingSize === "large" ? 20 : 15}px;margin:0}h2{font-size:16px;margin:5px 0}p{margin:4px 0}.head{text-align:${t.align}}hr{border:0;border-top:1px dashed #000}table{width:100%;font-size:10px;border-collapse:collapse}td{vertical-align:top;padding:4px 0}.right{text-align:right}.small{font-size:9px}footer{text-align:center;margin-top:12px}</style>`;
  if (job.kind === "label")
    return `<!doctype html><html><head>${base}</head><body><b>${e(t.businessName)} · #${p.orderNumber}</b><h2>${e(p.item.name)}</h2><p>${e(p.item.size)} · ${p.index}/${p.count}</p><p>${e(Object.values(p.item.options || {}).join(" · "))}</p><p>${e(p.item.toppings.map((x) => x.name).join(", "))}</p>${t.labelShowStaff ? "<p>" + e(p.staffName) + "</p>" : ""}</body></html>`;
  const o = p.order;
  return `<!doctype html><html><head>${base}</head><body><div class="head">${t.showLogo !== false ? `<img src="${receiptLogo}" alt="Bing Chun" style="height:18mm;width:auto;display:block;margin:0 ${t.align === "center" ? "auto" : "0"} 2mm;filter:grayscale(1)"/>` : ""}<h1>${e(t.businessName)}</h1><p>${e(t.subtitle)}</p><p>${e(t.address)}</p><p>${e(t.phone)}</p></div>${p.duplicate ? "<h2>DUPLICATE RECEIPT</h2>" : ""}<hr><h2>Order #${o.number}</h2><p>${e(new Date(o.paid_at || o.created_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" }))}</p>${t.showStaff ? "<p>Served by " + e(o.staff_name) + "</p>" : ""}<hr><table>${o.items.map((i) => `<tr><td>${i.quantity} × ${t.showCode ? e(i.code) + " " : ""}${e(i.name)}<br><span class="small">${e(i.size)}${t.showOptions ? "<br>" + e(Object.values(i.options || {}).join(" · ")) + "<br>" + e(i.toppings.map((x) => x.name).join(", ")) : ""}<br>Unit ${money(i.unitPrice)}</span></td><td class="right">${money(i.lineTotal)}</td></tr>`).join("")}</table><hr><p>Subtotal <span style="float:right">${money(o.subtotal)}</span></p>${o.discount ? '<p>Discount <span style="float:right">−' + money(o.discount) + "</span></p>" : ""}<h2>Total <span style="float:right">${money(o.total)}</span></h2>${t.showPayment ? "<p>Paid by " + e(o.payment_method) + "</p>" : ""}<footer>${e(t.footer)}</footer></body></html>`;
}
