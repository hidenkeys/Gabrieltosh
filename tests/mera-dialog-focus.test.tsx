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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { useDialogFocus, dialogTabStops } =
  await import("../src/mera/ui/useDialogFocus");
function Fixture({
  open = true,
  pending = false,
  onClose = () => {},
  fallback = () => {},
  children,
  native = false,
  initial = "first",
}: {
  open?: boolean;
  pending?: boolean;
  onClose?: () => void;
  fallback?: () => void;
  children?: React.ReactNode;
  native?: boolean;
  initial?: "first" | "dialog";
}) {
  const ref = React.useRef<HTMLElement>(null);
  useDialogFocus({
    dialogRef: ref,
    open,
    onClose,
    closeDisabled: pending,
    initialFocus: initial,
    fallbackFocus: fallback,
  });
  const props = {
    ref,
    role: "dialog",
    "aria-label": "Test review",
    tabIndex: -1,
  };
  return native ? (
    <dialog {...(props as any)}>{children}</dialog>
  ) : (
    <section {...props}>{children}</section>
  );
}
function outside() {
  const button = document.createElement("button");
  button.textContent = "Actual opener";
  document.body.append(button);
  button.focus();
  return button;
}
test("tab order excludes hidden, closed-disclosure, disabled fieldset and inert controls while honoring positive tabindex and radio groups", () => {
  try {
    render(
      <Fixture>
        <button disabled>Disabled</button>
        <div hidden>
          <button>Hidden parent</button>
        </div>
        <button style={{ display: "none" }}>CSS hidden</button>
        <div aria-hidden="true">
          <a href="#">Hidden link</a>
        </div>
        <fieldset disabled>
          <input aria-label="Disabled fieldset" />
        </fieldset>
        <div inert>
          <button>Inert</button>
        </div>
        <input type="hidden" />
        <details>
          <summary>More</summary>
          <button>Closed draft</button>
        </details>
        <button tabIndex={2}>Second priority</button>
        <button tabIndex={1}>First priority</button>
        <label>
          <input type="radio" name="choice" defaultChecked />
          Selected
        </label>
        <label>
          <input type="radio" name="choice" />
          Other
        </label>
        <button>Last action</button>
      </Fixture>,
    );
    const node = screen.getByRole("dialog");
    const stops = dialogTabStops(node);
    assert.deepEqual(
      stops.map((n) => n.textContent || n.getAttribute("type")),
      ["First priority", "Second priority", "More", "radio", "Last action"],
    );
    assert.equal(document.activeElement, screen.getByText("First priority"));
    const last = screen.getByText("Last action");
    last.focus();
    fireEvent.keyDown(last, { key: "Tab", cancelable: true });
    assert.equal(document.activeElement, stops[0]);
    fireEvent.keyDown(stops[0], {
      key: "Tab",
      shiftKey: true,
      cancelable: true,
    });
    assert.equal(document.activeElement, last);
  } finally {
    cleanup();
  }
});
test("fallback native dialog isolates background, redirects escaped focus, respects pending dismissal and restores opener/scroll", () => {
  const opener = outside();
  document.body.style.overflow = "scroll";
  let closes = 0;
  try {
    const view = render(
      <Fixture native pending onClose={() => closes++}>
        <button>First action</button>
        <button>Last action</button>
      </Fixture>,
    );
    const node = screen.getByRole("dialog");
    assert(node.hasAttribute("open"));
    assert(opener.hasAttribute("inert"));
    assert.equal(opener.getAttribute("aria-hidden"), "true");
    assert.equal(document.body.style.overflow, "hidden");
    opener.focus();
    assert.equal(document.activeElement, screen.getByText("First action"));
    fireEvent.keyDown(node, { key: "Escape", cancelable: true });
    assert.equal(closes, 0);
    fireEvent(node, new window.Event("cancel", { cancelable: true }));
    assert.equal(closes, 0);
    view.rerender(
      <Fixture native onClose={() => closes++}>
        <button>First action</button>
        <button>Last action</button>
      </Fixture>,
    );
    fireEvent.keyDown(node, { key: "Escape", cancelable: true });
    assert.equal(closes, 1);
    view.unmount();
    assert.equal(document.activeElement, opener);
    assert(!opener.hasAttribute("inert"));
    assert(!opener.hasAttribute("aria-hidden"));
    assert.equal(document.body.style.overflow, "scroll");
  } finally {
    cleanup();
    opener.remove();
    document.body.style.overflow = "";
  }
});
test("zero tabbables stays on dialog, detached opener uses fallback and pre-existing isolation is not reintroduced", () => {
  const opener = outside(),
    hidden = document.createElement("div");
  hidden.setAttribute("inert", "");
  hidden.setAttribute("aria-hidden", "true");
  document.body.append(hidden);
  let fallback = 0;
  try {
    const view = render(
      <Fixture fallback={() => fallback++}>
        <button disabled>Unavailable</button>
      </Fixture>,
    );
    const node = screen.getByRole("dialog");
    assert.equal(document.activeElement, node);
    fireEvent.keyDown(node, { key: "Tab", cancelable: true });
    assert.equal(document.activeElement, node);
    opener.remove();
    hidden.removeAttribute("inert");
    hidden.removeAttribute("aria-hidden");
    view.unmount();
    assert.equal(fallback, 1);
    assert(!hidden.hasAttribute("inert"));
    assert(!hidden.hasAttribute("aria-hidden"));
  } finally {
    cleanup();
    opener.remove();
    hidden.remove();
  }
});
test("only top dialog handles Escape; nested cleanup retains outer focus containment and body lock", () => {
  const opener = outside();
  let outer = 0,
    inner = 0;
  try {
    function Nested({ inside }: { inside: boolean }) {
      return (
        <Fixture onClose={() => outer++}>
          <button>Outer action</button>
          {inside && (
            <Fixture onClose={() => inner++}>
              <button>Inner action</button>
            </Fixture>
          )}
        </Fixture>
      );
    }
    const view = render(<Nested inside={false} />);
    view.rerender(<Nested inside />);
    fireEvent.keyDown(document.activeElement!, {
      key: "Escape",
      cancelable: true,
    });
    assert.equal(inner, 1);
    assert.equal(outer, 0);
    assert.equal(document.body.style.overflow, "hidden");
    view.rerender(<Nested inside={false} />);
    opener.focus();
    assert.equal(document.activeElement, screen.getByText("Outer action"));
    assert.equal(document.body.style.overflow, "hidden");
    fireEvent.keyDown(document.activeElement!, {
      key: "Escape",
      cancelable: true,
    });
    assert.equal(outer, 1);
    view.unmount();
    assert.equal(document.activeElement, opener);
    assert.equal(document.body.style.overflow, "");
  } finally {
    cleanup();
    opener.remove();
    document.body.style.overflow = "";
  }
});
test("StrictMode replay preserves keyboard containment and returns focus without leaving background inert", () => {
  const opener = outside();
  try {
    const view = render(
      <React.StrictMode>
        <Fixture initial="dialog">
          <button>Only action</button>
        </Fixture>
      </React.StrictMode>,
    );
    const node = screen.getByRole("dialog");
    assert.equal(document.activeElement, node);
    fireEvent.keyDown(node, { key: "Tab", cancelable: true });
    assert.equal(document.activeElement, screen.getByText("Only action"));
    view.unmount();
    assert.equal(document.activeElement, opener);
    assert(!opener.hasAttribute("inert"));
    assert.equal(document.body.style.overflow, "");
  } finally {
    cleanup();
    opener.remove();
  }
});
