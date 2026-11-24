import { chooseField } from "./choice-field-helpers";
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
const { default: QrCodes } = await import("../src/mera/workspace/QrCodes");
const base = "/organizations/org-a/branches/branch-a",
  format = {
    version: 1,
    receipt: {
      businessName: "Venue",
      footer: "<script>unsafe</script>",
      showStaff: true,
      paperWidth: 58,
    },
    label: { width: 50, height: 40 },
  };
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(() => window.sessionStorage.clear());
test("O7 receipt and sticker samples precede format editor and keep exact template payload", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async (input) => {
    if (String(input).includes("/templates/save-attempts/")) {
      const body = writes.at(-1)[2],
        intent = { receipt: body.receipt, label: body.label };
      return Response.json({
        requestKey: body.requestKey,
        actorId: "staff-one",
        organizationId: "org-a",
        branchId: "branch-a",
        operation: "template_save",
        targetId: null,
        status: "recorded",
        resultBasis: "recorded_operation_snapshot",
        result: { id: "format-id", version: 2, ...intent },
        operationRecord: {
          id: "op",
          requestKey: body.requestKey,
          actorId: "staff-one",
          operation: "template_save",
          targetId: null,
          intent,
        },
      });
    }
    return Response.json(String(input).endsWith("/templates") ? format : []);
  };
  try {
    const { container } = render(
      <PrintStudio
        actorId="staff-one"
        base={base}
        disabled={false}
        canViewJobs={false}
        canReprint={false}
        save={async (...args) => {
          writes.push(args);
          return { ...format, version: 2 };
        }}
      />,
    );
    await screen.findByTitle("Receipt sample preview");
    assert.equal(
      (container.querySelector(".mw-print-format") as HTMLDetailsElement).open,
      false,
    );
    assert(
      screen.getByText(
        "Order access is required to view this branch’s print queue.",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Sticker", exact: true }),
    );
    const sticker = screen.getByTitle("Sticker sample preview");
    assert(sticker.getAttribute("srcdoc")?.includes("size:50mm 40mm"));
    fireEvent.click(screen.getByText("Edit receipt & sticker format"));
    fireEvent.change(screen.getByLabelText("Business heading"), {
      target: { value: "Updated venue" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save templates" }).closest("form")!,
    );
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0][0], base + "/templates");
    assert.equal(writes[0][1], "PUT");
    assert.equal(writes[0][2].receipt.businessName, "Updated venue");
    assert.equal(writes[0][2].version, undefined);
    assert.equal(typeof writes[0][2].requestKey, "string");
    assert.equal(writes[0][2].label.width, 50);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O7 format and queue failures retry independently without false queue empty", async () => {
  const original = globalThis.fetch;
  let formats = 0,
    queues = 0;
  globalThis.fetch = async (input) =>
    String(input).endsWith("/templates")
      ? ++formats === 1
        ? Response.json({ error: "No" }, { status: 503 })
        : Response.json(format)
      : ++queues === 1
        ? Response.json({ error: "No" }, { status: 503 })
        : Response.json([]);
  try {
    render(
      <PrintStudio
        actorId="staff-one"
        base={base}
        disabled={false}
        canViewJobs
        canReprint={false}
        save={async () => {}}
      />,
    );
    await screen.findByRole("button", { name: "Retry loading formats" });
    await screen.findByRole("button", { name: "Retry loading print jobs" });
    assert.equal(screen.queryByText("No print jobs in this branch."), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading formats" }),
    );
    await screen.findByTitle("Receipt sample preview");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading print jobs" }),
    );
    await screen.findByText("No print jobs in this branch.");
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O7 unknown format save freezes changed writes while reading a saved version never unlocks it", async () => {
  const original = globalThis.fetch;
  let reads = 0,
    writes = 0;
  globalThis.fetch = async () =>
    Response.json(
      ++reads === 1
        ? format
        : {
            ...format,
            version: 3,
            receipt: {
              ...format.receipt,
              businessName: "Latest saved heading",
            },
          },
    );
  try {
    render(
      <PrintStudio
        actorId="staff-one"
        base={base}
        disabled={false}
        canViewJobs={false}
        canReprint={false}
        save={async () => {
          writes++;
          throw new TypeError("Unknown save");
        }}
      />,
    );
    await screen.findByTitle("Receipt sample preview");
    fireEvent.click(screen.getByText("Edit receipt & sticker format"));
    fireEvent.change(screen.getByLabelText("Business heading"), {
      target: { value: "Original attempted heading" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save templates" }).closest("form")!,
    );
    await screen.findByText("Format save unconfirmed");
    assert(
      (
        screen
          .getByLabelText("Business heading")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Read latest saved format" }),
    );
    await screen.findByText(/Latest saved heading: Latest saved heading/);
    assert(
      (
        screen
          .getByLabelText("Business heading")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    );
    assert.equal(
      (screen.getByLabelText("Business heading") as HTMLInputElement).value,
      "Original attempted heading",
    );
    assert.equal(writes, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O7 QR address failure has retry and never claims successful empty or public reachability", async () => {
  const original = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async (input) =>
    String(input).includes("/qr-preview")
      ? Response.json({
          url: "https://menu.example.test/mera/menu/venue/branch?preview=test",
          opensAs: "menu_only",
          warnings: [],
        })
      : ++reads === 1
        ? Response.json({ error: "HTTPS origin unavailable" }, { status: 503 })
        : Response.json({ codes: [] });
  try {
    render(<QrCodes base={base} tables={[]} demo={false} />);
    await screen.findByText(
      "The public menu address is not ready. Ask an administrator to verify it before sharing codes.",
    );
    assert.equal(
      screen.queryByText("No menu codes have been created for this branch."),
      null,
    );
    assert(
      (
        screen
          .getByRole("button", { name: "Create menu code" })
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading menu codes" }),
    );
    await screen.findByText("No menu codes have been created for this branch.");
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O7 QR natural-destination retry retains original body and exports only scoped image paths", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async (_input, init: any = {}) => {
    if (init.method === "POST") {
      writes.push(JSON.parse(init.body));
      if (writes.length === 1) throw new TypeError("Unknown creation");
      return Response.json({
        id: "qr-1",
        kind: "table",
        tableId: "table-a",
        url: "https://menu.example.test/api/mera/v1/public/qr/qr-1",
      });
    }
    return Response.json({ codes: [] });
  };
  try {
    render(
      <QrCodes
        base={base}
        tables={[{ id: "table-a", name: "Window table" }]}
        demo
      />,
    );
    await screen.findByText("No menu codes have been created for this branch.");
    chooseField(screen, fireEvent, "Menu destination", String("table"));
    chooseField(screen, fireEvent, "Table", String("table-a"));
    fireEvent.submit(
      screen.getByRole("button", { name: "Create menu code" }).closest("form")!,
    );
    await screen.findByText("Code creation unconfirmed");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original menu code" }),
    );
    const svg = await screen.findByRole("link", { name: "Export SVG" });
    assert.deepEqual(writes, [
      { kind: "table", tableId: "table-a" },
      { kind: "table", tableId: "table-a" },
    ]);
    assert.equal(
      svg.getAttribute("href"),
      "/api/mera/v1" + base + "/qr-codes/qr-1/image.svg",
    );
    assert(screen.getByText(/not guaranteed to be publicly reachable/));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O7 stale QR read cannot expose codes from a previous branch", async () => {
  const original = globalThis.fetch;
  let release: ((response: Response) => void) | undefined;
  globalThis.fetch = async (input) =>
    String(input).includes("branch-a/")
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json({ codes: [] });
  try {
    const view = render(<QrCodes base={base} tables={[]} demo />);
    assert(release);
    view.rerender(
      <QrCodes
        base="/organizations/org-a/branches/branch-b"
        tables={[]}
        demo
      />,
    );
    await screen.findByText("No menu codes have been created for this branch.");
    await act(async () => {
      release!(
        Response.json({
          codes: [
            {
              id: "private",
              kind: "branch",
              url: "https://private-old.example.test",
            },
          ],
        }),
      );
      await Promise.resolve();
    });
    assert.equal(screen.queryByRole("link", { name: "Export SVG" }), null);
    assert.equal(screen.queryByText("https://private-old.example.test"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("O7 unknown reprint never resends on queue refresh and queue previews use saved references", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  const job = {
    id: "job-a",
    kind: "receipt",
    status: "queued",
    orderId: "raw-order-private",
    documentSnapshot: {
      businessName: "Venue",
      branchName: "Branch",
      reference: "A1",
      currency: "NGN",
      template: format.receipt,
      items: [],
      total: 0,
      appliedPaid: 0,
    },
  };
  globalThis.fetch = async (input) =>
    Response.json(String(input).endsWith("/templates") ? format : [job]);
  try {
    render(
      <PrintStudio
        actorId="staff-one"
        base={base}
        disabled={false}
        canViewJobs
        canReprint
        save={async (...args) => {
          writes.push(args);
          throw new TypeError("Unknown duplicate");
        }}
      />,
    );
    await screen.findByRole("heading", { name: "Receipt · A1" });
    assert(screen.getByRole("region", { name: "Recent print jobs" }));
    assert.equal(screen.queryByText("raw-order-private"), null);
    fillPresetDetails("Reason for reprint", "Receipt damaged");
    fireEvent.click(
      screen.getByRole("button", { name: "Queue marked duplicate" }),
    );
    await screen.findByText("Duplicate request unconfirmed");
    fireEvent.click(screen.getByRole("button", { name: "Refresh print jobs" }));
    await screen.findByRole("heading", { name: "Receipt · A1" });
    assert.equal(writes.length, 1);
    assert.equal(typeof writes[0][2].requestKey, "string");
    assert.deepEqual(
      { ...writes[0][2], requestKey: undefined },
      { requestKey: undefined, reason: "Receipt damaged" },
    );
    assert(
      (
        screen.getByRole("button", {
          name: "Queue marked duplicate",
        }) as HTMLButtonElement
      ).disabled,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("O7 partially entered sticker dimensions show a recoverable preview error without losing the draft", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(format);
  try {
    render(
      <PrintStudio
        actorId="staff-one"
        base={base}
        disabled={false}
        canViewJobs={false}
        canReprint={false}
        save={async () => {}}
      />,
    );
    await screen.findByTitle("Receipt sample preview");
    fireEvent.click(screen.getByText("Edit receipt & sticker format"));
    fireEvent.change(screen.getByLabelText("Sticker width (mm)"), {
      target: { value: "" },
    });
    assert(
      screen.getByText("Enter valid paper dimensions to preview this layout."),
    );
    assert(
      (
        screen.getByRole("button", {
          name: "Print sample through browser",
        }) as HTMLButtonElement
      ).disabled,
    );
    fireEvent.change(screen.getByLabelText("Sticker width (mm)"), {
      target: { value: "50" },
    });
    assert.equal(
      screen.queryByText(
        "Enter valid paper dimensions to preview this layout.",
      ),
      null,
    );
    assert.equal(
      (screen.getByLabelText("Business heading") as HTMLInputElement).value,
      "Venue",
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
