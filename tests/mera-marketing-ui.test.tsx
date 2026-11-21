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
test.afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/mera");
});
test("MeraTech distinguishes existing, planned and bespoke offerings without venue photography or public prices", () => {
  window.history.replaceState(null, "", "/mera");
  render(<Marketing />);
  assert.ok(screen.getByRole("heading", { name: /Behind every/ }));
  for (const path of ["qr", "travel", "consultancy"])
    assert.ok(document.querySelector(`a[href="/mera/${path}"]`));
  assert.equal(
    screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
    "/mera/sign-in",
  );
  assert.ok(screen.getByText("Fictional demonstration venue"));
  assert.ok(screen.getByText("Illustrative data"));
  assert.equal(document.querySelector('img[src*="bing-chun"]'), null);
  assert.doesNotMatch(
    document.body.textContent || "",
    /₦|15,000|unlimited branches/i,
  );
  assert.equal(screen.getAllByRole("img", { name: "Mera" }).length, 2);
});
test("mobile navigation recovers keyboard focus on dismissal", () => {
  render(<Marketing />);
  const toggle = screen.getByRole("button", { name: "Open menu" });
  fireEvent.click(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  fireEvent.keyDown(toggle, { key: "Escape" });
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, toggle);
});
test("QR illustrations switch coherent venue views without submitting orders", () => {
  window.history.replaceState(null, "", "/mera/qr");
  let writes = 0;
  globalThis.fetch = (async () => {
    writes++;
    throw Error("No request expected");
  }) as any;
  render(<Marketing />);
  for (const label of [
    "Orders",
    "Tables",
    "Preparation",
    "Owner overview",
    "Guest menu",
  ]) {
    const button = screen.getByRole("button", { name: label, exact: true });
    fireEvent.click(button);
    assert.equal(button.getAttribute("aria-pressed"), "true");
    const panel = screen.getByRole("region", { name: `${label} illustration` });
    assert.equal(panel.id, button.getAttribute("aria-controls"));
    assert.equal(document.querySelectorAll('[aria-pressed="true"]').length, 1);
  }
  fireEvent.click(
    screen.getByRole("button", { name: "Preparation", exact: true }),
  );
  const tickets = screen
    .getByRole("region", { name: "Preparation illustration" })
    .querySelectorAll("article");
  const kitchen = Array.from(tickets).find((ticket) =>
    ticket.textContent?.includes("Kitchen"),
  )!;
  const bar = Array.from(tickets).find((ticket) =>
    ticket.textContent?.includes("Bar"),
  )!;
  assert.match(kitchen.textContent || "", /Garden sandwich/);
  assert.doesNotMatch(kitchen.textContent || "", /Citrus cooler|Iced coffee/);
  assert.match(bar.textContent || "", /Citrus cooler/);
  assert.match(bar.textContent || "", /Iced coffee/);
  assert.equal(writes, 0);
  assert.match(
    screen
      .getByRole("link", { name: /Bing Chun test menu/ })
      .getAttribute("href") || "",
    /^\/mera\/menu\/bing-chun\//,
  );
  const summary = screen.getByText("Which payment methods are available?", {
    selector: "summary",
  });
  fireEvent.keyDown(summary, { key: "Enter" });
  assert.equal(summary.closest("details")?.open, true);
  assert.ok(
    screen.getByText(
      /Integrated online collections require verified provider access/,
    ),
  );
});
test("planned travel routes to interest and does not offer travel login or purchases", () => {
  window.history.replaceState(null, "", "/mera/travel");
  render(<Marketing />);
  assert.ok(document.getElementById("travel-interest"));
  assert.ok(
    screen.getByRole("textbox", { name: "Email address" }).closest("form"),
  );
  assert.doesNotMatch(document.body.textContent || "", /Book now|Buy now|₦/);
});
test("product entry separates organization accounts and restricted operator access", () => {
  window.history.replaceState(null, "", "/mera/sign-in");
  render(<Marketing />);
  assert.ok(document.querySelector('main a[href="/mera/workspace"]'));
  assert.ok(document.querySelector('main a[href="/mera/signup"]'));
  assert.ok(document.querySelector('main a[href="/mera/platform/sign-in"]'));
  assert.ok(
    document.querySelector('main a[href="/mera/travel#travel-interest"]'),
  );
});
test("legal preparation retains honest approval boundaries and parent navigation", () => {
  render(<LegalInformation />);
  assert.ok(screen.getByText(/No final legal text or customer consent/));
  assert.equal(
    screen
      .getByRole("link", { name: "Return to MeraTech" })
      .getAttribute("href"),
    "/mera",
  );
});

test("homepage order illustration routes station tickets, waits for both stations and resets without network writes", () => {
  window.history.replaceState(null, "", "/mera");
  let writes = 0;
  globalThis.fetch = (async () => {
    writes++;
    throw Error("Illustration must remain local");
  }) as any;
  render(<Marketing />);
  fireEvent.click(
    screen.getByRole("button", { name: "Remove one Citrus cooler" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Remove one Garden sandwich" }),
  );
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Add an item to send",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add Citrus cooler" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Garden sandwich" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Iced coffee" }));
  fireEvent.click(screen.getByRole("button", { name: "Send order · 3 items" }));
  const tickets = Array.from(
    document.querySelectorAll(".mx-ticket:not(.mx-ticket--seed)"),
  );
  assert.equal(tickets.length, 2);
  const kitchen = tickets.find(
    (ticket) =>
      ticket.querySelector("header strong")?.textContent === "Kitchen",
  )!;
  const bar = tickets.find(
    (ticket) => ticket.querySelector("header strong")?.textContent === "Bar",
  )!;
  assert.match(kitchen.textContent || "", /Garden sandwich/);
  assert.doesNotMatch(kitchen.textContent || "", /Citrus cooler|Iced coffee/);
  assert.match(bar.textContent || "", /Citrus cooler/);
  assert.match(bar.textContent || "", /Iced coffee/);
  fireEvent.click(kitchen.querySelector("button")!);
  assert.ok(screen.getByText("Being prepared."));
  fireEvent.click(kitchen.querySelector("button")!);
  assert.ok(screen.getByText("Being prepared."));
  assert.equal(screen.queryByText("Ready to serve at your table."), null);
  fireEvent.click(bar.querySelector("button")!);
  fireEvent.click(bar.querySelector("button")!);
  assert.ok(screen.getByText("Ready to serve at your table."));
  fireEvent.click(screen.getByRole("button", { name: "Start again" }));
  assert.ok(screen.getByRole("button", { name: "Send order · 2 items" }));
  assert.equal(
    document.querySelectorAll(".mx-ticket:not(.mx-ticket--seed)").length,
    0,
  );
  assert.equal(writes, 0);
});
