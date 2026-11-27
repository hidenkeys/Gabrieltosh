import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { VENUE_PORTFOLIO } from "../server/mera/venue-portfolio.js";
import { venueMemoryFixture } from "./mera-venue-memory-fixture.js";

for (const [slug, , type] of VENUE_PORTFOLIO)
  test(`${slug}: owner readiness to guest order and staff handoff (memory)`, async (t) => {
    const origin = process.env.MERA_PUBLIC_ORIGIN;
    process.env.MERA_PUBLIC_ORIGIN = "https://venue.example.test";
    t.after(() => {
      if (origin === undefined) delete process.env.MERA_PUBLIC_ORIGIN;
      else process.env.MERA_PUBLIC_ORIGIN = origin;
    });
    const f = venueMemoryFixture(slug),
      { b, invoke } = f;
    const table = f.records("table")[0];
    if (table) await invoke("/qr-codes", { kind: "table", tableId: table.id });
    else await invoke("/qr-codes", { kind: "branch" });
    if (b.settings.capabilities.includes("guest_list")) {
      const entry = await invoke("/guest-list", {
        requestKey: randomUUID(),
        name: "Fictional VIP guest",
        partySize: 2,
        tradingDate: new Date().toISOString().slice(0, 10),
      });
      const arrived = await invoke(
        "/guest-list/:id/check-in",
        { requestKey: randomUUID(), version: 1, count: 2 },
        { params: { id: entry.id } },
      );
      assert.equal(arrived.arrivedCount, 2);
    }
    const ready = await invoke("/readiness", undefined, { method: "get" });
    assert.equal(ready.canPublish, true, JSON.stringify(ready.checks));
    for (const c of ready.checks) {
      assert.ok(c.label);
      assert.ok(c.detail);
      assert.ok(c.fixTarget);
    }
    const disabled = [
      "table_service",
      "reservations",
      "deposits",
      "minimum_spend",
      "guest_list",
      "room_charge",
    ].filter((c) => !b.settings.capabilities.includes(c));
    for (const cap of disabled)
      assert.equal(
        ready.checks.some((c) => c.id === cap),
        false,
      );
    await invoke(
      "/guests",
      { displayName: "Fictional guest" },
      { guest: true },
    );
    const code = f.records("qr_code")[0];
    const redirect = await invoke("/public/qr/:id", undefined, {
      guest: true,
      method: "get",
      params: { id: code.id },
    });
    assert.equal(redirect.code, 302);
    if (table) assert.ok(redirect.url.includes(`tableId=${table.id}`));
    const product = b.products.find((p) => p.code === "DRINK");
    const input = {
      requestKey: randomUUID(),
      menuVersion: 1,
      displayName: "Fictional guest",
      items: [{ productId: product.id, quantity: 1 }],
      fulfillment: table ? "table_service" : "counter_pickup",
    };
    const minimum = {
      minimumSpendAcknowledged: true,
      minimumSpendPolicyVersion: b.settings.minimumSpendPolicy?.version,
    };
    if (type === "reservation_restaurant") {
      const startsAt = new Date(Date.now() + 86400000).toISOString(),
        endsAt = new Date(Date.now() + 90000000).toISOString();
      const reservation = await invoke(
        "/reservations",
        {
          requestKey: randomUUID(),
          displayName: "Guest",
          partySize: 2,
          contact: "guest@example.test",
          startsAt,
          endsAt,
          tableId: table.id,
        },
        { guest: true },
      );
      await invoke(
        "/reservations/:id/deposits",
        {
          requestKey: randomUUID(),
          amount: b.settings.depositPolicy.amount,
          method: "cash",
          reference: "Fictional deposit",
        },
        { params: { id: reservation.id } },
      );
      await invoke(
        "/reservations/:id/status",
        { status: "confirmed" },
        { params: { id: reservation.id } },
      );
      const seated = await invoke(
        "/reservations/:id/seat",
        { tableId: table.id, displayName: "Fictional guest" },
        { params: { id: reservation.id } },
      );
      input.visitId = seated.visit?.id || seated.id;
      input.reservationId = reservation.id;
    } else if (["lounge", "club"].includes(type)) {
      const visit = await invoke("/visits", {
        tableId: table.id,
        displayName: "Fictional VIP guest",
        ...minimum,
      });
      await invoke(
        "/visits/join",
        { visitId: visit.id, code: visit.joiningCode, ...minimum },
        { guest: true },
      );
      input.visitId = visit.id;
      assert.equal(f.records("bill")[0].status, "open");
    } else if (table) {
      input.tableId = table.id;
      input.qrId = code.id;
    }
    const guestOrdering = b.settings.capabilities.includes("qr_ordering");
    if (input.tableId)
      await assert.rejects(
        () =>
          invoke("/orders", { ...input, qrId: randomUUID() }, { guest: true }),
        (e) => e.code === "TABLE_QR_REQUIRED",
      );
    const order = await invoke("/orders", input, { guest: guestOrdering });
    assert.ok(order.id, "Real persisted order");
    assert.equal(f.records("order")[0].id, order.id);
    if (type === "hotel_fb") {
    const menu = await invoke("/menu", undefined, {guest:true,method:"get"});
    assert.equal(menu.tables.find(t=>t.id===table.id).zone,"Rooms");
      assert.equal(order.tableName, "Room 204");
      assert.equal(table.zone, "Rooms");
    }
    // Counter venues require payment before preparation; room charge stays staff-authorized.
    if (!b.settings.payLater)
      await invoke(
        "/orders/:id/payments",
        {
          requestKey: randomUUID(),
          amount: order.total,
          method: "cash",
          reference: "Fictional payment",
        },
        { params: { id: order.id } },
      );
    let current = f.records("order")[0];
    await invoke(
      "/orders/:id/status",
      { status: "accepted", version: current.version },
      { params: { id: order.id } },
    );
    for (const ticket of f.records("ticket"))
      await invoke(
        "/tickets/:id/status",
        { status: "ready", version: ticket.version },
        { params: { id: ticket.id } },
      );
    current = f.records("order")[0];
    const collected = await invoke(
      "/orders/:id/status",
      { status: "collected", version: current.version },
      { params: { id: order.id } },
    );
    assert.equal(collected.status, "collected");
    if (input.visitId)
      assert.equal(f.records("bill")[0].charges[0].orderId, order.id);
  });

for (const [slug] of VENUE_PORTFOLIO)
  test(`${slug}: missing setup blocks only enabled capabilities`, async () => {
    const f = venueMemoryFixture(slug),
      { b, invoke } = f;
    b.settings.serviceHours = [];
    b.settings.reservationsEnabled = false;
    delete b.settings.depositPolicy;
    delete b.settings.minimumSpendPolicy;
    const result = await invoke("/readiness", undefined, { method: "get" });
    assert.equal(result.canPublish, false);
    assert.equal(
      result.checks.find((c) => c.id === "service_hours").status,
      "blocked",
    );
    for (const cap of [
      "table_service",
      "reservations",
      "deposits",
      "minimum_spend",
      "guest_list",
    ]) {
      const check = result.checks.find((c) => c.id === cap);
      if (b.settings.capabilities.includes(cap))
        assert.equal(check?.status, "blocked", cap);
      else assert.equal(check, undefined, cap);
    }
    await assert.rejects(
      () => invoke("/launch", { confirm: true }),
      (e) => e.status === 409,
    );
    b.settings.capabilities = [];
    const off = await invoke("/readiness", undefined, { method: "get" });
    for (const cap of [
      "table_service",
      "reservations",
      "deposits",
      "minimum_spend",
      "guest_list",
      "room_charge",
    ])
      assert.equal(
        off.checks.some((c) => c.id === cap),
        false,
      );
  });

test("hotel readiness requires an active room and club supports an explicit walk-ins-only decision", async () => {
  const hotel = venueMemoryFixture("harbour-hotel"),
    table = hotel.records("table")[0];
  await hotel.invoke(
    "/tables/:id",
    { zone: "Restaurant" },
    { method: "patch", params: { id: table.id } },
  );
  let result = await hotel.invoke("/readiness", undefined, { method: "get" });
  assert.equal(
    result.checks.find((c) => c.id === "room_charge").status,
    "blocked",
  );
  await hotel.db.query(
    "UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind=$5 RETURNING id",
    [
      JSON.stringify({ ...table, zone: "Rooms", active: false }),
      table.id,
      hotel.org.id,
      hotel.b.id,
      "table",
    ],
  );
  result = await hotel.invoke("/readiness", undefined, { method: "get" });
  assert.equal(
    result.checks.find((c) => c.id === "room_charge").status,
    "blocked",
  );
  const club = venueMemoryFixture("pulse");
  club.b.settings.guestListWalkInsOnly = true;
  result = await club.invoke("/readiness", undefined, { method: "get" });
  assert.equal(
    result.checks.find((c) => c.id === "guest_list").status,
    "ready",
  );
});
