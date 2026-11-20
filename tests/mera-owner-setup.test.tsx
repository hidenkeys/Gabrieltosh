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
  name: "First branch",
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
    fireEvent.click(screen.getByRole("button", { name: "02 Your business" }));
    await screen.findByRole("heading", { name: "Your business" });
    fireEvent.change(screen.getByLabelText("Business contact draft"), {
      target: { value: "Unsaved draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "First branch" });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const title = await screen.findByRole("heading", { name: "Your business" });
    assert.equal(
      (screen.getByLabelText("Business contact draft") as HTMLInputElement)
        .value,
      "Unsaved draft",
    );
    await waitFor(() => assert.equal(document.activeElement, title));
    assert.deepEqual(persisted, { data: { "ownerGuideStep_branch-one": 1 } });
    view.unmount();
    render(<OwnerSetup {...base} onboarding={persisted} save={save} />);
    assert.ok(screen.getByRole("heading", { name: "Your business" }));
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
      (screen.getByRole("button", { name: "05 Menu" }) as HTMLButtonElement)
        .disabled,
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
  globalThis.fetch = (async () => Response.json({ available: true })) as any;
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
