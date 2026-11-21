import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<html><body></body></html>", {
  url: "https://staging.example.invalid/mera/signup",
});
for (const key of [
  "window",
  "document",
  "sessionStorage",
  "HTMLElement",
  "Event",
  "MouseEvent",
])
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = await import("react");
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: ProviderSignup } = await import("../src/mera/ProviderSignup");
const { default: Signup } = await import("../src/mera/Signup");
const key = "mera:owner-provider-registration:v1";
const token = "a".repeat(64);
const reply = (body: any) =>
  new Response(JSON.stringify(body), { status: 200 });
function reset() {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/mera/signup");
}
function fill() {
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "QA Owner" },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "owner@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "Synthetic-password-123" },
  });
}
test("provider registration only stores opaque recovery key, email provider acceptance is not delivery", async () => {
  reset();
  let sent: any;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(String(options?.body));
    return reply({
      status: "verification_required",
      simulation: false,
      emailDelivery: "accepted",
      expiresAt: "2026-12-01T12:00:00Z",
      retryAllowed: false,
      requestKey: sent.requestKey,
    });
  };
  render(<ProviderSignup />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Create owner account" }));
  await screen.findByRole("heading", { name: "Check your email" });
  assert.ok(screen.getByText(/Inbox delivery is not yet confirmed/));
  assert.equal(sessionStorage.getItem(key), sent.requestKey);
  assert.ok(!JSON.stringify(sessionStorage).includes("Synthetic-password"));
  assert.ok(!JSON.stringify(sessionStorage).includes("owner@example.invalid"));
});
test("unknown register remount never auto resubmits, explicit recover uses only original key", async () => {
  reset();
  const calls: any[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(String(options?.body)) });
    throw Error("offline");
  };
  render(<ProviderSignup />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Create owner account" }));
  await screen.findByRole("alert");
  const saved = sessionStorage.getItem(key);
  cleanup();
  render(<ProviderSignup />);
  assert.equal(calls.length, 1);
  fireEvent.click(
    screen.getByRole("button", { name: "Check original request" }),
  );
  await screen.findByRole("alert");
  assert.equal(calls.length, 2);
  assert.match(String(calls[1].url), /provider\/recover$/);
  assert.deepEqual(calls[1].body, { requestKey: saved });
});
test("verification fragment is removed from URL and activation waits for explicit button; no auto consumption", async () => {
  reset();
  window.history.replaceState(null, "", "/mera/signup#verify=" + token);
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") {
      posts++;
      assert.deepEqual(JSON.parse(String(options.body)), { token });
      return reply({
        verified: true,
        realEmailVerified: true,
        simulation: false,
      });
    }
    return reply({ registration: "provider", emailDelivery: "provider" });
  };
  render(<Signup />);
  await screen.findByRole("button", { name: "Verify email" });
  assert.equal(window.location.hash, "");
  assert.equal(posts, 0);
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  await screen.findByRole("heading", { name: "Your email is verified." });
  assert.equal(posts, 1);
});
test("malformed provider acknowledgement never claims email acceptance", async () => {
  reset();
  globalThis.fetch = async () =>
    reply({
      status: "verification_required",
      simulation: true,
      emailDelivery: "accepted",
      verificationToken: token,
    });
  render(<ProviderSignup />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Create owner account" }));
  await screen.findByRole("alert");
  assert.equal(
    screen.queryByRole("heading", { name: "Check your email" }),
    null,
  );
  assert.ok(sessionStorage.getItem(key));
});
test("definite recipient denial permits correction without retaining password", async () => {
  reset();
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: "Approved recipient required",
        code: "RECIPIENT_NOT_ALLOWED",
      }),
      { status: 403 },
    );
  render(<ProviderSignup />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Create owner account" }));
  await screen.findByText("Approved recipient required");
  assert.equal(sessionStorage.getItem(key), null);
  assert.equal(
    (screen.getByLabelText("Password") as HTMLInputElement).value,
    "",
  );
});
test("invalid verification acknowledgement does not activate or clear another registration recovery", async () => {
  reset();
  sessionStorage.setItem(key, "10000000-0000-4000-8000-000000000001");
  globalThis.fetch = async () =>
    reply({ verifiedInDemo: true, realEmailVerified: false, simulation: true });
  render(<ProviderSignup verificationToken={token} />);
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  await screen.findByRole("alert");
  assert.equal(
    screen.queryByRole("heading", { name: "Your email is verified." }),
    null,
  );
  assert.ok(sessionStorage.getItem(key));
});

test("public signup removes approved-recipient restriction without weakening verification copy", () => {
  reset();
  render(<ProviderSignup recipientPolicy="public" />);
  assert.equal(screen.queryByText(/restricted to approved recipients/), null);
  assert.ok(
    screen.getByText(/verification link before your account can sign in/),
  );
  cleanup();
  render(<ProviderSignup recipientPolicy="allowlist" />);
  assert.ok(screen.getByText(/restricted to approved recipients/));
});

test("email link pasted into mounted signup tab captures new hash, removes it and waits for explicit verification", async () => {
  reset();
  sessionStorage.setItem(key, "10000000-0000-4000-8000-000000000001");
  const posts: any[] = [];
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") {
      posts.push(JSON.parse(String(options.body)));
      return reply({
        verified: true,
        realEmailVerified: true,
        simulation: false,
      });
    }
    return reply({
      registration: "provider",
      emailDelivery: "provider",
      recipientPolicy: "public",
    });
  };
  render(<Signup />);
  await screen.findByRole("heading", { name: "Check your original request" });
  window.location.hash = "verify=" + token;
  await screen.findByRole("button", { name: "Verify email" });
  assert.equal(window.location.hash, "");
  assert.equal(posts.length, 0);
  assert.ok(!JSON.stringify(sessionStorage).includes(token));
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  await screen.findByRole("heading", { name: "Your email is verified." });
  assert.deepEqual(posts, [{ token }]);
  const secondToken = "b".repeat(64);
  window.location.hash = "verify=" + secondToken;
  await screen.findByRole("button", { name: "Verify email" });
  assert.equal(
    screen.queryByRole("heading", { name: "Your email is verified." }),
    null,
  );
  assert.equal(posts.length, 1);
  assert.equal(window.location.hash, "");
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  await screen.findByRole("heading", { name: "Your email is verified." });
  assert.deepEqual(posts, [{ token }, { token: secondToken }]);
});
