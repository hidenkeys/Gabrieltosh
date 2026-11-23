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
const { render, screen, fireEvent, waitFor, cleanup, act } =
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
    fireEvent.click(screen.getByRole("button", { name: "6. Review" }));
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
    fireEvent.click(screen.getByRole("button", { name: "6. Review" }));
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

test("brand color text entry preserves valid colors and exposes incomplete hex input", async () => {
  const { default: BrandColorField } =
    await import("../src/mera/workspace/BrandColorField");
  const values: string[] = [];
  function Example() {
    const [value, setValue] = React.useState("#1558c9");
    return (
      <BrandColorField
        label="Primary color"
        value={value}
        onChange={(next) => {
          values.push(next);
          setValue(next);
        }}
      />
    );
  }
  try {
    render(<Example />);
    const field = screen.getByRole("textbox", {
      name: "Primary color hex",
    }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "#493" } });
    assert.equal(field.checkValidity(), false);
    assert.deepEqual(values, []);
    fireEvent.change(field, { target: { value: "#49324F" } });
    assert.equal(field.checkValidity(), true);
    assert.deepEqual(values, ["#49324F"]);
    assert.equal(
      (
        screen.getByLabelText("Primary color", {
          exact: true,
        }) as HTMLInputElement
      ).value,
      "#49324f",
    );
  } finally {
    cleanup();
  }
});

test("O3 settings locks duplicate and cross-form submits synchronously without retrying", async () => {
  let resolve: any;
  const writes: any[] = [];
  try {
    render(
      <BranchSettings
        branch={{ settings: {} }}
        organization={{ id: "org-1" }}
        base={base}
        disabled={false}
        save={async (...args) => {
          writes.push(args);
          return new Promise((r) => {
            resolve = r;
          });
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "6. Review" }));
    const operations = screen
      .getByRole("button", { name: "Save branch policies" })
      .closest("form")!;
    fireEvent.submit(operations);
    fireEvent.submit(operations);
    fireEvent.click(screen.getByRole("button", { name: "Brand appearance" }));
    fireEvent.submit(
      screen.getByRole("button", { name: "Save branding" }).closest("form")!,
    );
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], base + "/settings");
    await act(async () => resolve({}));
    assert.equal(
      writes.length,
      1,
      "settling a request must not submit the other form",
    );
  } finally {
    cleanup();
  }
});

test("O3 disabled setup rejects programmatic submissions and explicit validation rejection remains editable", async () => {
  let writes = 0;
  const props = {
    branch: { settings: {} },
    organization: { id: "org-1" },
    base,
    save: async () => {
      writes++;
      throw Object.assign(new Error("Review the timezone"), { status: 400 });
    },
  };
  try {
    const view = render(<BranchSettings {...props} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "6. Review" }));
    const form = screen
      .getByRole("button", { name: "Save branch policies" })
      .closest("form")!;
    fireEvent.submit(form);
    assert.equal(writes, 0);
    view.rerender(<BranchSettings {...props} disabled={false} />);
    fireEvent.submit(form);
    await screen.findByRole("alert");
    assert.equal(writes, 1);
    assert(!screen.queryByText("Branch settings saved."));
    fireEvent.change(screen.getByLabelText("Branch address"), {
      target: { value: "Reviewed address" },
    });
    assert.equal(
      (screen.getByLabelText("Branch address") as HTMLInputElement).value,
      "Reviewed address",
    );
    fireEvent.submit(form);
    await waitFor(() => assert.equal(writes, 2));
  } finally {
    cleanup();
  }
});
