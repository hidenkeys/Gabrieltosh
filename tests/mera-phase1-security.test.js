import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMeraRouter } from "../server/mera/index.js";

function fixture() {
  const org = {
    id: randomUUID(),
    slug: "venue",
    onboarding: { status: "published" },
    subscription: { status: "active" },
    policy: { includedBranches: 1 },
  };
  const branch = {
    id: randomUUID(),
    organization_id: org.id,
    timezone: "Africa/Lagos",
    currency: "NGN",
    menu_version: 1,
    settings: {
      launchState: "published",
      capabilities: ["qr_ordering", "table_service"],
    },
  };
  const guest = {
    id: randomUUID(),
    organization_id: org.id,
    display_name: "Ada",
  };
  const product = {
    id: randomUUID(),
    name: "Tea",
    code: "T",
    category: "Tea",
    price: 10000,
    station: "bar",
    available: true,
    stockMode: "unlimited",
    variants: [],
    modifierGroups: [],
  };
  branch.published_menu = [product];
  const records = [
    {
      id: product.id,
      organization_id: org.id,
      branch_id: branch.id,
      kind: "product",
      data: product,
    },
  ];
  const queries = [];
  const db = {
    async query(sql, p = []) {
      queries.push(sql);
      if (sql.includes("mera_organization_aliases")) return { rows: [] };
      if (sql.includes("mera_organizations")) return { rows: [org] };
      if (sql.includes("COUNT(*)") && sql.includes("mera_branches"))
        return { rows: [{ count: 1 }] };
      if (sql.includes("mera_branches")) return { rows: [branch] };
      if (sql.includes("mera_guests")) return { rows: [guest] };
      if (sql.includes("COUNT(*)") && sql.includes("kind='order'")) {
        assert.deepEqual(p, [org.id, branch.id, guest.id]);
        return {
          rows: [
            {
              count: records.filter(
                (r) =>
                  r.kind === "order" &&
                  r.organization_id === p[0] &&
                  r.branch_id === p[1] &&
                  r.data.guestId === p[2] &&
                  r.data.source === "customer_qr" &&
                  ["submitted", "accepted", "preparing", "ready"].includes(
                    r.data.status,
                  ) &&
                  r.data.paymentStatus !== "paid" &&
                  (r.data.outstandingBalance ?? r.data.total) > 0,
              ).length,
            },
          ],
        };
      }
      if (sql.startsWith("INSERT INTO mera_records")) {
        records.push({
          id: p[0],
          organization_id: p[1],
          branch_id: p[2],
          kind: p[3],
          data: JSON.parse(p[4]),
        });
        return { rows: [] };
      }
      if (sql.startsWith("UPDATE mera_records SET data=")) {
        const row = records.find((r) => r.id === p[1] && r.kind === p[4]);
        row.data = JSON.parse(p[0]);
        return { rows: [{ id: row.id }] };
      }
      if (sql.includes("mera_records")) {
        if (
          sql.includes("order_request_resolution") ||
          sql.includes("stockHeld'='true'")
        )
          return { rows: [] };
        let result = records;
        if (sql.includes("WHERE id=$1"))
          result = result.filter(
            (r) =>
              r.id === p[0] &&
              r.organization_id === p[1] &&
              r.branch_id === p[2] &&
              r.kind ===
                (p[3] || (sql.includes("kind='order'") ? "order" : "")),
          );
        else {
          result = result.filter(
            (r) => r.organization_id === p[0] && r.branch_id === p[1],
          );
          if (sql.includes("kind=$3"))
            result = result.filter((r) => r.kind === p[2]);
          if (sql.includes("kind='bill'"))
            result = result.filter((r) => r.kind === "bill");
          if (sql.includes("data->>'requestKey'=$4"))
            result = result.filter((r) => r.data.requestKey === p[3]);
          if (sql.includes("data->'charges'"))
            result = result.filter((r) =>
              r.data.charges.some(
                (c) => c.orderId === JSON.parse(p[2])[0].orderId,
              ),
            );
          if (sql.includes("data->>'visitId'=$3"))
            result = result.filter(
              (r) => r.data.visitId === p[2] && r.data.status === "open",
            );
        }
        return { rows: structuredClone(result) };
      }
      throw Error(sql);
    },
    async transaction(fn) {
      const before = structuredClone(records);
      try {
        return await fn(db);
      } catch (e) {
        records.splice(0, records.length, ...before);
        throw e;
      }
    },
  };
  const router = createMeraRouter(db);
  const handler = router.stack
    .find(
      (l) =>
        l.route?.path === "/public/:slug/:branchId/orders" &&
        l.route.methods.post,
    )
    .route.stack.at(-1).handle;
  const input = {
    requestKey: randomUUID(),
    menuVersion: 1,
    displayName: "Ada",
    fulfillment: "counter_pickup",
    items: [{ productId: product.id, quantity: 1 }],
    note: "",
  };
  const add = (kind, data, scope = {}) => {
    const row = {
      id: data.id || randomUUID(),
      organization_id: org.id,
      branch_id: branch.id,
      kind,
      ...scope,
    };
    row.data = { ...data, id: row.id };
    records.push(row);
    return row.data;
  };
  return {
    org,
    branch,
    guest,
    records,
    queries,
    add,
    router,
    async order(values = {}) {
      let result;
      await handler(
        {
          params: { slug: "venue", branchId: branch.id },
          query: {},
          cookies: { mera_guest: "server-issued-cookie" },
          get() {},
          body: { ...input, requestKey: randomUUID(), ...values },
        },
        {
          status() {
            return this;
          },
          json(v) {
            result = v;
          },
        },
      );
      return result;
    },
  };
}
for (const fulfillment of ["counter_pickup", "takeaway", "table_service"])
  test(`${fulfillment} cannot attach to another party's bill`, async () => {
    const f = fixture();
    const visit = f.add("visit", {
      status: "open",
      guestIds: ["another-guest"],
    });
    f.add("bill", {
      visitId: visit.id,
      status: "open",
      charges: [],
      allocations: [],
    });
    const before = structuredClone(f.records);
    await assert.rejects(f.order({ fulfillment, visitId: visit.id }), {
      status: 403,
    });
    assert.deepEqual(f.records, before);
  });
for (const variant of ["closed", "other-branch", "missing"])
  test(`visit authorization rejects ${variant} visits for takeaway`, async () => {
    const f = fixture(),
      id = randomUUID();
    if (variant !== "missing")
      f.add(
        "visit",
        {
          id,
          status: variant === "closed" ? "closed" : "open",
          guestIds: [f.guest.id],
        },
        variant === "other-branch" ? { branch_id: randomUUID() } : {},
      );
    await assert.rejects(f.order({ visitId: id, fulfillment: "takeaway" }), {
      status: 403,
    });
    assert.equal(
      f.records.some((r) => r.kind === "bill"),
      false,
    );
  });
for (const variant of [
  "missing-qr",
  "wrong-table",
  "inactive-qr",
  "other-branch-qr",
  "unavailable",
  "inactive-table",
  "valid",
])
  test(`table QR order: ${variant}`, async () => {
    const f = fixture();
    const table = f.add("table", {
      name: "Window",
      active: variant !== "inactive-table",
      status: variant === "unavailable" ? "unavailable" : "available",
    });
    const qr = f.add(
      "qr_code",
      {
        kind: "table",
        active: variant !== "inactive-qr",
        tableId: variant === "wrong-table" ? randomUUID() : table.id,
      },
      variant === "other-branch-qr" ? { branch_id: randomUUID() } : {},
    );
    const body = {
      fulfillment: "table_service",
      tableId: table.id,
      ...(variant !== "missing-qr" ? { qrId: qr.id } : {}),
    };
    if (variant === "valid") {
      await f.order(body);
      assert.equal(
        f.records.find((r) => r.kind === "order").data.tableId,
        table.id,
      );
    } else {
      await assert.rejects(f.order(body), (e) => [403, 409].includes(e.status));
      assert.equal(
        f.records.some((r) => r.kind === "bill"),
        false,
      );
    }
  });
test("three open guest orders are allowed, fourth rejected; replay and another guest remain usable", async () => {
  const f = fixture(),
    key = randomUUID();
  await f.order({ requestKey: key });
  await f.order();
  await f.order();
  const before = structuredClone(f.records);
  await assert.rejects(f.order(), {
    status: 429,
    code: "TOO_MANY_OPEN_ORDERS",
    message:
      "You have 3 orders waiting. Ask staff or wait for them to be prepared.",
  });
  assert.deepEqual(f.records, before);
  await f.order({ requestKey: key });
  assert.equal(f.records.filter((r) => r.kind === "order").length, 3);
  f.guest.id = randomUUID();
  await f.order();
  assert.equal(f.records.filter((r) => r.kind === "order").length, 4);
  assert.ok(f.queries.some((q) => q.includes("FOR UPDATE")));
});
test("paid, settled, terminal, and other-branch orders do not consume the cap", async () => {
  const f = fixture();
  for (const patch of [
    { status: "completed" },
    { status: "cancelled" },
    { paymentStatus: "paid" },
    { outstandingBalance: 0 },
  ])
    f.add("order", {
      guestId: f.guest.id,
      source: "customer_qr",
      status: "submitted",
      paymentStatus: "unpaid",
      total: 100,
      ...patch,
    });
  f.add(
    "order",
    {
      guestId: f.guest.id,
      source: "customer_qr",
      status: "submitted",
      paymentStatus: "unpaid",
      total: 100,
    },
    { branch_id: randomUUID() },
  );
  await f.order();
});
test("public order-create IP bucket permits ten requests independently of other mutations", () => {
  const f = fixture();
  const guard = f.router.stack.find((l) =>
    l.handle?.toString().includes("rateBuckets.get"),
  ).handle;
  let next = 0,
    status;
  const res = {
    status(n) {
      status = n;
      return this;
    },
    json() {
      return this;
    },
  };
  for (let i = 0; i < 10; i++)
    guard(
      { ip: "same", method: "POST", path: "/venue/branch/orders" },
      res,
      () => next++,
    );
  assert.equal(next, 10);
  guard(
    { ip: "same", method: "POST", path: "/venue/branch/orders" },
    res,
    () => next++,
  );
  assert.equal(status, 429);
  assert.equal(next, 10);
  guard(
    { ip: "same", method: "POST", path: "/venue/branch/guests" },
    res,
    () => next++,
  );
  assert.equal(next, 11);
});

test("a joined guest can attach a takeaway order to their own open visit bill", async () => {
  const f = fixture();
  const visit = f.add("visit", { status: "open", guestIds: [f.guest.id] });
  const bill = f.add("bill", {
    visitId: visit.id,
    status: "open",
    charges: [],
    allocations: [],
  });
  await f.order({ fulfillment: "takeaway", visitId: visit.id });
  assert.equal(f.records.find((r) => r.id === bill.id).data.charges.length, 1);
  assert.equal(f.records.filter((r) => r.kind === "bill").length, 1);
});
