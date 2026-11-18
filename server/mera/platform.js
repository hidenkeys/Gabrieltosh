import {
  createHmac,
  createHash,
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
const fail = (message, status = 403, code = "PLATFORM_ACCESS_REQUIRED") =>
  Object.assign(new Error(message), { status, code });
const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function migrateMeraPlatform(db) {
  await db.query(
    await readFile(new URL("./platform-schema.sql", import.meta.url), "utf8"),
  );
}
export function platformKey(env = process.env) {
  if (!/^[a-f\d]{64}$/i.test(env.MERA_PLATFORM_MFA_KEY || ""))
    throw fail(
      "Platform MFA encryption key is not configured.",
      503,
      "MFA_NOT_CONFIGURED",
    );
  return Buffer.from(env.MERA_PLATFORM_MFA_KEY, "hex");
}
export function encryptFactor(secret, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((v) => v.toString("base64url"))
    .join(".");
}
export function decryptFactor(value, key) {
  const [iv, tag, encrypted] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString(
    "utf8",
  );
}
export function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decode32(secret) {
  let bits = 0,
    value = 0,
    result = [];
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    const n = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
    if (n < 0) throw new Error("Invalid authenticator secret");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(result);
}
// RFC 6238, 30-second SHA-1 TOTP; test vectors cover counters beyond 2038.
export function totp(secret, counter, digits = 6) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decode32(secret)).update(bytes).digest();
  const offset = digest[digest.length - 1] & 15;
  return String(
    (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits,
  ).padStart(digits, "0");
}
export function verifyTotp(secret, code, lastCounter = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1, current + 1])
    if (
      counter > Number(lastCounter) &&
      counter >= 0 &&
      timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code))
    )
      return counter;
  return null;
}
export function mountMeraPlatform(router, { db, providers, proposedPolicy }) {
  async function member(req, c = db) {
    if (!req.user || !req.cookies?.pos_session)
      throw fail("Sign in with your platform account first.", 401);
    const sessionHash = hash(req.cookies.pos_session);
    const row = (
      await c.query(
        "SELECT p.user_id FROM mera_platform_members p JOIN sessions s ON s.user_id=p.user_id WHERE p.user_id=$1 AND p.active=true AND s.token=$2 AND s.expires_at>CURRENT_TIMESTAMP",
        [req.user.id, sessionHash],
      )
    ).rows[0];
    if (!row) throw fail("Platform operator access is required.");
    return sessionHash;
  }
  async function guard(req, _res, next) {
    try {
      const sessionHash = await member(req);
      platformKey();
      const verified = (
        await db.query(
          "SELECT user_id FROM mera_platform_stepups WHERE session_hash=$1 AND user_id=$2 AND expires_at>CURRENT_TIMESTAMP",
          [sessionHash, req.user.id],
        )
      ).rows[0];
      if (!verified)
        throw fail(
          "Enter a fresh authenticator code to continue.",
          403,
          "STRONG_AUTH_REQUIRED",
        );
      next();
    } catch (e) {
      next(e);
    }
  }
  router.get("/platform/auth", async (req, res) => {
    const sessionHash = await member(req);
    platformKey();
    const enrolled =
      (
        await db.query(
          "SELECT user_id FROM mera_platform_factors WHERE user_id=$1",
          [req.user.id],
        )
      ).rows.length > 0;
    const verified =
      (
        await db.query(
          "SELECT user_id FROM mera_platform_stepups WHERE session_hash=$1 AND user_id=$2 AND expires_at>CURRENT_TIMESTAMP",
          [sessionHash, req.user.id],
        )
      ).rows.length > 0;
    res.json({
      enrolled,
      verified,
      method: "authenticator",
      enrollment: "Operator-provisioned; no public self-enrollment.",
    });
  });
  router.post("/platform/auth/verify", async (req, res) => {
    const { code } = z
      .object({ code: z.string().regex(/^\d{6}$/) })
      .strict()
      .parse(req.body);
    const sessionHash = await member(req),
      key = platformKey();
    const result = await db.transaction(async (c) => {
      const factor = (
        await c.query(
          "SELECT * FROM mera_platform_factors WHERE user_id=$1 FOR UPDATE",
          [req.user.id],
        )
      ).rows[0];
      if (!factor)
        throw fail(
          "An authenticator must be provisioned by an authorized operator.",
          503,
          "MFA_NOT_ENROLLED",
        );
      if (factor.blocked_until && new Date(factor.blocked_until) > new Date())
        return { blocked: true };
      const counter = verifyTotp(
        decryptFactor(factor.secret_cipher, key),
        code,
        factor.last_counter,
      );
      if (counter === null) {
        await c.query(
          "UPDATE mera_platform_factors SET failed_attempts=failed_attempts+1,blocked_until=CASE WHEN failed_attempts>=4 THEN CURRENT_TIMESTAMP+INTERVAL '5 minutes' ELSE blocked_until END WHERE user_id=$1",
          [req.user.id],
        );
        return { invalid: true };
      }
      await c.query(
        "UPDATE mera_platform_factors SET last_counter=$1,failed_attempts=0,blocked_until=NULL WHERE user_id=$2",
        [counter, req.user.id],
      );
      await c.query(
        "INSERT INTO mera_platform_stepups(session_hash,user_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP+INTERVAL '10 minutes') ON CONFLICT(session_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at,user_id=EXCLUDED.user_id",
        [sessionHash, req.user.id],
      );
      await audit(c, req, "platform_stepup", null, {});
      return { verified: true };
    });
    if (result.blocked)
      throw fail(
        "Too many attempts. Wait five minutes before trying again.",
        429,
        "RATE_LIMITED",
      );
    if (result.invalid)
      throw fail(
        "That code is invalid, expired or already used.",
        401,
        "MFA_INVALID",
      );
    res.json({ verified: true, expiresInSeconds: 600 });
  });
  async function audit(c, req, action, org, details) {
    await c.query(
      "INSERT INTO mera_platform_audit(id,actor_id,action,organization_id,details) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), req.user.id, action, org, JSON.stringify(details)],
    );
  }
  router.get("/platform", guard, async (_req, res) => {
    const organizations = (
      await db.query(
        "SELECT id,name,slug,subscription,onboarding FROM mera_organizations ORDER BY name",
      )
    ).rows;
    const audits = (
      await db.query(
        "SELECT id,action,organization_id,details,created_at FROM mera_platform_audit ORDER BY created_at DESC,id LIMIT 100",
      )
    ).rows;
    const jobStates = (
      await db.query(
        "SELECT COALESCE(data->>'status','unknown') AS status,COUNT(*)::int AS count FROM mera_records WHERE kind='job' GROUP BY data->>'status'",
      )
    ).rows;
    const delayed =
      (
        await db.query(
          "SELECT COUNT(*)::int AS count FROM mera_records WHERE kind='order' AND data->>'status' IN ('submitted','accepted','preparing') AND created_at<CURRENT_TIMESTAMP-INTERVAL '15 minutes'",
        )
      ).rows[0]?.count || 0;
    const invoiceStates = (
      await db.query(
        "SELECT COALESCE(data->>'status','unknown') AS status,COUNT(*)::int AS count FROM mera_records WHERE kind='invoice' GROUP BY data->>'status'",
      )
    ).rows;
    res.json({
      organizations,
      audits,
      providers,
      policy: proposedPolicy,
      operationalSignals: {
        jobs: jobStates,
        ordersOlderThan15Minutes: delayed,
        invoices: invoiceStates,
        observedAt: new Date().toISOString(),
        monitoringScope: "application_database_snapshot",
        externalAlertsConfigured: false,
      },
      liveMoneyEnabled: false,
      supportImpersonationEnabled: false,
      blockedCapabilities: [
        "rubies_collections",
        "withdrawals",
        "settlements",
        "production_email",
        "zidi_live",
      ],
    });
  });
  router.patch(
    "/platform/organizations/:organizationId/subscription",
    guard,
    async (req, res) => {
      const value = z
        .object({
          status: z.enum([
            "trialing",
            "active",
            "past_due",
            "suspended",
            "cancelled",
          ]),
          reason: z.string().trim().min(5).max(500),
          requestKey: z.string().uuid(),
        })
        .strict()
        .parse(req.body);
      const orgId = z.string().uuid().parse(req.params.organizationId);
      const result = await db.transaction(async (c) => {
        const org = (
          await c.query(
            "SELECT subscription FROM mera_organizations WHERE id=$1 FOR UPDATE",
            [orgId],
          )
        ).rows[0];
        if (!org) throw fail("Organization not found.", 404);
        const prior = (
          await c.query(
            "SELECT details FROM mera_platform_audit WHERE organization_id=$1 AND action='subscription_status_changed' AND details->>'requestKey'=$2",
            [orgId, value.requestKey],
          )
        ).rows[0];
        if (prior) {
          if (
            prior.details.status !== value.status ||
            prior.details.reason !== value.reason
          )
            throw fail("This request key records a different change.", 409);
          return { subscription: prior.details.subscription };
        }
        const subscription = {
          ...org.subscription,
          status: value.status,
          statusChangedAt: new Date().toISOString(),
        };
        await c.query(
          "UPDATE mera_organizations SET subscription=$1 WHERE id=$2",
          [JSON.stringify(subscription), orgId],
        );
        await audit(c, req, "subscription_status_changed", orgId, {
          ...value,
          previousStatus: org.subscription?.status || null,
          subscription,
        });
        return { subscription };
      });
      res.json(result);
    },
  );
  router.post(
    "/platform/organizations/:organizationId/support-access",
    guard,
    async (req, res) => {
      const value = z
          .object({ reason: z.string().trim().min(10).max(500) })
          .strict()
          .parse(req.body),
        orgId = z.string().uuid().parse(req.params.organizationId);
      const org = (
        await db.query(
          "SELECT id,name,slug,subscription,onboarding FROM mera_organizations WHERE id=$1",
          [orgId],
        )
      ).rows[0];
      if (!org) throw fail("Organization not found.", 404);
      await audit(db, req, "support_configuration_viewed", orgId, {
        reason: value.reason,
        mode: "read_only_configuration",
      });
      res.json({
        organization: org,
        mode: "read_only_configuration",
        impersonationEnabled: false,
        customerDataIncluded: false,
      });
    },
  );
}
