import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera",
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
const { default: Marketing, LegalInformation } =
  await import("../src/mera/marketing/Marketing");
const scrolls: HTMLElement[] = [];
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: function () {
    scrolls.push(this);
  },
});
test.afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/mera");
  scrolls.length = 0;
});
test("company skip link and QR section links focus their actual destinations", () => {
  window.history.replaceState(null, "", "/mera/qr");
  render(<Marketing />);
  fireEvent.click(screen.getByRole("link", { name: "Skip to content" }));
  assert.equal(
    document.activeElement,
    screen.getByRole("heading", { level: 1 }),
  );
  assert.equal(window.location.hash, "#mt-main");
  for (const [name, id] of [
    ["Walkthrough", "experience"],
    ["Service modes", "modes"],
    ["Readiness", "commercial"],
    ["Questions", "questions"],
  ]) {
    fireEvent.click(screen.getByRole("link", { name, exact: true }));
    const section = document.getElementById(id)!;
    assert.equal(
      document.activeElement,
      section.querySelector("h1,h2,h3") || section,
    );
    assert.equal(window.location.hash, "#" + id);
    assert.equal(scrolls.at(-1), section);
  }
});
test("lazy homepage pricing fragment and legal policy fragment are resolved after their real sections mount", () => {
  window.history.replaceState(null, "", "/mera#pricing");
  const first = render(<Marketing />);
  assert.equal(
    document.activeElement,
    screen.getByRole("heading", {
      name: "A considered start, not a hidden commitment.",
    }),
  );
  first.unmount();
  window.history.replaceState(null, "", "/mera/legal#payments-policies");
  render(<LegalInformation />);
  const section = document.getElementById("payments-policies")!;
  assert.equal(document.activeElement, section.querySelector("h2,h3"));
  fireEvent.click(
    screen.getByRole("link", { name: "Skip to policy information" }),
  );
  assert.equal(
    document.activeElement,
    screen.getByRole("heading", { level: 1 }),
  );
  fireEvent.click(
    screen.getByRole("link", {
      name: "Communication preferences",
      exact: true,
    }),
  );
  assert.equal(
    document.activeElement,
    document
      .getElementById("communication-preferences")
      ?.querySelector("h2,h3"),
  );
});
test("hashchange and history navigation focus only allowed mounted page sections", () => {
  window.history.replaceState(null, "", "/mera/qr");
  render(<Marketing />);
  window.history.pushState(null, "", "/mera/qr#questions");
  fireEvent(window, new window.Event("hashchange"));
  assert.equal(
    document.activeElement,
    document.getElementById("questions")?.querySelector("h2,h3"),
  );
  window.history.replaceState(null, "", "/mera#modes");
  fireEvent(window, new window.Event("popstate"));
  assert.equal(
    document.activeElement,
    document.getElementById("modes")?.querySelector("h2,h3"),
  );
  const sentinel = document.createElement("button");
  sentinel.id = "private-admin-target";
  sentinel.textContent = "Outside this page";
  document.body.append(sentinel);
  sentinel.focus();
  for (const hash of [
    "#private-admin-target",
    "#%E0%A4%A",
    "#payments-policies",
  ]) {
    window.history.replaceState(null, "", "/mera" + hash);
    fireEvent(window, new window.Event("hashchange"));
    assert.equal(document.activeElement, sentinel);
  }
  sentinel.remove();
});
test("modified new-tab clicks are not intercepted, do not close the mobile menu or move current-page focus", () => {
  render(<Marketing />);
  const button = screen.getByRole("button", { name: "Open menu" });
  fireEvent.click(button);
  button.focus();
  let intercepted = true;
  const observe = (event: MouseEvent) => {
    intercepted = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", observe, { once: true });
  fireEvent.click(screen.getByRole("link", { name: "Products", exact: true }), {
    ctrlKey: true,
  });
  assert.equal(intercepted, false);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(document.activeElement, button);
  assert.equal(window.location.hash, "");
});
test("ordinary rerenders retain current focus and unmount removes hash/history listeners without changing unrelated targets", () => {
  const added: EventListenerOrEventListenerObject[] = [],
    removed: EventListenerOrEventListenerObject[] = [];
  const add = window.addEventListener.bind(window),
    remove = window.removeEventListener.bind(window);
  window.addEventListener = ((type: any, listener: any, options: any) => {
    if (type === "hashchange" || type === "popstate") added.push(listener);
    add(type, listener, options);
  }) as any;
  window.removeEventListener = ((type: any, listener: any, options: any) => {
    if (type === "hashchange" || type === "popstate") removed.push(listener);
    remove(type, listener, options);
  }) as any;
  try {
    window.history.replaceState(null, "", "/mera#pricing");
    const view = render(<Marketing />);
    const signIn = screen.getByRole("link", { name: "Sign in", exact: true });
    signIn.focus();
    const count = scrolls.length;
    view.rerender(<Marketing />);
    assert.equal(document.activeElement, signIn);
    assert.equal(scrolls.length, count);
    assert.equal(added.length, 2);
    view.unmount();
    assert.equal(removed.length, 2);
    assert.equal(
      removed.every((listener) => added.includes(listener)),
      true,
    );
    const target = document.createElement("section");
    target.id = "pricing";
    target.tabIndex = -1;
    document.body.append(target);
    const sentinel = document.createElement("button");
    document.body.append(sentinel);
    sentinel.focus();
    fireEvent(window, new window.Event("hashchange"));
    fireEvent(window, new window.Event("popstate"));
    assert.equal(document.activeElement, sentinel);
    target.remove();
    sentinel.remove();
  } finally {
    window.addEventListener = add;
    window.removeEventListener = remove;
  }
});
