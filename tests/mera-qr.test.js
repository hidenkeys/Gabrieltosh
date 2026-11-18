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
