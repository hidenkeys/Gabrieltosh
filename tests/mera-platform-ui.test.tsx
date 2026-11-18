import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/platform",
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
const { render, screen, fireEvent, waitFor, cleanup, act } =
  await import("@testing-library/react");
const { default: Platform } = await import("../src/mera/Platform");
test("platform exposes no directory before operator step-up", async () => {
  let directoryReads = 0;
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("/auth"))
      return Response.json({ enrolled: true, verified: false });
    directoryReads++;
    return Response.json({ organizations: [{ name: "Private tenant" }] });
  }) as any;
  try {
    render(<Platform />);
    await screen.findByRole("heading", { name: "Verify your authenticator" });
    assert.equal(directoryReads, 0);
    assert.equal(screen.queryByText("Private tenant"), null);
  } finally {
    cleanup();
  }
});
test("uncertain operator status change retains exact request intent and key", async () => {
  const writes: any[] = [];
  let fail = true;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const path = String(input);
    if (path.endsWith("/auth"))
      return Response.json({ enrolled: true, verified: true });
    if (init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      if (fail) throw new Error("connection dropped");
      return Response.json({ subscription: { status: "suspended" } });
    }
    return Response.json({
      organizations: [
        {
          id: "org",
          name: "Test business",
          slug: "test",
          subscription: { status: "active" },
        },
      ],
      audits: [],
      policy: { monthlyPrice: null },
    });
  }) as any;
  try {
    render(<Platform />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review organization" }),
    );
    fireEvent.change(screen.getByLabelText("Service status"), {
      target: { value: "suspended" },
    });
    fireEvent.change(screen.getByLabelText("Reason for this action"), {
      target: { value: "Review requested by owner" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save service status" }),
    );
    await screen.findByRole("alert");
    assert.equal(
      (screen.getByLabelText("Service status") as HTMLSelectElement).disabled,
      true,
    );
    fail = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original status change" }),
    );
    await waitFor(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0], writes[1]);
  } finally {
    cleanup();
  }
});
test("operator denial clears private data and a late directory response cannot restore it", async () => {
  let resolveDirectory: ((value: Response) => void) | undefined;
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("/auth"))
      return Response.json({
        enrolled: true,
        verified: true,
        userId: "operator",
      });
    if (String(input).endsWith("/platform"))
      return new Promise<Response>((resolve) => {
        resolveDirectory = resolve;
      });
    return Response.json({ cases: [] });
  }) as any;
  try {
    render(<Platform />);
    await waitFor(() => assert.ok(resolveDirectory));
    act(() =>
      window.dispatchEvent(new window.CustomEvent("mera:access-denied")),
    );
    await act(async () => {
      resolveDirectory!(
        Response.json({
          organizations: [
            { id: "private", name: "Sensitive tenant", slug: "private" },
          ],
          audits: [],
          policy: {},
        }),
      );
    });
    assert.equal(screen.queryByText("Sensitive tenant"), null);
    assert.ok(
      screen.getByRole("alert").textContent?.includes("access changed"),
    );
  } finally {
    cleanup();
  }
});
test("platform sections and subscription filter keep operational tasks focused", async () => {
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("/auth"))
      return Response.json({ enrolled: true, verified: true });
    if (String(input).endsWith("/support-cases"))
      return Response.json({ cases: [] });
    return Response.json({
      organizations: [
        {
          id: "one",
          name: "Active business",
          slug: "active",
          subscription: { status: "active" },
        },
        {
          id: "two",
          name: "Paused business",
          slug: "paused",
          subscription: { status: "suspended" },
        },
      ],
      audits: [],
      policy: {},
    });
  }) as any;
  try {
    render(<Platform />);
    await screen.findByRole("heading", { name: "Organization directory" });
    assert.equal(
      screen.queryByRole("heading", { name: "Organization support" }),
      null,
    );
    fireEvent.change(screen.getByLabelText("Subscription status"), {
      target: { value: "active" },
    });
    assert.ok(screen.getByRole("cell", { name: "Active business" }));
    assert.equal(screen.queryByRole("cell", { name: "Paused business" }), null);
    fireEvent.click(screen.getByRole("button", { name: "Support inbox" }));
    assert.ok(screen.getByRole("heading", { name: "Organization support" }));
    assert.equal(
      screen.queryByRole("heading", { name: "Organization directory" }),
      null,
    );
    assert.ok(screen.getByText("No support cases recorded."));
    fireEvent.click(screen.getByRole("button", { name: "Backups" }));
    assert.ok(screen.getByRole("heading", { name: "Backup readiness" }));
  } finally {
    cleanup();
  }
});
test("organization review opens a named dialog and returns keyboard focus when closed", async () => {
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("/auth"))
      return Response.json({ enrolled: true, verified: true });
    if (String(input).endsWith("/support-cases"))
      return Response.json({ cases: [] });
    return Response.json({
      organizations: [
        {
          id: "org",
          name: "Review business",
          slug: "review",
          subscription: { status: "active" },
        },
      ],
      audits: [],
      policy: {},
    });
  }) as any;
  try {
    render(<Platform />);
    const trigger = await screen.findByRole("button", {
      name: "Review organization",
    });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Review business",
    });
    assert.equal(dialog.contains(document.activeElement), true);
    fireEvent.click(screen.getByRole("button", { name: "Close organization" }));
    assert.equal(screen.queryByRole("dialog"), null);
    assert.equal(document.activeElement, trigger);
  } finally {
    cleanup();
  }
});
