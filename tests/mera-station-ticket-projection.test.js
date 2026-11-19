import test from "node:test";
import assert from "node:assert/strict";
import { projectStationTickets } from "../server/mera/index.js";
import { rolePermissions } from "../shared/mera-contracts.js";
const kitchen = {
    id: "kitchen-ticket",
    station: "kitchen",
    items: [{ name: "Kitchen item", note: "Kitchen-private preparation note" }],
  },
  bar = {
    id: "bar-ticket",
    station: "bar",
    items: [{ name: "Bar item", note: "Bar-private preparation note" }],
  },
  legacy = {
    id: "unknown-station",
    items: [{ name: "Unknown station-private note" }],
  };
const tickets = [kitchen, bar, legacy];
for (const role of ["kitchen", "bar"])
  test(`${role} workspace ticket projection excludes every other station and unknown station data`, () => {
    const projected = projectStationTickets(
      tickets,
      role,
      rolePermissions[role],
    );
    assert.deepEqual(projected, [role === "kitchen" ? kitchen : bar]);
    assert.equal(
      projected[0],
      role === "kitchen" ? kitchen : bar,
      "original authorized ticket is preserved",
    );
    assert.ok(
      !JSON.stringify(projected).includes(
        role === "kitchen" ? "Bar-private" : "Kitchen-private",
      ),
    );
    assert.ok(!JSON.stringify(projected).includes("Unknown station-private"));
    assert.equal(tickets.length, 3, "source records remain intact");
  });
test("owner manager and explicitly authorized custom roles retain branch preparation visibility", () => {
  for (const role of [
    "owner",
    "organization_admin",
    "branch_manager",
    "custom-preparer",
  ])
    assert.deepEqual(
      projectStationTickets(tickets, role, ["orders.prepare"]),
      tickets,
    );
});
test("orders view and fulfillment alone never disclose station tickets, including revoked preparation roles", () => {
  for (const role of ["waiter", "cashier", "reports_only", "kitchen", "bar"])
    assert.deepEqual(
      projectStationTickets(tickets, role, ["orders.view", "orders.fulfill"]),
      [],
    );
});
