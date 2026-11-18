import test from "node:test";
import assert from "node:assert/strict";
process.env.MEMORY_DB = "true";
process.env.MERA_ENABLED = "true";
process.env.MERA_DEMO = "false";
const { createApp, errorHandler } = await import("../server/app.js");
const { pool } = await import("../server/db.js");
test("hosted MERA never exposes unscoped legacy operational APIs", async () => {
  const app = createApp();
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    for (const route of [
      "/api/products",
      "/api/orders",
      "/api/printing",
      "/api/report",
      "/api/customer-menu",
    ]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 404, route);
    }
    assert.equal((await fetch(base + "/api/mera/v1/context")).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
    await pool.end();
  }
});
