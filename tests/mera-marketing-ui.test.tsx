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
test("M1 marketing connects signup, sign-in, demo and genuine product screenshots", () => {
  try {
    render(<Marketing />);
    assert.ok(
      screen.getByRole("heading", {
        name: "The whole service.Beautifully connected.",
      }),
    );
    for (const link of screen.getAllByRole("link", {
      name: /Get started|Start with your business/,
    }))
      assert.equal(link.getAttribute("href"), "/mera/signup");
    assert.match(
      screen
        .getByRole("link", { name: /Explore the menu demo/ })
        .getAttribute("href") || "",
      /^\/mera\/menu\/bing-chun\//,
    );
    assert.equal(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
      "/mera/workspace",
    );
    assert.equal(screen.getAllByRole("img", { name: "Mera" }).length, 2);
    for (const logo of screen.getAllByRole("img", { name: "Mera" }))
      assert.equal(logo.getAttribute("src"), "/mera/brand/mera-mark-dark.png");
    const productImages = screen
      .getAllByRole("img")
      .filter((image) => image.getAttribute("alt") !== "Mera");
    assert.equal(productImages.length, 2);
    for (const img of productImages)
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

test("M1 service modes update one coherent detail panel without changing conversion destination", () => {
  try {
    render(<Marketing />);
    const restaurant = screen.getByRole("button", { name: "Restaurants" });
    const counter = screen.getByRole("button", { name: "Counter & takeaway" });
    assert.equal(counter.getAttribute("aria-pressed"), "true");
    fireEvent.click(restaurant);
    assert.equal(restaurant.getAttribute("aria-pressed"), "true");
    assert.equal(counter.getAttribute("aria-pressed"), "false");
    assert.ok(
      screen.getByRole("heading", {
        name: "From the first booking to the last round.",
      }),
    );
    assert.ok(screen.getByText("Private visits and shared bills"));
    assert.equal(
      screen
        .getByRole("link", { name: "Set up your service" })
        .getAttribute("href"),
      "/mera/signup",
    );
    fireEvent.click(screen.getByRole("button", { name: "Lounges & clubs" }));
    assert.ok(
      screen.getByRole("heading", { name: "Keep the evening in view." }),
    );
    assert.equal(screen.queryByText("Private visits and shared bills"), null);
    fireEvent.click(counter);
    assert.ok(
      screen.getByRole("heading", { name: "A good order. A clear handoff." }),
    );
  } finally {
    cleanup();
  }
});
test("M1 FAQ can be opened by keyboard and retains provider and branch-policy limits", () => {
  try {
    render(<Marketing />);
    const summary = screen.getByText("How are payments handled?", {
      selector: "summary",
    });
    fireEvent.keyDown(summary, { key: "Enter" });
    assert.equal(summary.closest("details")?.open, true);
    assert.ok(
      screen.getByText(
        /Integrated online collections require payment-provider approval/,
      ),
    );
    fireEvent.keyDown(summary, { key: " " });
    assert.equal(summary.closest("details")?.open, false);
    const branchSummary = screen.getByText(
      "Can Mera support more than one branch?",
      { selector: "summary" },
    );
    fireEvent.keyDown(branchSummary, { key: "Enter" });
    assert.equal(branchSummary.closest("details")?.open, true);
    assert.ok(
      screen.getByText(
        /Additional-branch pricing and entitlement must be agreed/,
      ),
    );
  } finally {
    cleanup();
  }
});
