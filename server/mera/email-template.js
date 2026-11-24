// One branded layout for every email Mera sends. Returns matching HTML and plain text.
// Table layout and inline styles only: email clients ignore <style> blocks and modern CSS.
const C = {
  ink: "#152b24",
  muted: "#56635c",
  forest: "#153f32",
  paper: "#f7f6f0",
  white: "#ffffff",
  lime: "#d9eb92",
  border: "#d8ded6",
};
const FONT = "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";

export function escapeEmailHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}

function safeUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error("Email links must use http or https.");
  return parsed.toString();
}

/**
 * @param {object} input
 * @param {string} input.title        Main heading.
 * @param {string} [input.preheader]  Inbox preview line.
 * @param {string} [input.eyebrow]    Small label above the heading.
 * @param {string[]} [input.paragraphs]
 * @param {{label: string, url: string}} [input.action]  Primary button.
 * @param {{label: string, value: string}[]} [input.details]  Key/value rows.
 * @param {string} [input.note]       Small print under the card content.
 */
export function renderMeraEmail({
  title,
  preheader = "",
  eyebrow = "",
  paragraphs = [],
  action,
  details = [],
  note = "",
}) {
  if (!title) throw new Error("Email title is required.");
  const e = escapeEmailHtml;
  const url = action ? safeUrl(action.url) : null;
  const p = (text, extra = "") =>
    `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:24px;color:${C.ink};${extra}">${e(text)}</p>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${e(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper};">${e(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px;">
<span style="font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:6px;color:${C.ink};">MERA</span>
</td></tr>
<tr><td style="background:${C.white};border:1px solid ${C.border};border-radius:16px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="height:6px;background:${C.lime};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 8px;">
${eyebrow ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted};">${e(eyebrow)}</p>` : ""}
<h1 style="margin:0 0 20px;font-family:${FONT};font-size:26px;line-height:32px;font-weight:800;color:${C.forest};">${e(title)}</h1>
${paragraphs.map((t) => p(t)).join("\n")}
${
  details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;border:1px solid ${C.border};border-radius:12px;">
${details
  .map(
    (d, i) =>
      `<tr><td style="padding:12px 16px;font-family:${FONT};font-size:14px;color:${C.muted};${i ? `border-top:1px solid ${C.border};` : ""}">${e(d.label)}</td><td align="right" style="padding:12px 16px;font-family:${FONT};font-size:14px;font-weight:600;color:${C.ink};${i ? `border-top:1px solid ${C.border};` : ""}">${e(d.value)}</td></tr>`,
  )
  .join("\n")}
</table>`
    : ""
}
${
  url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td style="border-radius:10px;background:${C.forest};">
<a href="${e(url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:${C.white};text-decoration:none;border-radius:10px;">${e(action.label)}</a>
</td></tr></table>
<p style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">Button not working? Copy this link into your browser:</p>
<p style="margin:0 0 24px;font-family:${FONT};font-size:13px;line-height:20px;word-break:break-all;"><a href="${e(url)}" style="color:${C.forest};">${e(url)}</a></p>`
    : ""
}
</td></tr>
${note ? `<tr><td style="padding:0 32px 28px;"><p style="margin:0;padding-top:16px;border-top:1px solid ${C.border};font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">${e(note)}</p></td></tr>` : ""}
</table>
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
Sent by Mera, ordering and service for restaurants, lounges and clubs.<br>You received this because of activity on your Mera account.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    "MERA",
    "",
    title,
    "",
    ...paragraphs.flatMap((t) => [t, ""]),
    ...details.map((d) => `${d.label}: ${d.value}`),
    ...(details.length ? [""] : []),
    ...(url ? [`${action.label}: ${url}`, ""] : []),
    ...(note ? [note, ""] : []),
    "Sent by Mera, ordering and service for restaurants, lounges and clubs.",
  ].join("\n");

  return { html, text };
}
