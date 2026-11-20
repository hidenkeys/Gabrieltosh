import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://example.test/mera",
});
for (const name of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "sessionStorage",
])
  Object.defineProperty(globalThis, name, {
    value: (dom.window as any)[name],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = await import("react");
const { render, screen, cleanup, fireEvent } =
  await import("@testing-library/react");
const { MeraSiteEntry, MeraLoading } = await import("../src/mera/ui/MeraEntry");
test("website introduction never gates content and only marks first session entry", () => {
  sessionStorage.clear();
  const a = render(
    <MeraSiteEntry>
      <a href="/mera/qr">Explore Mera QR</a>
    </MeraSiteEntry>,
  );
  assert.ok(screen.getByRole("link", { name: "Explore Mera QR" }));
  assert.ok(a.container.querySelector(".mera-site-entry--first"));
  cleanup();
  const b = render(
    <MeraSiteEntry>
      <p>Ready immediately</p>
    </MeraSiteEntry>,
  );
  assert.ok(screen.getByText("Ready immediately"));
  assert.equal(b.container.querySelector(".mera-site-entry--first"), null);
  cleanup();
});
test("real loading has accessible status and failure exposes an explicit working retry", () => {
  let calls = 0;
  const view = render(
    <MeraLoading title="Opening the menu…" onRetry={() => calls++} />,
  );
  assert.match(
    screen.getByRole("status").textContent || "",
    /Opening the menu/,
  );
  assert.equal(screen.queryByRole("button", { name: "Try again" }), null);
  view.rerender(
    <MeraLoading
      error="The venue is unavailable. Check your connection."
      onRetry={() => calls++}
    />,
  );
  assert.match(
    screen.getByRole("alert").textContent || "",
    /venue is unavailable/,
  );
  assert.equal(view.container.querySelector(".mera-entry-progress"), null);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  assert.equal(calls, 1);
  cleanup();
});
