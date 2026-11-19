import test from "node:test";
import assert from "node:assert/strict";
import { mountMeraTickets } from "../server/mera/tickets.js";
import { rolePermissions } from "../shared/mera-contracts.js";
const B = "/organizations/:organizationId/branches/:branchId";
function fixture() {
  const routes = new Map(),
    writes = [],
    events = [];
  const tickets = [
    {
      id: "kitchen-ticket",
      orderId: "order",
      station: "kitchen",
      status: "queued",
      version: 1,
      items: [
        { orderLineId: "kitchen-line", quantity: 3, preparedQuantity: 0 },
      ],
    },
    {
      id: "bar-ticket",
      orderId: "order",
      station: "bar",
      status: "queued",
      version: 1,
      items: [{ orderLineId: "bar-line", quantity: 3, preparedQuantity: 0 }],
    },
  ];
  const order = {
    id: "order",
    status: "accepted",
    version: 1,
    total: 0,
    paid: 0,
    refunded: 0,
    items: [],
    history: [],
  };
  const connection = {
    query: async (sql, params) => {
      if (sql.startsWith("UPDATE")) {
        writes.push({ kind: params[4], data: JSON.parse(params[0]) });
        return { rows: [] };
      }
      if (sql.startsWith("SELECT data"))
        return { rows: tickets.map((data) => ({ data })) };
      throw Error("Unexpected query");
    },
  };
  mountMeraTickets(
    { post: (path, ...handlers) => routes.set(path, handlers) },
    {
      guard: (permission) => (req, _res, next) => {
        if (!rolePermissions[req.meraMembership.role]?.includes(permission))
          throw Object.assign(Error("Permission denied"), { status: 403 });
        next();
      },
      scope: (req) => ({
        organizationId: req.params.organizationId,
        branchId: req.params.branchId,
      }),
      locked: async (_scope, callback) =>
        callback(connection, { settings: { payLater: false } }),
      find: async (_c, _s, kind, id) =>
        kind === "ticket" ? tickets.find((ticket) => ticket.id === id) : order,
      readRecords: async () => [],
      event: async (_c, _s, action, actor, details) =>
        events.push({ action, actor, details }),
    },
  );
  async function call(role, id, body, line) {
    const handlers = routes.get(
      B + "/tickets/:id/" + (line ? "items/:orderLineId" : "status"),
    );
    const req = {
      params: {
        organizationId: "org",
        branchId: "branch",
        id,
        ...(line ? { orderLineId: line } : {}),
      },
      body,
      user: {
        id: role + "-actor",
        name: role === "kitchen" ? "Kitchen staff" : "Bar staff",
      },
      meraMembership: { role },
    };
    let result;
    const res = { json: (value) => (result = value) };
    for (const handler of handlers) await handler(req, res, () => {});
    return result;
  }
  return { tickets, order, writes, events, call };
}
for (const role of ["kitchen", "bar"])
  test(`${role} preparation lifecycle is versioned and cross-station requests cannot mutate tickets`, async () => {
    const f = fixture(),
      own = role + "-ticket",
      other = role === "kitchen" ? "bar-ticket" : "kitchen-ticket",
      line = role + "-line";
    await assert.rejects(
      f.call(role, other, { status: "preparing", version: 1 }),
      (error) => error.status === 403,
    );
    assert.equal(f.writes.length, 0);
    assert.equal(f.events.length, 0);
    let result = await f.call(role, own, { status: "preparing", version: 1 });
    assert.equal(result.ticket.status, "preparing");
    assert.equal(result.ticket.version, 2);
    await assert.rejects(
      f.call(role, own, { preparedQuantity: 1, version: 1 }, line),
      (error) => error.status === 409 && error.code === "STALE_VERSION",
    );
    assert.equal(
      f.tickets.find((ticket) => ticket.id === own).items[0].preparedQuantity,
      0,
    );
    result = await f.call(role, own, { preparedQuantity: 1, version: 2 }, line);
    assert.equal(result.ticket.items[0].preparedQuantity, 1);
    assert.equal(result.ticket.version, 3);
    await assert.rejects(
      f.call(role, own, { preparedQuantity: 4, version: 3 }, line),
      (error) => error.status === 409,
    );
    assert.equal(
      f.tickets.find((ticket) => ticket.id === own).items[0].preparedQuantity,
      1,
    );
    result = await f.call(role, own, { status: "ready", version: 3 });
    assert.equal(result.ticket.status, "ready");
    assert.equal(result.ticket.items[0].preparedQuantity, 3);
    assert.equal(
      result.order.status,
      "preparing",
      "other station is not ready",
    );
    assert.equal(
      result.order.history.at(-1).actorName,
      role === "kitchen" ? "Kitchen staff" : "Bar staff",
    );
    assert.equal(f.events.length, 3);
    assert.equal(
      f.writes.every((write) => ["ticket", "order"].includes(write.kind)),
      true,
      "no stock, payment, ledger or print writes",
    );
  });
test("preparation guard rejects non-preparation role, unpaid order and expired stock hold before ticket mutation", async () => {
  for (const mode of ["waiter", "unpaid", "expired"]) {
    const f = fixture();
    if (mode === "unpaid") {
      f.order.total = 1000;
      f.order.paid = 0;
    }
    if (mode === "expired") f.order.holdExpired = true;
    await assert.rejects(
      f.call(mode === "waiter" ? "waiter" : "kitchen", "kitchen-ticket", {
        status: "preparing",
        version: 1,
      }),
      (error) => error.status === (mode === "waiter" ? 403 : 409),
    );
    assert.equal(f.writes.length, 0);
    assert.equal(f.events.length, 0);
    assert.equal(f.tickets[0].version, 1);
  }
});
