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
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: ServiceAttention } =
  await import("../src/mera/workspace/ServiceAttention");
test("service attention keeps the queue action visible while keyboard details remain mounted and private IDs are not labels", () => {
  let reviews = 0;
  try {
    const { container, rerender } = render(
      <ServiceAttention
        orders={Array.from({ length: 12 }, (_, i) => ({
          id: `private-${i}`,
          reference: i ? `A-${i}` : null,
          ageMinutes: i ? 20 : undefined,
        }))}
        threshold={25}
        onReview={() => reviews++}
      />,
    );
    assert(
      screen
        .getByRole("status")
        .textContent?.includes("12 active orders need attention"),
    );
    const details = container.querySelector("details")!;
    assert.equal(details.open, false);
    fireEvent.click(
      screen.getByRole("button", { name: "Review branch orders" }),
    );
    assert.equal(reviews, 1);
    fireEvent.keyDown(screen.getByText("Waiting order details"), {
      key: "Enter",
    });
    assert.equal(details.open, true);
    assert.equal(container.querySelectorAll("li").length, 10);
    assert(screen.getByText(/25-minute threshold/));
    assert(screen.getByText("2 more delayed orders."));
    assert(!container.textContent?.includes("private-0"));
    assert(screen.getByText(/Waiting time unavailable/));
    rerender(<ServiceAttention orders={[]} onReview={() => reviews++} />);
    assert.equal(container.textContent, "");
  } finally {
    cleanup();
  }
});
