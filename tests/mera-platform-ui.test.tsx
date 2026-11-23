import { chooseField, choiceValue } from "./choice-field-helpers";
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
    assert.equal(
      screen.queryByRole("navigation", { name: "Platform sections" }),
      null,
    );
    assert.equal(
      screen.getByRole("img", { name: "Mera" }).getAttribute("src"),
      "/mera/brand/mera-mark-dark.png",
    );
    assert.equal(screen.queryByText("Private tenant"), null);
  } finally {
    cleanup();
  }
});
test("uncertain operator status change retains exact request intent and key", async () => {
  const writes: any[] = [];
  let outcome = "network";
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const path = String(input);
    if (path.endsWith("/auth"))
      return Response.json({ enrolled: true, verified: true });
    if (init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      if (outcome === "network") throw new Error("connection dropped");
      if (outcome === "rejected")
        return Response.json(
          { error: "Retry could not be confirmed" },
          { status: 422 },
        );
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
    chooseField(screen, fireEvent, "Service status", "suspended");
    fireEvent.change(screen.getByLabelText("Reason for this action"), {
      target: { value: "Review requested by owner" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save service status" }),
    );
    await screen.findByRole("alert");
    assert.equal(
      (
        screen.getByRole("group", {
          name: "Service status",
        }) as HTMLFieldSetElement
      ).disabled,
      true,
    );
    assert.equal(
      (screen.getByLabelText("Reason for this action") as HTMLTextAreaElement)
        .disabled,
      true,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    assert.ok(screen.getByRole("dialog"));
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Close organization",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Open audited configuration support",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    outcome = "rejected";
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original status change" }),
    );
    await waitFor(() => assert.equal(writes.length, 2));
    await screen.findByText("Retry could not be confirmed");
    assert.equal(
      (screen.getByLabelText("Reason for this action") as HTMLTextAreaElement)
        .disabled,
      true,
    );
    assert.deepEqual(writes[0], writes[1]);
    outcome = "success";
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original status change" }),
    );
    await waitFor(() => assert.equal(writes.length, 3));
    assert.deepEqual(writes[0], writes[2]);
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
    await waitFor(() => {
      if (typeof resolveDirectory !== "function")
        throw new Error("Directory request has not started yet.");
    });
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
    chooseField(screen, fireEvent, "Subscription status", "active");
    assert.ok(screen.getByRole("cell", { name: "Active business" }));
    assert.equal(screen.queryByRole("cell", { name: "Paused business" }), null);
    fireEvent.click(screen.getByRole("button", { name: "Support inbox" }));
    assert.ok(screen.getByRole("heading", { name: "Organization support" }));
    const supportHeading = screen.getByRole("heading", {
      level: 1,
      name: "Support inbox",
    });
    assert.equal(document.activeElement, supportHeading);
    assert.equal(
      screen.queryByRole("region", { name: "Organization overview" }),
      null,
    );
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
    const close = screen.getByRole("button", { name: "Close organization" });
    assert.ok(
      document.activeElement === close,
      "Focus should be on the enabled close control.",
    );
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    assert.equal(dialog.contains(document.activeElement), true);
    assert.ok(
      document.activeElement !== close,
      "Shift+Tab should wrap away from the first control.",
    );
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    assert.ok(
      document.activeElement === close,
      "Focus should be on the enabled close control.",
    );
    trigger.focus();
    assert.equal(dialog.contains(document.activeElement), true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    assert.equal(screen.queryByRole("dialog"), null);
    assert.ok(
      document.activeElement === trigger,
      "Focus should return to the organization review trigger.",
    );
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Review business" });
    fireEvent.click(screen.getByRole("button", { name: "Close organization" }));
    assert.equal(screen.queryByRole("dialog"), null);
    assert.ok(
      document.activeElement === trigger,
      "Focus should return to the organization review trigger.",
    );
  } finally {
    cleanup();
  }
});
test("support loading failure is recoverable and never masquerades as an empty inbox", async () => {
  let attempts = 0;
  let finish: ((value: Response) => void) | undefined;
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("/auth"))
      return Response.json({ enrolled: true, verified: true });
    if (String(input).endsWith("/support-cases")) {
      attempts++;
      if (attempts === 1) throw new Error("Connection interrupted");
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }
    return Response.json({ organizations: [], audits: [], policy: {} });
  }) as any;
  try {
    render(<Platform />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Support inbox" }),
    );
    await screen.findByRole("alert");
    assert.equal(screen.queryByText("No support cases recorded."), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry support cases" }),
    );
    assert.ok(await screen.findByText("Loading support cases…"));
    assert.equal(screen.queryByText("No support cases recorded."), null);
    await waitFor(() => {
      if (typeof finish !== "function")
        throw new Error("Support request has not started yet.");
    });
    await act(async () => {
      finish!(Response.json({ cases: [] }));
    });
    assert.ok(await screen.findByText("No support cases recorded."));
    assert.equal(screen.queryByRole("alert"), null);
    assert.equal(attempts, 2);
  } finally {
    cleanup();
  }
});
test("access failure and authenticator recovery move focus to the current state", async () => {
  let attempts = 0;
  globalThis.fetch = (async () => {
    if (++attempts === 1) throw new Error("Access check unavailable");
    return Response.json({ enrolled: true, verified: false });
  }) as any;
  try {
    render(<Platform />);
    const alert = await screen.findByRole("alert");
    await waitFor(() => {
      if (document.activeElement !== alert)
        throw new Error("Access error has not received focus yet.");
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh access" }));
    const heading = await screen.findByRole("heading", {
      name: "Verify your authenticator",
    });
    await waitFor(() => {
      if (document.activeElement !== heading)
        throw new Error("Verification heading has not received focus yet.");
    });
    assert.equal(
      screen.queryByRole("heading", { name: "Organization directory" }),
      null,
    );
  } finally {
    cleanup();
  }
});
test("action reasons remain task-local while disclosures preserve drafts", async () => {
  const writes: any[] = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    if (String(input).endsWith("/auth"))
      return Response.json({ enrolled: true, verified: true });
    if (String(input).endsWith("/support-cases"))
      return Response.json({ cases: [] });
    if (init.method === "PATCH") {
      writes.push(JSON.parse(init.body));
      return Response.json({ subscription: { status: "past_due" } });
    }
    return Response.json({
      organizations: [
        {
          id: "org",
          name: "Disclosure business",
          slug: "disclosure",
          subscription: { status: "active" },
        },
      ],
      audits: [],
      policy: {},
    });
  }) as any;
  try {
    render(<Platform />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review organization" }),
    );
    const reason = screen.getByLabelText(
      "Reason for this action",
    ) as HTMLTextAreaElement;
    assert.equal(reason.closest("form"), reason.form);
    assert.equal(reason.form?.id, "mera-platform-service-form");
    assert.equal(reason.required, true);
    assert.equal(reason.minLength, 10);
    assert.equal(reason.maxLength, 500);
    const addressSummary = screen.getByText("Organization address", {
      selector: "summary",
    });
    const addressBlock = addressSummary.closest("details")!;
    assert.equal(addressBlock.open, false);
    fireEvent.click(addressSummary);
    const address = screen.getByLabelText(
      "New organization address",
    ) as HTMLInputElement;
    fireEvent.change(address, { target: { value: "reviewed-address" } });
    fireEvent.change(reason, {
      target: { value: "Reviewed operator action for fixture" },
    });
    const addressReason = screen.getByLabelText(
      "Reason for address change",
    ) as HTMLTextAreaElement;
    assert.equal(addressReason.value, "");
    fireEvent.change(addressReason, {
      target: { value: "Owner requested a new address" },
    });
    fireEvent.click(addressSummary);
    assert.equal(addressBlock.open, false);
    fireEvent.click(addressSummary);
    assert.equal(addressBlock.open, true);
    assert.equal(addressReason.value, "Owner requested a new address");
    assert.equal(address.value, "reviewed-address");
    assert.equal(reason.value, "Reviewed operator action for fixture");
    chooseField(screen, fireEvent, "Service status", "past_due");
    assert.equal(
      screen
        .getByRole("radio", { name: "Past due" })
        .getAttribute("aria-label"),
      "Past due",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save service status" }),
    );
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0].status, "past_due");
    assert.equal(writes[0].reason, "Reviewed operator action for fixture");
    assert.equal(screen.queryByText("Configuration only"), null);
  } finally {
    cleanup();
  }
});
test("compact platform chooser reaches all seven sections and shares desktop navigation state", async () => {
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith("/auth"))
      return Response.json({ enrolled: true, verified: true });
    if (String(input).endsWith("/support-cases"))
      return Response.json({ cases: [] });
    return Response.json({ organizations: [], audits: [], policy: {} });
  }) as any;
  try {
    render(<Platform />);
    const chooser = await screen.findByRole("group", {
      name: "Platform section",
    });
    assert.deepEqual(
      Array.from(
        chooser.querySelectorAll<HTMLInputElement>("input[type=radio]"),
      ).map((option) => option.value),
      [
        "organizations",
        "support",
        "health",
        "backups",
        "audit",
        "consultancy",
        "travel_interest",
      ],
    );
    chooseField(screen, fireEvent, "Platform section", "audit");
    assert.ok(screen.getByRole("heading", { name: "Operator audit" }));
    assert.equal(
      document.activeElement,
      screen.getByRole("heading", { level: 1, name: "Audit log" }),
    );
    assert.equal(
      screen
        .getByRole("button", { name: "Audit log" })
        .getAttribute("aria-current"),
      "page",
    );
    assert.equal(
      screen.queryByRole("heading", { name: "Organization directory" }),
      null,
    );
    const auditRegion = screen.getByRole("region", {
      name: "Operator audit table",
    });
    assert.equal(auditRegion.getAttribute("tabindex"), "0");
    fireEvent.click(screen.getByRole("button", { name: "Organizations" }));
    assert.equal(choiceValue(screen, "Platform section"), "organizations");
    assert.equal(
      screen
        .getByRole("region", { name: "Organization directory table" })
        .getAttribute("tabindex"),
      "0",
    );
    chooseField(screen, fireEvent, "Platform section", "backups");
    assert.ok(screen.getByRole("heading", { name: "Backup readiness" }));
  } finally {
    cleanup();
  }
});

test("operator audit never invents session verification as a missing support reason", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith("/auth")
      ? Response.json({ enrolled: true, verified: true })
      : Response.json({
          organizations: [],
          policy: {},
          audits: [
            {
              id: "support",
              action: "platform_support_case_updated",
              created_at: "2026-11-19T12:00:00Z",
              details: {},
            },
            {
              id: "merchant",
              action: "merchant_support_case_created",
              created_at: "2026-11-19T12:01:00Z",
              details: { reason: "  " },
            },
            {
              id: "verification",
              action: "platform_step_up",
              created_at: "2026-11-19T12:02:00Z",
              details: {},
            },
            {
              id: "review",
              action: "platform_policy_reviewed",
              created_at: "2026-11-19T12:03:00Z",
              details: { reason: "Reviewed by operator" },
            },
          ],
        });
  try {
    render(<Platform />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Audit log", exact: true }),
    );
    assert.equal(screen.getAllByText("No reason recorded").length, 3);
    assert(!screen.queryByText("Session verification"));
    assert(screen.getByText("Reviewed by operator"));
    assert(screen.getByText("platform support case updated"));
    assert(screen.getByText("merchant support case created"));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("configuration support uses its own reason and never borrows a status reason", async () => {
  const requests: any[] = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path.endsWith("/auth"))
      return Response.json({ enrolled: true, verified: true });
    if (path.endsWith("/support-access")) {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        organization: { name: "Venue", onboarding: { status: "draft" } },
      });
    }
    return Response.json({
      organizations: [
        {
          id: "org",
          name: "Venue",
          slug: "venue",
          subscription: { status: "active" },
        },
      ],
      audits: [],
      policy: {},
    });
  };
  try {
    render(<Platform />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review organization" }),
    );
    fireEvent.change(screen.getByLabelText("Reason for this action"), {
      target: { value: "A status-only reason" },
    });
    const support = screen.getByRole("button", {
      name: "Open audited configuration support",
    }) as HTMLButtonElement;
    assert.equal(support.disabled, true);
    fireEvent.change(
      screen.getByLabelText("Reason for configuration support"),
      { target: { value: "Investigate setup reported by owner" } },
    );
    fireEvent.click(support);
    await screen.findByText(/Configuration opened for Venue/);
    assert.deepEqual(requests, [
      { reason: "Investigate setup reported by owner" },
    ]);
    assert.equal(
      (screen.getByLabelText("Reason for this action") as HTMLTextAreaElement)
        .value,
      "A status-only reason",
    );
  } finally {
    cleanup();
  }
});
