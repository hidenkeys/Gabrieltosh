import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3003/mera/menu/venue/branch",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "FormData",
])
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
const { default: GuestActivity } =
  await import("../src/mera/customer/GuestActivity.tsx");
test.afterEach(cleanup);
const activity = (text: string) => ({
  reservations: [],
  feedback: [
    {
      id: text,
      category: "service",
      rating: 5,
      text,
      status: "open",
      createdAt: "2026-11-18T12:00:00Z",
    },
  ],
});
test("activity scope switch hides previous private content immediately and ignores its late response", async (t) => {
  let resolveOld!: (response: Response) => void;
  let oldCalls = 0;
  t.mock.method(globalThis, "fetch", async (input: any) => {
    if (String(input).includes("/old/")) {
      if (++oldCalls === 1)
        return Response.json(activity("Old private feedback"));
      return new Promise<Response>((resolve) => {
        resolveOld = resolve;
      });
    }
    return Response.json(activity("New venue feedback"));
  });
  const view = render(
    React.createElement(GuestActivity, {
      prefix: "/api/mera/v1/public/old/branch",
    }),
  );
  await screen.findByText("Old private feedback");
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh your activity" }),
  );
  view.rerender(
    React.createElement(GuestActivity, {
      prefix: "/api/mera/v1/public/new/branch",
    }),
  );
  assert.equal(screen.queryByText("Old private feedback"), null);
  await screen.findByText("New venue feedback");
  await act(async () => {
    resolveOld(Response.json(activity("Late old private feedback")));
  });
  assert.equal(screen.queryByText("Late old private feedback"), null);
  assert(screen.getByText("New venue feedback"));
});
test("activity authorization loss clears private content and offers a deliberate retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++calls === 1
      ? Response.json(activity("Private guest feedback"))
      : Response.json({ error: "Guest session expired" }, { status: 401 }),
  );
  render(
    React.createElement(GuestActivity, {
      prefix: "/api/mera/v1/public/venue/branch",
    }),
  );
  await screen.findByText("Private guest feedback");
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh your activity" }),
  );
  await screen.findByRole("alert");
  assert.equal(screen.queryByText("Private guest feedback"), null);
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Refresh your activity",
      }) as HTMLButtonElement
    ).disabled,
    false,
  );
});
