import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
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
const { default: BusinessDetails } =
  await import("../src/mera/workspace/BusinessDetails");
const initial = {
  status: "published",
  data: {
    contact: "Saved contact",
    phone: "01234",
    serviceMode: "table_service",
  },
};
test("business details resume saved values without overwriting edits on a background refresh", () => {
  try {
    const props = {
      organizationId: "org",
      onboarding: initial,
      canEdit: true,
      disabled: false,
      save: async () => ({ saved: true }),
    };
    const ui = render(<BusinessDetails {...props} />);
    assert.equal(
      (screen.getByLabelText("Business contact") as HTMLInputElement).value,
      "Saved contact",
    );
    fireEvent.change(screen.getByLabelText("Business contact"), {
      target: { value: "Unsaved contact" },
    });
    ui.rerender(
      <BusinessDetails
        {...props}
        onboarding={{
          ...initial,
          data: { ...initial.data, contact: "Another admin" },
        }}
      />,
    );
    assert.equal(
      (screen.getByLabelText("Business contact") as HTMLInputElement).value,
      "Unsaved contact",
    );
    fireEvent.click(screen.getByRole("button", { name: "Use saved details" }));
    assert.equal(
      (screen.getByLabelText("Business contact") as HTMLInputElement).value,
      "Another admin",
    );
  } finally {
    cleanup();
  }
});
test("unconfirmed save locks exact business details through later failures and never announces success", async () => {
  const calls: any[] = [];
  let count = 0;
  try {
    render(
      <BusinessDetails
        organizationId="org"
        onboarding={initial}
        canEdit
        disabled={false}
        save={async (...args: any[]) => {
          calls.push(args);
          if (++count < 3)
            throw count === 1
              ? new TypeError("network")
              : Object.assign(new Error("rate"), { status: 429 });
          return { saved: true };
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save business details" }),
    );
    await screen.findByRole("alert");
    assert.equal(screen.queryByText("Business details saved."), null);
    assert.equal(
      (screen.getByLabelText("Business contact") as HTMLInputElement).matches(
        ":disabled",
      ),
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original business details" }),
    );
    await waitFor(() => assert.equal(calls.length, 2));
    await waitFor(() =>
      assert.equal(
        (
          screen.getByRole("button", {
            name: "Retry original business details",
          }) as HTMLButtonElement
        ).disabled,
        false,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original business details" }),
    );
    await screen.findByText("Business details saved.");
    assert.deepEqual(calls[0][2], calls[1][2]);
    assert.deepEqual(calls[1][2], calls[2][2]);
    assert.deepEqual(calls[0][2], { step: 1, data: initial.data });
  } finally {
    cleanup();
  }
});
test("branch-scoped managers can read business details but cannot save organization-wide data", () => {
  try {
    render(
      <BusinessDetails
        organizationId="org"
        onboarding={initial}
        canEdit={false}
        disabled={false}
        save={async () => {
          throw new Error("No write expected");
        }}
      />,
    );
    assert(
      screen.getByText(
        "Organization details are managed by an organization administrator.",
      ),
    );
    assert.equal(
      screen.queryByRole("button", { name: "Save business details" }),
      null,
    );
    assert.equal(
      (screen.getByLabelText("Business contact") as HTMLInputElement).matches(
        ":disabled",
      ),
      true,
    );
  } finally {
    cleanup();
  }
});
