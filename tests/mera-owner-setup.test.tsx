import test from "node:test";
import {
  inferTimezone,
  quickItem,
} from "../src/mera/workspace/setup/onboardingDefaults";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/mera/workspace?setup=1",
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
const { default: OwnerSetup } =
  await import("../src/mera/workspace/OwnerSetup");
const { default: CreateOrganization } =
  await import("../src/mera/workspace/CreateOrganization");
const org = {
  id: "org-one",
  name: "Test venue",
  slug: "test-venue",
  branding: {},
};
const branch = {
  id: "branch-one",
  name: "Branch",
  timezone: "Africa/Lagos",
  currency: "NGN",
  settings: {},
};
const base = {
  organization: org,
  branch,
  onboarding: {},
  actorName: "Owner",
  canGuide: true,
  disabled: false,
  demo: false,
  permissions: ["menu.edit"],
  onOpen: () => {},
  basics: (
    <input aria-label="Business contact draft" defaultValue="Saved contact" />
  ),
};
const saved = async (path: string, _method: string, body: any) =>
  path.endsWith("/settings") || path.endsWith("/operating")
    ? { version: (body.version || 1) + 1 }
    : { saved: true, onboarding: { data: body.data } };
const mockWorkspace = () => {
  globalThis.fetch = async () =>
    Response.json({
      products: [],
      checks: [],
      canPublish: true,
      launchState: "draft",
    });
};
test("five steps save merged Business, preserve drafts and resume", async () => {
  mockWorkspace();
  const writes: any[] = [];
  const save = async (p: string, m: string, b: any) => {
    writes.push({ path: p, body: b });
    return saved(p, m, b);
  };
  try {
    const view = render(<OwnerSetup {...base} save={save} />);
    assert.deepEqual(
      Array.from(
        screen
          .getByRole("navigation", { name: "Owner setup steps" })
          .querySelectorAll("button"),
      ).map((b) => b.textContent),
      ["Business", "Menu", "Payments", "Look & feel", "Go live"],
    );
    fireEvent.change(screen.getByLabelText("Public customer contact"), {
      target: { value: "hello@venue.test" },
    });
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "Accra, Ghana" },
    });
    assert.equal(
      (screen.getByLabelText("Timezone") as HTMLInputElement).value,
      "Africa/Accra",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Menu", exact: true });
    assert.ok(writes.some((w) => w.body.timezone === "Africa/Accra"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Add at least one menu item.");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Business", exact: true });
    assert.equal(
      (screen.getByLabelText("Public customer contact") as HTMLInputElement)
        .value,
      "hello@venue.test",
    );
    view.unmount();
    render(
      <OwnerSetup
        {...base}
        onboarding={{
          data: {
            ownerGuideV4Step_branch_one: 8,
            "ownerGuideV4Step_branch-one": 8,
          },
        }}
        save={save}
      />,
    );
    assert.ok(screen.getByRole("heading", { name: "Menu", exact: true }));
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
test("unknown save locks navigation and retries the exact write after remount", async () => {
  mockWorkspace();
  let fail = true;
  const writes: any[] = [];
  const save = async (p: string, m: string, b: any) => {
    writes.push(structuredClone(b));
    if (fail) throw Error("lost");
    return saved(p, m, b);
  };
  const props = {
    ...base,
    onboarding: { data: { contact: "hello@venue.test" } },
    save,
  };
  try {
    const view = render(<OwnerSetup {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    assert.equal(
      (screen.getByRole("button", { name: "Go live" }) as HTMLButtonElement)
        .disabled,
      true,
    );
    view.unmount();
    fail = false;
    render(<OwnerSetup {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry saving this step" }),
    );
    await screen.findByRole("heading", { name: "Menu", exact: true });
    assert.deepEqual(writes[0], writes[1]);
    cleanup();
    render(<OwnerSetup {...base} canGuide={false} save={save} />);
    assert.ok(
      screen.getByRole("heading", { name: "Start with the essentials" }),
    );
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
test("organization creation checks address, normalizes claim and resumes setup only after acknowledgement", async () => {
  window.sessionStorage.clear();
  let created = 0,
    saved: any;
  globalThis.fetch = (async (path: string) => {
    assert.match(String(path), /address-availability\?slug=test-venue/);
    return Response.json({ available: true, reason: "available" });
  }) as any;
  try {
    render(
      <CreateOrganization
        rootDomain="example.com"
        actorId="test-owner"
        actorName="Owner"
        disabled={false}
        demo
        save={async (_p, _m, body) => {
          saved = body;
          return { organizationId: "org", branchId: "branch" };
        }}
        onCreated={async () => {
          created++;
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: " Venue " },
    });
    assert.ok(screen.getByText("Your menu link: https://venue.example.com"));
    fireEvent.change(screen.getByLabelText("Requested Mera address"), {
      target: { value: "Test-Venue" },
    });
    fireEvent.change(screen.getByLabelText("First branch name"), {
      target: { value: " Branch " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check address" }));
    await screen.findByText(/Available now/);
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" }),
    );
    await waitFor(() => assert.equal(created, 1));
    assert.deepEqual(saved, {
      name: "Venue",
      slug: "test-venue",
      branchName: "Branch",
    });
    assert.equal(
      window.sessionStorage.getItem("mera:organization-create:v1:test-owner"),
      null,
    );
    assert.equal(new URLSearchParams(window.location.search).get("setup"), "1");
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
test("unknown organization creation persists a nonprivate lock across remount and never replays", async () => {
  let writes = 0;
  window.sessionStorage.clear();
  globalThis.fetch = (async () => Response.json({ available: true })) as any;
  const props = {
    actorId: "locked-owner",
    actorName: "Owner",
    disabled: false,
    demo: true,
    save: async () => {
      writes++;
      throw new Error("lost");
    },
    onCreated: async () => {},
  };
  try {
    const view = render(<CreateOrganization {...props} />);
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Private venue" },
    });
    fireEvent.change(screen.getByLabelText("Requested Mera address"), {
      target: { value: "private-venue" },
    });
    fireEvent.change(screen.getByLabelText("First branch name"), {
      target: { value: "Private branch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check address" }));
    await screen.findByText(/Available now/);
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" }),
    );
    await screen.findByRole("alert");
    assert.equal(
      window.sessionStorage.getItem("mera:organization-create:v1:locked-owner"),
      "pending",
    );
    view.unmount();
    render(<CreateOrganization {...props} />);
    assert.ok(
      screen.getByRole("heading", { name: "Check your existing access" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh workspace access" }),
    );
    assert.equal(writes, 1);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
test("explicit owner verification rejection preserves the security requirement without claiming uncertain creation", async () => {
  window.sessionStorage.clear();
  globalThis.fetch = (async (path: string) =>
    Response.json(
      String(path).endsWith("owner-status")
        ? { state: "verified", canResend: false }
        : { available: true },
    )) as any;
  try {
    render(
      <CreateOrganization
        actorId="unverified"
        actorName="Owner"
        disabled={false}
        demo={false}
        save={async () => {
          throw Object.assign(
            new Error("A verified owner identity is required."),
            { status: 403, code: "OWNER_VERIFICATION_REQUIRED" },
          );
        }}
        onCreated={async () => {}}
      />,
    );
    await waitFor(() =>
      assert.equal(
        (
          screen
            .getByLabelText("Organization name")
            .closest("fieldset") as HTMLFieldSetElement
        ).disabled,
        false,
      ),
    );
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "New venue" },
    });
    fireEvent.change(screen.getByLabelText("Requested Mera address"), {
      target: { value: "new-venue" },
    });
    fireEvent.change(screen.getByLabelText("First branch name"), {
      target: { value: "Main" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check address" }));
    await screen.findByText(/Available now/);
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" }),
    );
    assert.match(
      (await screen.findByRole("alert")).textContent || "",
      /verified owner identity is required/,
    );
    assert.equal(
      window.sessionStorage.getItem("mera:organization-create:v1:unverified"),
      null,
    );
    assert.equal(
      screen.queryByRole("heading", { name: "Check your existing access" }),
      null,
    );
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("platform-only account cannot create organization or resend an owner email", async () => {
  cleanup();
  window.sessionStorage.clear();
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json({ state: "platform_operator", canResend: false });
  };
  let writes = 0;
  render(
    <CreateOrganization
      actorId="operator"
      actorName="Platform QA"
      disabled={false}
      demo={false}
      save={async () => {
        writes++;
      }}
      onCreated={async () => {}}
    />,
  );
  await screen.findByRole("heading", {
    name: "Use an owner account to create a business",
  });
  assert.ok(screen.getByRole("link", { name: "Open platform administration" }));
  assert.equal(
    screen.queryByRole("button", { name: "Resend verification email" }),
    null,
  );
  assert.equal(
    (
      screen
        .getByLabelText("Organization name")
        .closest("fieldset") as HTMLFieldSetElement
    ).disabled,
    true,
  );
  assert.equal(writes, 0);
  assert.equal(calls.length, 1);
  cleanup();
});

test("owner verification check preserves business draft and unknown resend uses exact key after remount", async () => {
  cleanup();
  window.sessionStorage.clear();
  let verified = false;
  const bodies: any[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("owner-status"))
      return Response.json({
        state: verified ? "verified" : "unverified",
        email: "owner@example.invalid",
        canResend: true,
      });
    const body = JSON.parse(String(options?.body));
    bodies.push(body);
    if (bodies.length === 1)
      return Response.json({
        requestKey: body.resendKey,
        status: "verification_required",
        simulation: false,
        emailDelivery: "unknown",
        expiresAt: "2026-12-01T12:00:00Z",
        retryAllowed: false,
        canResend: false,
      });
    return Response.json({
      requestKey: body.resendKey,
      status: "verification_required",
      simulation: false,
      emailDelivery: "accepted",
      expiresAt: "2026-12-01T12:00:00Z",
      retryAllowed: false,
      canResend: false,
    });
  };
  const props = {
    actorId: "owner-resend",
    actorName: "Owner",
    disabled: false,
    demo: false,
    save: async () => {},
    onCreated: async () => {},
  };
  render(<CreateOrganization {...props} />);
  await screen.findByText(/Verify owner@example.invalid/);
  assert.equal(bodies.length, 0);
  fireEvent.change(screen.getByLabelText("Organization name"), {
    target: { value: "Draft venue" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Resend verification email" }),
  );
  await screen.findByRole("button", {
    name: "Retry same verification email request",
  });
  assert.ok(window.sessionStorage.getItem("mera:owner-resend:v1:owner-resend"));
  verified = true;
  fireEvent.click(screen.getByRole("button", { name: "Check verification" }));
  await waitFor(() =>
    assert.equal(
      (
        screen
          .getByLabelText("Organization name")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
      false,
    ),
  );
  assert.equal(
    (screen.getByLabelText("Organization name") as HTMLInputElement).value,
    "Draft venue",
  );
  cleanup();
  verified = false;
  render(<CreateOrganization {...props} />);
  const retry = await screen.findByRole("button", {
    name: "Retry same verification email request",
  });
  fireEvent.click(retry);
  await screen.findByText(/email provider accepted/);
  assert.deepEqual(bodies[0], bodies[1]);
  cleanup();
  window.sessionStorage.clear();
});

test("unavailable owner status is not treated as missing identity and requires a successful check", async () => {
  cleanup();
  window.sessionStorage.clear();
  let fail = true;
  globalThis.fetch = async () => {
    if (fail) throw Error("offline");
    return Response.json({ state: "no_owner_identity", canResend: false });
  };
  render(
    <CreateOrganization
      actorId="unknown-owner"
      actorName="Owner"
      disabled={false}
      demo={false}
      save={async () => {
        throw Error("must not submit");
      }}
      onCreated={async () => {}}
    />,
  );
  await screen.findByRole("alert");
  assert.equal(
    screen.queryByText(/does not have a business owner identity/),
    null,
  );
  assert.equal(
    (
      screen
        .getByLabelText("Organization name")
        .closest("fieldset") as HTMLFieldSetElement
    ).disabled,
    true,
  );
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Check verification" }));
  await screen.findByText(/does not have a business owner identity/);
  assert.equal(
    screen.queryByRole("link", { name: "Open platform administration" }),
    null,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Resend verification email" }),
    null,
  );
  cleanup();
});

test("legacy nine-step progress maps forward to the review stage and never mounts additional branch creation", () => {
  try {
    render(
      <OwnerSetup
        {...base}
        onboarding={{ data: { "ownerGuideStep_branch-one": 8 } }}
        branchAdministration={<button>Create another branch</button>}
        save={async () => ({})}
      />,
    );
    assert.ok(screen.getByRole("heading", { name: "Go live" }));
    assert.equal(
      screen.queryByRole("button", { name: "Create another branch" }),
      null,
    );
    assert.equal(
      screen
        .getByRole("navigation", { name: "Owner setup steps" })
        .querySelectorAll("ol button").length,
      5,
    );
  } finally {
    cleanup();
  }
});

test("venue cards use keyboard selection, real capabilities and save the selected preset on Continue", async () => {
  window.sessionStorage.clear();
  const writes: any[] = [];
  try {
    render(
      <OwnerSetup
        {...base}
        onboarding={{
          data: {
            "ownerGuideV3Step_branch-one": 2,
            contact: "hello@venue.test",
          },
        }}
        save={async (path, method, body) => {
          writes.push({ path, body });
          return path.endsWith("/operating")
            ? { version: 2 }
            : path.endsWith("/settings")
              ? { version: 2 }
              : path.endsWith("/settings")
                ? { version: 2 }
                : { saved: true, onboarding: { data: body.data } };
        }}
      />,
    );
    fireEvent.click(screen.getByText("Customise"));
    fireEvent.click(screen.getByRole("radio", { name: "Club & nightlife" }));
    assert.equal(
      screen
        .getByRole("button", { name: "Door and guest list" })
        .getAttribute("aria-pressed"),
      "true",
    );
    fireEvent.keyDown(
      screen.getByRole("radiogroup", { name: "Kind of venue" }),
      { key: "ArrowDown" },
    );
    assert.equal(
      (
        screen.getByRole("radio", {
          name: "Hotel food & beverage",
        }) as HTMLInputElement
      ).checked,
      true,
    );
    assert.equal(
      screen
        .getByRole("button", { name: "Charge to room" })
        .getAttribute("aria-pressed"),
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Menu", exact: true });
    const body = writes.find((w) => w.path.endsWith("/settings")).body;
    assert.equal(body.venueType, "hotel_fb");
    assert.ok(body.capabilities.includes("room_charge"));
    assert.ok(body.requestKey);
    assert.equal(body.version, 1);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("location count adapts setup and autosaves the operating choice", async () => {
  window.sessionStorage.clear();
  const writes: any[] = [];
  try {
    render(
      <OwnerSetup
        {...base}
        onboarding={{
          data: {
            "ownerGuideV3Step_branch-one": 1,
            contact: "owner@example.invalid",
          },
        }}
        save={async (path, method, body) => {
          writes.push({ path, body });
          return path.endsWith("/operating")
            ? { version: 2 }
            : path.endsWith("/settings")
              ? { version: 2 }
              : { saved: true, onboarding: { data: body.data } };
        }}
      />,
    );
    assert.equal(screen.queryByRole("button", { name: "Menu & stock" }), null);
    fireEvent.click(screen.getByRole("radio", { name: "2–5" }));
    assert.equal(screen.queryByRole("button", { name: "Menu & stock" }), null);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Menu", exact: true });
    assert.equal(
      writes.find((w) => w.path.endsWith("/operating")).body.locationCount,
      "few",
    );
    assert.equal(screen.queryByRole("button", { name: "Menu & stock" }), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("venue settings retry after remount reuses the original request and does not advance on failure", async () => {
  window.sessionStorage.clear();
  const writes: any[] = [];
  let fail = true;
  const save = async (path: string, method: string, body: any) => {
    writes.push({ path, body: structuredClone(body) });
    if (fail) throw Error("offline");
    return path.endsWith("/operating")
      ? { version: 2 }
      : path.endsWith("/settings")
        ? { version: 2 }
        : { saved: true, onboarding: { data: body.data } };
  };
  try {
    const view = render(
      <OwnerSetup
        {...base}
        onboarding={{
          data: {
            "ownerGuideV3Step_branch-one": 2,
            contact: "hello@venue.test",
          },
        }}
        save={save}
      />,
    );
    fireEvent.click(screen.getByText("Customise"));
    fireEvent.click(screen.getByRole("radio", { name: "Club & nightlife" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    view.unmount();
    fail = false;
    render(
      <OwnerSetup
        {...base}
        onboarding={{
          data: {
            "ownerGuideV3Step_branch-one": 2,
            contact: "hello@venue.test",
          },
        }}
        save={save}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry saving this step" }),
    );
    await screen.findByRole("heading", { name: "Menu", exact: true });
    assert.deepEqual(writes[0], writes[1]);
    assert.ok(writes.some((w) => w.body.payLater === true));
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("payments Continue saves reviewed manual methods, preserves caveats verbatim and never launches", async () => {
  window.sessionStorage.clear();
  const writes: any[] = [];
  globalThis.fetch = async () =>
    Response.json({
      checks: [{ id: "menu", label: "Menu", status: "ready" }],
      canPublish: true,
      launchState: "draft",
      paymentProviderState: "not_verified",
      publicHostingVerified: false,
    });
  try {
    render(
      <OwnerSetup
        {...base}
        onboarding={{
          data: {
            "ownerGuideV3Step_branch-one": 5,
            contact: "owner@example.invalid",
          },
        }}
        save={async (path, method, body) => {
          writes.push({ path, body });
          return path.endsWith("/onboarding")
            ? { saved: true, onboarding: { data: body.data } }
            : { checks: [], canPublish: true };
        }}
      />,
    );
    await screen.findByRole("checkbox", { name: "Cash" });
    assert.equal(
      screen.queryByText(/This publishes the branch’s configured menu state/),
      null,
    );
    assert.equal(screen.queryByText(/These choices are not saved yet/), null);
    assert.equal(
      (screen.getByRole("checkbox", { name: "Cash" }) as HTMLInputElement)
        .checked,
      true,
    );
    await waitFor(() =>
      assert.equal(
        (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
          .disabled,
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Look & feel" });
    assert.ok(screen.getByRole("region", { name: "Guest menu preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Midnight" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Go live" });
    assert.deepEqual(
      writes.find((w) => w.path.endsWith("/launch-policy")).body,
      {
        manualPaymentMethods: ["cash"],
        publicContact: "owner@example.invalid",
      },
    );
    assert.equal(
      writes.some((w) => w.path.endsWith("/launch")),
      false,
    );
    assert.equal(
      screen.getAllByRole("button", { name: "Go live", exact: true }).length,
      2,
    );
    assert.equal(
      writes.find((w) => w.path.endsWith("/branding")).body.palettePreset,
      "midnight",
    );
    assert.equal(
      writes.find((w) => w.path.endsWith("/branding")).body.background,
      "#151c26",
    );
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("organization address follows the business name until the owner edits it", () => {
  window.sessionStorage.clear();
  try {
    render(
      <CreateOrganization
        actorId="slug-owner"
        actorName="Owner"
        disabled={false}
        demo={true}
        save={async () => {
          throw Error("No writes expected");
        }}
        onCreated={async () => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Fictional Café" },
    });
    assert.equal(
      (screen.getByLabelText("Requested Mera address") as HTMLInputElement)
        .value,
      "fictional-cafe",
    );
    fireEvent.change(screen.getByLabelText("Requested Mera address"), {
      target: { value: "my-cafe" },
    });
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Another name" },
    });
    assert.equal(
      (screen.getByLabelText("Requested Mera address") as HTMLInputElement)
        .value,
      "my-cafe",
    );
  } finally {
    cleanup();
  }
});

test("multiple locations use compact names and defer stock strategy", () => {
  mockWorkspace();
  try {
    render(
      <OwnerSetup
        {...base}
        branches={[branch, { ...branch, id: "second", name: "North" }]}
        save={saved}
      />,
    );
    assert.ok(screen.getByText("North"));
    assert.equal(screen.queryByLabelText("Location code"), null);
    assert.equal(screen.queryByRole("button", { name: "Menu & stock" }), null);
    assert.ok(screen.getByText("Edit opening hours (optional)"));
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("saving an unchanged venue type preserves its explicit pay-first preference", async () => {
  window.sessionStorage.clear();
  const writes: any[] = [];
  try {
    render(
      <OwnerSetup
        {...base}
        branch={{
          ...branch,
          settings: { venueType: "casual_dining", payLater: false },
        }}
        onboarding={{
          data: {
            "ownerGuideV3Step_branch-one": 2,
            contact: "hello@venue.test",
          },
        }}
        save={async (path, _method, body) => {
          writes.push({ path, body });
          return path.endsWith("/settings") || path.endsWith("/operating")
            ? { version: 2 }
            : path.endsWith("/settings")
              ? { version: 2 }
              : { saved: true, onboarding: { data: body.data } };
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Menu", exact: true });
    assert.equal(
      writes.find((w) => w.path.endsWith("/settings")).body.payLater,
      false,
    );
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("go live publishes, creates branch QR and offers all three end actions", async () => {
  const writes: any[] = [];
  globalThis.fetch = async (url) =>
    Response.json(
      String(url).endsWith("publication-preview")
        ? {
            products: [{ id: "item", name: "Rice" }],
            previewHash: "a".repeat(64),
            publishedVersion: 0,
          }
        : String(url).endsWith("qr-codes")
          ? { codes: [] }
          : String(url).endsWith("workspace")
            ? { products: [{ id: "item", name: "Rice", price: 10000 }] }
            : { checks: [], canPublish: true, launchState: "draft" },
    );
  try {
    render(
      <OwnerSetup
        {...base}
        branch={{ ...branch, settings: { venueType: "casual_dining" } }}
        onboarding={{
          data: {
            "ownerGuideV3Step_branch-one": 6,
            contact: "hello@venue.test",
          },
        }}
        save={async (p, m, b) => {
          writes.push({ path: p, body: b });
          if (p.endsWith("qr-codes"))
            return { id: "qr", url: "https://menu.example/q/qr" };
          if (p.endsWith("launch-policy"))
            return { checks: [], canPublish: true };
          if (p.endsWith("/launch"))
            return { checks: [], launchState: "published" };
          return {
            version: 1,
            saved: true,
            onboarding: { completedAt: "2026-11-27T12:00:00Z" },
          };
        }}
      />,
    );
    assert.ok(screen.getByText("Add tables (optional)"));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Go live", exact: true }).at(-1)!,
    );
    await screen.findByRole("link", { name: "Open menu" });
    assert.ok(screen.getByRole("link", { name: "Download QR" }));
    assert.equal(
      screen
        .getByRole("link", { name: "Place a test order" })
        .getAttribute("target"),
      "_blank",
    );
    assert.ok(
      writes.some(
        (w) => w.path.endsWith("/menu/publish") && w.body.previewHash,
      ),
    );
    assert.ok(writes.some((w) => w.path.endsWith("/launch")));
    assert.ok(writes.some((w) => w.body.kind === "branch"));
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
test("business contact rejects words and accepts a phone, clearing inline error on edit", async () => {
  window.sessionStorage.clear();
  let writes = 0;
  try {
    render(
      <OwnerSetup
        {...base}
        onboarding={{ data: { "ownerGuideV3Step_branch-one": 1 } }}
        save={async (path, method, body) => {
          writes++;
          return path.endsWith("operating") || path.endsWith("/settings")
            ? { version: 2 }
            : path.endsWith("/settings")
              ? { version: 2 }
              : { saved: true, onboarding: { data: body.data } };
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Public customer contact"), {
      target: { value: "Contact us" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Enter a phone number with at least 7 digits/);
    assert.equal(writes, 0);
    fireEvent.change(screen.getByLabelText("Public customer contact"), {
      target: { value: "0803 123 4567" },
    });
    assert.equal(screen.queryByRole("alert"), null);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Menu", exact: true });
  } finally {
    cleanup();
  }
});

test("timezone defaults and kitchen/bar quick items", () => {
  assert.equal(inferTimezone("Nairobi, Kenya", "NGN"), "Africa/Nairobi");
  assert.equal(inferTimezone("", "GBP"), "Europe/London");
  for (const [category, station] of [
    ["Drinks", "bar"],
    ["Meals", "kitchen"],
  ]) {
    const item = quickItem("House special", "12.50", category);
    assert.match(item.code, /^ITEM-/);
    assert.equal(item.price, 1250);
    assert.equal(item.stockMode, "unlimited");
    assert.equal(item.station, station);
  }
});
test("payments require a method before continuing", async () => {
  mockWorkspace();
  try {
    render(
      <OwnerSetup
        {...base}
        onboarding={{
          data: {
            "ownerGuideV3Step_branch-one": 5,
            contact: "hello@venue.test",
          },
        }}
        save={async (p, m, b) =>
          p.endsWith("launch-policy")
            ? { checks: [], canPublish: true }
            : saved(p, m, b)
        }
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Cash" }));
    await waitFor(() =>
      assert.equal(
        (screen.getByRole("checkbox", { name: "Cash" }) as HTMLInputElement)
          .checked,
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Choose at least one payment method.");
    assert.ok(screen.getByRole("heading", { name: "Payments" }));
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
test("quick-add posts generated code and station", async () => {
  mockWorkspace();
  const bodies: any[] = [];
  try {
    render(
      <OwnerSetup
        {...base}
        onboarding={{ data: { "ownerGuideV4Step_branch-one": 8 } }}
        save={async (p, m, b) => {
          bodies.push(b);
          return { ...b, id: "created" };
        }}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.change(screen.getByLabelText("Item name"), {
      target: { value: "Lemonade" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Drinks" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    await screen.findByText("Lemonade");
    assert.equal(bodies[0].station, "bar");
    assert.match(bodies[0].code, /ITEM-/);
    assert.equal(bodies[0].stockMode, "unlimited");
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("table creation reuses existing names and creates a QR for each table", async () => {
  const { default: OnboardingLaunch } =
    await import("../src/mera/workspace/OnboardingLaunch");
  const writes: any[] = [];
  globalThis.fetch = async (url) =>
    Response.json(
      String(url).endsWith("workspace")
        ? { tables: [{ id: "existing", name: "Table 1" }] }
        : { checks: [], launchState: "draft" },
    );
  try {
    render(
      <OnboardingLaunch
        base="/organizations/org/branches/branch"
        organization={org}
        branding={{}}
        items={[]}
        capabilities={["table_service"]}
        contact="hello@venue.test"
        methods={["cash"]}
        disabled={false}
        onFix={() => {}}
        onFinished={() => {}}
        save={async (p: string, m: string, b: any) => {
          writes.push({ p, b });
          return { id: "new" };
        }}
      />,
    );
    fireEvent.click(screen.getByText("Add tables (optional)"));
    fireEvent.change(screen.getByLabelText("Number of tables"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create tables and QRs" }),
    );
    await waitFor(() => assert.equal(writes.length, 3));
    assert.deepEqual(
      writes.map((w) => w.b),
      [
        { kind: "table", tableId: "existing" },
        { name: "Table 2", capacity: 2, zone: "Main floor", x: 0, y: 0 },
        { kind: "table", tableId: "new" },
      ],
    );
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("second location exposes shared menu settings after launch", async () => {
  const { default: PostLaunchSettings } =
    await import("../src/mera/workspace/PostLaunchSettings");
  const bodies: any[] = [];
  try {
    render(
      <PostLaunchSettings
        organization={org}
        branches={[branch, { ...branch, id: "second" }]}
        disabled={false}
        save={async (p: string, m: string, b: any) => {
          bodies.push(b);
          return { version: 2 };
        }}
      />,
    );
    fireEvent.click(screen.getByText("Shared menus and central stock"));
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Same menu everywhere (prices can differ)",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save menu and stock settings" }),
    );
    await screen.findByText("Saved");
    assert.equal(bodies[0].menuMode, "shared");
    assert.ok(bodies[0].requestKey);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("uncertain menu publication retries its original reviewed body", async () => {
  const { default: OnboardingLaunch } =
    await import("../src/mera/workspace/OnboardingLaunch");
  const bodies: any[] = [];
  let fail = true;
  globalThis.fetch = async (url) =>
    Response.json(
      String(url).endsWith("publication-preview")
        ? {
            products: [{ name: "Rice" }],
            previewHash: "a".repeat(64),
            publishedVersion: 0,
          }
        : String(url).endsWith("qr-codes")
          ? {
              codes: [
                {
                  id: "existing",
                  kind: "branch",
                  url: "https://example.com/q/1",
                },
              ],
            }
          : { checks: [], launchState: "draft" },
    );
  const props = {
    base: "/organizations/org/branches/branch",
    organization: org,
    branding: {},
    items: [{ name: "Rice", price: 100 }],
    capabilities: [],
    contact: "hello@venue.test",
    methods: ["cash"],
    disabled: false,
    onFix: () => {},
    onFinished: () => {},
    save: async (p: string, m: string, b: any) => {
      if (p.endsWith("menu/publish")) {
        bodies.push(b);
        if (fail) throw Error("Connection lost");
        return { version: 1 };
      }
      if (p.endsWith("launch-policy")) return { checks: [], canPublish: true };
      if (p.endsWith("/launch")) return { launchState: "published" };
      return { onboarding: { completedAt: "now" } };
    },
  };
  try {
    const view = render(<OnboardingLaunch {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Go live" }));
    await screen.findByText("Connection lost");
    view.unmount();
    fail = false;
    render(<OnboardingLaunch {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Go live" }));
    await screen.findByRole("link", { name: "Open menu" });
    assert.deepEqual(bodies[0], bodies[1]);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
