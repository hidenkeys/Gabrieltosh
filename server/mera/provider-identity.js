import { renderMeraEmail } from "./email-template.js";
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
      new Date(row.expires_at) > new Date() &&
      !row.superseded_at,
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
  async function receipt(row, client = db) {
    const identity = (
      await client.query(
        "SELECT * FROM mera_owner_identities WHERE user_id=$1",
        [row.user_id],
      )
    ).rows[0];
    const verified =
      !!identity?.verified_at && identity.verification_mode === "provider";
    const latest = (
      await client.query(
        "SELECT created_at FROM mera_owner_registration_requests WHERE user_id=$1 ORDER BY created_at DESC,request_key DESC LIMIT 1",
        [row.user_id],
      )
    ).rows[0];
    const count = Number(
      (
        await client.query(
          "SELECT COUNT(*) AS count FROM mera_owner_registration_requests WHERE user_id=$1 AND created_at>=$2",
          [
            row.user_id,
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          ],
        )
      ).rows[0].count,
    );
    const available = new Date(new Date(latest.created_at).getTime() + 60000);
    const reason = verified
      ? "verified"
      : !providerIdentityReady(env) || !isEmailRecipientAllowed(row.email, env)
        ? "provider_unavailable"
        : count >= 5
          ? "daily_limit"
          : available > new Date()
            ? "cooldown"
            : null;
    return {
      ...ack(row),
      verified,
      expired: new Date(row.expires_at) <= new Date(),
      superseded: !!row.superseded_at,
      retryAllowed: !verified && !row.superseded_at && ack(row).retryAllowed,
      canResend: reason === null,
      resendAvailableAt: reason === "cooldown" ? available.toISOString() : null,
      reason,
    };
  }
  async function resend(originalKey, resendKey, actorId = null) {
    requireReady();
    const original = await read(originalKey);
    if (!original || (actorId && original.user_id !== actorId))
      throw fail(
        "An existing owner verification request is required.",
        403,
        "OWNER_IDENTITY_REQUIRED",
      );
    const outcome = await db.transaction(async (c) => {
      const identity = (
        await c.query(
          "SELECT * FROM mera_owner_identities WHERE user_id=$1 FOR UPDATE",
          [original.user_id],
        )
      ).rows[0];
      if (!identity)
        throw fail(
          "An existing owner identity is required.",
          403,
          "OWNER_IDENTITY_REQUIRED",
        );
      const prior = (
        await c.query(
          "SELECT * FROM mera_owner_registration_requests WHERE request_key=$1",
          [resendKey],
        )
      ).rows[0];
      if (prior) {
        if (
          prior.user_id !== original.user_id ||
          prior.parent_request_key !== originalKey
        )
          throw fail(
            "This resend key belongs to a different request.",
            409,
            "IDEMPOTENCY_CONFLICT",
          );
        return { row: prior, replayed: true };
      }
      const eligibility = await receipt(original, c);
      if (identity.verified_at && identity.verification_mode === "provider")
        throw fail(
          "Your owner email is already verified. Continue to your workspace.",
          409,
          "OWNER_ALREADY_VERIFIED",
        );
      if (!isEmailRecipientAllowed(identity.email, env))
        throw fail(
          "Email sending is unavailable for this recipient.",
          403,
          "RECIPIENT_NOT_ALLOWED",
        );
      if (eligibility.reason === "daily_limit")
        throw fail(
          "The daily verification-email limit has been reached. Try again later.",
          429,
          "RESEND_LIMIT",
        );
      if (eligibility.reason === "cooldown")
        throw fail(
          "Wait at least one minute between verification emails, then check again.",
          429,
          "RESEND_COOLDOWN",
        );
      const challengeId = randomUUID(),
        tokenHash = hash(tokenFor(challengeId, env));
      await c.query(
        "UPDATE mera_identity_challenges SET expires_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND mode='provider' AND consumed_at IS NULL",
        [original.user_id],
      );
      await c.query(
        "UPDATE mera_owner_registration_requests SET superseded_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND superseded_at IS NULL",
        [original.user_id],
      );
      await c.query(
        "INSERT INTO mera_identity_challenges(id,user_id,token_hash,expires_at,mode) VALUES($1,$2,$3,CURRENT_TIMESTAMP+INTERVAL '1 hour','provider')",
        [challengeId, original.user_id, tokenHash],
      );
      await c.query(
        "INSERT INTO mera_owner_registration_requests(request_key,user_id,challenge_id,name,email,token_hash,config_hash,expires_at,delivery_status,parent_request_key) VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP+INTERVAL '1 hour','pending',$8)",
        [
          resendKey,
          original.user_id,
          challengeId,
          original.name,
          identity.email,
          tokenHash,
          configHash(env),
          originalKey,
        ],
      );
      return {
        row: (
          await c.query(
            "SELECT * FROM mera_owner_registration_requests WHERE request_key=$1",
            [resendKey],
          )
        ).rows[0],
        replayed: false,
      };
    });
    if (outcome.replayed) {
      const priorReceipt = await receipt(outcome.row);
      return priorReceipt.retryAllowed ? deliver(resendKey) : priorReceipt;
    }
    return deliver(resendKey);
  }
  async function deliver(key) {
    requireReady();
    const attempt = await db.transaction(async (c) => {
      const reference = await read(key);
      if (reference)
        await c.query(
          "SELECT user_id FROM mera_owner_identities WHERE user_id=$1 FOR UPDATE",
          [reference.user_id],
        );
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
      const identity = (
        await c.query("SELECT * FROM mera_owner_identities WHERE user_id=$1", [
          row.user_id,
        ])
      ).rows[0];
      if (
        row.delivery_status === "accepted" ||
        row.superseded_at ||
        (identity?.verified_at && identity.verification_mode === "provider")
      )
        return { row, send: false };
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
    if (!attempt.send) return receipt(attempt.row);
    let status = "unknown";
    try {
      const token = tokenFor(attempt.row.challenge_id, env);
      const message = renderMeraEmail({
        preheader: "Confirm your email to finish creating your Mera account.",
        eyebrow: "Account verification",
        title: "Confirm your email",
        paragraphs: [
          `Hi ${attempt.row.name || "there"},`,
          "Thanks for signing up to Mera. Confirm this is your email address to activate your owner account and continue setting up your business.",
        ],
        action: {
          label: "Verify email",
          url: `${env.MERA_PUBLIC_ORIGIN.replace(/\/$/, "")}/mera/signup#verify=${token}`,
        },
        note: "This link expires one hour after your request. If you didn't try to create a Mera account, you can ignore this email.",
      });
      const result = await sendEmail(
        {
          to: attempt.row.email,
          subject: "Confirm your email for Mera",
          ...message,
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
    return receipt(await read(key));
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
      return res.json(await receipt(existing));
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
    res.json(await receipt(row));
  });
  router.post("/identity/provider/retry", async (req, res) => {
    limit(req);
    const { requestKey } = keySchema.parse(req.body);
    res.json(await deliver(requestKey));
  });
  router.post("/identity/provider/recover-account", async (req, res) => {
    limit(req);
    const input = z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((value) => value.toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .strict()
      .parse(req.body);
    const identity = (
      await db.query(
        "SELECT i.user_id,u.password_hash FROM mera_owner_identities i JOIN users u ON u.id=i.user_id WHERE i.email=$1",
        [input.email],
      )
    ).rows[0];
    // Always run bcrypt, including unknown identities, before the same generic denial.
    const fallback =
      "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6Ttx19lwA9cYBqAVYO8JvW4XK9yCe";
    const matches = await bcrypt.compare(
      input.password,
      identity?.password_hash || fallback,
    );
    if (!identity || !matches)
      throw fail(
        "The owner account could not be verified. Check your email and password.",
        401,
        "INVALID_CREDENTIALS",
      );
    const latest = (
      await db.query(
        "SELECT * FROM mera_owner_registration_requests WHERE user_id=$1 ORDER BY created_at DESC,request_key DESC LIMIT 1",
        [identity.user_id],
      )
    ).rows[0];
    if (!latest)
      throw fail(
        "The owner account could not be verified. Check your email and password.",
        401,
        "INVALID_CREDENTIALS",
      );
    res.json(await receipt(latest));
  });
  router.post("/identity/provider/resend", async (req, res) => {
    limit(req);
    const input = z
      .object({ requestKey: z.string().uuid(), resendKey: z.string().uuid() })
      .strict()
      .parse(req.body);
    res.json(await resend(input.requestKey, input.resendKey));
  });
  const requireActor = (req) => {
    if (!req.user)
      throw fail(
        "Sign in to check your owner account.",
        401,
        "SIGN_IN_REQUIRED",
      );
    const expected = req.get?.("X-Mera-Actor-Id");
    if (expected && expected !== req.user.id)
      throw fail(
        "The signed-in account changed. Refresh before continuing.",
        403,
        "ACTOR_CHANGED",
      );
  };
  async function ownerStatus(req) {
    requireActor(req);
    const identity = (
      await db.query("SELECT * FROM mera_owner_identities WHERE user_id=$1", [
        req.user.id,
      ])
    ).rows[0];
    if (!identity) {
      const operator = (
        await db.query(
          "SELECT user_id FROM mera_platform_members WHERE user_id=$1 AND active=true",
          [req.user.id],
        )
      ).rows[0];
      return {
        state: operator ? "platform_operator" : "no_owner_identity",
        canResend: false,
        reason: operator
          ? "Use a verified business-owner account to create an organization. Platform access does not verify owner email."
          : "This account has no owner email identity. Sign in with your registered business-owner account.",
      };
    }
    const latest = (
      await db.query(
        "SELECT * FROM mera_owner_registration_requests WHERE user_id=$1 ORDER BY created_at DESC,request_key DESC LIMIT 1",
        [req.user.id],
      )
    ).rows[0];
    const delivery = latest ? await receipt(latest) : null;
    const verified =
      !!identity.verified_at && identity.verification_mode === "provider";
    return {
      state: verified ? "verified" : "unverified",
      email: identity.email,
      canResend: delivery?.canResend || false,
      ...(delivery
        ? {
            delivery,
            resendAvailableAt: delivery.resendAvailableAt,
            reason: delivery.reason,
          }
        : {
            reason:
              "No provider verification request is available for this account.",
          }),
    };
  }
  router.get("/identity/owner-status", async (req, res) =>
    res.json(await ownerStatus(req)),
  );
  router.post("/identity/owner-resend", async (req, res) => {
    requireActor(req);
    limit(req);
    const { resendKey } = z
      .object({ resendKey: z.string().uuid() })
      .strict()
      .parse(req.body);
    // Replays resolve their own recorded parent, even after a new latest request exists.
    const prior = await read(resendKey);
    if (prior && prior.user_id !== req.user.id)
      throw fail(
        "This resend request belongs to another account.",
        403,
        "ACTOR_CHANGED",
      );
    const latest = (
      await db.query(
        "SELECT * FROM mera_owner_registration_requests WHERE user_id=$1 ORDER BY created_at DESC,request_key DESC LIMIT 1",
        [req.user.id],
      )
    ).rows[0];
    if (!latest)
      throw fail(
        "Use your registered business-owner account. No owner verification email is available for this account.",
        403,
        "OWNER_IDENTITY_REQUIRED",
      );
    res.json(
      await resend(
        prior?.parent_request_key || latest.request_key,
        resendKey,
        req.user.id,
      ),
    );
  });
  router.post("/identity/provider/verify", async (req, res) => {
    limit(req);
    requireReady();
    const { token } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/i) })
      .strict()
      .parse(req.body);
    const result = await db.transaction(async (c) => {
      const candidate = (
        await c.query(
          "SELECT * FROM mera_identity_challenges WHERE token_hash=$1 AND mode='provider'",
          [hash(token)],
        )
      ).rows[0];
      if (candidate)
        await c.query(
          "SELECT user_id FROM mera_owner_identities WHERE user_id=$1 FOR UPDATE",
          [candidate.user_id],
        );
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
