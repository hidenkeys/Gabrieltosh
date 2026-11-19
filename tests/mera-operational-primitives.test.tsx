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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { Disclosure, Action } =
  await import("../src/mera/ui/OperationalPrimitives");

test("disclosure Enter and Space toggle once while an unsent draft survives closing and parent rerender", () => {
  try {
    const view = render(
      <Disclosure summary="More filters">
        <label>
          Unsent detail
          <input defaultValue="" />
        </label>
      </Disclosure>,
    );
    let summary = screen.getByText("More filters", { selector: "summary" });
    const block = summary.closest("details")!;
    assert.equal(block.open, false);
    assert.equal(
      fireEvent.keyDown(summary, { key: "Enter", cancelable: true }),
      false,
    );
    assert.equal(block.open, true);
    fireEvent.keyUp(summary, { key: "Enter" });
    assert.equal(block.open, true);
    const input = screen.getByLabelText("Unsent detail") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Retain this draft" } });
    assert.equal(
      fireEvent.keyDown(summary, { key: " ", cancelable: true }),
      false,
    );
    assert.equal(block.open, false);
    view.rerender(
      <Disclosure summary="Updated filters" defaultOpen>
        <label>
          Unsent detail
          <input defaultValue="" />
        </label>
      </Disclosure>,
    );
    summary = screen.getByText("Updated filters", { selector: "summary" });
    assert.equal(summary.closest("details"), block);
    assert.equal(block.open, false);
    assert.equal(screen.getByLabelText("Unsent detail"), input);
    assert.equal(input.value, "Retain this draft");
    fireEvent.keyDown(summary, { key: "Enter" });
    assert.equal(block.open, true);
    assert.equal(input.value, "Retain this draft");
  } finally {
    cleanup();
  }
});
test("Enter from a disclosure input never toggles the summary", () => {
  try {
    render(
      <Disclosure summary="Edit details" defaultOpen>
        <label>
          Detail
          <input />
        </label>
      </Disclosure>,
    );
    const block = screen
      .getByText("Edit details", { selector: "summary" })
      .closest("details")!;
    assert.equal(block.open, true);
    assert.equal(
      fireEvent.keyDown(screen.getByLabelText("Detail"), {
        key: "Enter",
        cancelable: true,
      }),
      true,
    );
    assert.equal(block.open, true);
  } finally {
    cleanup();
  }
});
test("consumer keyboard cancellation is honored before disclosure behavior", () => {
  let calls = 0;
  try {
    render(
      <Disclosure
        summary="Protected details"
        onKeyDown={(event) => {
          calls++;
          event.preventDefault();
        }}
      >
        <input aria-label="Detail" />
      </Disclosure>,
    );
    const summary = screen.getByText("Protected details", {
        selector: "summary",
      }),
      block = summary.closest("details")!;
    assert.equal(
      fireEvent.keyDown(summary, { key: "Enter", cancelable: true }),
      false,
    );
    assert.equal(block.open, false);
    assert.equal(calls, 1);
    fireEvent.keyDown(summary, { key: " ", cancelable: true });
    assert.equal(block.open, false);
    assert.equal(calls, 2);
  } finally {
    cleanup();
  }
});
test("form actions default to non-submit and pending actions cannot invoke writes or submission", () => {
  let clicks = 0,
    submissions = 0;
  try {
    const view = render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submissions++;
        }}
      >
        <Action onClick={() => clicks++}>Review details</Action>
        <Action pending type="submit" onClick={() => clicks++}>
          Save pending
        </Action>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review details" }));
    assert.equal(clicks, 1);
    assert.equal(submissions, 0);
    fireEvent.click(screen.getByRole("button", { name: "Save pending" }));
    assert.equal(clicks, 1);
    assert.equal(submissions, 0);
    view.rerender(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submissions++;
        }}
      >
        <Action pending onClick={() => clicks++}>
          Review details
        </Action>
        <Action type="submit" onClick={() => clicks++}>
          Save ready
        </Action>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review details" }));
    assert.equal(clicks, 1);
    assert.equal(submissions, 0);
    fireEvent.click(screen.getByRole("button", { name: "Save ready" }));
    assert.equal(clicks, 2);
    assert.equal(submissions, 1);
  } finally {
    cleanup();
  }
});
