import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { createMeraRouter } from "../server/mera/index.js";
import { rolePermissions } from "../shared/mera-contracts.js";

const org = randomUUID(),
  branch = randomUUID(),
  owner = { id: randomUUID(), name: "Ada", username: "ada@example.test" };
const token = "a".repeat(64);
const env = {
  MERA_EMAIL_ENABLED: "true",
  RESEND_API_KEY: "re_testkey1234",
  MERA_EMAIL_FROM: "Mera <team@mera.test>",
  MERA_PUBLIC_ORIGIN: "https://mera.test",
  COOKIE_SECURE: "true",
};
function fixture(options = {}) {
  const state = {
    invites: [],
    users: [],
    sessions: [],
    members: [],
    records: [],
    committed: false,
  };
  const membership = {
    id: randomUUID(),
    role: "owner",
    permissions: rolePermissions.owner,
    organization_wide: true,
    branch_ids: [],
    branch_roles: {},
    active: true,
  };
  const db = {
    query: async (sql, p = []) => {
      let rows = [];
      if (sql.startsWith("SELECT") && sql.includes("FROM mera_invitations"))
        rows = state.invites.filter((i) =>
          sql.includes("token_hash")
            ? i.token_hash === p[0]
            : sql.includes("WHERE id=")
              ? i.id === p[0]
              : true,
        );
      else if (
        sql.startsWith("SELECT") &&
        sql.includes("FROM mera_organizations")
      )
        rows = [{ id: org, name: "Test Kitchen" }];
      else if (
        sql.startsWith("SELECT") &&
        sql.includes("FROM mera_memberships")
      )
        rows = [membership];
      else if (sql.startsWith("SELECT") && sql.includes("FROM mera_branches"))
        rows = [{ id: branch }];
      else if (sql.startsWith("SELECT") && sql.includes("FROM users"))
        rows = state.users.filter(
          (u) => u.username.toLowerCase() === p[0].toLowerCase(),
        );
      else if (sql.startsWith("SELECT") && sql.includes("FROM mera_records"))
        rows = state.records
          .filter((r) => r.kind === p[1] && r.data.requestKey === p[2])
          .map((r) => ({ data: structuredClone(r.data) }));
      else if (sql.startsWith("INSERT INTO mera_invitations"))
        state.invites.push({
          id: p[0],
          organization_id: p[1],
          token_hash: p[2],
          email: p[3],
          role: p[4],
          permissions: JSON.parse(p[5]),
          branch_ids: JSON.parse(p[6]),
          expires_at: p[7],
        });
      else if (sql.startsWith("UPDATE mera_invitations SET delivery"))
        state.invites.find((i) => i.id === p[1]).delivery = p[0];
      else if (sql.startsWith("UPDATE mera_invitations SET accepted"))
        state.invites.find((i) => i.id === p[0]).accepted = true;
      else if (sql.startsWith("INSERT INTO users"))
        state.users.push({
          id: p[0],
          name: p[1],
          username: p[2],
          password_hash: p[3],
        });
      else if (sql.startsWith("INSERT INTO sessions")) state.sessions.push(p);
      else if (sql.startsWith("INSERT INTO mera_memberships"))
        state.members.push(p);
      else if (sql.startsWith("INSERT INTO mera_records"))
        state.records.push({ kind: p[3], data: JSON.parse(p[4]) });
      else throw new Error("Unexpected SQL: " + sql);
      return { rows };
    },
    transaction: async (fn) => {
      const r = await fn(db);
      state.committed = true;
      return r;
    },
  };
  const router = createMeraRouter(db, options);
  async function call(path, body, user = owner, method = "POST") {
    const layer = router.stack.find(
      (l) => l.route?.path === path && l.route.methods[method.toLowerCase()],
    );
    const req = {
      body,
      user,
      params: { organizationId: org },
      get: () => undefined,
    };
    const res = {
      statusCode: 200,
      status(n) {
        this.statusCode = n;
        return this;
      },
      json(value) {
        this.body = value;
        return this;
      },
      set() {
        return this;
      },
      cookie(...v) {
        this.cookieValue = v;
        return this;
      },
    };
    try {
      for (const l of layer.route.stack) {
        let failure;
        await l.handle(req, res, (e) => {
          failure = e;
        });
        if (failure) throw failure;
      }
    } catch (e) {
      res.statusCode = e.status || (e.name === "ZodError" ? 400 : 500);
      res.body = { error: e.message, code: e.code };
      if (res.statusCode === 500) throw e;
    }
    return res;
  }
  function invite(overrides = {}) {
    state.invites.push({
      id: randomUUID(),
      organization_id: org,
      email: "staff@example.test",
      role: "cashier",
      branch_ids: [branch],
      token_hash: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + 3600000),
      ...overrides,
    });
  }
  return { state, call, invite };
}
const path = "/organizations/:organizationId/invitations";
const body = () => ({
  requestKey: randomUUID(),
  email: "staff@example.test",
  role: "cashier",
  branchIds: [branch],
});
test("creation commits before branded email, persists delivery and never resends a replay", async () => {
  let sends = 0;
  const f = fixture({
    env,
    sendEmail: async (input) => {
      sends++;
      assert.equal(f.state.committed, true);
      assert.match(input.html, /MERA/);
      assert.match(input.html, /Team invitation/);
      assert.match(input.text, /Ada invited you/);
      assert.match(
        input.text,
        /https:\/\/mera.test\/mera\/invite#token=[a-f0-9]{64}/,
      );
      assert.equal(
        input.idempotencyKey,
        "mera-invitation:" + f.state.invites[0].id,
      );
      return { accepted: true };
    },
  });
  const input = body();
  const first = await f.call(path, input);
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.delivery, "sent");
  assert.equal(f.state.invites[0].delivery, "sent");
  assert.equal((await f.call(path, input)).body.delivery, "sent");
  assert.equal(sends, 1);
  assert.equal(
    (await f.call(path, undefined, owner, "GET")).body[0].delivery,
    "sent",
  );
});
test("unconfigured email preserves not_sent without calling sender", async () => {
  const f = fixture({
    env: {},
    sendEmail: () => {
      throw Error("must not send");
    },
  });
  assert.equal((await f.call(path, body())).body.delivery, "not_sent");
});
for (const [outcome, delivery] of [
  ["rejected", "failed"],
  ["not_sent", "failed"],
  ["unknown", "pending"],
])
  test(`email ${outcome} preserves created invitation as ${delivery}`, async () => {
    const f = fixture({
      env,
      sendEmail: async () => {
        throw Object.assign(Error("SECRET provider body"), { outcome });
      },
    });
    const r = await f.call(path, body());
    assert.equal(r.statusCode, 201);
    assert.equal(r.body.delivery, delivery);
    assert.equal(f.state.invites.length, 1);
    assert.ok(!JSON.stringify(r.body).includes("SECRET"));
  });
test("accept creates active staff account, current membership, hashed session and audit", async () => {
  const f = fixture({ env });
  f.invite();
  const r = await f.call(
    "/invitations/accept",
    { token, name: "New Staff", password: "long-password-123" },
    null,
  );
  assert.equal(r.statusCode, 200);
  assert.equal(f.state.users[0].username, "staff@example.test");
  assert.ok(
    await bcrypt.compare("long-password-123", f.state.users[0].password_hash),
  );
  assert.equal(f.state.members[0][1], f.state.users[0].id);
  assert.equal(
    f.state.sessions[0][0],
    createHash("sha256").update(r.cookieValue[1]).digest("hex"),
  );
  assert.deepEqual(r.cookieValue[2], {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    maxAge: 43200000,
  });
  assert.equal(f.state.records[0].data.action, "invitation_accepted");
  assert.equal(f.state.invites[0].accepted, true);
});
test("existing account requires sign-in, wrong user forbidden, correct email case accepted", async () => {
  const f = fixture();
  f.invite();
  f.state.users.push({ id: "staff", username: "staff@example.test" });
  const r = await f.call("/invitations/accept", { token }, null);
  assert.equal(r.statusCode, 401);
  assert.equal(r.body.code, "SIGN_IN_REQUIRED");
  assert.equal(
    (await f.call("/invitations/accept", { token })).statusCode,
    403,
  );
  assert.equal(
    (
      await f.call(
        "/invitations/accept",
        { token },
        { id: "staff", username: "STAFF@example.test" },
      )
    ).statusCode,
    200,
  );
});
for (const overrides of [
  { revoked: true },
  { accepted: true },
  { expires_at: new Date(0) },
])
  test(
    "invalid invitation cannot preview or accept " + JSON.stringify(overrides),
    async () => {
      const f = fixture();
      f.invite(overrides);
      for (const path of ["/invitations/preview", "/invitations/accept"])
        assert.equal((await f.call(path, { token }, null)).statusCode, 409);
    },
  );
test("bad tokens return 409 and short password returns 400 without creating account", async () => {
  const f = fixture();
  f.invite();
  assert.equal(
    (await f.call("/invitations/accept", { token: "bad" }, null)).statusCode,
    409,
  );
  assert.equal(
    (
      await f.call(
        "/invitations/accept",
        { token, name: "Staff", password: "short" },
        null,
      )
    ).statusCode,
    400,
  );
  assert.equal(f.state.users.length, 0);
});
test("preview reveals only invitation facts", async () => {
  const f = fixture();
  f.invite();
  const r = await f.call("/invitations/preview", { token }, null);
  assert.deepEqual(
    Object.keys(r.body).sort(),
    [
      "organizationName",
      "role",
      "email",
      "expiresAt",
      "accountExists",
      "signedInAsInvitee",
    ].sort(),
  );
  assert.equal(r.body.accountExists, false);
  assert.equal(r.body.organizationName, "Test Kitchen");
});

test("demo token remains one-time and acceptance retains simulation response", async () => {
  const f = fixture({ env: { MERA_DEMO: "true" } });
  const input = body();
  const first = await f.call(path, input);
  assert.match(first.body.developmentToken, /^[a-f0-9]{64}$/);
  assert.equal(first.body.delivery, "not_sent");
  assert.equal((await f.call(path, input)).body.developmentToken, undefined);
  const accepted = await f.call(
    "/invitations/accept",
    { token: first.body.developmentToken },
    { id: "staff", username: input.email },
  );
  assert.deepEqual(accepted.body, {
    accepted: true,
    simulation: true,
    emailVerified: false,
  });
});
