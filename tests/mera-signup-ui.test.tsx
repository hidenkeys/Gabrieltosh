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
