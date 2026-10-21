import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { productPhotos, getProductPhoto } from "../src/brand";
test("all 34 seeded menu products have existing local product images", async () => {
  const seed = await readFile(
    new URL("../server/seed.js", import.meta.url),
    "utf8",
  );
  const codes = [...seed.matchAll(/\[\s*"([A-Z]\d+)",/g)].map((m) => m[1]);
  assert.equal(
    codes.length,
    34,
    "Menu coverage fixture should include every seeded item.",
  );
  for (const code of codes) {
    assert(productPhotos[code], `Missing image mapping for ${code}`);
    assert(
      !productPhotos[code].src.startsWith("http"),
      "Images must work without internet.",
    );
    const file = new URL(
      "../public/products/" + productPhotos[code].src,
      import.meta.url,
    );
    assert(
      (await stat(file)).size > 1000,
      `Missing or empty image for ${code}`,
    );
  }
});
test("each topping and smoothie has its own product image", () => {
  for (const group of [
    ["X1", "X2", "X3", "X4"],
    ["H1", "H6", "H8", "H7"],
  ])
    assert.equal(new Set(group.map((code) => productPhotos[code].src)).size, 4);
});
test("new product categories resolve to an existing local photograph", async () => {
  for (const category of [
    "Fruit milk tea",
    "Fresh fruit tea",
    "Ice cream series",
    "Smoothie series",
    "Toppings",
    "New category",
  ]) {
    const image = getProductPhoto({ code: "NEW", category });
    assert(
      (await stat(new URL("../public/products/" + image.src, import.meta.url)))
        .size > 1000,
    );
  }
});
