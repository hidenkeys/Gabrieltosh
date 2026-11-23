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
const base = "/organizations/org/branches/branch";
const original = globalThis.fetch;
const props = { base, disabled: false, save: async () => {} };
async function dateForm() {
  await screen.findByText("No jobs for this branch.");
  fireEvent.change(screen.getByLabelText("Business date"), {
    target: { value: "2026-11-19" },
  });
  return screen
    .getByRole("button", { name: "Queue report export" })
    .closest("form")!;
}
test("synchronous export submissions are serialized and original unknown body survives later conflict and rate limit", async () => {
  const writes: any[] = [];
  let resolve: any;
  globalThis.fetch = async () => Response.json([]);
  try {
    render(
      <ExportJobs
        {...props}
        save={async (...args: any[]) => {
          writes.push(args);
          if (writes.length === 1)
            return await new Promise((_r, reject) => (resolve = reject));
          throw Object.assign(Error("Check original request"), {
            status: writes.length === 2 ? 409 : 429,
          });
        }}
      />,
    );
    const form = await dateForm();
    fireEvent.submit(form);
    fireEvent.submit(form);
    assert.equal(writes.length, 1);
    await act(async () => resolve(Error("Network unknown")));
    await screen.findByRole("button", {
      name: "Retry original export request",
    });
    for (let n = 2; n <= 3; n++) {
      fireEvent.click(
        screen.getByRole("button", { name: "Retry original export request" }),
      );
      await waitFor(() => assert.equal(writes.length, n));
      await waitFor(() =>
        assert.equal(
          (
            screen.getByRole("button", {
              name: "Retry original export request",
            }) as HTMLButtonElement
          ).disabled,
          false,
        ),
      );
    }
    assert.deepEqual(writes[0][2], writes[1][2]);
    assert.deepEqual(writes[0][2], writes[2][2]);
    assert.equal(writes[0][2].date, "2026-11-19");
    assert.match(writes[0][2].requestKey, /^[\da-f-]{36}$/i);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
for (const status of [401, 403, 404])
  test(`export read ${status} clears private jobs and drafts and freezes further polling or writes`, async () => {
    let reads = 0,
      writes = 0;
    globalThis.fetch = async () =>
      ++reads === 1
        ? Response.json([
            {
              id: "private-job",
              status: "complete",
              artifactId: "private-artifact",
              date: "2026-11-19",
              createdAt: "2026-11-19T10:00:00Z",
            },
          ])
        : Response.json({ error: "Denied" }, { status });
    try {
      render(
        <ExportJobs
          {...props}
          timeZone="Africa/Lagos"
          save={async () => {
            writes++;
            throw Error("Unconfirmed");
          }}
        />,
      );
      await screen.findByRole("link", { name: "Download report CSV" });
      assert.match(
        screen.getByText(/Requested/).textContent || "",
        /19 Nov 2026, 11:00 · Africa\/Lagos/,
      );
      fireEvent.change(screen.getByLabelText("Business date"), {
        target: { value: "2026-11-19" },
      });
      fireEvent.submit(
        screen
          .getByRole("button", { name: "Queue report export" })
          .closest("form")!,
      );
      await screen.findByRole("button", {
        name: "Retry original export request",
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Refresh export jobs" }),
      );
      await screen.findByText(/export access needs checking/);
      assert.equal(screen.queryByRole("link"), null);
      assert.equal(screen.queryByRole("button"), null);
      assert.equal(screen.queryByLabelText("Business date"), null);
      assert.equal(screen.queryByText(/private-job|private-artifact/), null);
      assert.equal(writes, 1);
      assert.equal(reads, 2);
    } finally {
      cleanup();
      globalThis.fetch = original;
    }
  });
test("write denial clears private rows; stale old-scope mutation cannot populate a new scope", async () => {
  let reject: any;
  globalThis.fetch = async () => Response.json([]);
  try {
    const view = render(
      <ExportJobs
        {...props}
        save={async () => await new Promise((_r, r) => (reject = r))}
      />,
    );
    const form = await dateForm();
    fireEvent.submit(form);
    view.rerender(<ExportJobs {...props} base={base + "/new"} />);
    await act(async () =>
      reject(Object.assign(Error("Forbidden old scope"), { status: 403 })),
    );
    await screen.findByText("No jobs for this branch.");
    assert.equal(screen.queryByText(/access needs checking/), null);
    view.rerender(
      <ExportJobs
        {...props}
        base={base + "/denial"}
        save={async () => {
          throw Object.assign(Error("Denied"), { status: 403 });
        }}
      />,
    );
    const next = await dateForm();
    fireEvent.submit(next);
    await screen.findByText(/export access needs checking/);
    assert.equal(screen.queryByLabelText("Business date"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("failed-job retry has a synchronous guard and remains frozen after unknown outcome and canonical refresh", async () => {
  let writes = 0,
    reject: any;
  globalThis.fetch = async () =>
    Response.json([
      {
        id: "failed",
        status: "failed",
        attempts: 3,
        createdAt: "2026-11-19T10:00:00Z",
      },
    ]);
  try {
    render(
      <ExportJobs
        {...props}
        save={async () => {
          writes++;
          return await new Promise((_r, r) => (reject = r));
        }}
      />,
    );
    await screen.findByRole("button", { name: "Retry failed job" });
    assert.match(
      screen.getByText(/Requested/).textContent || "",
      /Device time/,
    );
    fireEvent.change(screen.getByLabelText("Retry reason"), {
      target: { value: "Worker recovered" },
    });
    const form = screen
      .getByRole("button", { name: "Retry failed job" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    assert.equal(writes, 1);
    await act(async () => reject(Error("Unknown retry")));
    await screen.findByText(/retry outcome is unconfirmed/);
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh export jobs" }),
    );
    await screen.findByRole("button", { name: "Retry failed job" });
    assert.equal(
      (
        screen.getByRole("button", {
          name: "Retry failed job",
        }) as HTMLButtonElement
      ).closest("fieldset")!.disabled,
      true,
    );
    assert.equal(writes, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("selected EOD date seeds only the scope; later prop changes cannot replace uncertain original and invalid calendar dates stay blank", async () => {
  const writes: any[] = [];
  globalThis.fetch = async () => Response.json([]);
  try {
    const view = render(
      <ExportJobs
        {...props}
        initialDate="2026-11-19"
        save={async (...args: any[]) => {
          writes.push(args);
          throw Error("Unknown original");
        }}
      />,
    );
    await screen.findByText("No jobs for this branch.");
    assert.equal(
      (screen.getByLabelText("Business date") as HTMLInputElement).value,
      "2026-11-19",
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Queue report export" })
        .closest("form")!,
    );
    await screen.findByRole("button", {
      name: "Retry original export request",
    });
    view.rerender(
      <ExportJobs
        {...props}
        initialDate="2026-11-20"
        save={async (...args: any[]) => {
          writes.push(args);
          throw Error("Unknown original");
        }}
      />,
    );
    assert.equal(
      (screen.getByLabelText("Business date") as HTMLInputElement).value,
      "2026-11-19",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original export request" }),
    );
    await waitFor(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0][2], writes[1][2]);
    view.rerender(
      <ExportJobs {...props} base={base + "/other"} initialDate="2026-02-30" />,
    );
    await screen.findByText("No jobs for this branch.");
    assert.equal(
      (screen.getByLabelText("Business date") as HTMLInputElement).value,
      "",
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("invalid job timestamps remain unavailable rather than throwing or inventing a time", async () => {
  globalThis.fetch = async () =>
    Response.json([
      { id: "invalid", status: "queued", createdAt: { unexpected: true } },
    ]);
  try {
    render(<ExportJobs {...props} timeZone="Africa/Lagos" />);
    await screen.findByText(/Request time unavailable/);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("report-export date presets never queue a job and custom entry keeps the exact selected day", async () => {
  const writes: any[] = [];
  globalThis.fetch = async () => Response.json([]);
  try {
    render(
      <ExportJobs
        {...props}
        save={async (...args: any[]) => {
          writes.push(args);
          return { id: "job-day" };
        }}
      />,
    );
    await screen.findByText("No jobs for this branch.");
    fireEvent.click(
      screen.getByRole("radio", { name: "Yesterday", exact: true }),
    );
    const day = (screen.getByLabelText("Business date") as HTMLInputElement)
      .value;
    assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(writes.length, 0);
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Queue report export" })
        .closest("form")!,
    );
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal(writes[0][2].date, day);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
