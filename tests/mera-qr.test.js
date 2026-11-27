import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mountMeraQr, qrOrigin } from "../server/mera/qr.js";

test("QR exports require configured HTTPS outside isolated demo", () => {
  const old = { ...process.env };
  try {
    process.env.MERA_DEMO = "false";
    delete process.env.MERA_PUBLIC_ORIGIN;
    assert.throws(() => qrOrigin({}), /HTTPS/);
    for (const origin of [
      "http://example.com",
      "https://user:secret@example.com",
    ]) {
      process.env.MERA_PUBLIC_ORIGIN = origin;
      assert.throws(() => qrOrigin({}), /HTTPS/);
    }
    process.env.MERA_PUBLIC_ORIGIN = "https://menu.example.com/path";
    assert.equal(qrOrigin({}), "https://menu.example.com");
  } finally {
    for (const key of ["MERA_DEMO", "MERA_PUBLIC_ORIGIN"])
      old[key] === undefined
        ? delete process.env[key]
        : (process.env[key] = old[key]);
  }
});

test("public directory projects published branches; explicit consent is private and retry-safe", async () => {
  const app = express();
  app.use(express.json());
  const records = [];
  const scope = { organizationId: "org", branchId: "branch" };
  const router = express.Router();
  mountMeraQr(router, {
    db: {
      query: async (sql, args) => {
        if (sql.includes("mera_slug_claims"))
          return {
            rows:
              args[0] === "shop"
                ? [{ id: "org", onboarding: { status: "published" } }]
                : [],
          };
        assert.match(sql, /menu_version>0/);
        return {
          rows: [
            {
              id: "branch",
              name: "Branch",
              timezone: "Africa/Lagos",
              currency: "NGN",
              settings: { address: "Lagos", secret: "private" },
            },
          ],
        };
      },
    },
    guard: () => (_req, _res, next) => next(),
    scope: () => scope,
    locked: async (_s, fn) => fn({}),
    publicContext: async () => ({ organization: { id: "org" }, s: scope }),
    guest: async (req) => {
      if (!req.get("x-test-guest"))
        throw Object.assign(new Error("Guest required"), { status: 401 });
      return { id: req.get("x-test-guest") };
    },
    readRecords: async () => records,
    record: async (_c, _s, _kind, data) => {
      records.push({ data });
      return data;
    },
  });
  app.use(router);
  app.use((err, _req, res, _next) =>
    res
      .status(err.status || (err.name === "ZodError" ? 400 : 500))
      .json({ error: err.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const directory = await (
      await fetch(base + "/public/organizations/shop/branches")
    ).json();
    assert.deepEqual(directory, {
      branches: [
        {
          id: "branch",
          name: "Branch",
          timezone: "Africa/Lagos",
          currency: "NGN",
          address: "Lagos",
        },
      ],
    });
    assert.equal(
      (await fetch(base + "/public/organizations/missing/branches")).status,
      404,
    );
    const path = base + "/public/shop/branch/consent";
    assert.equal((await fetch(path)).status, 401);
    const headers = {
      "content-type": "application/json",
      "x-test-guest": "one",
    };
    assert.equal(
      (await (await fetch(path, { headers })).json()).marketing,
      false,
    );
    const body = {
      requestKey: "10000000-0000-4000-8000-000000000001",
      marketing: true,
    };
    for (let n = 0; n < 2; n++)
      assert.equal(
        (
          await fetch(path, {
            method: "PUT",
            headers,
            body: JSON.stringify(body),
          })
        ).status,
        200,
      );
    assert.equal(records.length, 1);
    assert.equal(
      (
        await fetch(path, {
          method: "PUT",
          headers,
          body: JSON.stringify({ ...body, marketing: false }),
        })
      ).status,
      409,
    );
    assert.equal(
      (await (await fetch(path, { headers: { "x-test-guest": "two" } })).json())
        .marketing,
      false,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("QR URLs use validated tenant subdomains and preserve legacy and demo URLs", async () => {
  const { qrUrl } = await import("../server/mera/qr.js");
  const old = { ...process.env };
  try {
    process.env.MERA_DEMO = "false";
    process.env.MERA_ROOT_DOMAIN = " Example.com ";
    process.env.MERA_PUBLIC_ORIGIN = "https://legacy.example.com";
    assert.equal(qrUrl({}, "juniper", "123"), "https://juniper.example.com/q/123");
    assert.equal(qrUrl({}, "app", "123"), "https://legacy.example.com/api/mera/v1/public/qr/123");
    delete process.env.MERA_ROOT_DOMAIN;
    assert.equal(qrUrl({}, "juniper", "123"), "https://legacy.example.com/api/mera/v1/public/qr/123");
    process.env.MERA_ROOT_DOMAIN = "example.com";
    process.env.MERA_DEMO = "true";
    process.env.NODE_ENV = "test";
    assert.equal(qrUrl({ protocol: "http", get: () => "localhost:3003" }, "juniper", "123"), "http://localhost:3003/api/mera/v1/public/qr/123");
  } finally {
    for (const key of ["MERA_ROOT_DOMAIN", "MERA_PUBLIC_ORIGIN", "MERA_DEMO", "NODE_ENV"]) old[key] === undefined ? delete process.env[key] : process.env[key] = old[key];
  }
});
test("shared QR handler keeps redirects relative and permits aliases but rejects foreign tenant hosts", async () => {
  const handlers = new Map();
  const old = process.env.MERA_ROOT_DOMAIN;
  process.env.MERA_ROOT_DOMAIN = "example.com";
  try {
    mountMeraQr({ get: (path, ...fns) => handlers.set(path, fns.at(-1)), post() {}, put() {} }, {
      guard: () => () => {},
      db: { query: async (sql, args) => ({ rows: sql.includes("mera_records") ? [{ organization_id: "org", branch_id: "branch", data: { kind: "branch" } }] : sql.includes("mera_branches") ? [{ id: "branch", settings: {} }] : sql.includes("mera_slug_claims") ? [{ id: args[0] === "foreign" ? "other" : "org" }] : [{ id: "org", slug: "juniper" }] }) },
    });
    for (const hostname of ["juniper.example.com", "old-name.example.com", "foreign.example.com", "example.com"]) {
      const response = { statusCode: 200, location: "", status(n) { this.statusCode = n; return this; }, json() { return this; }, set() { return this; }, redirect(n, location) { this.statusCode = n; this.location = location; } };
      await handlers.get("/public/qr/:id")({ hostname, params: { id: "10000000-0000-4000-8000-000000000001" } }, response);
      assert.equal(response.statusCode, hostname.startsWith("foreign") ? 404 : 302);
      if (response.statusCode === 302) assert.equal(response.location, "/mera/menu/juniper/branch");
    }
  } finally { old === undefined ? delete process.env.MERA_ROOT_DOMAIN : process.env.MERA_ROOT_DOMAIN = old; }
});

test("app short route dispatches GET and HEAD scans to the permanent public QR route", async () => {
  const { meraQrShortRoute } = await import("../server/mera/qr.js");
  const id = "10000000-0000-4000-8000-000000000001";
  for (const method of ["GET", "HEAD", "POST"]) {
    const req = { method, path: "/q/" + id, url: "/q/" + id };
    let called = false;
    meraQrShortRoute(req, {}, () => { called = true; });
    assert.ok(called);
    assert.equal(req.url, method === "POST" ? "/q/" + id : "/api/mera/v1/public/qr/" + id);
  }
  // Malformed codes are left alone (no decode errors) and fall through to the normal 404.
  for (const bad of ["/q/123", "/q/%E0%A4%A"]) {
    const req = { method: "GET", path: bad, url: bad };
    meraQrShortRoute(req, {}, () => {});
    assert.equal(req.url, bad);
  }
});
test("QR list, creation and SVG export all use the tenant URL", async () => {
  const handlers = new Map(), old = { ...process.env };
  try {
    process.env.MERA_DEMO = "false";
    process.env.MERA_ROOT_DOMAIN = "example.com";
    const code = { id: "10000000-0000-4000-8000-000000000001", kind: "branch", active: true };
    mountMeraQr({ get: (path, ...fns) => handlers.set("GET " + path, fns.at(-1)), post: (path, ...fns) => handlers.set("POST " + path, fns.at(-1)), put() {} }, {
      guard: () => () => {}, scope: () => ({ organizationId: "org", branchId: "branch" }),
      db: { query: async () => ({ rows: [{ slug: "juniper" }] }) },
      readRecords: async () => [{ id: code.id, data: code }],
      locked: async (_s, fn) => fn({}, {}), find: async () => code,
    });
    const req = { body: { kind: "branch" }, params: { id: code.id, format: "svg" } };
    const res = { body: null, status() { return this; }, json(value) { this.body = value; return this; }, attachment() { return this; }, type() { return this; }, send(value) { this.body = value; return this; } };
    const path = "/organizations/:organizationId/branches/:branchId/qr-codes";
    await handlers.get("GET " + path)(req, res);
    const url = `https://juniper.example.com/q/${code.id}`;
    assert.equal(res.body.codes[0].url, url);
    await handlers.get("POST " + path)(req, res);
    assert.equal(res.body.url, url);
    await handlers.get("GET " + path + "/:id/image.:format")(req, res);
    const { default: QRCode } = await import("qrcode");
    assert.equal(res.body, await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 1024 }));
  } finally {
    for (const key of ["MERA_DEMO", "MERA_ROOT_DOMAIN"]) old[key] === undefined ? delete process.env[key] : process.env[key] = old[key];
  }
});
