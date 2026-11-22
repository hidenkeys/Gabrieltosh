import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
export const MERA_FORWARD_INBOX = "2cd7a3e7-fc63-4627-9672-fab561bab98b";
export const MERA_FORWARD_ADDRESS = "meratech@notify.zidihq.com";
export const MERA_FORWARD_RECIPIENT = "letimapro23@gmail.com";
export const MERA_FORWARD_WEBHOOK = "/api/mera/webhooks/resend-inbox";
const controls = /[\x00-\x1f\x7f]/;
const maxRetryAge = 23 * 60 * 60 * 1000;
const fail = (message, status) => Object.assign(new Error(message), { status });
const eventSchema = z.object({
  type: z.literal("inbox.email.received"),
  created_at: z.string().datetime(),
  data: z.object({
    source: z.literal("system"),
    inbox_id: z.string().uuid(),
    thread_id: z.string().uuid(),
    email_id: z.string().uuid(),
  }),
});
export async function migrateInboundForwarding(db) {
  await db.query(
    await readFile(
      new URL("./inbound-forwarding-schema.sql", import.meta.url),
      "utf8",
    ),
  );
}
export function verifyInboxWebhook(raw, headers, secret, now = Date.now()) {
  if (
    !Buffer.isBuffer(raw) ||
    raw.length > 256 * 1024 ||
    typeof secret !== "string" ||
    controls.test(secret) ||
    !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)
  )
    throw fail("Webhook verification unavailable.", 401);
  const id = headers["svix-id"],
    stamp = headers["svix-timestamp"],
    signature = headers["svix-signature"];
  if (
    typeof id !== "string" ||
    controls.test(id) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
    typeof stamp !== "string" ||
    controls.test(stamp) ||
    !/^\d{1,12}$/.test(stamp) ||
    Math.abs(now / 1000 - Number(stamp)) > 300 ||
    typeof signature !== "string" ||
    controls.test(signature) ||
    signature.length > 2048
  )
    throw fail("Invalid webhook signature.", 401);
  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length < 16) throw fail("Invalid webhook signature.", 401);
  const expected = createHmac("sha256", key)
    .update(id + "." + stamp + ".")
    .update(raw)
    .digest();
  const valid = signature.split(" ").some((value) => {
    const [version, encoded] = value.split(",");
    if (version !== "v1" || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
      return false;
    const candidate = Buffer.from(encoded, "base64");
    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  });
  if (!valid) throw fail("Invalid webhook signature.", 401);
  try {
    return { event: JSON.parse(raw.toString("utf8")), eventId: id };
  } catch {
    throw fail("Invalid webhook payload.", 400);
  }
}
export function inboundForwardingReady(env = process.env) {
  return (
    env.MERA_INBOUND_FORWARDING_ENABLED === "true" &&
    typeof env.RESEND_API_KEY === "string" &&
    !controls.test(env.RESEND_API_KEY) &&
    typeof env.RESEND_INBOX_WEBHOOK_SECRET === "string" &&
    !controls.test(env.RESEND_INBOX_WEBHOOK_SECRET) &&
    /^re_[A-Za-z0-9_-]{8,200}$/.test(env.RESEND_API_KEY || "") &&
    /^whsec_[A-Za-z0-9+/]+={0,2}$/.test(env.RESEND_INBOX_WEBHOOK_SECRET || "")
  );
}
export async function processInboxForward({
  db,
  event,
  eventId,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now,
}) {
  if (!inboundForwardingReady(env))
    throw fail("Inbox forwarding is not configured.", 503);
  // Outbound events are deliberately ignored, preventing forwarding our own send.
  if (event?.type !== "inbox.email.received") return { status: "ignored" };
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) throw fail("Invalid inbox event.", 400);
  const {
    inbox_id: inboxId,
    email_id: emailId,
    thread_id: threadId,
  } = parsed.data.data;
  if (inboxId !== MERA_FORWARD_INBOX) return { status: "ignored" };
  const claim = await db.transaction(async (c) => {
    await c.query(
      "INSERT INTO mera_inbound_forwards(inbox_id,email_id,thread_id,event_id) VALUES($1,$2,$3,$4) ON CONFLICT(inbox_id,email_id) DO NOTHING",
      [inboxId, emailId, threadId, eventId],
    );
    const row = (
      await c.query(
        "SELECT * FROM mera_inbound_forwards WHERE inbox_id=$1 AND email_id=$2 FOR UPDATE",
        [inboxId, emailId],
      )
    ).rows[0];
    if (row.thread_id !== threadId)
      throw fail("Inbox event conflicts with the original message.", 409);
    if (row.status === "accepted" || row.status === "review_required")
      return { row, send: false };
    if (
      row.first_attempt_at &&
      now() - new Date(row.first_attempt_at).getTime() >= maxRetryAge
    ) {
      await c.query(
        "UPDATE mera_inbound_forwards SET status='review_required',updated_at=CURRENT_TIMESTAMP WHERE inbox_id=$1 AND email_id=$2",
        [inboxId, emailId],
      );
      return { row: { ...row, status: "review_required" }, send: false };
    }
    if (
      row.status === "sending" &&
      row.attempted_at &&
      now() - new Date(row.attempted_at).getTime() < 30000
    )
      return { row, send: false };
    await c.query(
      "UPDATE mera_inbound_forwards SET status='sending',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,CURRENT_TIMESTAMP),attempted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE inbox_id=$1 AND email_id=$2",
      [inboxId, emailId],
    );
    return { row, send: true };
  });
  if (!claim.send) return { status: claim.row.status };
  const endpoint = `https://api.resend.com/inboxes/${inboxId}/threads/${threadId}/emails/${emailId}/forward`;
  const controller = new AbortController();
  let timer;
  let status = "unknown",
    providerId = null,
    httpStatus = null;
  const request = async () => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `mera-inbox-forward-v1:${inboxId}:${emailId}`,
      },
      body: JSON.stringify({ to: [MERA_FORWARD_RECIPIENT] }),
    });
    if (response.ok) {
      const result = await response.json();
      return {
        status: z.string().uuid().safeParse(result?.id).success
          ? "accepted"
          : "unknown",
        providerId: z.string().uuid().safeParse(result?.id).success
          ? result.id
          : null,
        httpStatus: response.status,
      };
    }
    try {
      await response.body?.cancel();
    } catch {
      /* No provider content retained. */
    }
    return {
      status:
        response.status >= 400 &&
        response.status < 500 &&
        ![408, 409, 429].includes(response.status)
          ? "rejected"
          : "unknown",
      providerId: null,
      httpStatus: response.status,
    };
  };
  try {
    const outcome = await Promise.race([
      request(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("timeout"));
        }, 8000);
      }),
    ]);
    ({ status, providerId, httpStatus } = outcome);
  } catch {
    /* Unknown transport/acknowledgement outcome; same-key recovery only. */
  } finally {
    clearTimeout(timer);
  }
  // An older uncertain request must never overwrite a later confirmed acceptance.
  await db.query(
    "UPDATE mera_inbound_forwards SET status=$3,provider_email_id=$4,last_http_status=$5,updated_at=CURRENT_TIMESTAMP WHERE inbox_id=$1 AND email_id=$2 AND status<>'accepted'",
    [inboxId, emailId, status, providerId, httpStatus],
  );
  const row = (
    await db.query(
      "SELECT status FROM mera_inbound_forwards WHERE inbox_id=$1 AND email_id=$2",
      [inboxId, emailId],
    )
  ).rows[0];
  return { status: row.status };
}
export function createInboxForwardingWebhook(db, options = {}) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    const env = options.env || process.env;
    if (!inboundForwardingReady(env))
      return res
        .status(503)
        .json({ error: "Inbox forwarding is not configured." });
    try {
      const verified = verifyInboxWebhook(
        req.body,
        req.headers,
        env.RESEND_INBOX_WEBHOOK_SECRET,
      );
      const result = await processInboxForward({
        db,
        ...verified,
        ...options,
        env,
      });
      if (["accepted", "ignored"].includes(result.status))
        return res.status(200).json({ received: true, status: result.status });
      return res.status(503).json({
        received: true,
        status: result.status,
        retryable: result.status !== "review_required",
      });
    } catch (error) {
      return res
        .status([400, 401, 409].includes(error.status) ? error.status : 503)
        .json({
          error:
            error.status === 401
              ? "Invalid webhook signature."
              : error.status === 400
                ? "Invalid inbox event."
                : "Forwarding outcome not confirmed.",
        });
    }
  };
}
