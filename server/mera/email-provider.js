// Provider acceptance is not delivery. Resend retains idempotency keys for 24h;
// callers must persist attempt state and must not blindly retry after that window.
const ENDPOINT = "https://api.resend.com/emails";
const CONTROLS = /[\x00-\x1f\x7f]/;
const EMAIL =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function mailbox(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    !CONTROLS.test(value) &&
    EMAIL.test(value) &&
    value.split("@")[0].length <= 64
  );
}
function sender(value) {
  if (mailbox(value)) return true;
  if (typeof value !== "string" || value.length > 350 || CONTROLS.test(value))
    return false;
  const match = /^([^<>"\\,;]+) <([^<>]+)>$/.exec(value);
  return !!match && !!match[1].trim() && mailbox(match[2]);
}
function allowedRecipients(env) {
  if (env.MERA_EMAIL_ALLOWED_RECIPIENTS === undefined) return null;
  if (
    typeof env.MERA_EMAIL_ALLOWED_RECIPIENTS !== "string" ||
    CONTROLS.test(env.MERA_EMAIL_ALLOWED_RECIPIENTS)
  )
    return [];
  return env.MERA_EMAIL_ALLOWED_RECIPIENTS.split(",").map((value) =>
    value.trim(),
  );
}
// Readiness confirms explicit transport configuration, not domain verification.
export function getEmailReadiness(env = process.env) {
  if (env.MERA_EMAIL_ENABLED !== "true")
    return { configured: false, reason: "disabled" };
  const allowed = allowedRecipients(env);
  if (
    allowed !== null &&
    (!allowed.length ||
      allowed.length > 50 ||
      allowed.some((value) => !mailbox(value)))
  )
    return { configured: false, reason: "invalid_recipient_allowlist" };
  if (!env.RESEND_API_KEY || !env.MERA_EMAIL_FROM || !env.MERA_PUBLIC_ORIGIN)
    return { configured: false, reason: "missing_configuration" };
  if (
    typeof env.RESEND_API_KEY !== "string" ||
    CONTROLS.test(env.RESEND_API_KEY) ||
    !/^re_[A-Za-z0-9_-]{8,200}$/.test(env.RESEND_API_KEY) ||
    !sender(env.MERA_EMAIL_FROM) ||
    (env.MERA_EMAIL_REPLY_TO !== undefined && !mailbox(env.MERA_EMAIL_REPLY_TO))
  )
    return { configured: false, reason: "invalid_configuration" };
  try {
    const origin = new URL(env.MERA_PUBLIC_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      CONTROLS.test(env.MERA_PUBLIC_ORIGIN) ||
      env.MERA_PUBLIC_ORIGIN.trim() !== env.MERA_PUBLIC_ORIGIN
    )
      throw new Error();
  } catch {
    return { configured: false, reason: "invalid_public_origin" };
  }
  return { configured: true, reason: "configured" };
}
function failure(code, outcome) {
  const error = new Error("Email provider request could not be confirmed.");
  error.code = code;
  error.outcome = outcome;
  return error;
}
export async function sendMeraEmail(
  input,
  { env = process.env, fetchImpl = globalThis.fetch } = {},
) {
  if (!getEmailReadiness(env).configured)
    throw failure("EMAIL_NOT_CONFIGURED", "not_sent");
  const { to, subject, text, html, idempotencyKey } = input || {};
  if (
    !mailbox(to) ||
    typeof subject !== "string" ||
    !subject.trim() ||
    subject.length > 200 ||
    CONTROLS.test(subject) ||
    typeof idempotencyKey !== "string" ||
    CONTROLS.test(idempotencyKey) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(idempotencyKey) ||
    ![text, html].some((v) => typeof v === "string" && v.trim()) ||
    [text, html].some(
      (v) =>
        v !== undefined &&
        (typeof v !== "string" ||
          Buffer.byteLength(v) > 256 * 1024 ||
          v.includes("\0")),
    )
  )
    throw failure("EMAIL_INVALID_INPUT", "not_sent");
  const allowed = allowedRecipients(env);
  if (
    allowed &&
    !allowed.some((value) => value.toLowerCase() === to.toLowerCase())
  )
    throw failure("EMAIL_RECIPIENT_NOT_ALLOWED", "not_sent");
  if (typeof fetchImpl !== "function")
    throw failure("EMAIL_UNAVAILABLE", "not_sent");
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(failure("EMAIL_TIMEOUT", "unknown"));
    }, 10000);
  });
  const request = async () => {
    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: env.MERA_EMAIL_FROM,
          to: [to],
          subject,
          ...(text !== undefined ? { text } : {}),
          ...(html !== undefined ? { html } : {}),
          ...(env.MERA_EMAIL_REPLY_TO
            ? { reply_to: env.MERA_EMAIL_REPLY_TO }
            : {}),
        }),
      });
    } catch {
      throw failure(
        controller.signal.aborted ? "EMAIL_TIMEOUT" : "EMAIL_NETWORK_ERROR",
        "unknown",
      );
    }
    if (!response?.ok) {
      try {
        await response?.body?.cancel();
      } catch {
        /* Never expose provider content. */
      }
      throw failure(
        "EMAIL_PROVIDER_REJECTED",
        response?.status >= 400 &&
          response.status < 500 &&
          response.status !== 408 &&
          response.status !== 409
          ? "rejected"
          : "unknown",
      );
    }
    let acknowledgement;
    try {
      acknowledgement = await response.json();
    } catch {
      throw failure("EMAIL_INVALID_ACK", "unknown");
    }
    if (
      !acknowledgement ||
      typeof acknowledgement.id !== "string" ||
      CONTROLS.test(acknowledgement.id) ||
      !UUID.test(acknowledgement.id)
    )
      throw failure("EMAIL_INVALID_ACK", "unknown");
    return { accepted: true, provider: "resend", id: acknowledgement.id };
  };
  try {
    return await Promise.race([request(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
