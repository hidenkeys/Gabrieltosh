import { chooseField } from "./choice-field-helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: ShiftWorkspace } =
  await import("../src/mera/workspace/ShiftWorkspace");
test.afterEach(cleanup);
const shifts = [
  { id: "private-open-id", status: "open" },
  { id: "private-pending-id", status: "pending_approval" },
  { id: "private-closed-id", status: "closed" },
  { id: "private-approved-id", status: "approved" },
];
const record = (shift: any) => (
  <label>
    {shift.status} count
    <input aria-label={`${shift.status} count`} defaultValue="" />
  </label>
);
test("all shift records remain mounted and their drafts survive queues and selected-filter clearing", () => {
  const view = render(
    <ShiftWorkspace
      shifts={shifts}
      initialShiftId={shifts[0].id}
      renderRecord={record}
    />,
  );
  const input = screen.getByLabelText("open count");
  fireEvent.change(input, { target: { value: "123" } });
  assert.equal(
    document.querySelectorAll(".mw-shift-workspace-record input").length,
    4,
  );
  chooseField(screen, fireEvent, "Show shifts", "closed");
  assert.ok(
    input.closest(".mw-shift-workspace-record")?.hasAttribute("hidden"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear selected shift" }));
  assert.match(screen.getByText(/Showing/).textContent!, /Showing 2 of 4/);
  chooseField(screen, fireEvent, "Show shifts", "all");
  assert.ok(
    screen.getByLabelText("open count") === input,
    "filtering must preserve actual child identity",
  );
  assert.equal((input as HTMLInputElement).value, "123");
  assert.ok(!view.container.textContent?.includes("private-open-id"));
});
test("attention starts with open and pending approval only", () => {
  render(
    <ShiftWorkspace
      shifts={shifts}
      initialQueue="attention"
      renderRecord={record}
    />,
  );
  assert.match(screen.getByText(/Showing/).textContent!, /Showing 2 of 4/);
  assert.ok(!screen.getByLabelText("open count").closest("[hidden]"));
  assert.ok(screen.getByLabelText("closed count").closest("[hidden]"));
});
test("unknown and malformed data are not presented as an empty branch", () => {
  const view = render(<ShiftWorkspace renderRecord={record} />);
  assert.ok(screen.getByText(/unavailable or incomplete/));
  assert.equal(screen.queryByText(/No shifts have/), null);
  view.rerender(
    <ShiftWorkspace
      shifts={[null, shifts[0], shifts[0]]}
      renderRecord={record}
    />,
  );
  assert.ok(screen.getByText(/some records unavailable/));
  assert.equal(
    document.querySelectorAll(".mw-shift-workspace-record input").length,
    1,
  );
  assert.equal(screen.queryByText(/No shifts have/), null);
});
test("missing selected record has a clear recovery action without showing an ID", () => {
  render(
    <ShiftWorkspace
      shifts={shifts}
      initialShiftId="secret-missing"
      renderRecord={record}
    />,
  );
  assert.ok(screen.getByText(/selected shift is unavailable/));
  assert.ok(!document.body.textContent?.includes("secret-missing"));
  fireEvent.click(screen.getByRole("button", { name: "Clear selected shift" }));
  assert.equal(screen.queryByText(/selected shift is unavailable/), null);
  assert.match(screen.getByText(/Showing/).textContent!, /Showing 4 of 4/);
});
test("an actual empty array has an honest empty state", () => {
  render(<ShiftWorkspace shifts={[]} renderRecord={record} />);
  assert.ok(screen.getByText(/No shifts have been loaded/));
  assert.equal(screen.queryByText(/unavailable or incomplete/), null);
});
