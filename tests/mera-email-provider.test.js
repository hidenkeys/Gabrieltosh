import test from "node:test";
import assert from "node:assert/strict";
import {
  getEmailReadiness,
  sendMeraEmail,
} from "../server/mera/email-provider.js";
const env = {
  MERA_EMAIL_ENABLED: "true",
  RESEND_API_KEY: "re_synthetic_test_only",
  MERA_EMAIL_FROM: "Mera Test <sender@example.invalid>",
  MERA_PUBLIC_ORIGIN: "https://example.invalid",
};
const input = {
  to: "recipient@example.invalid",
  subject: "Synthetic test",
  text: "Test only",
  idempotencyKey: "test/send-1",
};
const id = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794";
test("email configuration fails closed without leaking values", () => {
  assert.deepEqual(getEmailReadiness(env), {
    configured: true,
    reason: "configured",
  });
  for (const key of Object.keys(env))
    assert.equal(getEmailReadiness({ ...env, [key]: "" }).configured, false);
  for (const patch of [
    { MERA_EMAIL_FROM: "a@b.com\r\nBcc:x@y.com" },
    { MERA_EMAIL_FROM: "sender@example.invalid\n" },
    { MERA_EMAIL_REPLY_TO: "reply@example.invalid\n" },
    { RESEND_API_KEY: "re_synthetic_test_only\n" },
    { RESEND_API_KEY: "re_bad\nkey" },
    { MERA_PUBLIC_ORIGIN: "http://example.invalid" },
    { MERA_PUBLIC_ORIGIN: "https://u:p@example.invalid" },
    { MERA_PUBLIC_ORIGIN: "https://example.invalid/path" },
    { MERA_EMAIL_REPLY_TO: "x@y.com,z@y.com" },
  ])
    assert.equal(getEmailReadiness({ ...env, ...patch }).configured, false);
});
test("only fixed endpoint and validated payload sent; acceptance requires ID", async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["Idempotency-Key"], input.idempotencyKey);
    assert.deepEqual(JSON.parse(options.body), {
      from: env.MERA_EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      reply_to: "help@example.invalid",
    });
    return { ok: true, json: async () => ({ id }) };
  };
  assert.deepEqual(
    await sendMeraEmail(input, {
      env: { ...env, MERA_EMAIL_REPLY_TO: "help@example.invalid" },
      fetchImpl,
    }),
    { accepted: true, provider: "resend", id },
  );
  assert.equal(calls, 1);
});
test("missing configuration and invalid input never call provider", async () => {
  const fetchImpl = () => {
    throw Error("must not call");
  };
  await assert.rejects(sendMeraEmail(input, { env: {}, fetchImpl }), {
    code: "EMAIL_NOT_CONFIGURED",
    outcome: "not_sent",
  });
  for (const patch of [
    { to: [input.to] },
    { to: "recipient@example.invalid\n" },
    { idempotencyKey: "valid-key\n" },
    { to: "x@y.com\nBcc:bad@y.com" },
    { subject: "bad\nheader" },
    { idempotencyKey: undefined },
    { idempotencyKey: "bad\rkey" },
    { idempotencyKey: "x".repeat(257) },
    { text: "", html: undefined },
    { text: "x".repeat(262145) },
  ])
    await assert.rejects(
      sendMeraEmail({ ...input, ...patch }, { env, fetchImpl }),
      { code: "EMAIL_INVALID_INPUT", outcome: "not_sent" },
    );
});
test("malformed acknowledgements remain unknown and errors are sanitized", async () => {
  for (const data of [
    null,
    {},
    { id: "" },
    { id: "secret key or arbitrary response" },
  ])
    await assert.rejects(
      sendMeraEmail(input, {
        env,
        fetchImpl: async () => ({ ok: true, json: async () => data }),
      }),
      { code: "EMAIL_INVALID_ACK", outcome: "unknown" },
    );
  await assert.rejects(
    sendMeraEmail(input, {
      env,
      fetchImpl: async () => {
        throw Error(env.RESEND_API_KEY);
      },
    }),
    (e) =>
      e.code === "EMAIL_NETWORK_ERROR" &&
      !JSON.stringify(e).includes(env.RESEND_API_KEY) &&
      !e.message.includes(env.RESEND_API_KEY),
  );
  await assert.rejects(
    sendMeraEmail(input, {
      env,
      fetchImpl: async () => ({
        ok: false,
        status: 422,
        json: () => {
          throw Error("body must not be read");
        },
      }),
    }),
    { code: "EMAIL_PROVIDER_REJECTED", outcome: "rejected" },
  );
  await assert.rejects(
    sendMeraEmail(input, {
      env,
      fetchImpl: async () => ({ ok: false, status: 500 }),
    }),
    { outcome: "unknown" },
  );
});
test("timeout aborts request and remains unknown, without automatic retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal,
    calls = 0;
  const pending = sendMeraEmail(input, {
    env,
    fetchImpl: async (_, options) => {
      calls++;
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  const rejection = assert.rejects(pending, {
    code: "EMAIL_TIMEOUT",
    outcome: "unknown",
  });
  t.mock.timers.tick(10000);
  await rejection;
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});

test("explicit enable gate and optional staging recipient allowlist fail closed", async () => {
  assert.deepEqual(
    getEmailReadiness({ ...env, MERA_EMAIL_ENABLED: undefined }),
    { configured: false, reason: "disabled" },
  );
  for (const value of [
    "",
    "a@example.invalid,",
    "a@example.invalid\n",
    "a@example.invalid,\n b@example.invalid",
    "a@example.invalid\nBcc:b@example.invalid",
  ])
    assert.equal(
      getEmailReadiness({ ...env, MERA_EMAIL_ALLOWED_RECIPIENTS: value })
        .configured,
      false,
    );
  let calls = 0;
  const options = {
    env: {
      ...env,
      MERA_EMAIL_ALLOWED_RECIPIENTS:
        " Recipient@example.invalid, other@example.invalid ",
    },
    fetchImpl: async () => {
      calls++;
      return { ok: true, json: async () => ({ id }) };
    },
  };
  await sendMeraEmail(input, options);
  await assert.rejects(
    sendMeraEmail({ ...input, to: "blocked@example.invalid" }, options),
    { code: "EMAIL_RECIPIENT_NOT_ALLOWED", outcome: "not_sent" },
  );
  assert.equal(calls, 1);
});
