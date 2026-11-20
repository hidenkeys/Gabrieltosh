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
const { render, screen, fireEvent, cleanup, waitFor } =
  await import("@testing-library/react");
const { default: Signup } = await import("../src/mera/Signup");
test("readiness failure has explicit retry and focuses the recovered state", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) throw new Error("Service unavailable");
    return Response.json({ registration: "blocked" });
  }) as any;
  try {
    render(<Signup />);
    const alert = await screen.findByRole("alert");
    await waitFor(() => assert(document.activeElement === alert));
    assert.equal(screen.queryByLabelText("Password"), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry registration check" }),
    );
    const heading = await screen.findByRole("heading", {
      name: "Registration is awaiting verification setup",
    });
    await waitFor(() => assert(document.activeElement === heading));
    assert.equal(calls, 2);
    assert.equal(
      screen.queryByRole("button", { name: "Retry registration check" }),
      null,
    );
  } finally {
    cleanup();
  }
});
test("unsupported readiness fails closed with retry instead of an empty card", async () => {
  globalThis.fetch = (async () =>
    Response.json({ registration: "unexpected" })) as any;
  try {
    render(<Signup />);
    assert.match(
      (await screen.findByRole("alert")).textContent || "",
      /could not be confirmed/,
    );
    assert.ok(screen.getByRole("button", { name: "Retry registration check" }));
    assert.equal(screen.queryByLabelText("Password"), null);
  } finally {
    cleanup();
  }
});
test("normal signup never presents simulated registration as real signup", async () => {
  window.history.replaceState({}, "", "/mera/signup");
  globalThis.fetch = (async () =>
    Response.json({ registration: "simulator" })) as any;
  try {
    render(<Signup />);
    await screen.findByRole("heading", {
      name: "Registration is awaiting verification setup",
    });
    assert.equal(screen.queryByLabelText("Password"), null);
    assert.equal(
      screen
        .getByRole("link", { name: "Explore the owner demo" })
        .getAttribute("href"),
      "/mera/signup?demo=1",
    );
    assert.equal(
      screen
        .getByRole("link", { name: "Platform operator access" })
        .getAttribute("href"),
      "/mera/platform",
    );
  } finally {
    cleanup();
  }
});
test("explicit demonstration has an accessible password visibility control", async () => {
  window.history.replaceState({}, "", "/mera/signup?demo=1");
  globalThis.fetch = (async () =>
    Response.json({ registration: "simulator" })) as any;
  try {
    render(<Signup />);
    const password = await screen.findByLabelText("Password");
    assert.equal(password.getAttribute("type"), "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    assert.equal(password.getAttribute("type"), "text");
    assert.equal(
      screen
        .getByRole("button", { name: "Hide password" })
        .getAttribute("aria-pressed"),
      "true",
    );
  } finally {
    cleanup();
    window.history.replaceState({}, "", "/mera/signup");
  }
});
