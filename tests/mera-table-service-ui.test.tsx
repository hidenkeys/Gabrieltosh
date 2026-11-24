import { chooseField, choiceValue } from "./choice-field-helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { formatMoney } from "../src/mera/workspace/api";
const dom = new JSDOM("<!doctype html><html><body></body></html>");
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
const { render, screen, fireEvent, cleanup, waitFor, act, within } =
  await import("@testing-library/react");
const { default: TableServiceView } =
  await import("../src/mera/workspace/TableServiceView");
const props = {
  tables: [],
  visits: [],
  renderTableTools: () => null,
  renderPartyTools: () => null,
  openParty: null,
  setup: null,
};
test("tables distinguish unavailable reads from confirmed empty collections", () => {
  try {
    const view = render(
      <TableServiceView {...props} tables={undefined} visits={undefined} />,
    );
    assert.ok(screen.getByText(/Table records are unavailable/));
    assert.ok(screen.getByText(/Visit records are unavailable/));
    assert.equal(screen.queryByText(/0 tables/), null);
    view.rerender(<TableServiceView {...props} />);
    assert.ok(screen.getByText("No tables created yet."));
    assert.ok(screen.getByText("No open parties at this branch."));
  } finally {
    cleanup();
  }
});
test("party filtering preserves mounted drafts and resolves combined table names", () => {
  let mounts = 0;
  function Tools() {
    React.useEffect(() => {
      mounts++;
    }, []);
    return <input aria-label="Party note" defaultValue="" />;
  }
  try {
    render(
      <TableServiceView
        {...props}
        tables={[
          {
            id: "private-table-a",
            name: "Window",
            status: "occupied",
            capacity: 4,
          },
          {
            id: "private-table-b",
            name: "Garden",
            status: "occupied",
            capacity: 2,
          },
        ]}
        visits={[
          {
            id: "private-visit",
            status: "open",
            displayName: "Lunch party",
            tableIds: ["private-table-a", "private-table-b"],
          },
        ]}
        renderPartyTools={() => <Tools />}
      />,
    );
    assert.ok(screen.getByText("Window + Garden"));
    assert.equal(document.body.textContent?.includes("private-table"), false);
    fireEvent.change(screen.getByLabelText("Party note"), {
      target: { value: "Keep this draft" },
    });
    chooseField(screen, fireEvent, "Show visits", String("closed"));
    assert.ok(screen.getByText("No visits in this view."));
    assert.equal(
      screen.getByLabelText("Party note").closest("article")?.hidden,
      true,
    );
    chooseField(screen, fireEvent, "Show visits", String("open"));
    assert.equal(
      (screen.getByLabelText("Party note") as HTMLInputElement).value,
      "Keep this draft",
    );
    assert.equal(mounts, 1);
  } finally {
    cleanup();
  }
});

test("table task navigation shows one task while retaining the mounted floor draft", () => {
  let mounts = 0;
  function FloorDraft() {
    React.useEffect(() => {
      mounts++;
    }, []);
    return (
      <label>
        Floor zone draft
        <input defaultValue="" />
      </label>
    );
  }
  try {
    render(
      <TableServiceView
        {...props}
        setup={<FloorDraft />}
        bills={
          <section aria-label="Bill management">
            <button>Review synthetic bill</button>
          </section>
        }
      />,
    );
    const service = screen.getByRole("region", { name: "Branch tables" });
    const floor = screen.getByLabelText("Floor zone draft");
    const bill = screen.getByText("Review synthetic bill");
    const taskPanel = (node: Element) =>
      node.closest(".mw-table-service > div") as HTMLElement;
    assert.equal(taskPanel(service).hidden, false);
    assert.equal(taskPanel(floor).hidden, true);
    assert.equal(taskPanel(bill).hidden, true);
    assert.equal(
      screen.queryByRole("button", { name: "Review synthetic bill" }),
      null,
    );

    fireEvent.click(screen.getByRole("button", { name: "Floor layout" }));
    assert.equal(taskPanel(service).hidden, true);
    assert.equal(taskPanel(floor).hidden, false);
    assert.equal(taskPanel(bill).hidden, true);
    assert.equal(
      screen
        .getByRole("button", { name: "Floor layout" })
        .getAttribute("aria-pressed"),
      "true",
    );
    fireEvent.change(floor, {
      target: { value: "Keep the garden layout draft" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Manage bills" }));
    assert.equal(taskPanel(service).hidden, true);
    assert.equal(taskPanel(floor).hidden, true);
    assert.equal(taskPanel(bill).hidden, false);
    assert(screen.getByRole("button", { name: "Review synthetic bill" }));

    fireEvent.click(screen.getByRole("button", { name: "Tables & parties" }));
    assert.equal(taskPanel(service).hidden, false);
    assert.equal(taskPanel(floor).hidden, true);
    assert.equal(taskPanel(bill).hidden, true);
    fireEvent.click(screen.getByRole("button", { name: "Floor layout" }));
    assert.equal(
      (screen.getByLabelText("Floor zone draft") as HTMLInputElement).value,
      "Keep the garden layout draft",
    );
    assert.equal(mounts, 1, "changing tasks must not remount the floor editor");
  } finally {
    cleanup();
  }
});

test("Seat party is offered only for known free tables and opens the existing form without losing its draft", async () => {
  const { default: Stepper } = await import("../src/mera/ui/Stepper");
  const seated: string[] = [];
  let submissions = 0;
  function Draft() {
    const [partySize, setPartySize] = React.useState(2);
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submissions++;
        }}
      >
        <label>
          Guest display name
          <input name="visitName" defaultValue="Draft party" />
        </label>
        <Stepper
          label="Party size"
          min={1}
          max={100}
          value={partySize}
          onChange={setPartySize}
        />
        <button>Open visit</button>
      </form>
    );
  }
  const tables = [
    { id: "one", name: "Table 1", status: "available", capacity: 6 },
    { id: "two", name: "Table 2", status: "available", capacity: 6 },
    ...["occupied", "cleaning", "reserved", "unavailable"].map((status) => ({
      id: status,
      name: status,
      status,
      capacity: 4,
    })),
    { id: "held", name: "Already held", status: "available", capacity: 4 },
  ];
  try {
    const view = render(
      <TableServiceView
        {...props}
        tables={tables}
        visits={[
          {
            id: "held-visit",
            tableId: "held",
            displayName: "Other party",
            status: "open",
          },
        ]}
        onSeatParty={(table) => seated.push(table.id)}
        openParty={<Draft />}
      />,
    );
    assert.equal(
      screen.getAllByRole("button", { name: "Seat party", exact: true }).length,
      2,
    );
    const firstCard = screen
      .getByRole("heading", { name: "Table 1", exact: true })
      .closest("article")!;
    fireEvent.click(
      within(firstCard).getByRole("button", { name: "Seat party" }),
    );
    const name = screen.getByLabelText(
      "Guest display name",
    ) as HTMLInputElement;
    const details = name.closest("details") as HTMLDetailsElement;
    assert.equal(details.open, true);
    assert.equal(document.activeElement, name);
    assert.deepEqual(seated, ["one"]);
    assert.equal(submissions, 0);
    fireEvent.click(
      screen.getByRole("button", { name: "Increase Party size" }),
    );
    fireEvent.change(name, { target: { value: "Retained party" } });
    fireEvent.click(
      screen.getByText("Open a table visit", { selector: "summary" }),
    );
    assert.equal(details.open, false);
    const secondCard = screen
      .getByRole("heading", { name: "Table 2", exact: true })
      .closest("article")!;
    fireEvent.click(
      within(secondCard).getByRole("button", { name: "Seat party" }),
    );
    assert.equal(details.open, true);
    assert.equal(document.activeElement, name);
    assert.equal(name.value, "Retained party");
    assert.equal(
      (
        screen.getByRole("spinbutton", {
          name: "Party size",
        }) as HTMLInputElement
      ).value,
      "3",
    );
    assert.deepEqual(seated, ["one", "two"]);
    view.rerender(
      <TableServiceView
        {...props}
        tables={tables}
        visits={undefined}
        onSeatParty={() => {
          throw Error("Unavailable reads must not allow seating");
        }}
        openParty={<Draft />}
      />,
    );
    assert.equal(screen.queryByRole("button", { name: "Seat party" }), null);
  } finally {
    cleanup();
  }
});

test("busy or uncertain visit opening disables table seating shortcuts", () => {
  try {
    render(
      <TableServiceView
        {...props}
        tables={[
          { id: "one", name: "Table 1", status: "available", capacity: 4 },
        ]}
        onSeatParty={() => {
          throw Error("Disabled seating must not run");
        }}
        seatPartyDisabled
      />,
    );
    const seat = screen.getByRole("button", {
      name: "Seat party",
    }) as HTMLButtonElement;
    assert.equal(seat.disabled, true);
    fireEvent.click(seat);
  } finally {
    cleanup();
  }
});
