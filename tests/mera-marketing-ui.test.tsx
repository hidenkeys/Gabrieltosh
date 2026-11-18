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
const { default: Marketing, LegalInformation } =
  await import("../src/mera/marketing/Marketing");
test("M1 selected homepage has genuine product imagery and working conversion routes", () => {
  try {
    render(<Marketing />);
    assert.ok(
      screen.getByRole("heading", { name: "Every service.One clear view." }),
    );
    for (const link of screen.getAllByRole("link", { name: /Explore Mera/ }))
      assert.equal(link.getAttribute("href"), "/mera/signup");
    assert.match(
      screen.getByRole("link", { name: /View demo/ }).getAttribute("href") ||
        "",
      /^\/mera\/menu\/bing-chun\//,
    );
    assert.equal(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
      "/mera/workspace",
    );
    assert.equal(screen.getAllByRole("img").length, 2);
    for (const img of screen.getAllByRole("img"))
      assert.match(
        img.getAttribute("src") || "",
        /^\/mera\/bing-chun-(counter|menu)-preview\.jpg$/,
      );
    assert.ok(screen.getByText("PROPOSED STARTING PLAN"));
    assert.ok(
      screen.getByText(/No recurring debit or live collection is enabled/),
    );
  } finally {
    cleanup();
  }
});
test("M1 compact navigation closes on Escape with focus recovery and follows real anchors", () => {
  try {
    render(<Marketing />);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    fireEvent.click(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    fireEvent.keyDown(toggle, { key: "Escape" });
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, toggle);
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("link", { name: "Solutions" }));
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    for (const name of ["Product", "Solutions", "Pricing"]) {
      const href = screen.getByRole("link", { name }).getAttribute("href")!;
      assert.ok(document.getElementById(href.slice(1)));
    }
  } finally {
    cleanup();
  }
});
test("M2 legal information retains explicit approval and privacy boundaries", () => {
  try {
    render(<LegalInformation />);
    assert.ok(
      screen.getByRole("heading", { name: "Privacy & terms preparation" }),
    );
    assert.ok(screen.getByText(/No final legal text or customer consent/));
    assert.ok(screen.getByText(/Marketing consent must be separate/));
    assert.equal(
      screen.getByRole("link", { name: "Return to Mera" }).getAttribute("href"),
      "/mera",
    );
  } finally {
    cleanup();
  }
});
