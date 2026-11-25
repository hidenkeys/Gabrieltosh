import test from "node:test";
import assert from "node:assert/strict";
import { resolveMeraHost, meraHostRoutes } from "../server/mera/domains.js";
test("host routing distinguishes platform, app and exact organization subdomains", () => {
  assert.deepEqual(resolveMeraHost("MERA.EXAMPLE", "mera.example"), {
    surface: "marketing",
  });
  assert.deepEqual(resolveMeraHost("app.mera.example", "mera.example"), {
    surface: "workspace",
  });
  assert.deepEqual(resolveMeraHost("platform.mera.example", "mera.example"), {
    surface: "platform",
  });
  assert.deepEqual(resolveMeraHost("bing-chun.mera.example", "mera.example"), {
    surface: "organization",
    slug: "bing-chun",
  });
  for (const host of [
    "evilmera.example",
    "bing-chun.mera.example.evil",
    "extra.bing-chun.mera.example",
    "api.mera.example",
    "-bad.mera.example",
  ])
    assert.equal(resolveMeraHost(host, "mera.example"), null);
  assert.equal(
    resolveMeraHost("bing-chun.mera.example", "https://mera.example"),
    null,
  );
});
test("organization host resolves current published slug and branch without changing tenant authorization", async () => {
  const old = {
    MERA_ENABLED: process.env.MERA_ENABLED,
    MERA_DEMO: process.env.MERA_DEMO,
    MERA_ROOT_DOMAIN: process.env.MERA_ROOT_DOMAIN,
  };
  Object.assign(process.env, {
    MERA_ENABLED: "true",
    MERA_DEMO: "false",
    MERA_ROOT_DOMAIN: "mera.example",
  });
  let target = "",
    queries = 0;
  const middleware = meraHostRoutes(async (sql, args) => {
    queries++;
    assert.match(sql, /launchState/);
    assert.deepEqual(args, ["bing-chun"]);
    return { rows: [{ slug: "bing-chun", id: "branch-id" }] };
  });
  const res = {
    redirect(status, url) {
      assert.equal(status, 302);
      target = url;
      return this;
    },
    status() {
      return this;
    },
    send() {
      return this;
    },
  };
  try {
    await middleware(
      { method: "GET", path: "/", hostname: "bing-chun.mera.example" },
      res,
      () => assert.fail(),
    );
    assert.equal(target, "/mera/menu/bing-chun/branch-id?chooseBranch=1");
    let missing = 0;
    const statusRes = { ...res, status(code) { missing = code; return this; } };
    await middleware(
      { method: "GET", path: "/", hostname: "mera-web-staging.up.railway.app" },
      res,
      () => assert.fail(),
    );
    assert.equal(target, "/mera");
    await middleware(
      { method: "GET", path: "/", hostname: "api.mera.example" },
      statusRes,
      () => assert.fail(),
    );
    assert.equal(missing, 404);
    let next = 0;
    await middleware(
      { method: "GET", path: "/api/mera/v1/context" },
      res,
      () => next++,
    );
    assert.equal(next, 1);
    assert.equal(queries, 1);
  } finally {
    for (const k of Object.keys(old))
      old[k] === undefined ? delete process.env[k] : (process.env[k] = old[k]);
  }
});
