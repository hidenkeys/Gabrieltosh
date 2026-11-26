import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<html><body></body></html>", {
  url: "https://mera.test",
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
const { render, screen, cleanup, fireEvent, waitFor } =
  await import("@testing-library/react");
const { default: MenuPhotos } =
  await import("../src/mera/workspace/MenuPhotos");
test("photos render generated data URL, resize to JPEG and post apply, then refresh", async () => {
  const original = globalThis.fetch,
    bitmap = globalThis.createImageBitmap,
    context = dom.window.HTMLCanvasElement.prototype.getContext,
    toData = dom.window.HTMLCanvasElement.prototype.toDataURL;
  const calls: any[] = [];
  let refreshed = 0,
    closed = false;
  globalThis.createImageBitmap = async () =>
    ({
      width: 1600,
      height: 1200,
      close() {
        closed = true;
      },
    }) as ImageBitmap;
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillRect() {},
      drawImage() {
        assert.equal(this.canvas.width, 800);
        assert.equal(this.canvas.height, 600);
      },
      canvas: this,
    } as any;
  };
  dom.window.HTMLCanvasElement.prototype.toDataURL = function (mime, q) {
    assert.equal(mime, "image/jpeg");
    assert.equal(q, 0.82);
    return "data:image/jpeg;base64,YWJjZA==";
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    return Response.json(
      String(url).endsWith("/generate")
        ? { mime: "image/png", data: "YWJjZA==" }
        : { id: "rice", image: "/api/mera/v1/public/assets/test" },
    );
  };
  try {
    render(
      <MenuPhotos
        base="/branch"
        products={[
          { id: "rice", name: "Rice" },
          { id: "saved", name: "Soup", image: "/image" },
        ]}
        onImported={() => {
          refreshed++;
        }}
        onClose={() => {}}
      />,
    );
    assert.equal(screen.queryByText("Soup"), null);
    assert(screen.getByText(/1 photos ≈ \$0.04/));
    fireEvent.click(
      screen.getByRole("button", { name: "Generate", exact: true }),
    );
    await screen.findByRole("img", { name: "Generated Rice" });
    assert.equal(
      screen.getByRole("img").getAttribute("src"),
      "data:image/png;base64,YWJjZA==",
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep", exact: true }));
    await screen.findByText("Photo kept");
    await waitFor(() => assert.equal(refreshed, 1));
    assert.deepEqual(calls[1].body, {
      productId: "rice",
      mime: "image/jpeg",
      data: "YWJjZA==",
    });
    assert(closed);
  } finally {
    cleanup();
    globalThis.fetch = original;
    globalThis.createImageBitmap = bitmap;
    dom.window.HTMLCanvasElement.prototype.getContext = context;
    dom.window.HTMLCanvasElement.prototype.toDataURL = toData;
  }
});
test("per-item 503 does not stop other photos", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) =>
    JSON.parse(String(options?.body)).productId === "rice"
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : Response.json({ mime: "image/png", data: "YWJjZA==" });
  try {
    render(
      <MenuPhotos
        base="/branch"
        products={[
          { id: "rice", name: "Rice" },
          { id: "soup", name: "Soup" },
        ]}
        onImported={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate", exact: true }),
    );
    await screen.findByText("AI photos aren't set up yet.");
    await screen.findByRole("img", { name: "Generated Soup" });
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
