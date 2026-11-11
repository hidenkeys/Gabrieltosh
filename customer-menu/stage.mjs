// Stage the public Worker and its optimized product photos in the Sites checkout.
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { getProductPhoto, productPhotos } from "../src/brand.ts";

const [destination, sharpPath] = process.argv.slice(2);
if (!destination)
  throw new Error(
    "Usage: node customer-menu/stage.mjs <Site checkout> [absolute sharp module path]",
  );
const sharp = createRequire(import.meta.url)(sharpPath || "sharp");
const here = new URL("./", import.meta.url);
const read = (filename) => readFile(new URL(filename, here), "utf8");
const catalog = {
  assets: {},
  photos: {},
  fallbacks: {},
  css: await read("menu.css"),
  script: await read("menu.js"),
};
const names = new Map();
async function asset(filename) {
  if (!names.has(filename)) {
    const original = await readFile(new URL(`../public/${filename}`, here));
    const data = await sharp(original)
      .resize(360, 360, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const hash =
      createHash("sha256").update(data).digest("hex").slice(0, 16) + ".webp";
    catalog.assets[hash] = data.toString("base64");
    names.set(filename, hash);
  }
  return names.get(filename);
}
for (const [code, photo] of Object.entries(productPhotos))
  catalog.photos[code] = await asset(`products/${photo.src}`);
for (const category of [
  "Fruit milk tea",
  "Fresh fruit tea",
  "Ice cream series",
  "Smoothie series",
  "Toppings",
])
  catalog.fallbacks[category] = await asset(
    `products/${getProductPhoto({ code: "", category }).src}`,
  );
catalog.defaultPhoto = catalog.fallbacks["Fruit milk tea"];
catalog.logo = await asset("brand/brand-logo.png");
await mkdir(resolve(destination, "worker"), { recursive: true });
await mkdir(resolve(destination, ".openai"), { recursive: true });
await copyFile(
  new URL(".openai/hosting.json", here),
  resolve(destination, ".openai/hosting.json"),
);
const source = await read("worker.mjs");
await writeFile(
  resolve(destination, "worker/index.js"),
  `${source}\nexport default createMenuWorker(${JSON.stringify(catalog)});\n`,
);
console.log(
  `Staged public menu with ${Object.keys(catalog.assets).length} optimized images.`,
);
