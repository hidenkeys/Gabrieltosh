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
const { render, screen, fireEvent, cleanup, act } =
  await import("@testing-library/react");
const { default: CustomerCare } =
  await import("../src/mera/workspace/CustomerCare");
test.afterEach(cleanup);
const row = {
  id: "care-one",
  category: "service",
  rating: 2,
  text: "Long wait at the counter",
  status: "open",
  orderId: "private-order-uuid",
  createdAt: "2026-11-18T12:00:00Z",
};
const props = {
  base: "/organizations/org/branches/branch",
  complaints: [row],
  disabled: false,
  timezone: "Africa/Lagos",
  save: async (..._args: any[]) => ({}),
};
test("care filters real records, selects one editor, and hides raw IDs without inventing references", () => {
  render(
    <CustomerCare
      {...props}
      complaints={[
        row,
        {
          ...row,
          id: "second",
          category: "food",
          status: "resolved",
          text: "Sundae was warm",
          orderId: "second-private-order",
          resolution: "Replacement served",
        },
      ]}
    />,
  );
  assert(screen.getByText("2 of 2 records shown"));
  assert.equal(
    screen.getAllByRole("textbox", { name: "Resolution" }).length,
    1,
  );
  assert.equal(
    document.body.textContent?.includes("private-order-uuid"),
    false,
  );
  assert(screen.getByText("Order-linked feedback"));
  fireEvent.change(
    screen.getByRole("combobox", { name: "Filter care records" }),
    { target: { value: "resolved" } },
  );
  assert(screen.getByText("1 of 2 records shown"));
  assert.equal(
    (screen.getByRole("textbox", { name: "Resolution" }) as HTMLTextAreaElement)
      .value,
    "Replacement served",
  );
  fireEvent.change(screen.getByRole("searchbox", { name: "Find feedback" }), {
    target: { value: "missing" },
  });
  assert(screen.getByRole("heading", { name: "No matching feedback" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Clear feedback filters" }),
  );
  assert(screen.getByText("2 of 2 records shown"));
  assert(screen.getByText("Times shown in Africa/Lagos."));
});
test("resolved care requires private notes and sends only original branch status/resolution contract", async () => {
  const calls: any[] = [];
  render(
    <CustomerCare
      {...props}
      save={async (...args: any[]) => {
        calls.push(args);
        return {};
      }}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Case status" }), {
    target: { value: "resolved" },
  });
  const resolution = screen.getByRole("textbox", {
    name: "Resolution",
  }) as HTMLTextAreaElement;
  assert.equal(resolution.required, true);
  fireEvent.change(resolution, {
    target: { value: "Team checked the delay and explained the outcome" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update care record" }));
  await screen.findByText(
    /Customer care record updated. No message or refund was sent/,
  );
  assert.deepEqual(calls[0].slice(0, 3), [
    props.base + "/complaints/care-one",
    "PATCH",
    {
      status: "resolved",
      resolution: "Team checked the delay and explained the outcome",
    },
  ]);
});
test("unknown care update stays frozen across periodic matching snapshot and cannot blindly resend", async () => {
  let writes = 0;
  const save = async () => {
    writes++;
    throw Error("Connection interrupted");
  };
  const view = render(<CustomerCare {...props} save={save} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Case status" }), {
    target: { value: "investigating" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Resolution" }), {
    target: { value: "Counter is reviewing the delay" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update care record" }));
  await screen.findByRole("alert");
  assert(
    screen.getByRole("heading", { name: "This update still needs checking" }),
  );
  view.rerender(
    <CustomerCare
      {...props}
      save={save}
      complaints={[
        {
          ...row,
          status: "investigating",
          resolution: "Counter is reviewing the delay",
          updatedAt: "2026-11-19T12:00:00Z",
        },
      ]}
    />,
  );
  assert.equal(
    (
      screen.getByRole("textbox", { name: "Resolution" }) as HTMLTextAreaElement
    ).matches(":disabled"),
    true,
  );
  fireEvent.submit(document.querySelector("form")!);
  await act(async () => {});
  assert.equal(writes, 1);
  assert.equal(
    (screen.getByRole("textbox", { name: "Resolution" }) as HTMLTextAreaElement)
      .value,
    "Counter is reviewing the delay",
  );
  assert.equal(screen.queryByRole("button", { name: /retry/i }), null);
});
test("scope change discards prior drafts and ignores late save completion", async () => {
  let resolve!: (value: any) => void;
  const view = render(
    <CustomerCare
      {...props}
      save={() =>
        new Promise((done) => {
          resolve = done;
        })
      }
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Resolution" }), {
    target: { value: "Private old-branch investigation" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update care record" }));
  view.rerender(
    <CustomerCare
      {...props}
      base="/organizations/org/branches/other"
      complaints={[{ ...row, id: "new-case", text: "New branch feedback" }]}
    />,
  );
  assert.equal(
    (screen.getByRole("textbox", { name: "Resolution" }) as HTMLTextAreaElement)
      .value,
    "",
  );
  await act(async () => resolve({ id: "care-one" }));
  assert.equal(screen.queryByText(/Customer care record updated/), null);
  assert.equal(
    document.body.textContent?.includes("Private old-branch investigation"),
    false,
  );
});
for (const status of [401, 403])
  test(`care ${status} hides feedback and draft notes rather than retaining unauthorized data`, async () => {
    render(
      <CustomerCare
        {...props}
        save={async () => {
          throw Object.assign(Error("Not authorized"), { status });
        }}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Resolution" }), {
      target: { value: "Private investigation notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update care record" }));
    await screen.findByRole("alert");
    assert.equal(
      document.body.textContent?.includes("Long wait at the counter"),
      false,
    );
    assert.equal(screen.queryByRole("textbox", { name: "Resolution" }), null);
  });
test("empty care uses actual supplied snapshot without fetching unrelated customer identity or help data", (t) => {
  let reads = 0;
  t.mock.method(globalThis, "fetch", () => {
    reads++;
    throw Error("No care API read is defined");
  });
  render(<CustomerCare {...props} complaints={[]} timezone={undefined} />);
  assert(screen.getByRole("heading", { name: "No customer feedback shown" }));
  assert.equal(reads, 0);
  assert.equal(
    screen.queryByRole("button", { name: "Update care record" }),
    null,
  );
});

for (const value of [undefined, null, {}, [null]])
  test(`unavailable care collection ${JSON.stringify(value)} is not a confirmed empty branch`, () => {
    render(<CustomerCare {...props} complaints={value} />);
    assert(
      screen.getByRole("heading", { name: "Customer feedback is unavailable" }),
    );
    assert.equal(
      screen.queryByRole("heading", { name: "No customer feedback shown" }),
      null,
    );
    assert.equal(screen.queryByRole("textbox", { name: "Resolution" }), null);
  });
