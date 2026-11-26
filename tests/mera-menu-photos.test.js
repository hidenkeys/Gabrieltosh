import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import {
  mountMenuPhotos,
  placeholderPng,
  parsePhoto,
} from "../server/mera/menu-photos.js";
const id = randomUUID(),
  org = randomUUID(),
  branch = randomUUID();
function fixture({
  env = { MERA_AI_MOCK: "true" },
  aiFetch = () => {
    throw Error("Network prohibited");
  },
  spend = 0,
  count = 0,
  permission = true,
  station = "kitchen",
  missing = false,
} = {}) {
  const usage = [],
    assets = [],
    events = [],
    requests = [];
  let product = { id, name: "Jollof rice", description: "Spicy rice", station };
  const db = {
    async query(sql, p = []) {
      requests.push(sql);
      if (sql.includes("SUM(cost_usd)")) return { rows: [{ total: spend }] };
      if (sql.includes("COUNT(*)"))
        return {
          rows: [
            { count: sql.includes("mera_assets") ? assets.length : count },
          ],
        };
      if (sql.startsWith("INSERT INTO mera_ai_usage"))
        usage.push({ id: p[0], feature: p[4], cost: p[8], status: p[9] });
      if (sql.startsWith("UPDATE mera_ai_usage"))
        Object.assign(
          usage.find((u) => u.id === p[4]),
          { cost: p[2], status: p[3] },
        );
      if (sql.startsWith("INSERT INTO mera_assets")) assets.push(p);
      if (sql.includes("sha256=$3"))
        return {
          rows: assets.filter((a) => a[8] === p[2]).map((a) => ({ id: a[0] })),
        };
      return {
        rows:
          sql.includes("mera_organizations") || sql.includes("mera_branches")
            ? [{ id: org, settings: { venueType: "lounge" } }]
            : [],
      };
    },
    async transaction(fn) {
      return fn(db);
    },
  };
  const applyRouter = express.Router();
  mountMenuPhotos(applyRouter, {
    db,
    env,
    aiFetch,
    guard: () => (req, res, next) => {
      if (!permission) throw Object.assign(Error("Forbidden"), { status: 403 });
      next();
    },
    scope: () => ({ organizationId: org, branchId: branch }),
    find: async () => {
      if (missing) throw Object.assign(Error("Missing"), { status: 404 });
      return product;
    },
    locked: async (s, fn) => fn(db),
    update: async (c, s, k, i, p) => {
      product = p;
      return p;
    },
    event: async (c, s, action) => events.push(action),
  });
  return {
    usage,
    assets,
    events,
    requests,
    async call(action, body = { productId: id }) {
      const route = applyRouter.stack.find((l) =>
        l.route.path.endsWith("/" + action),
      );
      const req = { body, user: { id: randomUUID() } };
      let result;
      const res = {
        json: (v) => {
          result = v;
        },
      };
      try {
        for (const l of route.route.stack) {
          let error;
          await l.handle(req, res, (e) => (error = e));
          if (error) throw error;
        }
        return { status: 200, body: result };
      } catch (e) {
        return {
          status: e.status || (e.name === "ZodError" ? 400 : 500),
          body: e.message,
        };
      }
    },
  };
}
test("mock PNG has valid signature, IHDR dimensions and deterministic colour", () => {
  const png = placeholderPng("Rice");
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
  assert.deepEqual(png, placeholderPng("Rice"));
  assert.notDeepEqual(png, placeholderPng("Soup"));
});
test("photo parsing rejects invalid data URL, base64 and mismatched magic bytes", () => {
  assert.throws(() => parsePhoto("https://example.com/photo"));
  assert.throws(() => parsePhoto("data:image/png;base64,abcd"));
  assert.throws(() =>
    parsePhoto(
      "data:image/jpeg;base64," + placeholderPng("Rice").toString("base64"),
    ),
  );
  assert.equal(
    parsePhoto(
      "data:image/png;base64," + placeholderPng("Rice").toString("base64"),
    ).mime,
    "image/png",
  );
});
test("gateway request includes model, modalities, venue, name and drink glass prompt; priced usage", async () => {
  let request;
  const f = fixture({
    env: { AI_GATEWAY_API_KEY: "test", AI_IMAGE_MODEL: "test-image" },
    station: "bar",
    aiFetch: async (url, options) => {
      request = { url, ...JSON.parse(options.body) };
      return Response.json({
        usage: { cost: 0.02 },
        choices: [
          {
            message: {
              images: [
                {
                  image_url: {
                    url:
                      "data:image/png;base64," +
                      placeholderPng("Rice").toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      });
    },
  });
  assert.equal((await f.call("generate")).status, 200);
  assert.equal(request.model, "test-image");
  assert.deepEqual(request.modalities, ["image", "text"]);
  assert.match(
    request.messages[0].content,
    /drink photograph of Jollof rice, Spicy rice/,
  );
  assert.match(request.messages[0].content, /appropriate glass/);
  assert.match(request.messages[0].content, /lounge in Nigeria/);
  assert.equal(f.usage[0].status, "ok");
  assert.equal(f.usage[0].cost, 0.02);
  assert.equal(f.usage[0].feature, "menu_photo");
});
test("mock is network free and tracks zero cost; unconfigured, cap, hourly, missing and permission errors", async () => {
  const mock = fixture();
  assert.equal((await mock.call("generate")).body.usage.costUsd, 0);
  assert.equal(mock.usage[0].status, "mock");
  for (const [options, status] of [
    [{ env: {} }, 503],
    [{ spend: 5 }, 429],
    [{ count: 60 }, 429],
    [{ missing: true }, 404],
    [{ permission: false }, 403],
  ]) {
    const f = fixture(options);
    assert.equal((await f.call("generate")).status, status);
    if (status !== 403) assert.equal(f.usage[0].status, "failed");
  }
});
test("failed gateway attempts release the reserved cost and record failed status", async () => {
  const f = fixture({
    env: { AI_GATEWAY_API_KEY: "test" },
    aiFetch: async () => Response.json({}, { status: 500 }),
  });
  assert.equal((await f.call("generate")).status, 502);
  assert.equal(f.usage[0].cost, 0);
  assert.equal(f.usage[0].status, "failed");
});
test("apply stores deduplicated asset, updates product image and records event", async () => {
  const f = fixture(),
    body = {
      productId: id,
      mime: "image/png",
      data: placeholderPng("Rice").toString("base64"),
    };
  const r = await f.call("apply", body);
  assert.equal(r.status, 200);
  assert.match(r.body.image, /\/public\/assets\//);
  assert.equal(f.assets.length, 1);
  assert(f.events.includes("product_photo_added"));
  assert.equal((await f.call("apply", body)).body.image, r.body.image);
  assert.equal(f.assets.length, 1);
});
test("apply rejects oversized, invalid base64 and magic bytes; enforces permissions", async () => {
  for (const data of [Buffer.alloc(524289).toString("base64"), "!!!!", "abcd"])
    assert.equal(
      (
        await fixture().call("apply", {
          productId: id,
          mime: "image/png",
          data,
        })
      ).status,
      400,
    );
  assert.equal(
    (await fixture({ permission: false }).call("apply", {})).status,
    403,
  );
});
