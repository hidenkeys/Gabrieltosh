import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mountMeraStockTransfers } from "../server/mera/stock-transfers.js";
const O = "/organizations/:organizationId/stock-transfers";
function fixture() {
  const org = randomUUID(),
    otherOrg = randomUUID(),
    from = randomUUID(),
    to = randomUUID(),
    foreign = randomUUID(),
    handlers = new Map();
  let rows = [];
  const branches = [
    { id: from, org },
    { id: to, org },
    { id: foreign, org: otherOrg },
  ];
  const user = { id: "owner", name: "Owner" },
    grants = new Map([
      [from, ["stock.transfer"]],
      [to, ["stock.receive"]],
    ]);
  for (const branch of [from, to])
    rows.push({
      org,
      branch,
      kind: "product",
      data: {
        id: randomUUID(),
        code: "TEA",
        name: "Tea",
        unitCost: 0,
        kind: "single",
        stockMode: "counted",
        stock: branch === from ? 10 : 1,
        variants: [
          { id: "large", name: "Large", stockMode: "counted", stock: 10 },
        ],
      },
    });
  const db = {
    async query(sql, p = []) {
      if (sql.includes("FROM mera_organizations"))
        return { rows: p[0] === org ? [{ id: org }] : [] };
      if (sql.includes("FROM mera_branches"))
        return {
          rows: branches.filter((b) =>
            sql.includes("WHERE id=$1")
              ? b.id === p[0] && b.org === p[1]
              : b.org === p[0],
          ),
        };
      let found = rows;
      if (sql.includes("WHERE id=$1"))
        found = found.filter((r) => r.data.id === p[0] && r.org === p[1]);
      else {
        found = found.filter((r) => r.org === p[0]);
        if (sql.includes("branch_id=$2"))
          found = found.filter((r) => r.branch === p[1]);
      }
      if (sql.includes("kind='product'"))
        found = found.filter((r) => r.kind === "product");
      if (sql.includes("kind='stock_transfer'"))
        found = found.filter((r) => r.kind === "stock_transfer");
      if (sql.includes("data->>'requestKey'=$2"))
        found = found.filter((r) => r.data.requestKey === p[1]);
      return { rows: structuredClone(found) };
    },
    async transaction(fn) {
      const before = structuredClone(rows);
      try {
        return await fn(db);
      } catch (e) {
        rows = before;
        throw e;
      }
    },
  };
  const router = {
    get: (p, h) => handlers.set("get" + p, h),
    post: (p, h) => handlers.set("post" + p, h),
  };
  mountMeraStockTransfers(router, {
    db,
    membership: async (req, o, b, permission) => {
      const wanted = Array.isArray(permission) ? permission : [permission];
      if (o !== org || !wanted.some((p) => grants.get(b)?.includes(p)))
        throw Object.assign(Error("Forbidden"), { status: 403 });
    },
    record: async (c, s, kind, data) => {
      const value = { ...structuredClone(data), id: randomUUID() };
      rows.push({
        org: s.organizationId,
        branch: s.branchId,
        kind,
        data: value,
      });
      return structuredClone(value);
    },
    update: async (c, s, kind, id, data) => {
      const row = rows.find(
        (r) =>
          r.org === s.organizationId &&
          r.branch === s.branchId &&
          r.kind === kind &&
          r.data.id === id,
      );
      assert.ok(row);
      row.data = structuredClone(data);
    },
    event: async () => {},
  });
  return {
    org,
    otherOrg,
    from,
    to,
    foreign,
    grants,
    get rows() {
      return rows;
    },
    stock: (branch, variant = false) => {
      const p = rows.find(
        (r) => r.branch === branch && r.kind === "product",
      ).data;
      return variant ? p.variants[0].stock : p.stock;
    },
    send: (quantity = 4) => ({
      requestKey: randomUUID(),
      fromBranchId: from,
      toBranchId: to,
      lines: [{ code: "TEA", quantity }],
    }),
    async call(action, body = {}, id, organizationId = org) {
      let data;
      const res = {
        status() {
          return this;
        },
        set() {
          return this;
        },
        json(v) {
          data = v;
          return this;
        },
      };
      await handlers.get(
        (action === "list" ? "get" : "post") + O + (id ? "/:id/" + action : ""),
      )(
        {
          params: { organizationId, id },
          body,
          query: action === "list" ? body : {},
          user,
        },
        res,
      );
      return data;
    },
  };
}
test("transfer send, receive and replay move counted stock once and preserve null versus zero cost", async () => {
  const f = fixture(),
    input = f.send(),
    sent = await f.call("send", input);
  assert.equal(f.stock(f.from), 6);
  assert.equal(sent.transfer.lines[0].unitCost, 0);
  assert.equal((await f.call("send", input)).replayed, true);
  assert.equal(f.stock(f.from), 6);
  const receive = { requestKey: randomUUID(), version: 1 };
  const result = await f.call("receive", receive, sent.transfer.id);
  assert.equal(result.transfer.status, "received");
  assert.equal(result.transfer.version, 2);
  assert.equal(f.stock(f.to), 5);
  assert.equal(
    (await f.call("receive", receive, sent.transfer.id)).replayed,
    true,
  );
  assert.equal(f.stock(f.to), 5);
  assert.deepEqual(
    f.rows.filter((r) => r.kind === "stock_movement").map((r) => r.data.reason),
    ["transfer_out", "transfer_in"],
  );
  await assert.rejects(
    f.call("send", { ...input, lines: [{ code: "TEA", quantity: 3 }] }),
    (e) => e.code === "REQUEST_KEY_CONFLICT",
  );
});
test("partial receive records loss without deducting the source twice", async () => {
  const f = fixture(),
    sent = await f.call("send", f.send(5));
  await f.call(
    "receive",
    {
      requestKey: randomUUID(),
      version: 1,
      lines: [{ code: "TEA", receivedQuantity: 3 }],
    },
    sent.transfer.id,
  );
  assert.equal(f.stock(f.from), 5);
  assert.equal(f.stock(f.to), 4);
  const loss = f.rows.find((r) => r.data.reason === "transfer_loss").data;
  assert.equal(loss.quantity, -2);
  assert.equal(loss.delta, 0);
  assert.equal(loss.before, 5);
  assert.equal(loss.after, 5);
});
test("cancel restores source, supports replay and rejects stale or terminal transitions", async () => {
  const f = fixture(),
    sent = await f.call("send", f.send());
  await assert.rejects(
    f.call(
      "cancel",
      { requestKey: randomUUID(), version: 2 },
      sent.transfer.id,
    ),
    (e) => e.code === "STALE_VERSION",
  );
  assert.equal(f.stock(f.from), 6);
  const input = { requestKey: randomUUID(), version: 1 };
  assert.equal(
    (await f.call("cancel", input, sent.transfer.id)).transfer.status,
    "cancelled",
  );
  assert.equal(f.stock(f.from), 10);
  assert.equal(
    (await f.call("cancel", input, sent.transfer.id)).replayed,
    true,
  );
  assert.equal(f.stock(f.from), 10);
  await assert.rejects(
    f.call(
      "receive",
      { requestKey: randomUUID(), version: 2 },
      sent.transfer.id,
    ),
    /Only a sent/,
  );
});
test("transfer tenant and branch permissions protect send receive cancel and listing", async () => {
  const f = fixture();
  await assert.rejects(
    f.call("send", { ...f.send(), toBranchId: f.foreign }),
    (e) => e.status === 404,
  );
  assert.equal(f.stock(f.from), 10);
  await assert.rejects(
    f.call("send", { ...f.send(), fromBranchId: f.to, toBranchId: f.from }),
    (e) => e.status === 403,
  );
  const sent = await f.call("send", f.send());
  await assert.rejects(
    f.call(
      "receive",
      { requestKey: randomUUID(), version: 1 },
      sent.transfer.id,
      f.otherOrg,
    ),
    (e) => e.status === 404,
  );
  assert.equal((await f.call("list")).transfers.length, 1);
  f.grants.delete(f.to);
  await assert.rejects(
    f.call(
      "receive",
      { requestKey: randomUUID(), version: 1 },
      sent.transfer.id,
    ),
    (e) => e.status === 403,
  );
  f.grants.delete(f.from);
  await assert.rejects(
    f.call(
      "cancel",
      { requestKey: randomUUID(), version: 1 },
      sent.transfer.id,
    ),
    (e) => e.status === 403,
  );
  await assert.rejects(f.call("list"), (e) => e.status === 403);
});
test("transfer variants match by name; invalid quantities and missing destination stock roll back", async () => {
  const f = fixture(),
    input = {
      ...f.send(),
      lines: [{ code: "TEA", variantName: "Large", quantity: 3 }],
    },
    sent = await f.call("send", input);
  assert.equal(f.stock(f.from, true), 7);
  await f.call(
    "receive",
    { requestKey: randomUUID(), version: 1 },
    sent.transfer.id,
  );
  assert.equal(f.stock(f.to, true), 13);
  const another = await f.call("send", f.send());
  await assert.rejects(
    f.call(
      "receive",
      {
        requestKey: randomUUID(),
        version: 1,
        lines: [{ code: "TEA", receivedQuantity: 5 }],
      },
      another.transfer.id,
    ),
    (e) => e.status === 400,
  );
  assert.equal(f.stock(f.to), 1);
  await assert.rejects(
    f.call("send", f.send(999)),
    (e) => e.code === "OUT_OF_STOCK",
  );
  assert.equal(f.stock(f.from), 6);
});

test("list includes either visible end and receive validates exact lines and counted matches", async () => {
  const f = fixture(),
    sent = await f.call("send", f.send());
  f.grants.delete(f.from);
  f.grants.set(f.to, ["orders.view"]);
  assert.equal((await f.call("list", { status: "sent" })).transfers.length, 1);
  assert.equal(
    (await f.call("list", { status: "received" })).transfers.length,
    0,
  );
  f.grants.set(f.to, ["stock.receive"]);
  await assert.rejects(
    f.call(
      "receive",
      {
        requestKey: randomUUID(),
        version: 1,
        lines: [{ code: "OTHER", receivedQuantity: 1 }],
      },
      sent.transfer.id,
    ),
    (e) => e.status === 400,
  );
  assert.equal(f.stock(f.to), 1);
  f.rows.find((r) => r.kind === "product" && r.branch === f.to).data.stockMode =
    "unlimited";
  await assert.rejects(
    f.call(
      "receive",
      { requestKey: randomUUID(), version: 1 },
      sent.transfer.id,
    ),
    (e) => e.code === "TRANSFER_PRODUCT_REQUIRED",
  );
  assert.equal(
    f.rows.find((r) => r.kind === "stock_transfer").data.status,
    "sent",
  );
  assert.equal(f.stock(f.from), 6);
});

test("request keys cannot be reused between transfers or actions", async () => {
  const f = fixture(),
    first = await f.call("send", f.send()),
    second = await f.call("send", f.send(1));
  await assert.rejects(
    f.call(
      "receive",
      { requestKey: first.transfer.requestKey, version: 1 },
      second.transfer.id,
    ),
    (e) => e.code === "REQUEST_KEY_CONFLICT",
  );
  await assert.rejects(
    f.call(
      "cancel",
      { requestKey: second.transfer.requestKey, version: 1 },
      second.transfer.id,
    ),
    (e) => e.code === "REQUEST_KEY_CONFLICT",
  );
  assert.equal(f.stock(f.from), 5);
  assert.equal(f.stock(f.to), 1);
});
