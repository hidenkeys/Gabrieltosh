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
const { PricingAndSupport, LegalInformationPage } =
  await import("../src/mera/marketing/MarketingSecondary");
const { default: Signup } = await import("../src/mera/Signup");

test("M2 fee comparison preserves proposed terms and never presents manual payments as chargeable", () => {
  let reads = 0;
  globalThis.fetch = (async () => {
    reads++;
    throw Error("Marketing must not submit");
  }) as any;
  try {
    render(<PricingAndSupport />);
    assert.ok(screen.getByText("PROPOSED STARTING PLAN"));
    assert.ok(screen.getByText("₦13,500"));
    assert.ok(screen.getByText(/unlimited branches are not included/));
    const rows = screen.getAllByRole("row");
    for (const payment of [
      "Recorded cash",
      "External POS",
      "Manually recorded external transfer",
    ]) {
      const row = rows.find((row) => row.textContent?.includes(payment));
      assert.ok(row);
      assert.match(row.textContent || "", /No collection fee/);
    }
    assert.equal(
      screen
        .getByRole("region", {
          name: "Proposed collection fee by payment method",
        })
        .getAttribute("tabindex"),
      "0",
    );
    const summary = screen.getByText("Commercial choices still to be agreed", {
      selector: "summary",
    });
    fireEvent.keyDown(summary, { key: "Enter" });
    assert.equal(summary.closest("details")?.open, true);
    assert.ok(
      screen.getByText(/No recurring debit or live collection is enabled/),
    );
    assert.equal(
      screen
        .getByRole("link", { name: "Explore onboarding" })
        .getAttribute("href"),
      "/mera/signup",
    );
    assert.equal(
      screen
        .getByRole("link", { name: "Open your workspace" })
        .getAttribute("href"),
      "/mera/workspace",
    );
    assert.equal(reads, 0);
  } finally {
    cleanup();
  }
});
test("M2 legal contents navigate to actual sections without asserting final consent", () => {
  try {
    render(<LegalInformationPage />);
    assert.ok(
      screen.getByRole("heading", { name: "Privacy & terms preparation" }),
    );
    assert.ok(screen.getByText("Pending business and legal approval"));
    for (const link of screen
      .getByRole("navigation", { name: "Policy topics" })
      .querySelectorAll("a")) {
      const target = document.getElementById(
        link.getAttribute("href")!.slice(1),
      );
      assert.ok(target);
      assert.ok(target.querySelector("h2"));
    }
    assert.ok(screen.getByText(/No final legal text or customer consent/));
    assert.ok(screen.getByText(/Marketing consent must be separate/));
    assert.equal(screen.queryByRole("checkbox"), null);
  } finally {
    cleanup();
  }
});
test("M2 blocked signup offers proposed pricing and existing workspace without collecting credentials", async () => {
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
    assert.equal(
      screen
        .getByRole("link", { name: "Review proposed pricing" })
        .getAttribute("href"),
      "/mera#pricing",
    );
    assert.equal(
      screen
        .getByRole("link", { name: "Open existing workspace" })
        .getAttribute("href"),
      "/mera/workspace",
    );
    assert.equal(screen.queryByLabelText("Password"), null);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].endsWith("/identity/capabilities"));
  } finally {
    cleanup();
  }
});

test("M2 a pricing fragment from another page reaches its section after the lazy page mounts", async () => {
  const { default: Marketing } =
    await import("../src/mera/marketing/Marketing");
  const previous = HTMLElement.prototype.scrollIntoView;
  const reached: string[] = [];
  HTMLElement.prototype.scrollIntoView = function () {
    reached.push(this.id);
  };
  try {
    window.history.replaceState({}, "", "/mera#pricing");
    const view = render(<Marketing />);
    assert.deepEqual(reached, ["pricing"]);
    view.unmount();
    reached.length = 0;
    window.history.replaceState({}, "", "/mera#unrecognized");
    render(<Marketing />);
    assert.deepEqual(reached, []);
  } finally {
    cleanup();
    window.history.replaceState({}, "", "/mera/signup");
    HTMLElement.prototype.scrollIntoView = previous;
  }
});
