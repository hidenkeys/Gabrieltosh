import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "HTMLDialogElement",
])
  Object.defineProperty(globalThis, key, {
    value: (dom.window as any)[key],
    configurable: true,
  });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
// JSDOM lacks the browser-native top layer. Real modality/Escape acceptance is a browser gate.
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
  this.focus();
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
const React = await import("react");
const { render, screen, fireEvent, cleanup } =
  await import("@testing-library/react");
const { default: MenuPublication } =
  await import("../src/mera/workspace/MenuPublication.tsx");
const proof = {
  actorId: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
  branchId: "30000000-0000-4000-8000-000000000001",
};
const base = `/organizations/${proof.organizationId}/branches/${proof.branchId}`;
const preview = {
  ...proof,
  publishedVersion: 2,
  previewHash: "a".repeat(64),
  products: [
    {
      id: "40000000-0000-4000-8000-000000000001",
      name: "Original tea",
      price: 120000,
      category: "Tea",
    },
  ],
  categories: [{ id: "50000000-0000-4000-8000-000000000001", name: "Tea" }],
};
const key = `mera:publication:tab:v1:${proof.organizationId}:${proof.branchId}:${proof.actorId}`;
const journal = () => ({
  ...proof,
  body: {
    requestKey: "60000000-0000-4000-8000-000000000001",
    previewHash: preview.previewHash,
    expectedVersion: 2,
  },
  preview,
});
test.beforeEach(() => window.sessionStorage.clear());
test.afterEach(cleanup);
const mount = (onSuccess = () => {}) =>
  render(
    <MenuPublication
      base={base}
      actorId={proof.actorId}
      organizationName="Bing Chun"
      branchName="Surulere"
      onSuccess={onSuccess}
    />,
  );
test("publication shows actual review and journals exact body before deliberate publish", async (t) => {
  let success = 0;
  const writes: any[] = [];
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (String(input).endsWith("/publication-preview"))
      return Response.json(preview);
    writes.push(JSON.parse(init.body));
    assert.deepEqual(
      JSON.parse(window.sessionStorage.getItem(key)!).body,
      writes[0],
    );
    return Response.json({ version: 3 });
  });
  mount(() => {
    success++;
  });
  fireEvent.click(screen.getByRole("button", { name: "Review & publish" }));
  await screen.findByText("Original tea");
  assert(screen.getByText("Bing Chun / Surulere · Customer menu"));
  assert.equal(writes.length, 0);
  assert(screen.getByText("₦1,200.00"));
  fireEvent.click(
    screen.getByRole("button", { name: "Publish reviewed menu" }),
  );
  await screen.findByText("Menu version 3 is published.");
  assert.equal(success, 1);
  assert.equal(writes.length, 1);
  assert.equal(window.sessionStorage.getItem(key), null);
});
test("uncertain publication retains exact request through4xx, refresh and check-not-found", async (t) => {
  const writes: any[] = [];
  let previews = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    const path = String(input);
    if (path.endsWith("/publication-preview")) {
      previews++;
      return Response.json(preview);
    }
    if (path.includes("/publication-attempts/"))
      return Response.json({ ...proof, status: "not_found" });
    writes.push(JSON.parse(init.body));
    if (writes.length === 1) throw Error("connection lost");
    if (writes.length === 2)
      return Response.json({ error: "Access interrupted" }, { status: 403 });
    return Response.json({ version: 3 });
  });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Review & publish" }));
  await screen.findByText("Original tea");
  fireEvent.click(
    screen.getByRole("button", { name: "Publish reviewed menu" }),
  );
  await screen.findByRole("alert");
  const original = window.sessionStorage.getItem(key);
  cleanup();
  mount();
  assert.equal(writes.length, 1);
  fireEvent.click(screen.getByRole("button", { name: "Recover publication" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Check original publication" }),
  );
  await screen.findByText(/No publication is recorded yet/);
  assert.equal(window.sessionStorage.getItem(key), original);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original publication" }),
  );
  await screen.findByRole("alert");
  assert.equal(window.sessionStorage.getItem(key), original);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original publication" }),
  );
  await screen.findByText("Menu version 3 is published.");
  assert.deepEqual(writes[0], writes[1]);
  assert.deepEqual(writes[0], writes[2]);
  assert.equal(previews, 1);
});
test("wrong canonical actor cannot replay or abandon a restored publication", async (t) => {
  window.sessionStorage.setItem(key, JSON.stringify(journal()));
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (init.method === "POST") writes.push(String(input));
    return Response.json({
      ...proof,
      actorId: "70000000-0000-4000-8000-000000000001",
      status: "not_found",
    });
  });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Recover publication" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original publication" }),
  );
  await screen.findByRole("alert");
  assert.equal(writes.length, 0);
  assert(window.sessionStorage.getItem(key));
});
test("explicit stop preserves recorded publication and requires confirmation before abandonment", async (t) => {
  window.sessionStorage.setItem(key, JSON.stringify(journal()));
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (_input: any, init: any) =>
    init.method === "GET"
      ? Response.json({ ...proof, status: "not_found" })
      : (posts++, Response.json({ ...proof, status: "recorded", version: 3 })),
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Recover publication" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Stop unconfirmed request…" }),
  );
  assert.equal(posts, 0);
  fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
    target: { value: "Please stop the unconfirmed request" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Stop unconfirmed publication" }),
  );
  await screen.findByText("Menu version 3 is published.");
  assert.equal(posts, 1);
  assert.equal(window.sessionStorage.getItem(key), null);
});
test("corrupt journal blocks fresh publication and storage refusal prevents POST", async (t) => {
  window.sessionStorage.setItem(key, "corrupt");
  const writes: any[] = [];
  t.mock.method(globalThis, "fetch", async (_input: any, init: any) => {
    if (init.method === "POST") writes.push(init.body);
    return Response.json(preview);
  });
  mount();
  await screen.findByRole("alert");
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Review & publish",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  cleanup();
  window.sessionStorage.clear();
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Review & publish" }));
  await screen.findByText("Original tea");
  t.mock.method(Object.getPrototypeOf(window.sessionStorage), "setItem", () => {
    throw Error("Storage refused");
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Publish reviewed menu" }),
  );
  await screen.findByRole("alert");
  assert.equal(writes.length, 0);
});

test("authoritative abandonment alone releases saved review; malformed proof stays frozen", async (t) => {
  window.sessionStorage.setItem(key, JSON.stringify(journal()));
  let valid = false;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      ...proof,
      status: "abandoned",
      ...(valid
        ? { resolutionId: "80000000-0000-4000-8000-000000000001" }
        : {}),
    }),
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Recover publication" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Check original publication" }),
  );
  await screen.findByRole("alert");
  assert(window.sessionStorage.getItem(key));
  valid = true;
  fireEvent.click(
    screen.getByRole("button", { name: "Check original publication" }),
  );
  await screen.findByText(/The unconfirmed request is stopped/);
  assert.equal(window.sessionStorage.getItem(key), null);
});
test("native cancel retains pending publication and returns focus to recovery control", async () => {
  window.sessionStorage.setItem(key, JSON.stringify(journal()));
  mount();
  const trigger = screen.getByRole("button", { name: "Recover publication" });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { bubbles: false, cancelable: true }),
  );
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, trigger);
  assert(window.sessionStorage.getItem(key));
});
test("Escape key closes the review while retaining the original journal", () => {
  window.sessionStorage.setItem(key, JSON.stringify(journal()));
  mount();
  const trigger = screen.getByRole("button", { name: "Recover publication" });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, trigger);
  assert(window.sessionStorage.getItem(key));
});
test("unmount during publish retains journal and does not call parent success", async (t) => {
  let resolve!: (response: Response) => void;
  let success = 0;
  t.mock.method(globalThis, "fetch", async (_input: any, init: any) =>
    init.method === "GET"
      ? Response.json(preview)
      : new Promise<Response>((done) => {
          resolve = done;
        }),
  );
  mount(() => {
    success++;
  });
  fireEvent.click(screen.getByRole("button", { name: "Review & publish" }));
  await screen.findByText("Original tea");
  fireEvent.click(
    screen.getByRole("button", { name: "Publish reviewed menu" }),
  );
  assert(window.sessionStorage.getItem(key));
  cleanup();
  resolve(Response.json({ version: 3 }));
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(success, 0);
  assert(window.sessionStorage.getItem(key));
});

test("variant-only base zero review retains actual sizes, variant prices and modifier adjustments", async (t) => {
  const configured = {
    ...preview,
    products: [
      {
        ...preview.products[0],
        price: 0,
        size: "700 ml",
        variants: [{ id: "large", name: "Large", price: 350000 }],
        modifierGroups: [
          {
            id: "toppings",
            name: "Toppings",
            min: 0,
            max: 2,
            options: [
              { id: "pearls", name: "Tapioca pearls", price: 50000 },
              { id: "no-topping", name: "No topping", price: 0 },
            ],
          },
        ],
        privatePolicy: "must not persist",
      },
    ],
  };
  let saved: any;
  t.mock.method(globalThis, "fetch", async (_input: any, init: any) => {
    if (init.method === "GET") return Response.json(configured);
    saved = JSON.parse(window.sessionStorage.getItem(key)!);
    throw Error("Connection interrupted");
  });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Review & publish" }));
  await screen.findByText("Size: 700 ml");
  assert(screen.getByText("Large: ₦3,500.00"));
  assert(screen.getByText("Tapioca pearls: +₦500.00"));
  assert(screen.getByText("No topping: +₦0.00"));
  assert(screen.getByText("Choose 0–2 options"));
  assert(screen.getByText("See variant prices"));
  fireEvent.click(
    screen.getByRole("button", { name: "Publish reviewed menu" }),
  );
  await screen.findByRole("alert");
  assert.equal(saved.preview.products[0].variants[0].price, 350000);
  assert.equal(
    saved.preview.products[0].modifierGroups[0].options[0].price,
    50000,
  );
  assert.equal("privatePolicy" in saved.preview.products[0], false);
  assert.deepEqual(Object.keys(saved.body).sort(), [
    "expectedVersion",
    "previewHash",
    "requestKey",
  ]);
});

test("confirmed stopping offers a fresh review without publishing automatically", async (t) => {
  window.sessionStorage.setItem(key, JSON.stringify(journal()));
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    if (init.method !== "GET") writes++;
    return Response.json(
      String(input).endsWith("/publication-preview")
        ? preview
        : {
            ...proof,
            status: "abandoned",
            resolutionId: "50000000-0000-4000-8000-000000000001",
          },
    );
  });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Recover publication" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Check original publication" }),
  );
  await screen.findByRole("button", { name: "Review current menu" });
  fireEvent.click(screen.getByRole("button", { name: "Review current menu" }));
  await screen.findByText("Original tea");
  assert.equal(writes, 0);
  assert.equal(window.sessionStorage.getItem(key), null);
});
