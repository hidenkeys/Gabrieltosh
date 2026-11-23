import { chooseField } from "./choice-field-helpers";
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
const { default: NonReplayForm } =
  await import("../src/mera/workspace/NonReplayForm");
const { default: FloorMap } = await import("../src/mera/workspace/FloorMap");
const { default: TableEditor } =
  await import("../src/mera/workspace/TableEditor");
test.afterEach(cleanup);
const fields = (
  <>
    <label>
      Private draft
      <input defaultValue="Original private text" />
    </label>
    <button>Save change</button>
  </>
);
test("nonreplay form synchronously prevents duplicate submission and announces actual pending state", async () => {
  let resolve!: (value: any) => void,
    calls = 0;
  const states: any[] = [];
  render(
    <NonReplayForm
      disabled={false}
      label="Test action"
      onStateChange={(state) => states.push(state)}
      onSubmit={() => {
        calls++;
        return new Promise((done) => {
          resolve = done;
        });
      }}
    >
      {fields}
    </NonReplayForm>,
  );
  const form = screen.getByRole("form", { name: "Test action" });
  fireEvent.submit(form);
  fireEvent.submit(form);
  assert.equal(calls, 1);
  assert.equal(
    (
      screen.getByRole("textbox", { name: "Private draft" }) as HTMLInputElement
    ).matches(":disabled"),
    true,
  );
  assert(states.some((state) => state.busy));
  await act(async () => resolve({}));
  assert.equal(
    (
      screen.getByRole("textbox", { name: "Private draft" }) as HTMLInputElement
    ).matches(":disabled"),
    false,
  );
});
for (const error of [
  Error("Network interrupted"),
  Object.assign(Error("Server failed"), { status: 503 }),
  new DOMException("Aborted", "AbortError"),
])
  test(`nonreplay ${error.name}/${(error as any).status || 0} freezes across prop changes without retry`, async () => {
    let writes = 0;
    const submit = async () => {
      writes++;
      throw error;
    };
    const view = render(
      <NonReplayForm disabled={false} onSubmit={submit}>
        {fields}
      </NonReplayForm>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save change" }));
    await screen.findByRole("alert");
    assert(screen.getByText("This change still needs checking."));
    view.rerender(
      <NonReplayForm disabled={true} onSubmit={submit}>
        {fields}
      </NonReplayForm>,
    );
    view.rerender(
      <NonReplayForm disabled={false} onSubmit={submit}>
        {fields}
      </NonReplayForm>,
    );
    fireEvent.submit(document.querySelector("form")!);
    assert.equal(writes, 1);
    assert.equal(
      (
        screen.getByRole("textbox", {
          name: "Private draft",
        }) as HTMLInputElement
      ).matches(":disabled"),
      true,
    );
    assert.equal(screen.queryByRole("button", { name: /retry/i }), null);
  });
for (const status of [401, 403])
  test(`nonreplay ${status} removes private children and never unlocks from props`, async () => {
    let writes = 0;
    const submit = async () => {
      writes++;
      throw Object.assign(Error("Access denied"), { status });
    };
    const view = render(
      <NonReplayForm disabled={false} onSubmit={submit}>
        {fields}
      </NonReplayForm>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save change" }));
    await screen.findByRole("alert");
    assert.equal(
      screen.queryByRole("textbox", { name: "Private draft" }),
      null,
    );
    view.rerender(
      <NonReplayForm disabled={false} onSubmit={submit}>
        {fields}
      </NonReplayForm>,
    );
    fireEvent.submit(document.querySelector("form")!);
    assert.equal(writes, 1);
    assert.equal(
      document.body.textContent?.includes("Original private text"),
      false,
    );
  });
test("a first known domain rejection allows an explicit corrected attempt", async () => {
  let writes = 0;
  render(
    <NonReplayForm
      disabled={false}
      onSubmit={async () => {
        if (++writes === 1)
          throw Object.assign(Error("Review the name"), { status: 400 });
      }}
    >
      {fields}
    </NonReplayForm>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save change" }));
  await screen.findByText("Review the name");
  assert.equal(
    (
      screen.getByRole("textbox", { name: "Private draft" }) as HTMLInputElement
    ).matches(":disabled"),
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save change" }));
  await act(async () => {});
  assert.equal(writes, 2);
  assert.equal(screen.queryByText("This change still needs checking."), null);
});
test("late completion after unmount does not notify a new scope", async () => {
  let resolve!: (value: any) => void;
  const states: any[] = [];
  const view = render(
    <NonReplayForm
      disabled={false}
      onStateChange={(state) => states.push(state)}
      onSubmit={() =>
        new Promise((done) => {
          resolve = done;
        })
      }
    >
      {fields}
    </NonReplayForm>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save change" }));
  view.unmount();
  const count = states.length;
  await act(async () => resolve({}));
  assert.equal(states.length, count);
});
const tables = [
  {
    id: "private-table-alpha",
    name: "Window",
    zone: "Main floor",
    capacity: 4,
    x: 0,
    y: 0,
    status: "available",
  },
  {
    id: "private-table-beta",
    name: "Terrace",
    zone: "Outside",
    capacity: 2,
    x: 20,
    y: 10,
    status: "available",
  },
];
test("floor keeps names/zones and bounded coordinate callback while an unknown save freezes every map control", async () => {
  const writes: any[] = [];
  const save = async (...args: any[]) => {
    writes.push(args);
    throw Error("Position result unknown");
  };
  const view = render(
    <FloorMap
      base="/organizations/org/branches/branch"
      tables={tables}
      disabled={false}
      save={save}
    />,
  );
  fireEvent.focus(screen.getByRole("combobox", { name: "Map table" }));
  assert(screen.getByRole("option", { name: "Window · Main floor" }));
  assert.equal(
    document.body.textContent?.includes("private-table-alpha"),
    false,
  );
  chooseField(screen, fireEvent, "Map table", String(tables[0].id));
  const horizontal = screen.getByRole("slider", {
    name: "Horizontal position",
  });
  fireEvent.change(horizontal, { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Save floor position" }));
  await screen.findByRole("alert");
  assert.deepEqual(writes[0].slice(0, 3), [
    "/organizations/org/branches/branch/tables/private-table-alpha",
    "PATCH",
    { x: 100, y: 0 },
  ]);
  assert.equal(
    (screen.getByRole("combobox", { name: "Map zone" }) as HTMLSelectElement)
      .disabled,
    true,
  );
  assert.equal(
    (screen.getByRole("combobox", { name: "Map table" }) as HTMLSelectElement)
      .disabled,
    true,
  );
  assert.equal((horizontal as HTMLInputElement).matches(":disabled"), true);
  view.rerender(
    <FloorMap
      base="/organizations/org/branches/branch"
      tables={tables.map((table) => ({ ...table, x: 50 }))}
      disabled={false}
      save={save}
    />,
  );
  fireEvent.submit(screen.getByRole("form", { name: "Save floor position" }));
  assert.equal(writes.length, 1);
});
test("table metadata uncertainty freezes service status too and disclosure closing preserves the fence", async () => {
  const writes: any[] = [];
  render(
    <TableEditor
      base="/organizations/org/branches/branch"
      table={tables[0]}
      disabled={false}
      save={async (...args: any[]) => {
        writes.push(args);
        throw Error("Update unknown");
      }}
    />,
  );
  fireEvent.click(screen.getByText("Edit table & service status"));
  fireEvent.click(screen.getByRole("button", { name: "Save table" }));
  await screen.findByRole("alert");
  assert.equal(
    (
      screen.getByRole("radio", { name: "Available" }) as HTMLSelectElement
    ).matches(":disabled"),
    true,
  );
  fireEvent.click(screen.getByText("Edit table & service status"));
  fireEvent.click(screen.getByText("Edit table & service status"));
  fireEvent.submit(
    screen.getByRole("form", { name: "Update table service status" }),
  );
  assert.equal(writes.length, 1);
  assert(writes[0][0].endsWith("/tables/private-table-alpha"));
});
test("occupied or held service status remains blocked, and denied table edits hide both forms", async () => {
  const writes: any[] = [];
  const view = render(
    <TableEditor
      base="/organizations/org/branches/branch"
      table={tables[0]}
      held={true}
      disabled={false}
      save={async (...args: any[]) => {
        writes.push(args);
        throw Object.assign(Error("Denied"), { status: 403 });
      }}
    />,
  );
  fireEvent.click(screen.getByText("Edit table & service status"));
  fireEvent.submit(
    screen.getByRole("form", { name: "Update table service status" }),
  );
  assert.equal(writes.length, 0);
  fireEvent.click(screen.getByRole("button", { name: "Save table" }));
  await screen.findByRole("alert");
  assert.equal(screen.queryByRole("textbox", { name: "Table label" }), null);
  assert.equal(
    screen.queryByRole("group", { name: "Table service status" }),
    null,
  );
  view.rerender(
    <TableEditor
      base="/organizations/org/branches/branch"
      table={tables[0]}
      disabled={false}
      save={async () => {}}
    />,
  );
  assert.equal(screen.queryByRole("textbox", { name: "Table label" }), null);
});

test("unknown service-status update also fences metadata writes with original reason intact", async () => {
  const writes: any[] = [];
  render(
    <TableEditor
      base="/organizations/org/branches/branch"
      table={tables[0]}
      disabled={false}
      save={async (...args: any[]) => {
        writes.push(args);
        throw Error("Status outcome unknown");
      }}
    />,
  );
  fireEvent.click(screen.getByText("Edit table & service status"));
  chooseField(screen, fireEvent, "Table service status", String("cleaning"));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Table status reason" }),
    { target: { value: "Cleaning is in progress" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Update service status" }),
  );
  await screen.findByRole("alert");
  assert.deepEqual(writes[0].slice(0, 3), [
    "/organizations/org/branches/branch/tables/private-table-alpha/status",
    "POST",
    { status: "cleaning", reason: "Cleaning is in progress" },
  ]);
  assert.equal(
    (
      screen.getByRole("textbox", { name: "Table label" }) as HTMLInputElement
    ).matches(":disabled"),
    true,
  );
  assert.equal(
    (
      screen.getByRole("textbox", {
        name: "Table status reason",
      }) as HTMLInputElement
    ).value,
    "Cleaning is in progress",
  );
  fireEvent.submit(screen.getByRole("form", { name: "Edit table" }));
  assert.equal(writes.length, 1);
});

test("floor authorization loss hides its table view and does not unlock on refreshed props", async () => {
  const save = async () => {
    throw Object.assign(Error("Not authorized"), { status: 403 });
  };
  const view = render(
    <FloorMap
      base="/organizations/org/branches/branch"
      tables={tables}
      disabled={false}
      save={save}
    />,
  );
  chooseField(screen, fireEvent, "Map table", String(tables[0].id));
  fireEvent.click(screen.getByRole("button", { name: "Save floor position" }));
  await screen.findByRole("alert");
  assert.equal(screen.queryByRole("combobox", { name: "Map table" }), null);
  assert.equal(document.body.textContent?.includes("Window"), false);
  view.rerender(
    <FloorMap
      base="/organizations/org/branches/branch"
      tables={tables}
      disabled={false}
      save={save}
    />,
  );
  assert.equal(screen.queryByRole("combobox", { name: "Map table" }), null);
});
