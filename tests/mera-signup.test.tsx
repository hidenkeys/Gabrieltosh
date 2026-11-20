import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/signup",
});
for (const key of ["window", "document", "HTMLElement", "Event", "MouseEvent"])
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
const { default: Signup } = await import("../src/mera/Signup");
test("unconfigured public identity delivery blocks registration before collecting a password", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    calls.push(String(input));
    return Response.json({ registration: "blocked" });
  }) as any;
  try {
    render(<Signup />);
    await screen.findByRole("heading", {
      name: "Registration is awaiting verification setup",
    });
    assert.equal(screen.queryByLabelText("Password"), null);
    assert.equal(calls.length, 1);
  } finally {
    cleanup();
  }
});
test("development verification is explicit and does not claim email delivery", async () => {
  window.history.replaceState({}, "", "/mera/signup?demo=1");
  const calls: any[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    calls.push({ path: String(input), body: init.body });
    if (String(input).endsWith("/capabilities"))
      return Response.json({ registration: "simulator" });
    if (String(input).endsWith("/register"))
      return Response.json({
        status: "verification_required",
        simulation: true,
        emailSent: false,
        expiresInSeconds: 3600,
        verificationToken: "a".repeat(64),
      });
    return Response.json({
      verifiedInDemo: true,
      realEmailVerified: false,
      simulation: true,
    });
  }) as any;
  try {
    render(<Signup />);
    await screen.findByLabelText("Your name");
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Demo owner" },
    });
    fireEvent.change(screen.getByLabelText("Demonstration email"), {
      target: { value: "demo@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "demonstration-password-123" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create demonstration account" }),
    );
    await screen.findByRole("heading", { name: "Try the verification step" });
    assert.equal(calls.filter((c) => c.path.endsWith("/verify")).length, 0);
    fireEvent.click(
      screen.getByRole("button", { name: "Verify in this demonstration" }),
    );
    await screen.findByRole("heading", {
      name: "Your demonstration account is ready",
    });
    assert.ok(screen.getByText(/This does not verify a real email address/));
  } finally {
    cleanup();
  }
});
