import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://mera.test/mera/workspace",
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
const { default: MenuImport } =
  await import("../src/mera/workspace/MenuImport");
const draft = {
  currency: "NGN",
  categories: [
    {
      name: "Food",
      items: [
        {
          name: "Rice",
          description: "With vegetables",
          price: null,
          sizes: [],
          addOns: [],
          dietary: [],
          station: "kitchen" as const,
          confidence: "low" as const,
          note: "Check the price",
        },
      ],
    },
  ],
  warnings: ["Review all prices"],
};
test("review renders draft and low-confidence reason; missing price disables import; edited payload is submitted", async () => {
  const original = globalThis.fetch;
  let payload: any,
    refreshes = 0;
  globalThis.fetch = async (input, options) => {
    assert.equal(String(input), "/api/mera/v1/branch/menu-import/apply");
    payload = JSON.parse(String(options?.body));
    return Response.json({ created: 1, skipped: [], categoriesCreated: 1 });
  };
  try {
    render(
      <MenuImport
        base="/branch"
        initialDraft={structuredClone(draft)}
        onClose={() => {}}
        onImported={() => {
          refreshes++;
        }}
      />,
    );
    assert(screen.getByRole("table"));
    assert.equal(screen.getAllByRole("row").length, 2);
    assert.equal(
      screen
        .getByRole("button", { name: "Details" })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert(screen.getByText("Review all prices"));
    assert(screen.getByText("Check the price"));
    assert(
      screen
        .getByRole("row", { name: /Include Rice/ })
        .classList.contains("mmi-check"),
    );
    assert(
      (
        screen.getByRole("button", {
          name: "Import 1 items",
        }) as HTMLButtonElement
      ).disabled,
    );
    fireEvent.change(screen.getByLabelText("Price for Rice"), {
      target: { value: "2,500" },
    });
    fireEvent.change(screen.getByLabelText("Item name"), {
      target: { value: "Jollof rice" },
    });
    fireEvent.change(screen.getByLabelText("Category name"), {
      target: { value: "Lunch" },
    });
    assert(
      !(
        screen.getByRole("button", {
          name: "Import 1 items",
        }) as HTMLButtonElement
      ).disabled,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import 1 items" }));
    await screen.findByText("Added 1 items · 0 with photos");
    assert.equal(payload.categories[0].name, "Lunch");
    assert.equal(payload.categories[0].items[0].name, "Jollof rice");
    assert.equal(payload.categories[0].items[0].price, 2500);
    assert.equal(refreshes, 1);
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("deselecting missing-price category disables empty import; valid sizes allow import", () => {
  try {
    const withSize = structuredClone(draft);
    withSize.categories[0].items[0].sizes = [
      { name: "Large", price: 3000 },
    ] as never;
    render(
      <MenuImport
        base="/branch"
        initialDraft={withSize}
        onClose={() => {}}
        onImported={() => {}}
      />,
    );
    assert(
      !(
        screen.getByRole("button", {
          name: "Import 1 items",
        }) as HTMLButtonElement
      ).disabled,
    );
    fireEvent.click(screen.getByLabelText("Select category"));
    assert(
      (
        screen.getByRole("button", {
          name: "Import 0 items",
        }) as HTMLButtonElement
      ).disabled,
    );
  } finally {
    cleanup();
  }
});
test("upload validates total size and offers an accessible file picker", () => {
  try {
    render(
      <MenuImport base="/branch" onClose={() => {}} onImported={() => {}} />,
    );
    const file = new dom.window.File(["menu"], "menu.jpg", {
      type: "image/jpeg",
    });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("Choose files"), {
      target: { files: [file] },
    });
    assert(screen.getByRole("alert").textContent?.includes("10 MB"));
    assert(
      (screen.getByRole("button", { name: "Read menu" }) as HTMLButtonElement)
        .disabled,
    );
  } finally {
    cleanup();
  }
});
test("review thumbnails can be enlarged and removed; empty items show No photo", () => {
  try {
    const d = structuredClone(draft) as any;
    d.categories[0].items[0].preview = "data:image/jpeg;base64,/9j/";
    render(
      <MenuImport
        base="/branch"
        initialDraft={d}
        onClose={() => {}}
        onImported={() => {}}
      />,
    );
    assert(screen.getByRole("img", { name: "Rice photo" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Enlarge photo for Rice" }),
    );
    assert(screen.getByRole("img", { name: "Rice photo enlarged" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    assert(screen.getByText("No photo"));
    assert.equal(screen.queryByRole("img"), null);
  } finally {
    cleanup();
  }
});
test("import uploads photos before apply and continues after a failed photo upload", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  let payload: any;
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    const body = JSON.parse(String(options?.body));
    if (String(url).endsWith("/assets")) {
      assert.equal(body.mime, "image/jpeg");
      assert.equal(body.data, "/9j/");
      if (body.filename === "Beans photo")
        return Response.json({ error: "Photo failed" }, { status: 400 });
      return Response.json({
        url: "/api/mera/v1/public/assets/11111111-1111-4111-8111-111111111111",
      });
    }
    payload = body;
    return Response.json({
      created: 2,
      withPhotos: 1,
      skipped: [],
      categoriesCreated: 1,
    });
  };
  try {
    const d = structuredClone(draft) as any;
    d.categories[0].items[0].price = 2500;
    d.categories[0].items[0].preview = "data:image/jpeg;base64,/9j/";
    d.categories[0].items.push({ ...d.categories[0].items[0], name: "Beans" });
    render(
      <MenuImport
        base="/branch"
        initialDraft={d}
        onClose={() => {}}
        onImported={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import 2 items" }));
    await screen.findByText("Added 2 items · 1 with photos");
    assert.deepEqual(calls, [
      "/api/mera/v1/branch/assets",
      "/api/mera/v1/branch/assets",
      "/api/mera/v1/branch/menu-import/apply",
    ]);
    assert(payload.categories[0].items[0].image);
    assert.equal(payload.categories[0].items[1].image, undefined);
    assert.equal(payload.categories[0].items[0].preview, undefined);
    assert(screen.getByText("Photo not saved for Beans"));
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});
test("crop preview pads, clamps and scales original source through a bitmap and canvas", async () => {
  const bitmapOriginal = globalThis.createImageBitmap;
  const contextOriginal = dom.window.HTMLCanvasElement.prototype.getContext;
  const dataOriginal = dom.window.HTMLCanvasElement.prototype.toDataURL;
  let drawn: any[] = [];
  let closed = false;
  globalThis.createImageBitmap = (async () => ({
    width: 2000,
    height: 1000,
    close: () => {
      closed = true;
    },
  })) as any;
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      drawImage: (...args: any[]) => {
        drawn = args;
      },
    };
  } as any;
  dom.window.HTMLCanvasElement.prototype.toDataURL = function (mime, q) {
    assert.equal(mime, "image/jpeg");
    assert.equal(q, 0.85);
    assert.equal(this.width, 800);
    assert.equal(this.height, 400);
    return "data:image/jpeg;base64,preview";
  };
  try {
    const { photoPreview } = await import("../src/mera/workspace/MenuImport");
    assert.equal(
      await photoPreview(new Blob(), [0, 0, 1000, 1000]),
      "data:image/jpeg;base64,preview",
    );
    assert.deepEqual(drawn.slice(1), [0, 0, 2000, 1000, 0, 0, 800, 400]);
    assert(closed);
  } finally {
    globalThis.createImageBitmap = bitmapOriginal;
    dom.window.HTMLCanvasElement.prototype.getContext = contextOriginal;
    dom.window.HTMLCanvasElement.prototype.toDataURL = dataOriginal;
  }
});
test("extract prepares crop and embedded thumbnails from source bytes", async () => {
  const originalFetch = globalThis.fetch,
    originalBitmap = globalThis.createImageBitmap;
  const originalReader = globalThis.FileReader;
  const originalContext = dom.window.HTMLCanvasElement.prototype.getContext;
  const originalData = dom.window.HTMLCanvasElement.prototype.toDataURL;
  Object.defineProperty(globalThis, "FileReader", {
    value: dom.window.FileReader,
    configurable: true,
  });
  const sources: Blob[] = [];
  globalThis.createImageBitmap = (async (source: Blob) => {
    sources.push(source);
    return { width: 100, height: 100, close: () => {} };
  }) as any;
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return { drawImage: () => {} };
  } as any;
  dom.window.HTMLCanvasElement.prototype.toDataURL = () =>
    "data:image/jpeg;base64,/9j/";
  globalThis.fetch = async (url) => {
    assert(String(url).endsWith("/extract"));
    const d = structuredClone(draft) as any;
    d.categories[0].items[0].photo = {
      kind: "crop",
      file: 0,
      box: [100, 100, 900, 900],
    };
    d.categories[0].items.push({
      ...d.categories[0].items[0],
      name: "Beans",
      photo: { kind: "embedded", ref: "img1" },
    });
    return Response.json({
      draft: d,
      photos: { img1: { mime: "image/jpeg", data: "/9j/" } },
      importId: "test",
    });
  };
  try {
    render(
      <MenuImport base="/branch" onClose={() => {}} onImported={() => {}} />,
    );
    const file = new dom.window.File(
      [new Uint8Array([255, 216, 255])],
      "menu.jpg",
      { type: "image/jpeg" },
    );
    fireEvent.change(screen.getByLabelText("Choose files"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read menu" }));
    await screen.findByRole("img", { name: "Rice photo" });
    assert(screen.getByRole("img", { name: "Beans photo" }));
    assert.equal(sources[1], file); // first bitmap prepares the model upload; crop uses the original File again
    assert.equal(sources[2].type, "image/jpeg");
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    globalThis.createImageBitmap = originalBitmap;
    Object.defineProperty(globalThis, "FileReader", {
      value: originalReader,
      configurable: true,
    });
    dom.window.HTMLCanvasElement.prototype.getContext = originalContext;
    dom.window.HTMLCanvasElement.prototype.toDataURL = originalData;
  }
});
