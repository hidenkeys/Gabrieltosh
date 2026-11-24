import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<html><body></body></html>", {
  url: "http://localhost",
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
const { render, screen, fireEvent, waitFor, cleanup } =
  await import("@testing-library/react");
const { default: OriginalLaunchReadiness } =
  await import("../src/mera/workspace/LaunchReadiness");
const { default: GoLiveChecklist } =
  await import("../src/mera/workspace/GoLiveChecklist");
const LaunchReadiness = (p: any) =>
  p.guidedStage === "payments" ? (
    <OriginalLaunchReadiness {...p} />
  ) : (
    <GoLiveChecklist
      {...p}
      settings={{ ...p.settings, publicContact: p.publicContact }}
    />
  );
const { default: BusinessDetails } =
  await import("../src/mera/workspace/BusinessDetails");
const ready = {
  checks: [{ id: "menu", label: "Menu", status: "ready" }],
  canPublish: true,
  launchState: "draft",
  paymentProviderState: "blocked",
};
const props = {
  base: "/branches/guided",
  settings: { manualPaymentMethods: ["cash"] },
  disabled: false,
  publicContact: "+2348012345678",
  guidedStage: "review" as const,
};
test("one explicit go-live persists reviewed original policy then publication; no repeat contact or acknowledgements", async () => {
  window.sessionStorage.clear();
  const calls: any[] = [];
  globalThis.fetch = async () => Response.json(ready);
  try {
    render(
      <LaunchReadiness
        {...props}
        save={async (...args) => {
          calls.push(args);
          return args[0].endsWith("launch-policy")
            ? ready
            : { ...ready, launchState: "published" };
        }}
      />,
    );
    const go = await screen.findByRole("button", { name: "Go live" });
    assert.equal(
      screen.queryByRole("textbox", { name: "Public customer contact" }),
      null,
    );
    assert.equal(screen.queryByRole("checkbox"), null);
    assert.equal(calls.length, 0);
    fireEvent.click(go);
    await waitFor(() => assert.equal(calls.length, 2));
    assert.deepEqual(calls[0].slice(0, 3), [
      "/branches/guided/launch-policy",
      "PATCH",
      {
        manualPaymentMethods: ["cash"],
        launchAcknowledged: true,
        publicContact: props.publicContact,
      },
    ]);
    assert.deepEqual(calls[1].slice(0, 3), [
      "/branches/guided/launch",
      "POST",
      { confirm: true },
    ]);
    await waitFor(() => assert.equal(window.sessionStorage.length, 0));
    assert.equal((go as HTMLButtonElement).disabled, true);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
test("blocked authoritative policy never publishes; malformed acknowledgement stays locked across remount", async () => {
  globalThis.fetch = async () => Response.json(ready);
  window.sessionStorage.clear();
  let writes = 0;
  try {
    const blocked = render(
      <LaunchReadiness
        {...props}
        save={async () => {
          writes++;
          return { ...ready, canPublish: false };
        }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Go live" }));
    await screen.findByText(/Complete the remaining checks/);
    assert.equal(writes, 1);
    blocked.unmount();
    const save = async () => {
      writes++;
      return { saved: true };
    };
    const view = render(<LaunchReadiness {...props} save={save} />);
    fireEvent.click(await screen.findByRole("button", { name: "Go live" }));
    await screen.findByText(/reviewed policy response could not be confirmed/);
    assert.equal(writes, 2);
    view.unmount();
    render(<LaunchReadiness {...props} save={save} />);
    assert.equal(
      (
        (await screen.findByRole("button", {
          name: "Go live",
        })) as HTMLButtonElement
      ).disabled,
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Recheck readiness" }));
    await waitFor(() => assert.equal(writes, 2));
    assert.equal(
      (screen.getByRole("button", { name: "Go live" }) as HTMLButtonElement)
        .disabled,
      true,
    );
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
test("payments retain chosen methods into review and no authority change can dispatch publication", async () => {
  globalThis.fetch = async () => Response.json(ready);
  window.sessionStorage.clear();
  let resolve: any;
  const calls: any[] = [];
  const save = async (...args: any[]) => {
    calls.push(args);
    return new Promise((r) => {
      resolve = r;
    });
  };
  try {
    const view = render(
      <LaunchReadiness {...props} guidedStage="payments" save={save} />,
    );
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "External card / POS" }),
    );
    view.rerender(<LaunchReadiness {...props} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Go live" }));
    await waitFor(() => assert.equal(calls.length, 1));
    assert.deepEqual(calls[0][2].manualPaymentMethods, [
      "cash",
      "external_pos",
    ]);
    view.rerender(<LaunchReadiness {...props} disabled save={save} />);
    resolve(ready);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls.length, 1);
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
test("guided business asks contact once and preserves legacy metadata in unchanged body", async () => {
  let body: any;
  let contact = "";
  try {
    render(
      <BusinessDetails
        organizationId="org"
        onboarding={{
          data: {
            contact: "Legacy name",
            phone: "08011111111",
            serviceMode: "table_service",
          },
        }}
        canEdit
        disabled={false}
        guided
        initialContact="+2348011111111"
        onContactSaved={(value) => (contact = value)}
        save={async (_p, _m, value) => {
          body = value;
          return { saved: true };
        }}
      />,
    );
    assert.equal(screen.queryByLabelText("Phone"), null);
    assert.equal(screen.queryByLabelText("Primary service"), null);
    fireEvent.change(screen.getByLabelText("Public customer contact"), {
      target: { value: "help@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save business details" }),
    );
    await waitFor(() => assert.equal(contact, "help@example.com"));
    assert.deepEqual(body, {
      step: 1,
      data: {
        contact: "help@example.com",
        phone: "08011111111",
        serviceMode: "table_service",
      },
    });
  } finally {
    cleanup();
  }
});

test("parent mutation busy is not mistaken for revoked authority between policy and launch", async () => {
  globalThis.fetch = async () => Response.json(ready);
  window.sessionStorage.clear();
  let finishPolicy: any;
  const calls: string[] = [];
  const save = async (path: string) => {
    calls.push(path);
    if (path.endsWith("launch-policy"))
      return new Promise((resolve) => {
        finishPolicy = resolve;
      });
    return { ...ready, launchState: "published" };
  };
  try {
    const view = render(
      <LaunchReadiness {...props} accessBlocked={false} save={save} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Go live" }));
    await waitFor(() => assert.equal(calls.length, 1));
    view.rerender(
      <LaunchReadiness {...props} disabled accessBlocked={false} save={save} />,
    );
    finishPolicy(ready);
    await waitFor(() => assert.equal(calls.length, 2));
    await waitFor(() => assert.equal(window.sessionStorage.length, 0));
    assert.equal(
      screen.queryByRole("region", { name: "Go-live checklist" }),
      null,
    );
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});

test("checklist shows actionable readiness and a definite409 clears recovery", async () => {
  window.sessionStorage.clear();
  const opened: string[] = [];
  globalThis.fetch = async () =>
    Response.json({
      ...ready,
      checks: [
        { id: "menu", status: "ready" },
        { id: "printing", status: "blocked" },
        { id: "manual_platform_policy", status: "blocked" },
      ],
    });
  try {
    const view = render(
      <GoLiveChecklist
        {...props}
        settings={{ ...props.settings, publicContact: props.publicContact }}
        onOpen={(s) => opened.push(s)}
        save={async () => {
          throw Object.assign(new Error("NOT_READY"), { status: 409 });
        }}
      />,
    );
    await screen.findByText("Ready to go live · 1 of 3 done");
    assert.ok(screen.getByText("Done"));
    assert.ok(screen.getByText("To do"));
    assert.ok(screen.getByText("Waiting on Mera"));
    assert.equal(
      screen
        .getByRole("progressbar", { name: "Go-live progress" })
        .getAttribute("aria-valuenow"),
      "1",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add and publish your menu" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Design receipt and stickers" }),
    );
    assert.deepEqual(opened, ["menu", "printing"]);
    fireEvent.click(screen.getByRole("button", { name: "Go live" }));
    await screen.findByText("NOT_READY");
    assert.equal(window.sessionStorage.length, 0);
    assert.equal(
      screen.queryByText(/previous launch attempt is unconfirmed/),
      null,
    );
    view.unmount();
  } finally {
    cleanup();
    window.sessionStorage.clear();
  }
});
