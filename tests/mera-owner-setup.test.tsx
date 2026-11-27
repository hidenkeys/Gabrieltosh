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
test("guided setup autosaves business on Continue, preserves drafts and resumes without claiming readiness", async () => {
  let persisted: any = {};
  const writes: any[] = [];
  const save = async (path: string, method: string, body: any) => {
    writes.push({ path, body });
    assert.equal(method, "PATCH");
    if (path.endsWith("/operating")) return { version: 2 };
    persisted = { data: { ...persisted.data, ...body.data } };
    return { saved: true, onboarding: persisted };
  };
  try {
    const view = render(<OwnerSetup {...base} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const title = await screen.findByRole("heading", { name: "Your business" });
    await waitFor(() => assert.equal(document.activeElement, title));
    fireEvent.change(screen.getByLabelText("Public customer contact"), {
      target: { value: "owner@example.invalid" },
    });
    assert.equal(writes.length, 1);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Kind of venue" });
    assert.ok(
      writes.some((w) => w.body.data?.contact === "owner@example.invalid"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Your business" });
    assert.equal(
      (screen.getByLabelText("Public customer contact") as HTMLInputElement)
        .value,
      "owner@example.invalid",
    );
    assert.equal(persisted.data["ownerGuideV3Step_branch-one"], 1);
    view.unmount();
    render(<OwnerSetup {...base} onboarding={persisted} save={save} />);
    assert.ok(screen.getByRole("heading", { name: "Your business" }));
    assert.ok(screen.getByText("Visiting a step does not mark it complete."));
    assert.equal(screen.queryByRole("button", { name: "Menu & stock" }), null);
  } finally {
    cleanup();
    window.sessionStorage.clear();
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
      (
        screen.getByRole("button", {
          name: "Review & finish setup",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry saving this step" }),
    );
    await screen.findByRole("heading", { name: "Your business" });
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
    assert.ok(screen.getByRole("heading", { name: "Review & finish setup" }));
    assert.equal(
      screen.queryByRole("button", { name: "Create another branch" }),
      null,
    );
    assert.equal(
      screen
        .getByRole("navigation", { name: "Owner setup steps" })
        .querySelectorAll("ol button").length,
      6,
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
        onboarding={{ data: { "ownerGuideV3Step_branch-one": 2 } }}
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
    await screen.findByRole("heading", { name: "Locations" });
    const body = writes.find((w) => w.path.endsWith("/settings")).body;
    assert.equal(body.venueType, "hotel_fb");
    assert.ok(body.capabilities.includes("room_charge"));
    assert.ok(body.requestKey);
    assert.equal(body.version, 1);
    assert.ok(screen.getByText(/single items, packages like bottle service/));
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
            : { saved: true, onboarding: { data: body.data } };
        }}
      />,
    );
    assert.equal(screen.queryByRole("button", { name: "Menu & stock" }), null);
    fireEvent.click(screen.getByRole("radio", { name: "2–5" }));
    assert.ok(screen.getByRole("button", { name: "Menu & stock" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Kind of venue" });
    assert.equal(
      writes.find((w) => w.path.endsWith("/operating")).body.locationCount,
      "few",
    );
    assert.ok(
      screen.getByRole("switch", {
        name: "Are all your locations the same kind?",
      }),
    );
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
        onboarding={{ data: { "ownerGuideV3Step_branch-one": 2 } }}
        save={save}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Club & nightlife" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    view.unmount();
    fail = false;
    render(
      <OwnerSetup
        {...base}
        onboarding={{ data: { "ownerGuideV3Step_branch-one": 2 } }}
        save={save}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry saving this step" }),
    );
    await screen.findByRole("heading", { name: "Locations" });
    assert.deepEqual(writes[0], writes[1]);
    assert.equal(writes[0].body.payLater, true);
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
    assert.equal((screen.getByRole("checkbox", { name: "Cash" }) as HTMLInputElement).checked, true);
    await waitFor(() =>
      assert.equal(
        (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
          .disabled,
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Review & finish setup" });
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
    assert.ok(screen.getByRole("button", { name: "Finish setup" }));
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

test("new locations retain their exact creation key and overnight hours are split before settings save", async () => {
  window.sessionStorage.clear();
  const writes: any[] = [];
  let loseCreate = true;
  const save = async (path: string, method: string, body: any) => {
    writes.push({ path, method, body: structuredClone(body) });
    if (method === "POST") {
      if (loseCreate) {
        loseCreate = false;
        throw Error("lost response");
      }
      return { id: "second-location" };
    }
    return path.endsWith("/operating")
      ? { version: 2 }
      : path.endsWith("/settings")
        ? { version: body.version + 1 }
        : { saved: true, onboarding: { data: body.data } };
  };
  try {
    render(
      <OwnerSetup
        {...base}
        organization={{ ...org, operating: { locationCount: "few" } }}
        branch={{ ...branch, settings: { venueType: "club" } }}
        onboarding={{ data: { "ownerGuideV3Step_branch-one": 3 } }}
        save={save}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add another location" }),
    );
    const names = screen.getAllByLabelText("Location name");
    fireEvent.change(names[1], { target: { value: "Fictional North" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry saving this step" }),
    );
    await screen.findByRole("heading", { name: "Menu & stock" });
    const creations = writes.filter((w) => w.method === "POST");
    assert.equal(creations.length, 2);
    assert.deepEqual(creations[0], creations[1]);
    assert.equal(creations[0].body.code, "FIC");
    const second = writes.find((w) =>
      w.path.endsWith("/second-location/settings"),
    );
    assert.ok(second);
    assert.equal(second.body.payLater, true);
    assert.equal(second.body.serviceHours.length, 2);
    assert.ok(second.body.serviceHours.every((w: any) => w.end > w.start));
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
        onboarding={{ data: { "ownerGuideV3Step_branch-one": 2 } }}
        save={async (path, _method, body) => {
          writes.push({ path, body });
          return path.endsWith("/settings") || path.endsWith("/operating")
            ? { version: 2 }
            : { saved: true, onboarding: { data: body.data } };
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Locations" });
    assert.equal(
      writes.find((w) => w.path.endsWith("/settings")).body.payLater,
      false,
    );
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("review finishes onboarding without publication and returns home", async () => {
  window.sessionStorage.clear();
  let finished = false;
  let request: any;
  try {
    render(
      <OwnerSetup
        {...base}
        onboarding={{
          data: {
            "ownerGuideV3Step_branch-one": 6,
            contact: "hello@venue.test",
          },
        }}
        onFinished={() => {
          finished = true;
        }}
        save={async (path, method, body) => {
          request = { path, method, body };
          return {
            saved: true,
            onboarding: { completedAt: "2026-11-24T00:00:00Z" },
          };
        }}
      />,
    );
    assert.equal(
      screen
        .getAllByRole("navigation", { name: "Owner setup steps" })[0]
        .querySelectorAll("li").length,
      6,
    );
    assert.equal(screen.queryByRole("button", { name: "Go live" }), null);
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => assert.equal(finished, true));
    assert.equal(request.path, "/organizations/org-one/onboarding");
    assert.equal(request.body.complete, true);
    assert.equal(
      screen.queryByRole("heading", { name: "Review & finish setup" }),
      null,
    );
  } finally {
    cleanup();
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
          return path.endsWith("operating")
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
    await screen.findByRole("heading", { name: "Kind of venue" });
  } finally {
    cleanup();
  }
});
