import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.env.MEMORY_DB = process.env.TEST_DATABASE_URL ? "false" : "true";
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { migrate, query, pool } = await import("../server/db.js");
const { seed, createAdmin } = await import("../server/seed.js");
const { createApp, errorHandler } = await import("../server/app.js");
await migrate();
await seed();
await createAdmin("Test Admin", "admin", "TestPassword1234");
const app = createApp();
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
let cookie = "";
async function call(
  path,
  method = "GET",
  body,
  session = cookie,
  headers = {},
) {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-pos-request": "1",
      cookie: session,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    data: await res.json(),
    cookie: res.headers.get("set-cookie")?.split(";")[0],
  };
}
test("authenticated order-to-payment flow preserves totals and is idempotent", async () => {
  assert.equal((await call("/products")).status, 401);
  const login = await call("/login", "POST", {
    username: "admin",
    password: "TestPassword1234",
  });
  assert.equal(login.status, 200);
  cookie = login.cookie;
  const products = (await call("/products")).data;
  const tea = products.find((p) => p.code === "C2"),
    boba = products.find((p) => p.code === "X1");
  const input = {
    requestKey: randomUUID(),
    items: [{ productId: tea.id, quantity: 2, toppings: [boba.id] }],
    note: "Test",
    discount: { type: "percent", value: 10, reason: "Test promotion" },
  };
  const create = await call("/orders", "POST", input);
  assert.equal(create.status, 201, JSON.stringify(create.data));
  assert.equal(create.data.total, 774000);
  const repeat = await call("/orders", "POST", input);
  assert.equal(repeat.data.id, create.data.id);
  const edited = await call("/orders/" + create.data.id, "PUT", {
    version: 1,
    items: input.items,
    note: "Updated held order",
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.version, 2);
  assert.equal(
    (
      await call("/orders/" + create.data.id, "PUT", {
        version: 1,
        items: input.items,
        note: "Stale edit",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/login",
        "POST",
        { username: "admin", password: "TestPassword1234" },
        "",
        { "x-forwarded-for": "192.168.1.80" },
      )
    ).status,
    403,
  );

  assert.equal(
    (
      await call("/orders/" + create.data.id + "/pay", "POST", {
        method: "cash",
        cashTendered: 100,
      })
    ).status,
    400,
  );
  const paid = await call("/orders/" + create.data.id + "/pay", "POST", {
    method: "cash",
    cashTendered: 800000,
  });
  assert.equal(paid.data.status, "paid");
  const second = await call("/orders/" + create.data.id + "/pay", "POST", {
    method: "cash",
    cashTendered: 800000,
  });
  assert.equal(second.data.id, paid.data.id);
  const jobs = (await call("/printing")).data.jobs;
  assert.equal(jobs.length, 3);
  assert.equal(jobs.filter((j) => j.kind === "label").length, 2);
  assert.equal(
    (
      await call("/orders/" + create.data.id + "/status", "POST", {
        status: "fulfilled",
      })
    ).status,
    409,
  );
  const user = await call("/users", "POST", {
    name: "Test Cashier",
    username: "cashier",
    password: "CashierPassword123",
    role: "cashier",
  });
  assert.equal(user.status, 200);
  const clerk = await call("/login", "POST", {
    username: "cashier",
    password: "CashierPassword123",
  });
  const clerkCookie = clerk.cookie;
  assert.equal(
    (await call("/users", "GET", undefined, clerkCookie)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/orders",
        "POST",
        { ...input, requestKey: randomUUID() },
        clerkCookie,
      )
    ).status,
    400,
  );
  const settings = (await call("/settings")).data;
  assert.equal(
    (
      await call("/settings/receipt", "PUT", {
        ...settings.receipt,
        footer: "A custom footer",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/settings")).data.receipt.footer,
    "A custom footer",
  );
  const audit = (await call("/audit")).data;
  assert(audit.some((a) => a.action === "payment_confirmed"));
  assert(audit.some((a) => a.action === "receipt_template_updated"));
});
test(
  "PostgreSQL worker submits receipt then individual labels and advances preparation",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const { processNext } = await import("../server/worker.js");
    await processNext();
    let jobs = (await call("/printing")).data.jobs;
    assert.equal(
      jobs.filter((j) => j.kind === "receipt" && j.status === "submitted")
        .length,
      1,
    );
    assert.equal(
      jobs.filter((j) => j.kind === "label" && j.status === "queued").length,
      2,
    );
    await processNext();
    let orders = (await call("/orders")).data;
    assert.equal(orders[0].status, "paid");
    await processNext();
    orders = (await call("/orders")).data;
    assert.equal(orders[0].status, "preparing");
    const o = orders[0];
    assert.equal(
      (await call("/orders/" + o.id + "/status", "POST", { status: "ready" }))
        .status,
      200,
    );
    assert.equal(
      (
        await call("/orders/" + o.id + "/status", "POST", {
          status: "fulfilled",
        })
      ).status,
      200,
    );
    const report = (await call("/report")).data;
    assert.equal(report.net, 774000);
    assert.equal(
      report.products.find((p) => p.name === "Brown Sugar Boba Milk Tea")
        .quantity,
      2,
    );
    const date = report.date;
    assert.equal(
      (await call("/closures", "POST", { date, countedCash: 774000 })).status,
      200,
    );
    const products = (await call("/products")).data;
    assert.equal(
      (
        await call("/orders", "POST", {
          requestKey: randomUUID(),
          items: [{ productId: products[0].id, quantity: 1 }],
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("/closures/" + date + "/reopen", "POST", {
          reason: "Integration test",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call("/orders/" + o.id + "/refund", "POST", {
          reason: "Full refund test",
          method: "cash",
        })
      ).status,
      200,
    );
    assert.equal((await call("/report")).data.net, 0);
  },
);

test.after(async () => {
  await new Promise((r) => server.close(r));
  await pool.end();
});
