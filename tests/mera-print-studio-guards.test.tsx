import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003",
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
const { render, screen, fireEvent, waitFor, cleanup, act, within } =
  await import("@testing-library/react");
function fillPresetDetails(label: string, value: string) {
  fireEvent.click(
    within(screen.getByRole("group", { name: label, hidden: true })).getByRole(
      "radio",
      { name: "Other", hidden: true },
    ),
  );
  fireEvent.change(screen.getByLabelText(`${label} details`), {
    target: { value },
  });
}

const { default: PrintStudio } =
  await import("../src/mera/workspace/PrintStudio");
const base = "/organizations/org/branches/branch",
  format = {
    version: 1,
    receipt: {
      businessName: "Venue",
      footer: "Thank you",
      showStaff: true,
      paperWidth: 58,
    },
    label: { width: 50, height: 40 },
  };
const original = globalThis.fetch;
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(() => window.sessionStorage.clear());
const props = {
  base,
  actorId: "staff-one",
  disabled: false,
  canViewJobs: true,
  canReprint: true,
  save: async () => format,
};
async function edit() {
  await screen.findByTitle("Receipt sample preview");
  fireEvent.click(screen.getByText("Edit receipt & sticker format"));
  fireEvent.change(screen.getByLabelText("Business heading"), {
    target: { value: "Local draft" },
  });
}
test("local dirty format survives saved-format refresh and permission changes; sample uses branch and remains NOT A SALE", async () => {
  let reads = 0;
  globalThis.fetch = async (input) =>
    Response.json(
      String(input).endsWith("/templates")
        ? {
            ...format,
            receipt: {
              ...format.receipt,
              businessName: ++reads === 1 ? "Venue" : "Latest canonical",
            },
          }
        : [],
    );
  try {
    const view = render(<PrintStudio {...props} branchName="Surulere" />);
    await edit();
    const frame = screen.getByTitle("Receipt sample preview");
    assert.match(frame.getAttribute("srcdoc") || "", /SAMPLE — NOT A SALE/);
    assert.match(frame.getAttribute("srcdoc") || "", /Surulere/);
    fireEvent.click(
      screen.getByRole("button", { name: "Read latest saved format" }),
    );
    await screen.findByText(/Latest saved heading: Latest canonical/);
    assert.equal(
      (screen.getByLabelText("Business heading") as HTMLInputElement).value,
      "Local draft",
    );
    view.rerender(<PrintStudio {...props} canViewJobs={false} />);
    assert.equal(
      (screen.getByLabelText("Business heading") as HTMLInputElement).value,
      "Local draft",
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("format writes serialize synchronously and unknown save stays frozen after reading canonical format", async () => {
  let writes = 0,
    reject: any;
  globalThis.fetch = async (input) =>
    Response.json(String(input).endsWith("/templates") ? format : []);
  try {
    render(
      <PrintStudio
        {...props}
        save={async () => {
          writes++;
          return await new Promise((_r, r) => (reject = r));
        }}
      />,
    );
    await edit();
    const form = screen
      .getByRole("button", { name: "Save templates" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    assert.equal(writes, 1);
    await act(async () => reject(Error("Unknown save")));
    await screen.findByText("Format save unconfirmed");
    fireEvent.click(
      screen.getByRole("button", { name: "Read latest saved format" }),
    );
    await screen.findByText(/Latest saved heading: Venue/);
    assert.equal(
      (screen.getByLabelText("Business heading") as HTMLInputElement).closest(
        "fieldset",
      )!.disabled,
      true,
    );
    assert.equal(writes, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
for (const status of [401, 403, 404])
  test(`print read ${status} hides private templates/jobs and disables further interaction`, async () => {
    let jobReads = 0;
    globalThis.fetch = async (input) =>
      String(input).endsWith("/templates")
        ? Response.json(format)
        : ++jobReads === 1
          ? Response.json([
              {
                id: "job",
                kind: "receipt",
                status: "queued",
                createdAt: "2026-11-19T10:00:00Z",
              },
            ])
          : Response.json({ error: "Denied" }, { status });
    try {
      render(<PrintStudio {...props} timeZone="Africa/Lagos" />);
      await screen.findByText("Receipt · Order reference unavailable");
      assert.ok(screen.getByText("19 Nov 2026, 11:00 · Africa/Lagos"));
      fireEvent.click(
        screen.getByRole("button", { name: "Refresh print jobs" }),
      );
      await screen.findByText(/Print access needs checking/);
      assert.equal(screen.queryByTitle("Receipt sample preview"), null);
      assert.equal(screen.queryByRole("button"), null);
      assert.equal(screen.queryByText("Print jobs"), null);
    } finally {
      cleanup();
      globalThis.fetch = original;
    }
  });
test("permission loss hides jobs immediately, rejects late read and never exposes reprint reason on return", async () => {
  let resolve: any;
  globalThis.fetch = async (input) =>
    String(input).endsWith("/templates")
      ? Response.json(format)
      : await new Promise((r) => (resolve = r));
  try {
    const view = render(<PrintStudio {...props} />);
    await screen.findByTitle("Receipt sample preview");
    view.rerender(
      <PrintStudio {...props} canViewJobs={false} canReprint={false} />,
    );
    await act(async () =>
      resolve(
        Response.json([
          {
            id: "old",
            kind: "receipt",
            status: "queued",
            documentSnapshot: { reference: "PRIVATE_OLD_REFERENCE" },
          },
        ]),
      ),
    );
    assert.equal(screen.queryByText(/PRIVATE_OLD_REFERENCE/), null);
    assert.equal(
      screen.queryByRole("group", { name: "Reason for reprint", hidden: true }),
      null,
    );
    assert.ok(screen.getByText(/Order access is required/));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("unknown reprint while permission is removed remains frozen when access returns, without a duplicate retry", async () => {
  let writes = 0,
    reject: any;
  globalThis.fetch = async (input) =>
    Response.json(
      String(input).endsWith("/templates")
        ? format
        : [
            {
              id: "job",
              kind: "receipt",
              status: "queued",
              createdAt: "invalid",
            },
          ],
    );
  try {
    const p = {
      ...props,
      save: async () => {
        writes++;
        return await new Promise((_r, r) => (reject = r));
      },
    };
    const view = render(<PrintStudio {...p} />);
    await screen.findByRole("button", { name: "Queue marked duplicate" });
    assert.ok(screen.getByText("Time unavailable"));
    fillPresetDetails("Reason for reprint", "Paper jam");
    const button = screen.getByRole("button", {
      name: "Queue marked duplicate",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    assert.equal(writes, 1);
    view.rerender(<PrintStudio {...p} canReprint={false} />);
    await act(async () => reject(Error("Network unknown")));
    view.rerender(<PrintStudio {...p} />);
    assert.equal(screen.queryByLabelText("Reason for reprint details"), null);
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Queue marked duplicate",
        }) as HTMLButtonElement
      ).disabled,
      true,
    );
    assert.equal(writes, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("format write denial clears private draft and ignores old-scope write completion", async () => {
  let resolve: any;
  globalThis.fetch = async (input) =>
    Response.json(String(input).endsWith("/templates") ? format : []);
  try {
    const view = render(
      <PrintStudio
        {...props}
        save={async () => await new Promise((r) => (resolve = r))}
      />,
    );
    await edit();
    fireEvent.submit(
      screen.getByRole("button", { name: "Save templates" }).closest("form")!,
    );
    view.rerender(
      <PrintStudio
        {...props}
        base="/organizations/org/branches/new"
        save={async () => {
          throw Object.assign(Error("Forbidden"), { status: 403 });
        }}
      />,
    );
    await act(async () =>
      resolve({
        ...format,
        receipt: { ...format.receipt, businessName: "OLD PRIVATE" },
      }),
    );
    await edit();
    assert.equal(screen.queryByText(/OLD PRIVATE/), null);
    fireEvent.submit(
      screen.getByRole("button", { name: "Save templates" }).closest("form")!,
    );
    await screen.findByText(/Print access needs checking/);
    assert.equal(screen.queryByLabelText("Business heading"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("minimum label dimensions carry a calibration warning without claiming content fits", async () => {
  globalThis.fetch = async (input) =>
    Response.json(
      String(input).endsWith("/templates")
        ? { ...format, label: { width: 20, height: 15 } }
        : [],
    );
  try {
    render(<PrintStudio {...props} />);
    await screen.findByTitle("Receipt sample preview");
    fireEvent.click(
      screen.getByRole("button", { name: "Sticker", exact: true }),
    );
    await screen.findByText(/This small label may need more space/);
    assert.ok(screen.getByTitle("Sticker sample preview"));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
