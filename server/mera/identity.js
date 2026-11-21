import {
  mountProviderIdentity,
  providerIdentityReady,
} from "./provider-identity.js";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { z } from "zod";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message, status = 400, code = "IDENTITY_ERROR") =>
  Object.assign(new Error(message), { status, code });
const simulated = () =>
  process.env.MERA_DEMO === "true" && process.env.NODE_ENV !== "production";
export async function migrateMeraIdentity(db) {
  await db.query(
    await readFile(new URL("./identity-schema.sql", import.meta.url), "utf8"),
  );
}
export async function requireVerifiedOwner(req, db) {
  if (simulated()) return;
  if (!req.user) throw fail("Sign in to continue.", 401);
  const identity = (
    await db.query(
      "SELECT user_id FROM mera_owner_identities WHERE user_id=$1 AND verified_at IS NOT NULL AND verification_mode='provider'",
      [req.user.id],
    )
  ).rows[0];
  if (!identity)
    throw fail(
      "A verified owner identity is required before creating an organization. Email verification delivery is not configured.",
      403,
      "OWNER_VERIFICATION_REQUIRED",
    );
}
export function mountMeraIdentity(router, { db }) {
  const attempts = new Map();
  function limit(req) {
    const now = Date.now(),
      key = req.ip || "unknown";
    for (const [id, v] of attempts) if (v.until <= now) attempts.delete(id);
    if (!attempts.has(key)) {
      if (attempts.size >= 10000)
        throw fail("Registration is busy. Retry shortly.", 503);
      attempts.set(key, { count: 0, until: now + 900000 });
    }
    if (++attempts.get(key).count > 5)
      throw fail(
        "Too many registration attempts. Wait fifteen minutes.",
        429,
        "RATE_LIMITED",
      );
  }
  mountProviderIdentity(router, { db, limit });
  router.get("/identity/capabilities", (_req, res) =>
    res.json({
      registration: simulated()
        ? "simulator"
        : providerIdentityReady()
          ? "provider"
          : "blocked",
      emailDelivery:
        !simulated() && providerIdentityReady() ? "provider" : "blocked",
      persistentCustomerIdentity: "blocked",
      reason:
        "Verified email delivery and sender authorization are required for production registration.",
    }),
  );
  router.post("/identity/register", async (req, res) => {
    limit(req);
    if (!simulated())
      throw fail(
        "Owner registration is unavailable until verified email delivery is configured. No account has been created.",
        503,
        "PROVIDER_BLOCKED",
      );
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(12).max(128),
      })
      .strict()
      .parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12),
      token = randomBytes(32).toString("hex"),
      userId = randomUUID();
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
          "INSERT INTO mera_identity_challenges(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP+INTERVAL '1 hour')",
          [randomUUID(), userId, hash(token)],
        );
      });
    } catch (e) {
      if (e.code === "23505")
        throw fail(
          "This registration cannot be completed. Use your existing account or contact support.",
          409,
        );
      throw e;
    }
    res.status(201).json({
      status: "verification_required",
      simulation: true,
      emailSent: false,
      verificationToken: token,
      expiresInSeconds: 3600,
      notice:
        "Development-only token. No email has been sent and no real contact verification is claimed.",
    });
  });
  router.post("/identity/verify", async (req, res) => {
    if (!simulated())
      throw fail(
        "Verified email delivery is not configured.",
        503,
        "PROVIDER_BLOCKED",
      );
    const { token } = z
      .object({ token: z.string().regex(/^[a-f\d]{64}$/i) })
      .strict()
      .parse(req.body);
    const result = await db.transaction(async (c) => {
      const challenge = (
        await c.query(
          "SELECT * FROM mera_identity_challenges WHERE token_hash=$1 AND mode='simulator' FOR UPDATE",
          [hash(token)],
        )
      ).rows[0];
      if (
        !challenge ||
        challenge.consumed_at ||
        new Date(challenge.expires_at) <= new Date()
      )
        throw fail(
          "This verification token is invalid, expired or already used.",
          401,
        );
      await c.query(
        "UPDATE mera_identity_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=$1",
        [challenge.id],
      );
      await c.query(
        "UPDATE mera_owner_identities SET verified_at=CURRENT_TIMESTAMP,verification_mode='simulator' WHERE user_id=$1",
        [challenge.user_id],
      );
      await c.query("UPDATE users SET active=true WHERE id=$1", [
        challenge.user_id,
      ]);
      return {
        verifiedInDemo: true,
        realEmailVerified: false,
        simulation: true,
      };
    });
    res.json(result);
  });
}
