import { randomUUID, createHash, createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  getEmailReadiness,
  getEmailRecipientPolicy,
  isEmailRecipientAllowed,
  sendMeraEmail,
} from "./email-provider.js";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const fail = (message, status = 400, code = "IDENTITY_ERROR") =>
  Object.assign(new Error(message), { status, code });
export function providerIdentityReady(env = process.env) {
  return (
    env.MERA_OWNER_VERIFICATION_ENABLED === "true" &&
    typeof env.MERA_IDENTITY_TOKEN_SECRET === "string" &&
    env.MERA_IDENTITY_TOKEN_SECRET.length >= 32 &&
    ["public", "allowlist"].includes(getEmailRecipientPolicy(env).policy) &&
    getEmailReadiness(env).configured
  );
}
const registration = z
  .object({
    requestKey: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
const keySchema = z.object({ requestKey: z.string().uuid() }).strict();
const tokenFor = (id, env) =>
  createHmac("sha256", env.MERA_IDENTITY_TOKEN_SECRET)
    .update("mera-owner-provider-v1:" + id)
    .digest("hex");
const configHash = (env) =>
  hash(
    JSON.stringify([
      env.MERA_PUBLIC_ORIGIN,
      env.MERA_EMAIL_FROM,
      env.MERA_EMAIL_REPLY_TO || "",
    ]),
  );
function ack(row) {
  return {
    status: "verification_required",
    simulation: false,
    emailDelivery: row.delivery_status,
    expiresAt: new Date(row.expires_at).toISOString(),
    retryAllowed:
      (["pending", "unknown", "not_sent"].includes(row.delivery_status) ||
        (row.delivery_status === "sending" &&
          row.attempted_at &&
          Date.now() - new Date(row.attempted_at).getTime() >= 30000)) &&
      new Date(row.expires_at) > new Date(),
    requestKey: row.request_key,
  };
}
export function mountProviderIdentity(
  router,
  { db, limit, env = process.env, sendEmail = sendMeraEmail },
) {
  const requireReady = () => {
    if (!providerIdentityReady(env))
      throw fail(
        "Owner email verification is unavailable. No new request was sent.",
        503,
        "PROVIDER_BLOCKED",
      );
  };
  const read = async (key) =>
    (
      await db.query(
        "SELECT * FROM mera_owner_registration_requests WHERE request_key=$1",
        [key],
      )
    ).rows[0];
  async function deliver(key) {
    requireReady();
    const attempt = await db.transaction(async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM mera_owner_registration_requests WHERE request_key=$1 FOR UPDATE",
          [key],
        )
      ).rows[0];
      if (!row)
        throw fail(
          "The original request could not be found. Do not create another account; review your original request.",
          404,
        );
      if (row.delivery_status === "accepted") return { row, send: false };
      if (new Date(row.expires_at) <= new Date())
        throw fail(
          "This verification request expired. Its delivery outcome needs account review; no new email was sent.",
          409,
          "VERIFICATION_EXPIRED",
        );
      if (
        row.delivery_status === "sending" &&
        Date.now() - new Date(row.attempted_at).getTime() < 30000
      )
        return { row, send: false };
      if (
        row.config_hash !== configHash(env) ||
        row.token_hash !== hash(tokenFor(row.challenge_id, env))
      )
        throw fail(
          "Email configuration changed. Review the original request before sending again.",
          409,
          "CONFIG_CHANGED",
        );
      await c.query(
        "UPDATE mera_owner_registration_requests SET delivery_status='sending',attempted_at=CURRENT_TIMESTAMP WHERE request_key=$1",
        [key],
      );
      return { row: { ...row, delivery_status: "sending" }, send: true };
    });
    if (!attempt.send) return ack(attempt.row);
    let status = "unknown";
    try {
      const token = tokenFor(attempt.row.challenge_id, env);
      const result = await sendEmail(
        {
          to: attempt.row.email,
          subject: "Verify your Mera QR owner email",
          text: `Confirm your email to activate your Mera QR owner account.\n\n${env.MERA_PUBLIC_ORIGIN.replace(/\/$/, "")}/mera/signup#verify=${token}\n\nOpen the link and choose Verify email. The link expires one hour after your request. If you did not request this account, ignore this email.`,
          idempotencyKey: "mera-owner-verification:" + key,
        },
        { env },
      );
      if (
        result?.accepted === true &&
        result?.provider === "resend" &&
        typeof result?.id === "string" &&
        /^[0-9a-f-]{36}$/i.test(result.id)
      )
        status = "accepted";
    } catch (error) {
      status = error?.outcome === "not_sent" ? "not_sent" : "unknown";
    }
    await db.query(
      "UPDATE mera_owner_registration_requests SET delivery_status=$2 WHERE request_key=$1 AND delivery_status<>'accepted'",
      [key, status],
    );
    return ack(await read(key));
  }
  router.post("/identity/provider/register", async (req, res) => {
    limit(req);
    requireReady();
    const input = registration.parse(req.body);
    if (!isEmailRecipientAllowed(input.email, env))
      throw fail(
        "Registration is restricted to approved recipients.",
        403,
        "RECIPIENT_NOT_ALLOWED",
      );
    const existing = await read(input.requestKey);
    if (existing) {
      const user = (
        await db.query("SELECT password_hash FROM users WHERE id=$1", [
          existing.user_id,
        ])
      ).rows[0];
      if (
        existing.name !== input.name ||
        existing.email !== input.email ||
        !user ||
        !(await bcrypt.compare(input.password, user.password_hash))
      )
        throw fail(
          "This key belongs to different registration details.",
          409,
          "IDEMPOTENCY_CONFLICT",
        );
      return res.json(ack(existing));
    }
    const userId = randomUUID(),
      challengeId = randomUUID(),
      tokenHash = hash(tokenFor(challengeId, env)),
      passwordHash = await bcrypt.hash(input.password, 12);
    try {
      await db.transaction(async (c) => {
        await c.query(
          "INSERT INTO users(id,name,username,password_hash,role,active) VALUES($1,$2,$3,$4,$5,false)",
          [userId, input.name, input.email, passwordHash, "cashier"],
        );
        await c.query(
          "INSERT INTO mera_owner_identities(user_id,email) VALUES($1,$2)",
          [userId, input.email],
        );
        await c.query(
          "INSERT INTO mera_identity_challenges(id,user_id,token_hash,expires_at,mode) VALUES($1,$2,$3,CURRENT_TIMESTAMP+INTERVAL '1 hour','provider')",
          [challengeId, userId, tokenHash],
        );
        await c.query(
          "INSERT INTO mera_owner_registration_requests(request_key,user_id,challenge_id,name,email,token_hash,config_hash,expires_at,delivery_status) VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP+INTERVAL '1 hour','pending')",
          [
            input.requestKey,
            userId,
            challengeId,
            input.name,
            input.email,
            tokenHash,
            configHash(env),
          ],
        );
      });
    } catch (error) {
      if (error.code === "23505")
        throw fail(
          "This registration cannot be completed. Use your existing account or review the original request.",
          409,
          "ACCOUNT_CONFLICT",
        );
      throw error;
    }
    res.status(201).json(await deliver(input.requestKey));
  });
  router.post("/identity/provider/recover", async (req, res) => {
    limit(req);
    const { requestKey } = keySchema.parse(req.body);
    const row = await read(requestKey);
    if (!row)
      throw fail(
        "The original request is not confirmed. Keep its recovery reference and review the account before registering again.",
        404,
      );
    res.json(ack(row));
  });
  router.post("/identity/provider/retry", async (req, res) => {
    limit(req);
    const { requestKey } = keySchema.parse(req.body);
    res.json(await deliver(requestKey));
  });
  router.post("/identity/provider/verify", async (req, res) => {
    limit(req);
    requireReady();
    const { token } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/i) })
      .strict()
      .parse(req.body);
    const result = await db.transaction(async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM mera_identity_challenges WHERE token_hash=$1 AND mode='provider' FOR UPDATE",
          [hash(token)],
        )
      ).rows[0];
      if (!row || row.consumed_at || new Date(row.expires_at) <= new Date())
        throw fail(
          "This verification link is invalid, expired or already used. If you already verified it, sign in.",
          401,
          "INVALID_VERIFICATION",
        );
      await c.query(
        "UPDATE mera_identity_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=$1",
        [row.id],
      );
      await c.query(
        "UPDATE mera_owner_identities SET verified_at=CURRENT_TIMESTAMP,verification_mode='provider' WHERE user_id=$1",
        [row.user_id],
      );
      await c.query("UPDATE users SET active=true WHERE id=$1", [row.user_id]);
      return { verified: true, realEmailVerified: true, simulation: false };
    });
    res.json(result);
  });
}
