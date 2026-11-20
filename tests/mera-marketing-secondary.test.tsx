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

test("commercial information offers readiness review without unapproved prices or payment writes", () => {
  let reads = 0;
  globalThis.fetch = (async () => {
    reads++;
    throw Error("Marketing must not submit");
  }) as any;
  try {
    render(<PricingAndSupport />);
    assert.ok(screen.getByRole("heading", { name: "Payment readiness" }));
    assert.ok(
      screen.getByText(
        /Manual payment records are distinct from integrated collections/,
      ),
    );
    assert.ok(screen.getByText(/Exploring setup does not activate billing/));
    assert.doesNotMatch(
      document.body.textContent || "",
      /₦|13,500|unlimited branches/,
    );
    assert.equal(
      screen
        .getByRole("link", { name: "Explore Mera QR setup" })
        .getAttribute("href"),
      "/mera/signup",
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
        .getByRole("link", { name: "Discuss plans and terms" })
        .getAttribute("href"),
      "/mera/qr#commercial",
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
    window.history.replaceState({}, "", "/mera/qr#commercial");
    const view = render(<Marketing />);
    assert.deepEqual(reached, ["commercial"]);
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
