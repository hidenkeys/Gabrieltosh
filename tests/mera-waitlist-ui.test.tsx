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
const { render, screen, fireEvent, waitFor, within, cleanup, act } =
  await import("@testing-library/react");
const { default: Waitlist } = await import("../src/mera/workspace/Waitlist");
const base = "/organizations/org-a/branches/branch-a";
const party = {
  id: "early",
  displayName: "Early party",
  partySize: 2,
  status: "waiting",
  contact: "private@example.test",
  notes: "No nuts <script>unsafe</script>",
  createdAt: "2026-11-18T23:30:00Z",
};
test("P5 active parties follow actual arrival order, contact stays disclosed and closed parties remain in history", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json([
      {
        ...party,
        id: "late",
        displayName: "Later party",
        createdAt: "2026-11-19T00:00:00Z",
      },
      party,
      { ...party, id: "closed", displayName: "Seated party", status: "seated" },
    ]);
  try {
    const { container } = render(
      <Waitlist
        base={base}
        disabled={false}
        timeZone="Africa/Lagos"
        save={async () => {}}
      />,
    );
    await screen.findByRole("heading", { name: "Early party" });
    const region = screen.getByRole("region", { name: "Waitlist arrivals" });
    assert.deepEqual(
      within(region)
        .getAllByRole("heading")
        .map((node) => node.textContent),
      ["Early party", "Later party"],
    );
    assert.equal(screen.queryByRole("heading", { name: "Seated party" }), null);
    const contact = screen.getAllByText("private@example.test")[0];
    assert.equal(
      (contact.closest("details") as HTMLDetailsElement).open,
      false,
    );
    assert(screen.getAllByText(/19 Nov 2026, 00:30/).length > 0);
    assert.equal(container.querySelector("script"), null);
    fireEvent.change(screen.getByLabelText("Waitlist view"), {
      target: { value: "history" },
    });
    await screen.findByRole("heading", { name: "Seated party" });
    assert.equal(screen.queryByRole("button", { name: "Mark seated" }), null);
    assert(screen.getByText(/does not open a table visit/));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("P5 failed waitlist reads retry without a false empty list", async () => {
  const original = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () =>
    ++reads === 1
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : Response.json([]);
  try {
    render(<Waitlist base={base} disabled={false} save={async () => {}} />);
    await screen.findByRole("button", { name: "Retry loading waitlist" });
    assert.equal(screen.queryByText("No parties on the waitlist."), null);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading waitlist" }),
    );
    await screen.findByText("No parties on the waitlist.");
    assert.equal(screen.queryByRole("alert"), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("P5 unknown non-idempotent party creation freezes its draft without resending on refresh", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async () => Response.json([]);
  try {
    render(
      <Waitlist
        base={base}
        disabled={false}
        save={async (...args) => {
          writes.push(args);
          throw new TypeError("Unknown party creation");
        }}
      />,
    );
    await screen.findByText("No parties on the waitlist.");
    fireEvent.click(screen.getByText("Add a party", { exact: true }));
    fireEvent.change(screen.getByLabelText("Party name"), {
      target: { value: "Original party" },
    });
    fireEvent.change(screen.getByLabelText("Party size"), {
      target: { value: "3" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Add waiting party" })
        .closest("form")!,
    );
    await screen.findByText("Party submission unconfirmed");
    fireEvent.click(screen.getByRole("button", { name: "Check waitlist" }));
    await screen.findByText("No parties on the waitlist.");
    assert(
      (
        screen
          .getByLabelText("Party name")
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    );
    assert.equal(
      (screen.getByLabelText("Party name") as HTMLInputElement).value,
      "Original party",
    );
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0][2], {
      displayName: "Original party",
      partySize: 3,
      contact: "",
      notes: "",
    });
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("P5 manual notification preserves the status-only API and an unknown outcome freezes that party", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = async () => Response.json([party]);
  try {
    render(
      <Waitlist
        base={base}
        disabled={false}
        save={async (...args) => {
          writes.push(args);
          throw new TypeError("Unknown status");
        }}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark manually notified" }),
    );
    await screen.findByText(/party’s update is unconfirmed/);
    fireEvent.click(screen.getByRole("button", { name: "Refresh waitlist" }));
    await screen.findByRole("button", { name: "Mark manually notified" });
    assert(
      (screen.getByRole("button", { name: "Mark seated" }) as HTMLButtonElement)
        .disabled,
    );
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], base + "/waitlist/early");
    assert.equal(writes[0][1], "PATCH");
    assert.deepEqual(writes[0][2], { status: "notified" });
    assert(screen.getByText(/no message is sent here/));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("P5 stale branch waitlist reads cannot reveal private contacts in the new scope", async () => {
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
      <Waitlist base={base} disabled={false} save={async () => {}} />,
    );
    assert(release);
    view.rerender(
      <Waitlist
        base="/organizations/org-a/branches/branch-b"
        disabled={false}
        save={async () => {}}
      />,
    );
    await screen.findByText("No parties on the waitlist.");
    await act(async () => {
      release!(Response.json([party]));
      await Promise.resolve();
    });
    assert.equal(screen.queryByText("private@example.test"), null);
    assert.equal(screen.queryByRole("heading", { name: "Early party" }), null);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("P5 read denial hides existing contacts and drafts and cannot be undone by refresh", async () => {
  const original = globalThis.fetch;
  let denied = false;
  globalThis.fetch = async () =>
    denied
      ? Response.json({ error: "Denied" }, { status: 403 })
      : Response.json([party]);
  try {
    render(<Waitlist base={base} disabled={false} save={async () => {}} />);
    await screen.findByRole("heading", { name: "Early party" });
    fireEvent.click(screen.getByText("Add a party", { exact: true }));
    fireEvent.change(screen.getByLabelText("Party name"), {
      target: { value: "Private unsent party" },
    });
    denied = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh waitlist" }));
    await screen.findByText(/Access to this branch’s waitlist/);
    assert(!document.body.textContent?.includes(party.contact));
    assert(!document.body.textContent?.includes("Private unsent party"));
    assert.equal(
      screen.queryByRole("button", { name: "Refresh waitlist" }),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
