import test from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { randomUUID, createHash } from "node:crypto";
import { migrateMeraIdentity } from "../server/mera/identity.js";
import {
  mountProviderIdentity,
  providerIdentityReady,
} from "../server/mera/provider-identity.js";
const env = {
  MERA_OWNER_VERIFICATION_ENABLED: "true",
  MERA_IDENTITY_TOKEN_SECRET: "synthetic-only-identity-secret-123456789012345",
  MERA_EMAIL_ENABLED: "true",
  MERA_EMAIL_FROM: "Mera <verify@notify.example.invalid>",
  MERA_EMAIL_ALLOWED_RECIPIENTS: "owner@example.invalid",
  MERA_PUBLIC_ORIGIN: "https://staging.example.invalid",
  RESEND_API_KEY: "re_synthetic_key_123456",
};
async function fixture(sendEmail, overrides = {}) {
  const memory = newDb();
  memory.public.none(
    "CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,username TEXT UNIQUE,password_hash TEXT,role TEXT,active BOOLEAN)",
  );
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  const db = {
    query: (s, v) => pool.query(s, v),
    transaction: async (fn) => {
      const snapshot = memory.backup();
      try {
        return await fn(db);
      } catch (error) {
        snapshot.restore();
        throw error;
      }
    },
  };
  await migrateMeraIdentity(db);
  const routes = new Map();
  mountProviderIdentity(
    { post: (path, fn) => routes.set(path, fn) },
    { db, limit: () => {}, env: { ...env, ...overrides }, sendEmail },
  );
  return {
    db,
    call: async (path, body) => {
      let result;
      await routes.get("/identity/provider/" + path)(
        { body },
        {
          status() {
            return this;
          },
          json(v) {
            result = v;
          },
        },
      );
      return result;
    },
  };
}
const input = () => ({
  requestKey: randomUUID(),
  name: "QA Owner",
  email: "owner@example.invalid",
  password: "Synthetic-only-password-123",
});
test("provider registration sends private fragment token and activates only after explicit verification; replay rejected", async () => {
  let sent;
  const f = await fixture(async (mail) => {
    sent = mail;
    return { accepted: true, provider: "resend", id: randomUUID() };
  });
  const body = input();
  const ack = await f.call("register", body);
  assert.equal(ack.emailDelivery, "accepted");
  assert.equal("verificationToken" in ack, false);
  assert.equal(JSON.stringify(ack).includes(body.email), false);
  const token = sent.text.match(/#verify=([a-f0-9]{64})/)[1];
  let user = (await f.db.query("SELECT * FROM users")).rows[0];
  assert.equal(user.active, false);
  assert.notEqual(user.password_hash, body.password);
  const challenge = (await f.db.query("SELECT * FROM mera_identity_challenges"))
    .rows[0];
  assert.equal(challenge.mode, "provider");
  assert.equal(
    challenge.token_hash,
    createHash("sha256").update(token).digest("hex"),
  );
  assert.equal(JSON.stringify(challenge).includes(token), false);
  assert.deepEqual(await f.call("verify", { token }), {
    verified: true,
    realEmailVerified: true,
    simulation: false,
  });
  assert.equal((await f.db.query("SELECT * FROM users")).rows[0].active, true);
  assert.equal(
    (await f.db.query("SELECT * FROM mera_owner_identities")).rows[0]
      .verification_mode,
    "provider",
  );
  await assert.rejects(
    f.call("verify", { token }),
    /invalid, expired or already used/,
  );
});
test("unknown email preserves original key/body and explicit retry uses identical provider message", async () => {
  const mails = [];
  const f = await fixture(async (mail) => {
    mails.push(mail);
    if (mails.length === 1)
      throw Object.assign(Error(), { outcome: "unknown" });
    return { accepted: true, provider: "resend", id: randomUUID() };
  });
  const body = input();
  assert.equal((await f.call("register", body)).emailDelivery, "unknown");
  assert.equal(
    (await f.call("recover", { requestKey: body.requestKey })).emailDelivery,
    "unknown",
  );
  assert.equal(mails.length, 1);
  assert.equal(
    (await f.call("retry", { requestKey: body.requestKey })).emailDelivery,
    "accepted",
  );
  assert.deepEqual(mails[0], mails[1]);
  assert.equal((await f.db.query("SELECT * FROM users")).rows.length, 1);
  await assert.rejects(
    f.call("register", { ...body, name: "Changed owner" }),
    /different registration details/,
  );
});
test("allowlist and readiness fail before account creation", async () => {
  const f = await fixture(async () => {
    throw Error("must not send");
  });
  await assert.rejects(
    f.call("register", { ...input(), email: "other@example.invalid" }),
    (e) => e.code === "RECIPIENT_NOT_ALLOWED",
  );
  assert.equal((await f.db.query("SELECT * FROM users")).rows.length, 0);
  assert.equal(
    providerIdentityReady({ ...env, MERA_OWNER_VERIFICATION_ENABLED: "false" }),
    false,
  );
  assert.equal(
    providerIdentityReady({ ...env, MERA_IDENTITY_TOKEN_SECRET: "" }),
    false,
  );
  assert.equal(
    providerIdentityReady({ ...env, MERA_EMAIL_ALLOWED_RECIPIENTS: undefined }),
    false,
  );
});
test("malformed provider acknowledgement stays unknown; expired resend and simulator-token promotion rejected", async () => {
  let sent;
  const f = await fixture(async (mail) => {
    sent = mail;
    return { accepted: true, provider: "resend", id: "invented" };
  });
  const body = input();
  assert.equal((await f.call("register", body)).emailDelivery, "unknown");
  const token = sent.text.match(/#verify=([a-f0-9]{64})/)[1];
  await f.db.query("UPDATE mera_identity_challenges SET mode='simulator'");
  await assert.rejects(
    f.call("verify", { token }),
    /invalid, expired or already used/,
  );
  await f.db.query(
    "UPDATE mera_owner_registration_requests SET expires_at='2020-01-01T00:00:00Z'",
  );
  assert.equal(
    (await f.call("recover", { requestKey: body.requestKey })).retryAllowed,
    false,
  );
  await assert.rejects(
    f.call("retry", { requestKey: body.requestKey }),
    (e) => e.code === "VERIFICATION_EXPIRED",
  );
  await f.db.query(
    "UPDATE mera_identity_challenges SET mode='provider',expires_at='2020-01-01T00:00:00Z'",
  );
  await assert.rejects(
    f.call("verify", { token }),
    /invalid, expired or already used/,
  );
  assert.equal((await f.db.query("SELECT * FROM users")).rows[0].active, false);
});

test("stale sending becomes explicitly retryable and accepted outcome never regresses", async () => {
  const f = await fixture(async () => {
    await f.db.query(
      "UPDATE mera_owner_registration_requests SET delivery_status='accepted'",
    );
    throw Error("late uncertain response");
  });
  const body = input();
  assert.equal((await f.call("register", body)).emailDelivery, "accepted");
  await f.db.query(
    "UPDATE mera_owner_registration_requests SET delivery_status='sending', attempted_at=CURRENT_TIMESTAMP",
  );
  assert.equal(
    (await f.call("recover", { requestKey: body.requestKey })).retryAllowed,
    false,
  );
  await f.db.query(
    "UPDATE mera_owner_registration_requests SET attempted_at='2020-01-01T00:00:00Z'",
  );
  assert.equal(
    (await f.call("recover", { requestKey: body.requestKey })).retryAllowed,
    true,
  );
});

test("public signup permits a new recipient, blocks organization creation before verification, then creates scoped owner organization", async () => {
  let sent;
  const f = await fixture(
    async (mail) => {
      sent = mail;
      return { accepted: true, provider: "resend", id: randomUUID() };
    },
    { MERA_EMAIL_RECIPIENT_POLICY: "public" },
  );
  const body = { ...input(), email: "another-owner@example.invalid" };
  assert.equal((await f.call("register", body)).emailDelivery, "accepted");
  assert.equal(sent.to, body.email);
  const user = (await f.db.query("SELECT * FROM users")).rows[0];
  assert.equal(user.active, false);
  const { readFile } = await import("node:fs/promises");
  const schema = await readFile(
    new URL("../server/mera/schema.sql", import.meta.url),
    "utf8",
  );
  await f.db.query(schema.split("\n").slice(0, 3).join("\n"));
  await f.db.query(
    "CREATE TABLE mera_slug_claims(slug TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES mera_organizations(id))",
  );
  const { createMeraRouter } = await import("../server/mera/index.js");
  const router = createMeraRouter(f.db);
  const create = router.stack.find(
    (layer) =>
      layer.route?.path === "/organizations" && layer.route.methods.post,
  ).route.stack[0].handle;
  const previous = process.env.MERA_DEMO;
  process.env.MERA_DEMO = "false";
  let result;
  const req = {
    user,
    body: {
      name: "Public signup test venue",
      slug: "public-signup-test",
      branchName: "First branch",
    },
  };
  const res = {
    status() {
      return this;
    },
    json(value) {
      result = value;
    },
  };
  try {
    await assert.rejects(
      create(req, res),
      (error) => error.code === "OWNER_VERIFICATION_REQUIRED",
    );
    assert.equal(
      (await f.db.query("SELECT * FROM mera_organizations")).rows.length,
      0,
    );
    const token = sent.text.match(/#verify=([a-f0-9]{64})/)[1];
    assert.equal((await f.call("verify", { token })).realEmailVerified, true);
    const active = (await f.db.query("SELECT * FROM users")).rows[0];
    assert.equal(active.active, true);
    await create({ ...req, user: active }, res);
    assert.ok(result.organizationId);
    assert.ok(result.branchId);
    const member = (await f.db.query("SELECT * FROM mera_memberships")).rows[0];
    assert.equal(member.user_id, active.id);
    assert.equal(member.organization_id, result.organizationId);
    assert.equal(member.role, "owner");
    assert.equal(member.organization_wide, true);
    const branch = (await f.db.query("SELECT * FROM mera_branches")).rows[0];
    assert.equal(branch.organization_id, result.organizationId);
    assert.equal(branch.settings.orderingPaused, true);
    assert.equal(
      (await f.db.query("SELECT * FROM mera_organizations")).rows[0]
        .subscription.billingEnabled,
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.MERA_DEMO;
    else process.env.MERA_DEMO = previous;
  }
});
