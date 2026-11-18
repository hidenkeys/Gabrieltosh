import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/workspace",
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
const { default: BranchSettings } =
  await import("../src/mera/workspace/BranchSettings");
const { default: LaunchReadiness } =
  await import("../src/mera/workspace/LaunchReadiness");
const base = "/organizations/org-1/branches/branch-1";
test("O3 settings sections retain edits and canonical save payloads", async () => {
  const calls: any[] = [];
  try {
    render(
      <BranchSettings
        branch={{
          settings: { address: "Old address", serviceModes: ["table_service"] },
          timezone: "Africa/Lagos",
          cutoff: 240,
        }}
        organization={{ id: "org-1", name: "Store" }}
        base={base}
        disabled={false}
        save={async (...args) => {
          calls.push(args);
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Branch address"), {
      target: { value: "New address" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Brand appearance" }));
    assert.equal(
      screen.queryByRole("button", { name: "Save branch policies" }),
      null,
    );
    fireEvent.change(screen.getByLabelText("Brand description"), {
      target: { value: "Fresh tea daily" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save branding" }).closest("form")!,
    );
    await waitFor(() => assert.equal(calls.length, 1));
    assert.equal(calls[0][0], "/organizations/org-1/branding");
    assert.equal(calls[0][2].description, "Fresh tea daily");
    fireEvent.click(screen.getByRole("button", { name: "Operating settings" }));
    assert.equal(
      (screen.getByLabelText("Branch address") as HTMLInputElement).value,
      "New address",
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Save branch policies" })
        .closest("form")!,
    );
    await waitFor(() => assert.equal(calls.length, 2));
    assert.equal(calls[1][0], base + "/settings");
    assert.deepEqual(calls[1][2].serviceModes, ["table_service"]);
    assert.equal(calls[1][2].cutoff, 240);
  } finally {
    cleanup();
  }
});
test("O3 save failures remain visible without claiming success", async () => {
  try {
    render(
      <BranchSettings
        branch={{ settings: {} }}
        organization={{ id: "org-1", name: "Store" }}
        base={base}
        disabled={false}
        save={async () => {
          throw new Error("Branch settings could not be saved");
        }}
      />,
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Save branch policies" })
        .closest("form")!,
    );
    await screen.findByRole("alert");
    assert(screen.getByText("Branch settings could not be saved"));
    assert.equal(screen.queryByRole("status"), null);
  } finally {
    cleanup();
  }
});
test("O3 failed publication checks offer retry and preserve explicit review requirements", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return count === 1
      ? Response.json({ error: "Temporarily unavailable" }, { status: 503 })
      : Response.json({
          launchState: "draft",
          paymentProviderState: "blocked",
          publicHostingVerified: false,
          checks: [],
          canPublish: false,
        });
  };
  try {
    render(
      <LaunchReadiness
        base={base}
        settings={{}}
        disabled={false}
        save={async () => {
          throw new Error("Should not save");
        }}
      />,
    );
    assert(screen.getByRole("status"));
    await screen.findByRole("button", { name: "Retry publication checks" });
    assert.equal(screen.queryByText("Checking branch readiness…"), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry publication checks" }),
    );
    await screen.findByRole("button", { name: "Publish branch menu" });
    assert(
      (
        screen.getByRole("button", {
          name: "Publish branch menu",
        }) as HTMLButtonElement
      ).disabled,
    );
    assert(
      (
        screen.getByRole("button", {
          name: "Save reviewed launch policy",
        }) as HTMLButtonElement
      ).disabled,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
