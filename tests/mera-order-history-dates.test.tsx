import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { chooseDateTime } from "./mera-input-helpers";
const dom = new JSDOM("<html><body></body></html>", {
  url: "http://localhost/mera/workspace",
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
const { render, screen, fireEvent, within, waitFor, cleanup } =
  await import("@testing-library/react");
const { default: OrderHistory } =
  await import("../src/mera/workspace/OrderHistory");
test("calendar history filters preserve device-local to ISO query serialization", async () => {
  const calls: URL[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(new URL(String(url), "http://localhost"));
    return Response.json({
      orders: [],
      hasMore: false,
      nextCursor: null,
      pageSize: 50,
    });
  };
  try {
    render(<OrderHistory base="/organizations/org/branches/branch" />);
    await waitFor(() => assert.equal(calls.length, 1));
    fireEvent.click(
      screen.getByText("More filters", { selector: "summary", exact: false }),
    );
    chooseDateTime(
      screen,
      fireEvent,
      within,
      "History from (device local time)",
      "2026-12-01T10:30",
    );
    chooseDateTime(
      screen,
      fireEvent,
      within,
      "History until (exclusive, device local time)",
      "2026-12-03T14:00",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply history filters" }),
    );
    await waitFor(() => assert.equal(calls.length, 2));
    assert.equal(
      calls[1].searchParams.get("from"),
      new Date("2026-12-01T10:30").toISOString(),
    );
    assert.equal(
      calls[1].searchParams.get("to"),
      new Date("2026-12-03T14:00").toISOString(),
    );
    assert.equal(document.querySelector('input[type="datetime-local"]'), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
