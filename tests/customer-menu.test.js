import test from "node:test";
import assert from "node:assert/strict";
import { createMenuWorker } from "../customer-menu/worker.mjs";

const url = "https://menu.example";
const key = "a".repeat(64);
const item = {
  code: "H1",
  name: "<b>Strawberry</b> Smoothie",
  category: "Smoothie series",
  size: "500 ml",
  price: 320000,
};

test("public menu accepts only authorized snapshots and exposes only customer fields", async () => {
  const storage = new Map();
  const env = {
    MENU_PUBLISH_KEY: key,
    BUCKET: {
      put: async (k, value) => storage.set(k, value),
      get: async (k) =>
        storage.has(k)
          ? { json: async () => JSON.parse(storage.get(k)) }
          : null,
    },
  };
  const worker = createMenuWorker({
    assets: {},
    photos: {},
    fallbacks: {},
    defaultPhoto: "photo.webp",
    logo: "logo.webp",
  });
  const publish = (authorization, items) =>
    worker.fetch(
      new Request(url + "/publish", {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({ items }),
      }),
      env,
    );
  assert.equal((await publish("Bearer " + "b".repeat(64), [item])).status, 403);
  assert.equal(storage.size, 0);
  assert.equal(
    (await publish("Bearer " + key, [{ ...item, price: -1 }])).status,
    400,
  );
  const response = await publish("Bearer " + key, [
    { ...item, staff: "PRIVATE STAFF DATA", id: "PRIVATE ID" },
  ]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 1);
  assert.deepEqual(JSON.parse(storage.values().next().value).items, [item]);

  const publicPage = await worker.fetch(new Request(url), env);
  assert.equal(publicPage.status, 200);
  const html = await publicPage.text();
  assert.match(html, /&lt;b&gt;Strawberry&lt;\/b&gt; Smoothie/);
  assert.match(html, /₦3,200/);
  assert(!html.includes("PRIVATE"));
  assert(!html.includes(key));
  assert.equal(
    (await worker.fetch(new Request(url + "/photo/constructor"), env)).status,
    404,
  );
});
