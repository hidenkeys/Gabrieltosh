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
const { render, screen, fireEvent, waitFor, cleanup, act } =
  await import("@testing-library/react");
const { default: ExportJobs } =
  await import("../src/mera/workspace/ExportJobs");
const { default: Integrations } =
  await import("../src/mera/workspace/Integrations");
const base = "/organizations/org-a/branches/branch-a";
test("O7 integration read failure is retryable without a false empty list", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () =>
    ++count === 1
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : Response.json([]);
  try {
    render(<Integrations base={base} demo />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Retry loading integration access",
      }),
    );
    await screen.findByText("No integration credentials for this branch.");
    assert.equal(screen.queryByRole("alert"), null);
    assert.equal(count, 2);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O7 unknown credential creation never resends or unlocks from an empty read", async () => {
  const original = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (_input, init: any = {}) => {
    if (init.method === "POST") {
      writes++;
      throw new TypeError("Unknown create");
    }
    return Response.json([]);
  };
  try {
    render(<Integrations base={base} demo />);
    await screen.findByText("No integration credentials for this branch.");
    fireEvent.change(screen.getByLabelText("Credential name"), {
      target: { value: "Original adapter" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create simulator credential" })
        .closest("form")!,
    );
    await screen.findByText("Credential creation unconfirmed");
    fireEvent.click(
      screen.getByRole("button", { name: "Check existing integration access" }),
    );
    await screen.findByText("No integration credentials for this branch.");
    assert(
      (
        screen
          .getByLabelText("Credential name")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    );
    assert.equal(
      (screen.getByLabelText("Credential name") as HTMLInputElement).value,
      "Original adapter",
    );
    assert.equal(writes, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O7 late credential secret from an old branch is never exposed after switching scope", async () => {
  const original = globalThis.fetch;
  let release: ((response: Response) => void) | undefined;
  globalThis.fetch = async (_input, init: any = {}) =>
    init.method === "POST"
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json([]);
  try {
    const view = render(<Integrations base={base} demo />);
    await screen.findByText("No integration credentials for this branch.");
    fireEvent.change(screen.getByLabelText("Credential name"), {
      target: { value: "Old adapter" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create simulator credential" })
        .closest("form")!,
    );
    assert(release);
    view.rerender(
      <Integrations base="/organizations/org-a/branches/branch-b" demo />,
    );
    await screen.findByText("No integration credentials for this branch.");
    await act(async () => {
      release!(Response.json({ id: "old", token: "private-old-secret" }));
      await Promise.resolve();
    });
    assert.equal(screen.queryByDisplayValue("private-old-secret"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O6 exports distinguish failed reads from empty and only complete records offer downloads", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () =>
    ++count === 1
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : Response.json([
          {
            id: "q",
            type: "report_export",
            status: "queued",
            artifactId: "not-ready",
          },
          {
            id: "c",
            type: "report_export",
            status: "complete",
            artifactId: "ready",
          },
        ]);
  try {
    render(<ExportJobs base={base} disabled={false} save={async () => {}} />);
    await screen.findByRole("button", { name: "Retry loading export jobs" });
    assert.equal(screen.queryByText("No jobs for this branch."), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading export jobs" }),
    );
    const link = await screen.findByRole("link", {
      name: "Download report CSV",
    });
    assert.equal(screen.getAllByRole("link").length, 1);
    assert.equal(
      link.getAttribute("href"),
      "/api/mera/v1" + base + "/exports/ready/download",
    );
    assert(screen.getByRole("region", { name: "Report export records" }));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O6 unknown export retains its actor/date request key across read refresh and explicit retry", async () => {
  const original = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = async () => Response.json([]);
  try {
    render(
      <ExportJobs
        base={base}
        disabled={false}
        save={async (...args) => {
          calls.push(args);
          throw Object.assign(new Error("Original export unconfirmed"), {
            status: calls.length === 1 ? 0 : 409,
          });
        }}
      />,
    );
    await screen.findByText("No jobs for this branch.");
    fireEvent.change(screen.getByLabelText("Business date"), {
      target: { value: "2026-11-18" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Queue report export" })
        .closest("form")!,
    );
    await screen.findByText("Export request unconfirmed");
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh export jobs" }),
    );
    await screen.findByText("No jobs for this branch.");
    assert(screen.getByText("Original export unconfirmed"));
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original export request" }),
    );
    await waitFor(() => assert.equal(calls.length, 2));
    assert.deepEqual(calls[0][2], calls[1][2]);
    assert.equal(calls[0][2].date, "2026-11-18");
    assert(
      (
        screen
          .getByLabelText("Business date")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O6 a stale export read cannot restore another branch’s download", async () => {
  const original = globalThis.fetch;
  let release: ((response: Response) => void) | undefined;
  globalThis.fetch = async (input) =>
    String(input).includes("branch-a/")
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json([]);
  try {
    const view = render(
      <ExportJobs base={base} disabled={false} save={async () => {}} />,
    );
    assert(release);
    view.rerender(
      <ExportJobs
        base="/organizations/org-a/branches/branch-b"
        disabled={false}
        save={async () => {}}
      />,
    );
    await screen.findByText("No jobs for this branch.");
    await act(async () => {
      release!(
        Response.json([
          { id: "private", status: "complete", artifactId: "private-artifact" },
        ]),
      );
      await Promise.resolve();
    });
    assert.equal(
      screen.queryByRole("link", { name: "Download report CSV" }),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("O6 an unknown failed-job retry is not resent or unlocked by queue refresh", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async () =>
    Response.json([
      {
        id: "failed",
        type: "report_export",
        status: "failed",
        date: "2026-11-18",
        attempts: 3,
        error: "Worker unavailable",
      },
    ]);
  try {
    render(
      <ExportJobs
        base={base}
        disabled={false}
        save={async (...args) => {
          writes.push(args);
          throw new TypeError("Unknown retry");
        }}
      />,
    );
    await screen.findByRole("button", { name: "Retry failed job" });
    fireEvent.change(screen.getByLabelText("Retry reason"), {
      target: { value: "Worker restored" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Retry failed job" }).closest("form")!,
    );
    await screen.findByText(/retry outcome is unconfirmed/);
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh export jobs" }),
    );
    await screen.findByRole("button", { name: "Retry failed job" });
    assert(
      (
        screen
          .getByLabelText("Retry reason")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    );
    assert.deepEqual(writes[0][2], { reason: "Worker restored" });
    assert.equal(writes.length, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O7 a known credential creation keeps its one-time secret when the subsequent list read fails", async () => {
  const original = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async (_input, init: any = {}) =>
    init.method === "POST"
      ? Response.json({ id: "credential", token: "one-time-known-secret" })
      : ++reads === 1
        ? Response.json([])
        : Response.json({ error: "Read failed" }, { status: 503 });
  try {
    render(<Integrations base={base} demo />);
    await screen.findByText("No integration credentials for this branch.");
    fireEvent.change(screen.getByLabelText("Credential name"), {
      target: { value: "Known credential" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Create simulator credential" })
        .closest("form")!,
    );
    await screen.findByDisplayValue("one-time-known-secret");
    await screen.findByRole("button", {
      name: "Retry loading integration access",
    });
    assert.equal(screen.queryByText("Credential creation unconfirmed"), null);
    assert.equal(
      screen.queryByText("No integration credentials for this branch."),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("O6 native date input events and submit read the visible business date without clearing it", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async () => Response.json([]);
  try {
    render(
      <ExportJobs
        base={base}
        disabled={false}
        save={async (...args) => {
          writes.push(args);
          return { id: "queued", status: "queued" };
        }}
      />,
    );
    await screen.findByText("No jobs for this branch.");
    const input = screen.getByLabelText("Business date") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "2026-11-18" } });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Queue report export" })
        .closest("form")!,
    );
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0][2].date, "2026-11-18");
    assert.equal(input.value, "2026-11-18");
    assert.equal(writes[0][0], base + "/exports");
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("O6 submit validates the actual native date value and never sends a blank date", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async () => Response.json([]);
  try {
    render(
      <ExportJobs
        base={base}
        disabled={false}
        save={async (...args) => {
          writes.push(args);
        }}
      />,
    );
    await screen.findByText("No jobs for this branch.");
    const input = screen.getByLabelText("Business date") as HTMLInputElement;
    const form = screen
      .getByRole("button", { name: "Queue report export" })
      .closest("form")!;
    fireEvent.submit(form);
    assert.equal(writes.length, 0);
    assert(
      screen.getByText(
        "Choose a valid business date before requesting a report.",
      ),
    );
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "2026-11-19");
    fireEvent.submit(form);
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0][2].date, "2026-11-19");
    assert.equal(input.value, "2026-11-19");
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
