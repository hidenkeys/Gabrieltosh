import test from "node:test";
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
test("guided setup preserves form drafts, saves resume position and never equates a visited step with readiness", async () => {
  let persisted: any = {};
  const save = async (path: string, method: string, body: any) => {
    assert.equal(path, "/organizations/org-one/onboarding");
    assert.equal(method, "PATCH");
    persisted = { data: { ...body.data } };
    return { saved: true, onboarding: persisted };
  };
  try {
    const view = render(<OwnerSetup {...base} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "02 Business" }));
    await screen.findByRole("heading", { name: "Business" });
    fireEvent.change(screen.getByLabelText("Business contact draft"), {
      target: { value: "Unsaved draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Branch" });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const title = await screen.findByRole("heading", { name: "Business" });
    assert.equal(
      (screen.getByLabelText("Business contact draft") as HTMLInputElement)
        .value,
      "Unsaved draft",
    );
    await waitFor(() => assert.equal(document.activeElement, title));
    assert.deepEqual(persisted, { data: { "ownerGuideV2Step_branch-one": 1 } });
    view.unmount();
    render(<OwnerSetup {...base} onboarding={persisted} save={save} />);
    assert.ok(screen.getByRole("heading", { name: "Business" }));
    assert.ok(
      screen.getByText("Visiting a step does not mark it complete.", {
        exact: false,
      }),
    );
  } finally {
    cleanup();
  }
});
test("unknown progress save locks navigation until exact step retry; branch-scoped users retain existing setup", async () => {
  const bodies: any[] = [];
  const save = async (_path: string, _method: string, body: any) => {
    bodies.push(body);
    if (bodies.length === 1) throw new Error("lost");
    return { saved: true, onboarding: { data: body.data } };
  };
  try {
    const view = render(<OwnerSetup {...base} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    assert.equal(
      (screen.getByRole("button", { name: "05 Go live" }) as HTMLButtonElement)
        .disabled,
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry saving this step" }),
    );
    await screen.findByRole("heading", { name: "Business" });
    assert.deepEqual(bodies[0], bodies[1]);
    view.unmount();
    render(<OwnerSetup {...base} canGuide={false} save={save} />);
    assert.equal(
      screen.queryByRole("region", { name: "Guided owner setup" }),
      null,
    );
    assert.ok(
      screen.getByRole("heading", { name: "Start with the essentials" }),
    );
  } finally {
    cleanup();
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

test("legacy nine-step progress maps to five stages and never mounts additional branch creation", () => {
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
