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
const { default: MediaUpload, prepareImage } =
  await import("../src/mera/MediaUpload.tsx");
function imageProcessing(t: any, outputType = "image/png") {
  const sizes: number[][] = [],
    types: string[] = [];
  let closed = false;
  t.mock.method(globalThis, "createImageBitmap", async () => ({
    width: 3200,
    height: 1600,
    close() {
      closed = true;
    },
  }));
  const original = document.createElement.bind(document);
  t.mock.method(document, "createElement", (tag: string, ...args: any[]) => {
    if (tag !== "canvas") return original(tag, ...args);
    const canvas: any = {
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect() {},
        drawImage() {
          sizes.push([canvas.width, canvas.height]);
        },
      }),
      toBlob(callback: any, mime: string) {
        types.push(mime);
        callback(new Blob(["safe fixture image"], { type: outputType }));
      },
    };
    return canvas;
  });
  return { sizes, types, closed: () => closed };
}
// createImageBitmap is missing in JSDOM; define the browser API before each mock.
Object.defineProperty(globalThis, "createImageBitmap", {
  value: async () => {},
  writable: true,
  configurable: true,
});
test("image preparation rejects executable formats before decoding", async () => {
  await assert.rejects(
    prepareImage(new File(["<svg/>"], "image.svg", { type: "image/svg+xml" })),
    /SVG and HTML/,
  );
});
test("large PNG keeps alpha-capable format and correct scaled dimensions", async (t) => {
  const probe = imageProcessing(t);
  const result = await prepareImage(
    new File(["png"], "logo.png", { type: "image/png" }),
  );
  assert.deepEqual(probe.sizes, [[1600, 800]]);
  assert.deepEqual(probe.types, ["image/png"]);
  assert.equal(result.blob.type, "image/png");
  assert.equal(result.width, 1600);
  assert(probe.closed());
});
test("upload remains scoped and leaves publishing explicit", async (t) => {
  imageProcessing(t);
  const endpoint = "/api/mera/v1/organizations/org/branches/branch/assets";
  let uploaded: any = null,
    body: any = null;
  t.mock.method(globalThis, "fetch", async (url: any, options: any) => {
    assert.equal(url, endpoint);
    body = JSON.parse(options.body);
    assert.equal(options.credentials, "same-origin");
    return Response.json({
      id: "asset-one",
      url: "/api/mera/v1/public/assets/asset-one",
      previewUrl: endpoint + "/asset-one",
      mime: "image/png",
      width: 1600,
      height: 800,
    });
  });
  render(
    React.createElement(MediaUpload, {
      endpoint,
      onUploaded: (value) => {
        uploaded = value;
      },
    }),
  );
  fireEvent.change(screen.getByLabelText("Upload image"), {
    target: { files: [new File(["png"], "logo.png", { type: "image/png" })] },
  });
  await screen.findByText(/Uploading does not publish it/);
  assert.equal(uploaded.id, "asset-one");
  assert.equal(body.mime, "image/png");
  assert.equal(body.filename, "logo.png");
  assert.equal(
    screen.getByAltText("Uploaded image preview").getAttribute("src"),
    endpoint + "/asset-one",
  );
  cleanup();
});
test("failed server validation never reports a successful upload", async (t) => {
  imageProcessing(t);
  let called = false;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "Image validation failed" }, { status: 400 }),
  );
  render(
    React.createElement(MediaUpload, {
      endpoint: "/api/mera/v1/organizations/org/assets",
      onUploaded: () => {
        called = true;
      },
    }),
  );
  fireEvent.change(screen.getByLabelText("Upload image"), {
    target: { files: [new File(["png"], "logo.png", { type: "image/png" })] },
  });
  await screen.findByRole("alert");
  assert.equal(called, false);
  assert.equal(screen.queryByAltText("Uploaded image preview"), null);
  cleanup();
});
