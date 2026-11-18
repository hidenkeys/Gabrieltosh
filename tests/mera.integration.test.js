import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import pg from "pg";
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { report as meraReport,tradingDate } from "../server/mera/domain.js";
import { loadBranchReportRecords,tradingDayWindow } from "../server/mera/queries.js";
import { processMeraJobs } from "../server/mera/operations.js";
import { base32, totp, encryptFactor } from "../server/mera/platform.js";
import {
  createMeraRouter,
  migrateMera,
  seedMeraDemo,
  DEMO_ORGANIZATION as org,
  DEMO_BRANCH as branch,
} from "../server/mera/index.js";

test(
  "isolated Mera PostgreSQL integration: tenant boundaries, last-unit concurrency, payments, guest/visit privacy and capacity",
  { skip: process.env.RUN_MERA_PG_TESTS !== "true", timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "mera-integration-"));
    const postgres = new EmbeddedPostgres({
      databaseDir: join(directory, "db"),
      user: "mera_test",
      password: "TemporaryMeraOnly",
      port: 55442,
      persistent: false,
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: () => {},
    });
    let pool, server;
    try {
      await postgres.initialise();
      await postgres.start();
      pool = new pg.Pool({
        connectionString:
          "postgres://mera_test:TemporaryMeraOnly@127.0.0.1:55442/postgres",
      });
      const db = {
        query: (s, v) => pool.query(s, v),
        transaction: async (fn) => {
          const c = await pool.connect();
          try {
            await c.query("BEGIN");
            const r = await fn(c);
            await c.query("COMMIT");
            return r;
          } catch (e) {
            await c.query("ROLLBACK");
            throw e;
          } finally {
            c.release();
          }
        },
      };
      await db.query(
        await readFile(
          new URL("../server/schema.sql", import.meta.url),
          "utf8",
        ),
      );
      const owner = randomUUID(),
        other = randomUUID();
      for (const [id, name] of [
        [owner, "Owner"],
        [other, "Other"],
      ])
        await db.query(
          "INSERT INTO users(id,name,username,password_hash,role) VALUES($1,$2,$3,'not-a-login-hash','admin')",
          [id, name, id],
        );
      const productId = randomUUID();
      await db.query(
        "INSERT INTO products(id,code,name,category,price) VALUES($1,'C2','Brown Sugar Tea','Fruit milk tea',380000)",
        [productId],
      );
      process.env.MERA_DEMO = "true";
      await migrateMera(db);
      await seedMeraDemo({ ...db, userId: owner });
      const app = express();
      app.use(express.json());
      app.use(cookieParser());
      app.use((req, res, next) => {
        if (req.get("x-test-user"))
          req.user = { id: req.get("x-test-user"), name: "Test Actor" };
        next();
      });
      app.use("/api/mera/v1", createMeraRouter(db));
      server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const base = "http://127.0.0.1:" + server.address().port + "/api/mera/v1",
        B = `/organizations/${org}/branches/${branch}`,
        P = `/public/bing-chun/${branch}`;
      async function call(
        path,
        method = "GET",
        body,
        user = owner,
        cookie = "",
        extra = {},
      ) {
        const response = await fetch(base + path, {
          method,
          headers: {
            "content-type": "application/json",
            ...extra,
            ...(user ? { "x-test-user": user } : {}),
            ...(cookie ? { cookie } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return {
          status: response.status,
          cacheControl: response.headers.get("cache-control"),
          data: await response.json(),
          cookie: response.headers.get("set-cookie")?.split(";")[0],
          cookies:response.headers.getSetCookie().map(c=>c.split(";")[0]),
        };
      }
      assert.equal(
        (await call(B + "/workspace", "GET", undefined, other)).status,
        403,
      );
      assert.equal(
        (await call(B + "/workspace", "GET", undefined, null)).status,
        401,
      );
      assert.equal((await call("/platform")).status, 401);
      let menu = (await call(P + "/menu", "GET", undefined, null)).data;
      assert.equal(menu.products.length, 1);
      const selected = menu.products[0];
      const lastUnitSetup = await call(B + "/stock", "POST", {
        productId: selected.id,
        quantity: 1,
        reason: "Last unit test",
      });
      assert.equal(lastUnitSetup.status, 200, JSON.stringify(lastUnitSetup.data));
      assert.equal(lastUnitSetup.data.stockMode, "counted");
      assert.equal(lastUnitSetup.data.stock, 1);
      const g1 = (
        await call(P + "/guests", "POST", { displayName: "Guest One" }, null)
      ).cookie;
      const g2 = (
        await call(P + "/guests", "POST", { displayName: "Guest Two" }, null)
      ).cookie;
      const firstIdentity = await call(P + "/guest", "GET", undefined, null, g1);
      assert.equal(firstIdentity.status, 200);
      assert.equal(firstIdentity.cacheControl, "no-store");
      assert.match(firstIdentity.data.sessionRef, /^[0-9a-f-]{36}$/);
      const reusedIdentity = await call(P + "/guests", "POST", { displayName: "Guest One" }, null, g1);
      assert.equal(reusedIdentity.status, 200);
      assert.equal(reusedIdentity.cacheControl, "no-store");
      assert.equal(reusedIdentity.data.sessionRef, firstIdentity.data.sessionRef);
      const otherIdentity = await call(P + "/guest", "GET", undefined, null, g2);
      assert.notEqual(otherIdentity.data.sessionRef, firstIdentity.data.sessionRef);
      const expiringIdentity = await call(P + "/guests", "POST", { displayName: "Expired identity fixture" }, null);
      assert.equal(expiringIdentity.status, 201);
      assert.equal(expiringIdentity.cacheControl, "no-store");
      assert.match(expiringIdentity.data.sessionRef, /^[0-9a-f-]{36}$/);
      const newIdentityGet = await call(P + "/guest", "GET", undefined, null, expiringIdentity.cookie);
      assert.equal(newIdentityGet.data.sessionRef, expiringIdentity.data.sessionRef);
      await db.query("UPDATE mera_guests SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=$1", [expiringIdentity.data.sessionRef]);
      const expiredIdentityGet = await call(P + "/guest", "GET", undefined, null, expiringIdentity.cookie);
      assert.equal(expiredIdentityGet.status, 401);
      assert.equal(expiredIdentityGet.cacheControl, "no-store");
      assert.equal(expiredIdentityGet.data.sessionRef, undefined);
      assert.equal((await call(P + "/guest", "GET", undefined, null, "")).status, 401);
      const first = {
        requestKey: randomUUID(),
        menuVersion: menu.version,
        displayName: "Guest One",
        items: [{ productId: selected.id, quantity: 1, modifiers: [] }],
      };
      const second = { ...first, requestKey: randomUUID() };
      const responses = await Promise.all([
        call(P + "/orders", "POST", first, null, g1),
        call(P + "/orders", "POST", second, null, g2),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      const winner =
        responses[0].status === 201
          ? { order: responses[0].data, cookie: g1, input: first, other: g2 }
          : { order: responses[1].data, cookie: g2, input: second, other: g1 };
      assert.equal(
        (await call(P + "/orders", "POST", winner.input, null, winner.cookie))
          .data.id,
        winner.order.id,
      );
      assert.equal(
        (
          await call(
            "/public/orders/" + winner.order.id,
            "GET",
            undefined,
            null,
            winner.other,
          )
        ).status,
        404,
      );
      const reused = await call(
        P + "/guests",
        "POST",
        { displayName: "Updated Name" },
        null,
        winner.cookie,
      );
      assert.ok(!reused.cookies.some(c=>c.startsWith("mera_guest=")));
      assert.equal(
        (
          await call(
            "/public/orders/" + winner.order.id,
            "GET",
            undefined,
            null,
            winner.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await call(B + "/orders/" + winner.order.id + "/status", "POST", {
            status: "accepted",
            version: 1,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(B + "/orders/" + winner.order.id + "/status", "POST", {
            status: "preparing",
            version: 2,
          })
        ).status,
        409,
      );
      const payKey = randomUUID();
      assert.equal(
        (
          await call(B + "/orders/" + winner.order.id + "/payments", "POST", {
            requestKey: payKey,
            method: "cash",
            amount: 100000,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(B + "/orders/" + winner.order.id + "/payments", "POST", {
            requestKey: payKey,
            method: "cash",
            amount: 100000,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(B + "/orders/" + winner.order.id + "/payments", "POST", {
            requestKey: randomUUID(),
            method: "cash",
            amount: 500000,
          })
        ).status,
        409,
      );
      await call(B + "/orders/" + winner.order.id + "/payments", "POST", {
        requestKey: randomUUID(),
        method: "external_pos",
        amount: 280000,
      });
      let order = (
        await call(
          "/public/orders/" + winner.order.id,
          "GET",
          undefined,
          null,
          winner.cookie,
        )
      ).data;
      assert.equal(order.paid, 380000);
      assert.equal((await call(B+"/orders/"+order.id+"/status","POST",{status:"preparing",version:order.version})).status,200);
      order=(await call("/public/orders/"+order.id,"GET",undefined,null,winner.cookie)).data;
      assert.equal((await call(B+"/orders/"+order.id+"/status","POST",{status:"ready",version:order.version})).status,409);
      const stationTicket=(await db.query("SELECT data FROM mera_records WHERE kind='ticket' AND data->>'orderId'=$1",[order.id])).rows[0].data;
      const partial=await call(B+"/tickets/"+stationTicket.id+"/items/"+stationTicket.items[0].orderLineId,"POST",{preparedQuantity:0,version:1});
      assert.equal(partial.status,200,JSON.stringify(partial.data));
      assert.equal(partial.data.order.status,"preparing");
      assert.equal((await call(B+"/tickets/"+stationTicket.id+"/status","POST",{status:"ready",version:1})).status,409);
      const stationReady=await call(B+"/tickets/"+stationTicket.id+"/status","POST",{status:"ready",version:2});
      assert.equal(stationReady.status,200,JSON.stringify(stationReady.data));
      assert.equal(stationReady.data.order.status,"ready");
      order=stationReady.data.order;
      for (const status of ["collected", "completed"]) {
        const r = await call(B + "/orders/" + order.id + "/status", "POST", {
          status,
          version: order.version,
        });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        order = r.data;
      }
      const ledger = (
        await db.query("SELECT data FROM mera_records WHERE kind='ledger'")
      ).rows;
      assert.equal(ledger.filter((r) => r.data.paymentId).length, 2);
      assert.equal(
        ledger.filter((r) => r.data.type === "sale_recognition").length,
        1,
      );
      for (const row of ledger)
        assert.equal(
          row.data.postings.reduce((n, p) => n + p.debit - p.credit, 0),
          0,
        );
      const changedReplay = await call(
        P + "/orders",
        "POST",
        { ...winner.input, note: "Changed intent" },
        null,
        winner.cookie,
      );
      assert.equal(changedReplay.status, 409);
      assert.equal(changedReplay.data.code, "IDEMPOTENCY_CONFLICT");
      assert.equal(
        (
          await call(B + "/orders/" + winner.order.id + "/payments", "POST", {
            requestKey: payKey,
            method: "cash",
            amount: 100000,
            reference: "DIFFERENT",
          })
        ).status,
        409,
      );
      await assert.rejects(
        db.query("UPDATE mera_records SET data=data WHERE kind='ledger'"),
      );
      await assert.rejects(
        db.query(
          "INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'ledger',$4)",
          [
            randomUUID(),
            org,
            branch,
            JSON.stringify({
              postings: [
                { account: "cash", debit: 100, credit: 0 },
                { account: "sales", debit: 0, credit: 99 },
              ],
            }),
          ],
        ),
      );
      const table = (
        await call(B + "/tables", "POST", {
          name: "T1",
          capacity: 4,
          zone: "Main floor",
          x: 10,
          y: 20,
        })
      ).data;
      let visit = (
        await call(B + "/visits", "POST", {
          tableId: table.id,
          displayName: "Dinner",
        })
      ).data;
      assert.equal(
        (
          await call(
            P + "/visits/join",
            "POST",
            { visitId: visit.id, code: "bad-code" },
            null,
            g1,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(
            P + "/visits/join",
            "POST",
            { visitId: visit.id, code: visit.joiningCode },
            null,
            g1,
          )
        ).status,
        200,
      );
      assert.equal(
        (await call("/public/visits/" + visit.id, "GET", undefined, null, g2))
          .status,
        404,
      );
      assert.equal(
        (await call(B + "/visits/" + visit.id + "/close", "POST", {})).status,
        200,
      );
      assert.equal(
        (await call("/public/visits/" + visit.id, "GET", undefined, null, g1))
          .status,
        404,
      );
      await call(B + "/tables/" + table.id + "/status", "POST", {
        status: "available",
        reason:"Table cleaned after fixture visit",
      });
      const nextVisit = (
        await call(B + "/visits", "POST", {
          tableId: table.id,
          displayName: "New Visit",
        })
      ).data;
      assert.notEqual(nextVisit.id, visit.id);
      assert.equal((await call(B+"/visits/"+visit.id+"/close","POST",{})).status,409);
      assert.equal((await db.query("SELECT data FROM mera_records WHERE id=$1",[table.id])).rows[0].data.status,"occupied");
      assert.equal(
        (
          await call(
            "/public/visits/" + nextVisit.id,
            "GET",
            undefined,
            null,
            g1,
          )
        ).status,
        404,
      );
      const startsAt = new Date(Date.now() + 86400000).toISOString(),
        endsAt = new Date(Date.now() + 90000000).toISOString();
      const reservation = {
        requestKey: randomUUID(),
        displayName: "Guest",
        contact: "guest@example.test",
        partySize: 20,
        startsAt,
        endsAt,
      };
      const bookings = await Promise.all([
        call(P + "/reservations", "POST", reservation, null, g1),
        call(
          P + "/reservations",
          "POST",
          { ...reservation, requestKey: randomUUID() },
          null,
          g2,
        ),
      ]);
      assert.deepEqual(bookings.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        (await call("/organizations/" + org + "/members")).status,
        200,
      );
      await call(B + "/stock", "POST", {
        productId: selected.id,
        quantity: 10,
        reason: "Bill test balance",
      });
      await call(
        P + "/visits/join",
        "POST",
        { visitId: nextVisit.id, code: nextVisit.joiningCode },
        null,
        g1,
      );
      const tableOrder = (
        await call(
          P + "/orders",
          "POST",
          {
            requestKey: randomUUID(),
            menuVersion: menu.version,
            displayName: "Guest One",
            fulfillment: "table_service",
            visitId: nextVisit.id,
            items: [{ productId: selected.id, quantity: 2, modifiers: [] }],
          },
          null,
          g1,
        )
      ).data;
      assert.equal(tableOrder.total, 760000);
      let workspace = (await call(B + "/workspace")).data;
      let bill = workspace.bills.find(
        (b) => b.visitId === nextVisit.id && b.status === "open",
      );
      assert.equal(bill.total, 760000);
      const split = await call(B + "/bills/" + bill.id + "/split", "POST", {
        name: "Guest Two bill",
        amount: 400000,
      });
      assert.equal(split.status, 200, JSON.stringify(split.data));
      assert.equal(split.data.source.total + split.data.bill.total, 760000);
      const billPaymentKey = randomUUID();
      const partialBillPayment = await call(
        B + "/bills/" + split.data.bill.id + "/payments",
        "POST",
        { requestKey: billPaymentKey, amount: 200000, method: "cash" },
      );
      assert.equal(
        partialBillPayment.status,
        200,
        JSON.stringify(partialBillPayment.data),
      );
      assert.equal(partialBillPayment.data.bill.balance, 200000);
      assert.equal(
        (
          await call(B + "/bills/" + split.data.bill.id + "/payments", "POST", {
            requestKey: billPaymentKey,
            amount: 200000,
            method: "cash",
          })
        ).data.payment.id,
        partialBillPayment.data.payment.id,
      );
      assert.equal(
        (
          await call(B + "/bills/" + split.data.bill.id + "/split", "POST", {
            name: "Invalid paid split",
            amount: 300000,
          })
        ).status,
        409,
      );
      const merged = await call(B + "/bills/" + bill.id + "/merge", "POST", {
        sourceBillIds: [split.data.bill.id],
      });
      assert.equal(merged.status, 200, JSON.stringify(merged.data));
      assert.equal(merged.data.total, 760000);
      assert.equal(merged.data.paid, 200000);
      assert.equal(merged.data.balance, 560000);
      assert.equal(
        (
          await call(B + "/bills/" + bill.id + "/merge", "POST", {
            sourceBillIds: [split.data.bill.id],
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(B + "/bills/" + bill.id + "/payments", "POST", {
            requestKey: randomUUID(),
            amount: 560000,
            method: "external_pos",
          })
        ).status,
        200,
      );
      const paidTableOrder = (
        await call(
          "/public/orders/" + tableOrder.id,
          "GET",
          undefined,
          null,
          g1,
        )
      ).data;
      assert.equal(paidTableOrder.paid, 760000);
      assert.equal(
        (
          await call(B + "/deposit-policy", "PUT", {
            enabled: true,
            amount: 100000,
            cancellationCutoffHours: 24,
            refundRule: "refundable_before_cutoff",
            approved: true,
          })
        ).status,
        200,
      );
      const depositReservation = (
        await call(
          P + "/reservations",
          "POST",
          { ...reservation, requestKey: randomUUID(), partySize: 2 },
          null,
          g1,
        )
      ).data;
      assert(depositReservation.id, JSON.stringify(depositReservation));
      const depositKey = randomUUID();
      const deposit = await call(
        B + "/reservations/" + depositReservation.id + "/deposits",
        "POST",
        { requestKey: depositKey, amount: 100000, method: "cash" },
      );
      assert.equal(deposit.status, 200, JSON.stringify(deposit.data));
      assert.equal(
        (
          await call(
            B + "/reservations/" + depositReservation.id + "/deposits",
            "POST",
            { requestKey: depositKey, amount: 100000, method: "cash" },
          )
        ).data.id,
        deposit.data.id,
      );
      assert.equal(
        (
          await call(
            B + "/reservations/" + depositReservation.id + "/status",
            "POST",
            { status: "confirmed" },
          )
        ).status,
        200,
      );
      const depositTable = (
        await call(B + "/tables", "POST", {
          name: "T2",
          capacity: 4,
          zone: "Main",
          x: 20,
          y: 20,
        })
      ).data;
      const seated = await call(
        B + "/reservations/" + depositReservation.id + "/seat",
        "POST",
        { tableId: depositTable.id, displayName: "Guest One" },
      );
      assert.equal(seated.status, 200, JSON.stringify(seated.data));
      assert.equal(seated.data.bill.paid, 100000);
      const seatedAgain = await call(
        B + "/reservations/" + depositReservation.id + "/seat",
        "POST",
        { tableId: depositTable.id, displayName: "Guest One" },
      );
      assert.equal(seatedAgain.data.bill.id, seated.data.bill.id);
      assert.equal(seatedAgain.data.bill.paid, 100000);
      const depositOrder = await call(
        P + "/orders",
        "POST",
        {
          requestKey: randomUUID(),
          menuVersion: menu.version,
          displayName: "Guest One",
          fulfillment: "table_service",
          visitId: seated.data.visit.id,
          items: [{ productId: selected.id, quantity: 1, modifiers: [] }],
        },
        null,
        g1,
      );
      assert.equal(depositOrder.status, 201, JSON.stringify(depositOrder.data));
      assert.equal(depositOrder.data.paid, 100000);
      const depositVisit = (
        await call(
          "/public/visits/" + seated.data.visit.id,
          "GET",
          undefined,
          null,
          g1,
        )
      ).data;
      assert.equal(depositVisit.bills[0].balance, 280000);
      const roundBody = () => ({
        requestKey: randomUUID(),
        menuVersion: menu.version,
        displayName: "Guest One",
        fulfillment: "table_service",
        visitId: nextVisit.id,
        items: [{ productId: selected.id, quantity: 1, modifiers: [] }],
      });
      const paidRound = (
        await call(P + "/orders", "POST", roundBody(), null, g1)
      ).data;
      assert.equal(
        (
          await call(B + "/orders/" + paidRound.id + "/payments", "POST", {
            requestKey: randomUUID(),
            amount: 380000,
            method: "cash",
          })
        ).status,
        200,
      );
      const unpaidRound = (
        await call(P + "/orders", "POST", roundBody(), null, g1)
      ).data;
      let currentBills = (await call(B + "/workspace")).data.bills;
      let combined = currentBills.find(
        (b) => b.visitId === nextVisit.id && b.status === "open",
      );
      const paidCharge = combined.charges.find(
        (c) => c.orderId === paidRound.id,
      );
      assert.equal(
        (
          await call(B + "/bills/" + combined.id + "/split", "POST", {
            name: "Invalid paid item",
            items: [{ chargeId: paidCharge.id, quantity: 1 }],
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(B + "/orders/" + unpaidRound.id + "/status", "POST", {
            status: "cancelled",
            version: unpaidRound.version,
          })
        ).status,
        200,
      );
      combined = (await call(B + "/workspace")).data.bills.find(
        (b) => b.id === combined.id,
      );
      assert.equal(combined.balance, 0);
      assert(!combined.charges.some((l) => l.orderId === unpaidRound.id));
      assert.equal(
        (
          await call(B + "/orders/" + paidRound.id + "/refunds", "POST", {
            requestKey: randomUUID(),
            amount: 380000,
            reason: "Manual return",
            method: "cash",
          })
        ).status,
        200,
      );
      combined = (await call(B + "/workspace")).data.bills.find(
        (b) => b.id === combined.id,
      );
      assert.equal(combined.balance, 0);
      assert.equal(combined.total, combined.paid);
      const refundedRound = (
        await call("/public/orders/" + paidRound.id, "GET", undefined, null, g1)
      ).data;
      assert.equal(
        (
          await call(B + "/orders/" + paidRound.id + "/status", "POST", {
            status: "cancelled",
            version: refundedRound.version,
          })
        ).status,
        200,
      );
      combined = (await call(B + "/workspace")).data.bills.find(
        (b) => b.id === combined.id,
      );
      assert.equal(combined.balance, 0);
      assert(!combined.charges.some((l) => l.orderId === paidRound.id));
      const credential = await call(B + "/integration-credentials", "POST", {
        name: "Development Zidi",
        scopes: [
          "published_menu.read",
          "orders.create",
          "orders.read",
          "reservations.create",
        ],
      });
      assert.equal(credential.status, 201, JSON.stringify(credential.data));
      const machineHeaders = {
        authorization: "Bearer " + credential.data.token,
      };
      const zidiMenu = await call(
        "/integrations/zidi/v1/menu",
        "GET",
        undefined,
        null,
        "",
        machineHeaders,
      );
      assert.equal(zidiMenu.status, 200, JSON.stringify(zidiMenu.data));
      assert.equal(zidiMenu.data.mode, "simulator");
      const machineOrderBody = {
        requestKey: randomUUID(),
        menuVersion: menu.version,
        displayName: "Zidi Guest",
        items: [{ productId: selected.id, quantity: 1, modifiers: [] }],
      };
      const machineOrder = await call(
        "/integrations/zidi/v1/orders",
        "POST",
        machineOrderBody,
        null,
        "",
        machineHeaders,
      );
      assert.equal(machineOrder.status, 201, JSON.stringify(machineOrder.data));
      assert.equal(
        (
          await call(
            "/integrations/zidi/v1/orders",
            "POST",
            machineOrderBody,
            null,
            "",
            machineHeaders,
          )
        ).data.order.id,
        machineOrder.data.order.id,
      );
      assert.equal(
        (
          await call(
            "/integrations/zidi/v1/orders",
            "POST",
            { ...machineOrderBody, note: "Changed intent" },
            null,
            "",
            machineHeaders,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await call(
            "/integrations/zidi/v1/orders/" + machineOrder.data.order.id,
            "GET",
            undefined,
            null,
            "",
            machineHeaders,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            "/integrations/zidi/v1/orders/" + winner.order.id,
            "GET",
            undefined,
            null,
            "",
            machineHeaders,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await call(
            "/integrations/zidi/v1/orders/" +
              machineOrder.data.order.id +
              "/payments",
            "POST",
            { amount: 380000 },
            null,
            "",
            machineHeaders,
          )
        ).status,
        503,
      );
      const menuOnlyCredential = (
        await call(B + "/integration-credentials", "POST", {
          name: "Read only",
          scopes: ["published_menu.read"],
        })
      ).data;
      assert.equal(
        (
          await call(
            "/integrations/zidi/v1/orders",
            "POST",
            { ...machineOrderBody, requestKey: randomUUID() },
            null,
            "",
            { authorization: "Bearer " + menuOnlyCredential.token },
          )
        ).status,
        403,
      );
      await call(
        B + "/integration-credentials/" + credential.data.id,
        "DELETE",
      );
      assert.equal(
        (
          await call(
            "/integrations/zidi/v1/menu",
            "GET",
            undefined,
            null,
            "",
            machineHeaders,
          )
        ).status,
        403,
      );
      const exportDate = new Date().toISOString().slice(0, 10);
      const customRole=await call("/organizations/"+org+"/roles","POST",{name:"Menu auditor",permissions:["reports.view"]});
      assert.equal(customRole.status,201,JSON.stringify(customRole.data));
      assert.equal((await call("/organizations/"+org+"/roles/"+customRole.data.id,"PATCH",{name:"Menu auditor",permissions:["reports.view","menu.edit"],active:true,version:1})).status,200);
      assert.equal((await call("/organizations/"+org+"/roles/"+customRole.data.id,"PATCH",{name:"Stale role",permissions:["reports.view"],active:true,version:1})).status,409);
      const customInvite=await call("/organizations/"+org+"/invitations","POST",{email:"auditor@example.invalid",role:customRole.data.id,branchIds:[branch]});
      assert.equal(customInvite.status,201,JSON.stringify(customInvite.data));
      assert.ok((await call("/organizations/"+org+"/invitations")).data.some(i=>i.id===customInvite.data.id));
      const exportJob = await call(B + "/exports", "POST", {
        date: exportDate,
        requestKey: randomUUID(),
      });
      assert.equal(exportJob.status, 202, JSON.stringify(exportJob.data));
      assert.equal(await processMeraJobs(db), true);
      const stolenJob=await call(B+"/exports","POST",{date:"2026-01-01",requestKey:randomUUID()});
      let claim=true;
      const competingDb={...db,transaction:async(fn)=>{const result=await db.transaction(fn);if(claim){claim=false;await db.query("UPDATE mera_records SET data=jsonb_set(data,'{leaseToken}',to_jsonb('new-worker-lease'::text)) WHERE id=$1",[stolenJob.data.id]);}return result;}};
      assert.equal(await processMeraJobs(competingDb),true);
      assert.equal((await db.query("SELECT id FROM mera_records WHERE id=$1 AND kind='export'",[stolenJob.data.artifactId])).rowCount,0);
      assert.equal((await db.query("SELECT data FROM mera_records WHERE id=$1",[stolenJob.data.id])).rows[0].data.leaseToken,"new-worker-lease");

      const completedJob = (await call(B + "/jobs")).data.find(
        (j) => j.id === exportJob.data.id,
      );
      assert.equal(completedJob.status, "complete");
      const downloaded = await fetch(
        base + B + "/exports/" + completedJob.artifactId + "/download",
        { headers: { "x-test-user": owner } },
      );
      assert.equal(downloaded.status, 200);
      assert.match(await downloaded.text(), /grossOrderValue/);
      assert.equal(
        (
          await fetch(
            base + B + "/exports/" + completedJob.artifactId + "/download",
            { headers: { "x-test-user": other } },
          )
        ).status,
        403,
      );
      const invoice = await call(
        "/organizations/" + org + "/invoices",
        "POST",
        {
          periodStart: "2026-11-01T00:00:00Z",
          periodEnd: "2026-12-01T00:00:00Z",
          requestKey: randomUUID(),
        },
      );
      assert.equal(invoice.status, 201, JSON.stringify(invoice.data));
      assert.equal(invoice.data.notCharged, true);
      assert.equal(invoice.data.status, "draft");
      assert.equal(invoice.data.amount, 1350000);
      const directory = (
        await call(
          "/public/organizations/bing-chun/branches",
          "GET",
          undefined,
          null,
        )
      ).data;
      assert.equal(directory.branches.length, 1);
      assert.equal(directory.branches[0].id, branch);
      const consentKey = randomUUID();
      assert.equal(
        (
          await call(
            P + "/consent",
            "PUT",
            { requestKey: consentKey, marketing: true },
            null,
            g1,
          )
        ).data.marketing,
        true,
      );
      assert.equal(
        (
          await call(
            P + "/consent",
            "PUT",
            { requestKey: consentKey, marketing: false },
            null,
            g1,
          )
        ).status,
        409,
      );
      assert.equal(
        (await call(P + "/consent", "GET", undefined, null, g2)).data.marketing,
        false,
      );
      const factor = base32(randomBytes(20)),
        mfaKey = randomBytes(32);
      process.env.MERA_PLATFORM_MFA_KEY = mfaKey.toString("hex");
      await db.query(
        "INSERT INTO mera_platform_members(user_id,active) VALUES($1,true)",
        [owner],
      );
      await db.query(
        "INSERT INTO mera_platform_factors(user_id,secret_cipher) VALUES($1,$2)",
        [owner, encryptFactor(factor, mfaKey)],
      );
      const sessionA = randomBytes(32).toString("hex"),
        sessionB = randomBytes(32).toString("hex");
      for (const token of [sessionA, sessionB])
        await db.query(
          "INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP+INTERVAL '1 hour')",
          [createHash("sha256").update(token).digest("hex"), owner],
        );
      assert.equal(
        (
          await call(
            "/platform",
            "GET",
            undefined,
            owner,
            "pos_session=" + sessionA,
          )
        ).status,
        403,
      );
      const counter = Math.floor(Date.now() / 30000),
        code = totp(factor, counter);
      assert.equal(
        (
          await call(
            "/platform/auth/verify",
            "POST",
            { code },
            owner,
            "pos_session=" + sessionA,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            "/platform/auth/verify",
            "POST",
            { code },
            owner,
            "pos_session=" + sessionA,
          )
        ).status,
        401,
      );
      assert.equal(
        (
          await call(
            "/platform",
            "GET",
            undefined,
            owner,
            "pos_session=" + sessionA,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            "/platform",
            "GET",
            undefined,
            owner,
            "pos_session=" + sessionB,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(
            "/platform/auth/verify",
            "POST",
            { code: totp(factor, counter + 1) },
            owner,
            "pos_session=" + sessionB,
          )
        ).status,
        200,
      );
      await db.query(
        "UPDATE mera_platform_members SET active=false WHERE user_id=$1",
        [owner],
      );
      assert.equal(
        (
          await call(
            "/platform",
            "GET",
            undefined,
            owner,
            "pos_session=" + sessionA,
          )
        ).status,
        403,
      );
      await db.query(
        "UPDATE mera_platform_members SET active=true WHERE user_id=$1",
        [owner],
      );
      const subscriptionKey = randomUUID();
      const subscriptionPath =
        "/platform/organizations/" + org + "/subscription";
      assert.equal(
        (
          await call(
            subscriptionPath,
            "PATCH",
            {
              requestKey: subscriptionKey,
              status: "suspended",
              reason: "Test subscription suspension",
            },
            owner,
            "pos_session=" + sessionA,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            subscriptionPath,
            "PATCH",
            {
              requestKey: subscriptionKey,
              status: "active",
              reason: "Changed intent",
            },
            owner,
            "pos_session=" + sessionA,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await call(
            P + "/orders",
            "POST",
            { ...winner.input, requestKey: randomUUID() },
            null,
            winner.cookie,
          )
        ).status,
        409,
      );
      const activePaidOrder = (
        await call(
          "/public/orders/" + tableOrder.id,
          "GET",
          undefined,
          null,
          g1,
        )
      ).data;
      assert.equal(
        (
          await call(B + "/orders/" + tableOrder.id + "/status", "POST", {
            status: "accepted",
            version: activePaidOrder.version,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            subscriptionPath,
            "PATCH",
            {
              requestKey: randomUUID(),
              status: "active",
              reason: "Restore after test",
            },
            owner,
            "pos_session=" + sessionA,
          )
        ).status,
        200,
      );
      const allLedger = (
        await db.query("SELECT data FROM mera_records WHERE kind='ledger'")
      ).rows;
      for (const row of allLedger)
        assert.equal(
          row.data.postings.reduce((n, p) => n + p.debit - p.credit, 0),
          0,
        );
      workspace = (await call(B + "/workspace")).data;
      assert(workspace.report.grossOrderValue > workspace.report.grossSales);
      assert.equal(workspace.report.grossSales, 380000);
      const sized=await call(B+"/products","POST",{name:"Last sized tea",code:"SIZE1",category:"Tests",price:10000,variants:[{id:"large",name:"Large",price:20000,stockMode:"counted",stock:1}]});
      assert.equal(sized.status,201,JSON.stringify(sized.data));
      const publication=await call(B+"/menu/publish","POST",{});
      const sizeIntent={requestKey:randomUUID(),menuVersion:publication.data.version,displayName:"Size tester",items:[{productId:sized.data.id,variantId:"large",quantity:1,modifiers:[]}]};
      const sizeRace=await Promise.all([call(B+"/orders","POST",sizeIntent),call(B+"/orders","POST",{...sizeIntent,requestKey:randomUUID()})]);
      assert.deepEqual(sizeRace.map(r=>r.status).sort(),[201,409]);
      const sizeOrder=sizeRace.find(r=>r.status===201).data;
      assert.equal(sizeOrder.items[0].variantId,"large");
      await db.query("UPDATE mera_records SET data=jsonb_set(data,'{holdExpiresAt}',to_jsonb('2020-01-01T00:00:00Z'::text)) WHERE id=$1",[sizeOrder.id]);
      await call(P+"/menu","GET",undefined,null);
      assert.equal((await db.query("SELECT data FROM mera_records WHERE id=$1",[sized.data.id])).rows[0].data.variants[0].stock,1);
      const currentSize=(await db.query("SELECT data FROM mera_records WHERE id=$1",[sized.data.id])).rows[0].data;
      const stockEdit=await call(B+"/products/"+sized.data.id,"PUT",{...currentSize,stock:999,variants:currentSize.variants.map(v=>({...v,stock:999}))});
      assert.equal(stockEdit.status,200,JSON.stringify(stockEdit.data));
      assert.equal(stockEdit.data.variants[0].stock,1);
      assert.equal(stockEdit.data.stock,0);
      assert.equal((await call(B+"/settings","PATCH",{timezone:"Invalid/Timezone"})).status,400);
      const local=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Lagos",weekday:"short"}).format(new Date());
      const tomorrow=(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(local)+1)%7;
      await call(B+"/settings","PATCH",{serviceHours:[{days:[tomorrow],start:"00:00",end:"23:59"}],timezone:"Africa/Lagos",cutoff:240});
      assert.equal((await call(P+"/menu","GET",undefined,null)).data.orderingAvailable,false);
      assert.equal((await call(B+"/orders","POST",{...sizeIntent,requestKey:randomUUID()})).status,409);
      await call(B+"/settings","PATCH",{serviceHours:[],cutoff:0});
      const providerIntent={eventId:"fixture-settlement-first",transactionId:"fixture-provider-reference",orderId:winner.order.id,sequence:2,type:"settlement_reported",amount:380000,occurredAt:new Date().toISOString()};
      assert.equal((await call(B+"/provider-simulator/events","POST",providerIntent)).status,201);
      assert.equal((await call(B+"/reconciliation")).data.transactions[0].status,"awaiting_events");
      assert.equal((await call(B+"/provider-simulator/events","POST",providerIntent)).status,200);
      assert.equal((await call(B+"/provider-simulator/events","POST",{...providerIntent,amount:1})).status,409);
      const providerCollection=await call(B+"/provider-simulator/events","POST",{...providerIntent,eventId:"fixture-collection-later",sequence:1,type:"collection_reported"});
      assert.equal(providerCollection.status,201);
      const reconciliation=(await call(B+"/reconciliation")).data;
      assert.equal(reconciliation.fundsMoved,false);
      assert.equal(reconciliation.transactions[0].status,"mismatch");
      assert.deepEqual(reconciliation.transactions[0].missingSequences,[]);
      assert.equal(reconciliation.transactions[0].fee.assessed,null);
      await assert.rejects(db.query("UPDATE mera_records SET data=data||'{\"amount\":1}'::jsonb WHERE id=$1",[providerCollection.data.event.id]),/append-only/i);
      const sharedMenu=await call("/organizations/"+org+"/menus","POST",{name:"Regional menu",items:[{...currentSize,stock:999}]});
      assert.equal(sharedMenu.status,201,JSON.stringify(sharedMenu.data));
      const sharedApply=await call(B+"/menu/shared-use","POST",{menuId:sharedMenu.data.id,version:1,overrides:[{code:"SIZE1",price:25000}]});
      assert.equal(sharedApply.status,200,JSON.stringify(sharedApply.data));
      const appliedMenu=(await call(P+"/menu","GET",undefined,null)).data;
      assert.equal(appliedMenu.products[0].id,sized.data.id);
      assert.equal(appliedMenu.products[0].price,25000);
      assert.equal(appliedMenu.products[0].variants[0].stock,1);
      assert.equal((await call(B+"/menu/shared-use","POST",{menuId:sharedMenu.data.id,version:999,overrides:[]})).status,409);
      await call(B+"/settings","PATCH",{payLater:true});
      await call(B+"/stock","POST",{productId:sized.data.id,variantId:"large",quantity:5,reason:"Partial cancellation fixture"});
      const partialOrder=await call(B+"/orders","POST",{...sizeIntent,menuVersion:sharedApply.data.version,requestKey:randomUUID(),items:[{productId:sized.data.id,variantId:"large",quantity:3,modifiers:[]}]});
      assert.equal(partialOrder.status,201,JSON.stringify(partialOrder.data));
      const partialBill=(await db.query("SELECT data FROM mera_records WHERE kind='bill' AND data->'charges' @> $1::jsonb",[JSON.stringify([{orderId:partialOrder.data.id}])])).rows[0].data;
      assert.equal((await call(B+"/bills/"+partialBill.id+"/split","POST",{name:"Small separate amount",amount:10000})).status,200);
      const acceptPartial=await call(B+"/orders/"+partialOrder.data.id+"/status","POST",{status:"accepted",version:1});
      const partialTicket=(await db.query("SELECT data FROM mera_records WHERE kind='ticket' AND data->>'orderId'=$1",[partialOrder.data.id])).rows[0].data;
      const preparedPartial=await call(B+"/tickets/"+partialTicket.id+"/items/"+partialTicket.items[0].orderLineId,"POST",{preparedQuantity:1,version:1});
      assert.equal(preparedPartial.status,200,JSON.stringify(preparedPartial.data));
      const cancelPath=B+"/orders/"+partialOrder.data.id+"/items/"+partialOrder.data.items[0].orderLineId+"/cancel";
      const cancelIntent={requestKey:randomUUID(),quantity:1,version:preparedPartial.data.order.version,reason:"One unprepared drink no longer wanted"};
      assert.equal((await call(cancelPath,"POST",{...cancelIntent,quantity:3})).status,409);
      const cancelledItem=await call(cancelPath,"POST",cancelIntent);
      assert.equal(cancelledItem.status,200,JSON.stringify(cancelledItem.data));
      assert.equal(cancelledItem.data.order.total,40000);
      assert.equal((await call(cancelPath,"POST",cancelIntent)).status,200);
      assert.equal((await db.query("SELECT data FROM mera_records WHERE id=$1",[sized.data.id])).rows[0].data.variants[0].stock,3);
      const partialBills=(await db.query("SELECT data FROM mera_records WHERE kind='bill' AND data->'charges' @> $1::jsonb",[JSON.stringify([{orderId:partialOrder.data.id}])])).rows.map(r=>r.data);
      assert.equal(partialBills.reduce((n,b)=>n+b.charges.filter(l=>l.orderId===partialOrder.data.id).reduce((a,l)=>a+l.amount,0),0),40000);
      await call(B+"/orders/"+partialOrder.data.id+"/payments","POST",{requestKey:randomUUID(),method:"cash",amount:20000});
      const paidPartial=(await db.query("SELECT data FROM mera_records WHERE id=$1",[partialOrder.data.id])).rows[0].data;
      assert.equal((await call(cancelPath,"POST",{...cancelIntent,requestKey:randomUUID(),version:paidPartial.version})).data.code,"PAID_ITEM_REVIEW_REQUIRED");
      const activity=(await call(P+"/activity","GET",undefined,null,g1)).data;
      assert.ok(activity.reservations.some(r=>r.id===depositReservation.id));
      assert.ok(!(await call(P+"/activity","GET",undefined,null,g2)).data.reservations.some(r=>r.id===depositReservation.id));
      const bookingFuture={...reservation,requestKey:randomUUID(),startsAt:new Date(Date.now()+5*86400000).toISOString(),endsAt:new Date(Date.now()+5*86400000+3600000).toISOString(),partySize:1};
      const heldBooking=await call(P+"/reservations","POST",bookingFuture,null,g1);
      assert.equal(heldBooking.status,201,JSON.stringify(heldBooking.data));
      assert.equal((await call(B+"/reservations/"+heldBooking.data.id+"/deposits","POST",{requestKey:randomUUID(),amount:100000,method:"cash"})).status,200);
      const guestCancelPath=P+"/reservations/"+heldBooking.data.id+"/cancellation",cancelBooking={requestKey:randomUUID(),reason:"Plans changed before the booking"};
      assert.equal((await call(guestCancelPath,"POST",cancelBooking,null,g2)).status,404);
      const heldCancel=await call(guestCancelPath,"POST",cancelBooking,null,g1);
      assert.equal(heldCancel.status,200,JSON.stringify(heldCancel.data));
      assert.equal(heldCancel.data.depositReviewRequired,true);
      assert.equal(heldCancel.data.refundConfirmed,false);
      assert.notEqual(heldCancel.data.status,"cancelled");
      assert.equal((await call(guestCancelPath,"POST",cancelBooking,null,g1)).status,200);
      const originalDemo=process.env.MERA_DEMO;
      process.env.MERA_DEMO="false";
      assert.equal((await call(P+"/menu","GET",undefined,null)).status,404);
      await db.query("UPDATE mera_organizations SET onboarding=jsonb_set(onboarding,'{status}',to_jsonb('published'::text)) WHERE id=$1",[org]);
      assert.equal((await call(P+"/menu","GET",undefined,null)).status,404);
      await db.query("UPDATE mera_branches SET settings=settings||'{\"launchState\":\"published\",\"manualPaymentMethods\":[\"cash\"]}'::jsonb WHERE id=$1",[branch]);
      assert.equal((await call(P+"/menu","GET",undefined,null)).status,200);
      process.env.MERA_DEMO=originalDemo;
      assert.equal((await call(B+"/orders/"+partialOrder.data.id+"/payments","POST",{requestKey:randomUUID(),method:"external_pos",amount:1000})).data.code,"PAYMENT_METHOD_DISABLED");
      const combinePrimary=(await call(B+"/tables","POST",{name:"Move source fixture",capacity:2,zone:"main"})).data;
      const combineVisit=(await call(B+"/visits","POST",{tableId:combinePrimary.id,displayName:"Private combine fixture"})).data;
      const combineTable=(await call(B+"/tables","POST",{name:"Combined fixture",capacity:2,zone:"main"})).data;
      const moveIntent={requestKey:randomUUID(),version:1,primaryTableId:combinePrimary.id,tableIds:[combinePrimary.id,combineTable.id],reason:"Combine empty adjacent table"};
      const combinedVisit=await call(B+"/visits/"+combineVisit.id+"/tables","POST",moveIntent);
      assert.equal(combinedVisit.status,200,JSON.stringify(combinedVisit.data));
      assert.equal((await call(B+"/visits/"+combineVisit.id+"/tables","POST",moveIntent)).status,200);
      assert.equal((await call(B+"/visits/"+combineVisit.id+"/tables","POST",{...moveIntent,requestKey:randomUUID()})).status,409);
      assert.equal((await call(P+"/visits/join","POST",{tableId:combineTable.id,code:combineVisit.joiningCode},null,g2)).status,200);
      assert.equal((await call(B+"/visits/"+combineVisit.id+"/close","POST",{})).status,200);
      assert.equal((await db.query("SELECT data FROM mera_records WHERE id=$1",[combineTable.id])).rows[0].data.status,"cleaning");
      const cashShift=(await call(B+"/shifts","POST",{openingFloat:10000})).data;
      const cashIntent={requestKey:randomUUID(),direction:"in",amount:1000,reason:"Petty cash fixture"};
      assert.equal((await call(B+"/shifts/"+cashShift.id+"/movements","POST",cashIntent)).status,200);
      assert.equal((await call(B+"/shifts/"+cashShift.id+"/movements","POST",cashIntent)).status,200);
      assert.equal((await call(B+"/shifts/"+cashShift.id+"/movements","POST",{...cashIntent,amount:2000})).status,409);
      const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1sAAAAASUVORK5CYII=";
      const uploaded=await call(B+"/assets","POST",{filename:"fixture.png",mime:"image/png",data:png});
      assert.equal(uploaded.status,201,JSON.stringify(uploaded.data));
      const unpublished=await fetch(base+"/public/assets/"+uploaded.data.id);
      assert.equal(unpublished.status,404);
      const latestSized=(await db.query("SELECT data FROM mera_records WHERE id=$1",[sized.data.id])).rows[0].data;
      assert.equal((await call(B+"/products/"+sized.data.id,"PUT",{...latestSized,image:uploaded.data.url})).status,200);
      await call(B+"/menu/publish","POST",{});
      const publicPng=await fetch(base+"/public/assets/"+uploaded.data.id);
      assert.equal(publicPng.status,200);
      assert.deepEqual(Buffer.from(await publicPng.arrayBuffer()),Buffer.from(png,"base64"));
      const foreignOrg=await call("/organizations","POST",{name:"Foreign asset fixture",slug:"foreign-asset-fixture",branchName:"Other"});
      assert.equal(foreignOrg.status,201,JSON.stringify(foreignOrg.data));
      const foreignBase="/organizations/"+foreignOrg.data.organizationId+"/branches/"+foreignOrg.data.branchId;
      const foreignUpload=await call(foreignBase+"/assets","POST",{filename:"foreign.png",mime:"image/png",data:png});
      assert.equal(foreignUpload.status,201,JSON.stringify(foreignUpload.data));
      assert.equal((await call(B+"/products/"+sized.data.id,"PUT",{...latestSized,image:foreignUpload.data.url})).status,403);
      const linkedRefund=await call(B+"/orders/"+partialOrder.data.id+"/refunds","POST",{requestKey:randomUUID(),amount:20000,method:"cash",reason:"Approved return for unprepared cancelled drink"});
      assert.equal(linkedRefund.status,200,JSON.stringify(linkedRefund.data));
      const beforePaidCancel=(await db.query("SELECT data FROM mera_records WHERE id=$1",[partialOrder.data.id])).rows[0].data;
      const paidCancelIntent={requestKey:randomUUID(),quantity:1,version:beforePaidCancel.version,reason:"Apply approved return to one drink",refundAllocations:[{refundId:linkedRefund.data.id,amount:20000}]};
      const paidCancel=await call(cancelPath,"POST",paidCancelIntent);
      assert.equal(paidCancel.status,200,JSON.stringify(paidCancel.data));
      assert.equal(paidCancel.data.order.total,20000);
      assert.equal(paidCancel.data.order.effectivePaid,0);
      assert.equal(paidCancel.data.order.recognitionTotal,40000);
      assert.equal((await call(cancelPath,"POST",paidCancelIntent)).status,200);
      const paidCancelBills=(await db.query("SELECT data FROM mera_records WHERE kind='bill' AND data->'charges' @> $1::jsonb",[JSON.stringify([{orderId:partialOrder.data.id}])])).rows.map(r=>r.data);
      assert.equal(paidCancelBills.reduce((n,b)=>n+b.charges.filter(l=>l.orderId===partialOrder.data.id).reduce((v,l)=>v+l.amount,0),0),20000);
      assert.equal((await call(B+"/orders/"+partialOrder.data.id+"/payments","POST",{requestKey:randomUUID(),amount:20000,method:"cash"})).status,200);
      const settledCancel=(await db.query("SELECT data FROM mera_records WHERE id=$1",[partialOrder.data.id])).rows[0].data;
      assert.equal(settledCancel.effectivePaid,20000);
      assert.equal((await call(B+"/orders/"+partialOrder.data.id+"/status","POST",{status:"collected",version:settledCancel.version})).status,200);
      const cancelLedger=(await db.query("SELECT data FROM mera_records WHERE kind='ledger' AND data->>'orderId'=$1 AND data->>'type'='sale_recognition'",[partialOrder.data.id])).rows[0].data;
      assert.equal(cancelLedger.postings.reduce((n,p)=>n+p.debit-p.credit,0),0);
      assert.equal(cancelLedger.postings.find(p=>p.account==="merchant_sales").credit,40000);
      const latestVersion=(await call(P+"/menu","GET",undefined,null)).data.version;
      const pricingPolicy={enabled:true,approved:true,discount:{label:"Store discount",type:"basis_points",value:1000},serviceCharge:{label:"Service",basisPoints:500},tax:{label:"Tax",basisPoints:1000,basis:"net_items_and_service"}};
      assert.equal((await call(B+"/pricing-policy","PATCH",pricingPolicy)).status,200);
      const chargedIntent={...sizeIntent,menuVersion:latestVersion,requestKey:randomUUID()};
      assert.equal((await call(B+"/orders","POST",chargedIntent)).data.code,"QUOTE_REQUIRED");
      const chargedQuote=await call(B+"/quote","POST",{menuVersion:latestVersion,items:chargedIntent.items});
      assert.equal(chargedQuote.status,201,JSON.stringify(chargedQuote.data));
      assert.equal(chargedQuote.data.subtotal,20000);
      assert.equal(chargedQuote.data.discount,2000);
      assert.equal(chargedQuote.data.serviceCharge,900);
      assert.equal(chargedQuote.data.tax,1890);
      assert.equal(chargedQuote.data.total,20790);
      assert.equal((await call(B+"/orders","POST",{...chargedIntent,quoteId:chargedQuote.data.id,items:[{...chargedIntent.items[0],quantity:2}]})).data.code,"QUOTE_CHANGED");
      const chargedKey=randomUUID();
      const chargedOrder=await call(B+"/orders","POST",{...chargedIntent,requestKey:chargedKey,quoteId:chargedQuote.data.id});
      assert.equal(chargedOrder.status,201,JSON.stringify(chargedOrder.data));
      await db.query("UPDATE mera_records SET data=jsonb_set(data,'{expiresAt}',to_jsonb('2020-01-01T00:00:00Z'::text)) WHERE id=$1",[chargedQuote.data.id]);
      const quoteReplay=await call(B+"/orders","POST",{...chargedIntent,requestKey:chargedKey,quoteId:chargedQuote.data.id});
      assert.equal(quoteReplay.status,201,JSON.stringify(quoteReplay.data));
      assert.equal(quoteReplay.data.id,chargedOrder.data.id);
      const chargedBill=(await db.query("SELECT data FROM mera_records WHERE kind='bill' AND data->'charges' @> $1::jsonb",[JSON.stringify([{orderId:chargedOrder.data.id}])])).rows[0].data;
      assert.equal(chargedBill.charges.reduce((n,l)=>n+l.amount,0),20790);
      assert.equal((await call(B+"/orders/"+chargedOrder.data.id+"/payments","POST",{requestKey:randomUUID(),method:"cash",amount:20790})).status,200);
      let chargedCanonical=(await db.query("SELECT data FROM mera_records WHERE id=$1",[chargedOrder.data.id])).rows[0].data;
      assert.equal((await call(B+"/orders/"+chargedOrder.data.id+"/status","POST",{status:"accepted",version:chargedCanonical.version})).status,200);
      const chargedTicket=(await db.query("SELECT data FROM mera_records WHERE kind='ticket' AND data->>'orderId'=$1",[chargedOrder.data.id])).rows[0].data;
      const chargedReady=await call(B+"/tickets/"+chargedTicket.id+"/status","POST",{status:"ready",version:1});
      assert.equal(chargedReady.status,200,JSON.stringify(chargedReady.data));
      assert.equal((await call(B+"/orders/"+chargedOrder.data.id+"/status","POST",{status:"collected",version:chargedReady.data.order.version})).status,200);
      const chargedRefund=await call(B+"/orders/"+chargedOrder.data.id+"/refunds","POST",{requestKey:randomUUID(),method:"cash",amount:2079,reason:"Ten percent service recovery"});
      assert.equal(chargedRefund.status,200,JSON.stringify(chargedRefund.data));
      assert.equal(chargedRefund.data.taxAmount,189);
      const chargedLedgers=(await db.query("SELECT data FROM mera_records WHERE kind='ledger'")).rows.map(r=>r.data);
      for(const l of chargedLedgers) assert.equal(l.postings.reduce((n,p)=>n+p.debit-p.credit,0),0);
      const taxSale=chargedLedgers.find(l=>l.orderId===chargedOrder.data.id&&l.type==="sale_recognition");
      assert.equal(taxSale.postings.find(p=>p.account==="tax_payable").credit,1890);
      assert.equal(taxSale.postings.find(p=>p.account==="merchant_sales").credit,18900);
      await call(B+"/pricing-policy","PATCH",{enabled:false,approved:true,discount:null,serviceCharge:null,tax:null});
      const signup=await call("/identity/register","POST",{name:"Demo owner",email:"demo-owner@example.invalid",password:"FixtureTemporaryPassword!"},null);
      assert.equal(signup.status,201,JSON.stringify(signup.data));
      assert.equal(signup.data.emailSent,false);
      assert.equal((await call("/identity/verify","POST",{token:signup.data.verificationToken},null)).data.realEmailVerified,false);
      assert.equal((await call("/identity/verify","POST",{token:signup.data.verificationToken},null)).status,401);
      const expiredSignup=await call("/identity/register","POST",{name:"Expired demo",email:"expired-owner@example.invalid",password:"FixtureTemporaryPassword!"},null);
      await db.query("UPDATE mera_identity_challenges SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE token_hash=$1",[createHash("sha256").update(expiredSignup.data.verificationToken).digest("hex")]);
      assert.equal((await call("/identity/verify","POST",{token:expiredSignup.data.verificationToken},null)).status,401);
      const supportPath="/platform/organizations/"+org+"/lookup";
      const support=await call(supportPath,"POST",{reference:winner.order.reference,reason:"Investigate fixture transaction reference"},owner,"pos_session="+sessionA);
      assert.equal(support.status,200,JSON.stringify(support.data));
      assert.ok(support.data.records.some(r=>r.id===winner.order.id));
      assert.equal(support.data.customerIdentityIncluded,false);
      assert.ok(!JSON.stringify(support.data).includes("displayName"));
      const otherSupport=await call("/platform/organizations/"+foreignOrg.data.organizationId+"/lookup","POST",{reference:winner.order.reference,reason:"Verify foreign tenant reference isolation"},owner,"pos_session="+sessionA);
      assert.equal(otherSupport.status,200,JSON.stringify(otherSupport.data));
      assert.deepEqual(otherSupport.data.records,[]);
      assert.ok((await db.query("SELECT id FROM mera_platform_audit WHERE action='support_reference_lookup' AND organization_id=$1",[org])).rowCount>=1);
      const currentPolicy=(await db.query("SELECT policy FROM mera_organizations WHERE id=$1",[org])).rows[0].policy;
      const policyApprovalPath="/platform/organizations/"+org+"/policy-approval";
      assert.equal((await call(policyApprovalPath,"POST",{version:currentPolicy.version,reason:"Review unresolved proposed policy fixture"},owner,"pos_session="+sessionA)).status,409);
      const resolvedPolicy=await call("/organizations/"+org+"/policy","PATCH",{monthlyPrice:1350000,includedBranches:1,additionalBranchPrice:null,integratedFeeBps:10,feePayer:"merchant",feeBasis:"collection",refundTreatment:"return_fee",trialDays:14,graceDays:0});
      assert.equal(resolvedPolicy.status,200,JSON.stringify(resolvedPolicy.data));
      const approvedPolicy=await call(policyApprovalPath,"POST",{version:resolvedPolicy.data.version,reason:"Approve fully resolved fixture policy without live billing"},owner,"pos_session="+sessionA);
      assert.equal(approvedPolicy.status,200,JSON.stringify(approvedPolicy.data));
      assert.equal(approvedPolicy.data.policy.status,"approved");
      assert.equal(approvedPolicy.data.liveBillingEnabled,false);
      assert.equal(approvedPolicy.data.subscription.approvedPolicySnapshot.version,approvedPolicy.data.policy.version);
      assert.equal((await call(policyApprovalPath,"POST",{version:resolvedPolicy.data.version,reason:"Reject stale proposal version in fixture"},owner,"pos_session="+sessionA)).status,409);
      const laterProposal=await call("/organizations/"+org+"/policy","PATCH",{monthlyPrice:999999,includedBranches:1,additionalBranchPrice:null,integratedFeeBps:20,feePayer:"customer",feeBasis:"sales",refundTreatment:"retain_fee",trialDays:30,graceDays:365});
      assert.equal(laterProposal.status,200);
      const retainedApproval=(await db.query("SELECT subscription FROM mera_organizations WHERE id=$1",[org])).rows[0].subscription.approvedPolicySnapshot;
      assert.equal(retainedApproval.version,approvedPolicy.data.policy.version);
      const datesIntent={requestKey:randomUUID(),status:"active",reason:"Configure explicit subscription fixture schedule",trialEndsAt:"2026-01-01T00:00:00Z",paidThrough:"2099-01-01T00:00:00Z",dueAt:null};
      const dated=await call(subscriptionPath,"PATCH",datesIntent,owner,"pos_session="+sessionA);
      assert.equal(dated.status,200,JSON.stringify(dated.data));
      assert.equal(dated.data.subscription.paidThrough,datesIntent.paidThrough);
      assert.equal((await call(subscriptionPath,"PATCH",{...datesIntent,paidThrough:"2098-01-01T00:00:00Z"},owner,"pos_session="+sessionA)).status,409);
      const preserveDates=await call(subscriptionPath,"PATCH",{requestKey:randomUUID(),status:"active",reason:"Preserve previously configured dates fixture"},owner,"pos_session="+sessionA);
      assert.equal(preserveDates.data.subscription.trialEndsAt,datesIntent.trialEndsAt);
      assert.equal(preserveDates.data.subscription.paidThrough,datesIntent.paidThrough);
      assert.equal(preserveDates.data.subscription.dueAt,null);
      const expiredTrial=await call(subscriptionPath,"PATCH",{requestKey:randomUUID(),status:"trialing",trialEndsAt:new Date(Date.now()-86400000).toISOString(),reason:"Verify expired approved trial restriction"},owner,"pos_session="+sessionA);
      assert.equal(expiredTrial.status,200);
      assert.equal((await call(B+"/orders","POST",{...chargedIntent,requestKey:randomUUID()})).data.code,"SUBSCRIPTION_RESTRICTED");
      await call(subscriptionPath,"PATCH",{requestKey:randomUUID(),status:"active",paidThrough:"2099-01-01T00:00:00Z",reason:"Restore explicit active fixture subscription"},owner,"pos_session="+sessionA);
      const snapshotOrder=await call(B+"/orders","POST",{...chargedIntent,requestKey:randomUUID()});
      assert.equal(snapshotOrder.status,201,JSON.stringify(snapshotOrder.data));
      assert.equal(snapshotOrder.data.financialPolicy.version,approvedPolicy.data.policy.version);
      assert.equal(snapshotOrder.data.financialPolicy.integratedFeeBps,10);
      const financialLookup=B+"/financial-requests/";
      const foundMovement=await call(financialLookup+cashIntent.requestKey);
      assert.equal(foundMovement.status,200,JSON.stringify(foundMovement.data));
      assert.equal(foundMovement.data.status,"recorded");
      assert.equal(foundMovement.data.kind,"cash_movement");
      assert.deepEqual(Object.keys(foundMovement.data).sort(),["id","kind","status"]);
      assert.equal((await call(financialLookup+linkedRefund.data.requestKey)).data.kind,"refund");
      assert.equal((await call(financialLookup+cancelIntent.requestKey)).data.kind,"item_cancellation");
      assert.equal((await call(financialLookup+randomUUID())).data.status,"not_found");
      await db.query("INSERT INTO mera_memberships(id,user_id,organization_id,role,permissions,branch_ids) VALUES($1,$2,$3,'cashier',$4,$5) ON CONFLICT(user_id,organization_id) DO UPDATE SET permissions=EXCLUDED.permissions,active=true",[randomUUID(),other,org,JSON.stringify(["payments.record","shifts.manage","orders.view","orders.create"]),JSON.stringify([branch])]);
      assert.equal((await call(financialLookup+cashIntent.requestKey,"GET",undefined,other)).data.status,"not_found");
      assert.equal((await call(foreignBase+"/financial-requests/"+cashIntent.requestKey)).data.status,"not_found");
      const cashierContext=await call("/context","GET",undefined,other);
      const cashierOrg=cashierContext.data.organizations.find(o=>o.id===org);
      assert.equal(cashierOrg.policy,null);
      assert.equal(cashierOrg.subscription.approvedPolicySnapshot,undefined);
      const cashierWorkspace=await call(B+"/workspace","GET",undefined,other);
      assert.equal(cashierWorkspace.status,200,JSON.stringify(cashierWorkspace.data));
      assert.equal(cashierWorkspace.data.policy,null);
      assert.equal(cashierWorkspace.data.subscription.approvedPolicySnapshot,undefined);
      const cashierSeen=cashierWorkspace.data.orders.find(o=>o.id===snapshotOrder.data.id);
      assert.equal(cashierSeen.total,20000);
      assert.equal(cashierSeen.financialPolicy,undefined);
      assert.equal(cashierSeen.policyVersion,undefined);
      assert.equal(cashierSeen.pricing.total,20000);
      const cashierCreated=await call(B+"/orders","POST",{...chargedIntent,requestKey:randomUUID()},other);
      assert.equal(cashierCreated.status,201,JSON.stringify(cashierCreated.data));
      assert.equal(cashierCreated.data.financialPolicy,undefined);
      assert.equal(cashierCreated.data.policyVersion,undefined);
      const cashierPayment=await call(B+"/orders/"+snapshotOrder.data.id+"/payments","POST",{requestKey:randomUUID(),amount:20000,method:"cash"},other);
      assert.equal(cashierPayment.status,200,JSON.stringify(cashierPayment.data));
      assert.equal(cashierPayment.data.amount,20000);
      assert.equal(cashierPayment.data.financialPolicy,undefined);
      assert.equal(cashierPayment.data.policyVersion,undefined);
      const abandonedCashKey=randomUUID(),cashPath=B+"/shifts/"+cashShift.id+"/movements";
      const abandonCash=await call(financialLookup+abandonedCashKey+"/abandon","POST",{kind:"cash_movement",reason:"Fence uncertain cash fixture before retry"});
      assert.equal(abandonCash.data.status,"abandoned");
      assert.equal((await call(cashPath,"POST",{...cashIntent,requestKey:abandonedCashKey})).data.code,"REQUEST_ABANDONED");
      assert.equal((await call(financialLookup+abandonedCashKey)).data.status,"abandoned");
      assert.equal((await db.query("SELECT id FROM mera_records WHERE kind='cash_movement' AND data->>'requestKey'=$1",[abandonedCashKey])).rowCount,0);
      assert.equal((await call(financialLookup+cashIntent.requestKey+"/abandon","POST",{kind:"cash_movement",reason:"Already committed fixture must retain recorded outcome"})).data.status,"recorded");
      const racingCashKey=randomUUID();
      const racingCash=await Promise.all([call(cashPath,"POST",{...cashIntent,requestKey:racingCashKey}),call(financialLookup+racingCashKey+"/abandon","POST",{kind:"cash_movement",reason:"Race cash fixture write against safe abandonment"})]);
      const racingCashCount=(await db.query("SELECT id FROM mera_records WHERE kind='cash_movement' AND data->>'requestKey'=$1",[racingCashKey])).rowCount;
      assert.ok(racingCashCount===0||racingCashCount===1);
      assert.equal(racingCash[1].data.status,racingCashCount?"recorded":"abandoned");
      assert.equal(racingCash[0].status,racingCashCount?200:409);
      const racingPaymentKey=randomUUID();
      const racingPayment=await Promise.all([call(B+"/orders/"+cashierCreated.data.id+"/payments","POST",{requestKey:racingPaymentKey,amount:20000,method:"cash"},other),call(financialLookup+racingPaymentKey+"/abandon","POST",{kind:"payment",reason:"Fence uncertain payment fixture atomically"},other)]);
      const racingPaymentRows=(await db.query("SELECT id FROM mera_records WHERE kind='payment' AND data->>'requestKey'=$1",[racingPaymentKey])).rows;
      assert.ok(racingPaymentRows.length<=1);
      assert.equal(racingPayment[1].data.status,racingPaymentRows.length?"recorded":"abandoned");
      const racedPaid=(await db.query("SELECT data FROM mera_records WHERE id=$1",[cashierCreated.data.id])).rows[0].data.paid;
      assert.equal(racedPaid,racingPaymentRows.length?20000:0);
      const abandonedRefundKey=randomUUID();
      assert.equal((await call(financialLookup+abandonedRefundKey+"/abandon","POST",{kind:"refund",reason:"Fence approved refund fixture before unsafe retry"})).data.status,"abandoned");
      assert.equal((await call(B+"/orders/"+chargedOrder.data.id+"/refunds","POST",{requestKey:abandonedRefundKey,amount:1000,method:"cash",reason:"Delayed refund fixture intent"})).data.code,"REQUEST_ABANDONED");
      const tombstoneBooking=await call(B+"/reservations","POST",{...reservation,requestKey:randomUUID(),startsAt:new Date(Date.now()+9*86400000).toISOString(),endsAt:new Date(Date.now()+9*86400000+3600000).toISOString(),partySize:1});
      assert.equal(tombstoneBooking.status,201,JSON.stringify(tombstoneBooking.data));
      const abandonedDepositKey=randomUUID();
      await call(financialLookup+abandonedDepositKey+"/abandon","POST",{kind:"deposit",reason:"Fence reservation deposit fixture intent"});
      assert.equal((await call(B+"/reservations/"+tombstoneBooking.data.id+"/deposits","POST",{requestKey:abandonedDepositKey,amount:100000,method:"cash"})).data.code,"REQUEST_ABANDONED");
      const tombstoneOrder=await call(B+"/orders","POST",{...chargedIntent,requestKey:randomUUID()});
      assert.equal(tombstoneOrder.status,201,JSON.stringify(tombstoneOrder.data));
      const abandonedCancelKey=randomUUID();
      await call(financialLookup+abandonedCancelKey+"/abandon","POST",{kind:"item_cancellation",reason:"Fence uncertain item cancellation fixture"});
      assert.equal((await call(B+"/orders/"+tombstoneOrder.data.id+"/items/"+tombstoneOrder.data.items[0].orderLineId+"/cancel","POST",{requestKey:abandonedCancelKey,quantity:1,version:1,reason:"Delayed cancellation fixture intent"})).data.code,"REQUEST_ABANDONED");
      const tombstoneRow=(await db.query("SELECT id FROM mera_records WHERE kind='financial_request_resolution' AND data->>'requestKey'=$1",[abandonedCashKey])).rows[0];
      await assert.rejects(db.query("DELETE FROM mera_records WHERE id=$1",[tombstoneRow.id]),/append-only/i);
      await call(B+"/stock","POST",{productId:sized.data.id,variantId:"large",quantity:5,reason:"Reviewed repricing fixture stock"});
      const reviewedPolicy={enabled:true,approved:true,discount:{label:"Original fixed discount",type:"fixed",value:10000},serviceCharge:{label:"Original service",basisPoints:500},tax:{label:"Original tax",basisPoints:1000,basis:"net_items_and_service"}};
      assert.equal((await call(B+"/pricing-policy","PATCH",reviewedPolicy)).status,200);
      const reviewedItems=[{productId:sized.data.id,variantId:"large",quantity:2,modifiers:[]}];
      const reviewedOrderQuote=await call(B+"/quote","POST",{menuVersion:latestVersion,items:reviewedItems});
      assert.equal(reviewedOrderQuote.data.total,34650);
      const reviewedOrder=await call(B+"/orders","POST",{requestKey:randomUUID(),menuVersion:latestVersion,quoteId:reviewedOrderQuote.data.id,displayName:"Reviewed cancellation fixture",items:reviewedItems});
      assert.equal(reviewedOrder.status,201,JSON.stringify(reviewedOrder.data));
      const reviewedBill=(await db.query("SELECT data FROM mera_records WHERE kind='bill' AND data->'charges' @> $1::jsonb",[JSON.stringify([{orderId:reviewedOrder.data.id}])])).rows[0].data;
      assert.equal((await call(B+"/bills/"+reviewedBill.id+"/split","POST",{name:"Reviewed split portion",amount:10000})).status,200);
      assert.equal((await call(B+"/orders/"+reviewedOrder.data.id+"/payments","POST",{requestKey:randomUUID(),method:"cash",amount:34650})).status,200);
      let reviewedCanonical=(await db.query("SELECT data FROM mera_records WHERE id=$1",[reviewedOrder.data.id])).rows[0].data;
      await call(B+"/orders/"+reviewedOrder.data.id+"/status","POST",{status:"accepted",version:reviewedCanonical.version});
      const reviewedTicket=(await db.query("SELECT data FROM mera_records WHERE kind='ticket' AND data->>'orderId'=$1",[reviewedOrder.data.id])).rows[0].data;
      assert.equal((await call(B+"/tickets/"+reviewedTicket.id+"/items/"+reviewedTicket.items[0].orderLineId,"POST",{preparedQuantity:1,version:1})).status,200);
      await call(B+"/pricing-policy","PATCH",{enabled:true,approved:true,discount:null,serviceCharge:null,tax:null});
      reviewedCanonical=(await db.query("SELECT data FROM mera_records WHERE id=$1",[reviewedOrder.data.id])).rows[0].data;
      const reviewedCancelPath=B+"/orders/"+reviewedOrder.data.id+"/items/"+reviewedOrder.data.items[0].orderLineId;
      const reviewQuote=await call(reviewedCancelPath+"/cancel-quote","POST",{quantity:1,version:reviewedCanonical.version});
      assert.equal(reviewQuote.status,201,JSON.stringify(reviewQuote.data));
      assert.equal(reviewQuote.data.previousTotal,34650);
      assert.equal(reviewQuote.data.newTotal,11550);
      assert.equal(reviewQuote.data.creditRequired,23100);
      assert.equal(reviewQuote.data.refundTaxAmount,2100);
      assert.equal(reviewQuote.data.pricing.discount,10000);
      const reviewedRefund=await call(B+"/orders/"+reviewedOrder.data.id+"/refunds","POST",{requestKey:randomUUID(),method:"cash",amount:23100,reason:"Approved original-policy reviewed cancellation return",cancellationQuoteId:reviewQuote.data.id});
      assert.equal(reviewedRefund.status,200,JSON.stringify(reviewedRefund.data));
      assert.equal(reviewedRefund.data.taxAmount,2100);
      assert.equal((await call(B+"/orders/"+reviewedOrder.data.id+"/refunds","POST",{requestKey:randomUUID(),method:"cash",amount:23100,reason:"Prevent duplicate reviewed quote refund",cancellationQuoteId:reviewQuote.data.id})).status,409);
      reviewedCanonical=(await db.query("SELECT data FROM mera_records WHERE id=$1",[reviewedOrder.data.id])).rows[0].data;
      const reviewedCancelIntent={requestKey:randomUUID(),quantity:1,version:reviewedCanonical.version,reason:"Apply original-policy reviewed partial cancellation",cancellationQuoteId:reviewQuote.data.id,refundAllocations:[{refundId:reviewedRefund.data.id,amount:23100}]};
      const reviewedCancelled=await call(reviewedCancelPath+"/cancel","POST",reviewedCancelIntent);
      assert.equal(reviewedCancelled.status,200,JSON.stringify(reviewedCancelled.data));
      assert.equal(reviewedCancelled.data.order.total,11550);
      assert.equal(reviewedCancelled.data.order.pricing.tax,1050);
      assert.equal(reviewedCancelled.data.order.pricing.serviceCharge,500);
      assert.equal(reviewedCancelled.data.order.recognitionPricing.tax,3150);
      assert.equal(reviewedCancelled.data.order.recognitionTotal,34650);
      assert.equal(reviewedCancelled.data.order.effectivePaid,11550);
      assert.equal((await call(reviewedCancelPath+"/cancel","POST",reviewedCancelIntent)).status,200);
      const repricedBills=(await db.query("SELECT data FROM mera_records WHERE kind='bill' AND data->'charges' @> $1::jsonb",[JSON.stringify([{orderId:reviewedOrder.data.id}])])).rows.map(r=>r.data);
      assert.equal(repricedBills.reduce((n,b)=>n+b.charges.filter(l=>l.orderId===reviewedOrder.data.id).reduce((v,l)=>v+l.amount,0),0),11550);
      assert.equal(repricedBills.reduce((n,b)=>n+b.allocations.filter(l=>l.orderId===reviewedOrder.data.id).reduce((v,l)=>v+l.amount,0),0),11550);
      assert.equal((await db.query("SELECT data FROM mera_records WHERE id=$1",[sized.data.id])).rows[0].data.variants[0].stock,4);
      assert.equal((await call(B+"/orders/"+reviewedOrder.data.id+"/status","POST",{status:"collected",version:reviewedCancelled.data.order.version})).status,200);
      const reviewedSale=(await db.query("SELECT data FROM mera_records WHERE kind='ledger' AND data->>'orderId'=$1 AND data->>'type'='sale_recognition'",[reviewedOrder.data.id])).rows[0].data;
      assert.equal(reviewedSale.postings.find(p=>p.account==="tax_payable"&&p.credit>0).credit,3150);
      assert.equal(reviewedSale.postings.find(p=>p.account==="tax_payable"&&p.debit>0).debit,2100);
      assert.equal(reviewedSale.postings.reduce((n,p)=>n+p.debit-p.credit,0),0);
      await call(B+"/pricing-policy","PATCH",{enabled:false,approved:true,discount:null,serviceCharge:null,tax:null});
      await call(B+"/pricing-policy","PATCH",reviewedPolicy);
      const quoteCredentialA=await call(B+"/integration-credentials","POST",{name:"Quoted simulator A",scopes:["published_menu.read","orders.create","orders.read"]});
      const quoteCredentialB=await call(B+"/integration-credentials","POST",{name:"Quoted simulator B",scopes:["published_menu.read","orders.create"]});
      const quoteHeadersA={authorization:"Bearer "+quoteCredentialA.data.token},quoteHeadersB={authorization:"Bearer "+quoteCredentialB.data.token};
      const machinePricingMenu=await call("/integrations/zidi/v1/menu","GET",undefined,null,"",quoteHeadersA);
      assert.equal(machinePricingMenu.status,200,JSON.stringify(machinePricingMenu.data));
      assert.equal(machinePricingMenu.data.contractVersion,"1.1.0");
      assert.equal(machinePricingMenu.data.pricingPolicyRequired,true);
      assert.equal(machinePricingMenu.data.capabilities.outboundEvents.state,"blocked");
      assert.equal(machinePricingMenu.data.products.find(p=>p.id===sized.data.id).variants[0].stock,4);
      const machineQuoteItems=[{productId:sized.data.id,variantId:"large",quantity:1,modifiers:[]}];
      const staffOnlyQuote=await call(B+"/quote","POST",{menuVersion:latestVersion,items:machineQuoteItems});
      const machineQuotedIntent={requestKey:randomUUID(),menuVersion:latestVersion,displayName:"Quoted machine fixture",items:machineQuoteItems};
      assert.equal((await call("/integrations/zidi/v1/orders","POST",{...machineQuotedIntent,quoteId:staffOnlyQuote.data.id},null,"",quoteHeadersA)).data.code,"QUOTE_CHANGED");
      const boundMachineQuote=await call("/integrations/zidi/v1/quote","POST",{menuVersion:latestVersion,items:machineQuoteItems},null,"",quoteHeadersA);
      assert.equal(boundMachineQuote.status,201,JSON.stringify(boundMachineQuote.data));
      assert.equal(boundMachineQuote.data.quote.total,11550);
      assert.equal((await call("/integrations/zidi/v1/orders","POST",{...machineQuotedIntent,quoteId:boundMachineQuote.data.quote.id},null,"",quoteHeadersB)).data.code,"QUOTE_CHANGED");
      const quotedMachineOrder=await call("/integrations/zidi/v1/orders","POST",{...machineQuotedIntent,quoteId:boundMachineQuote.data.quote.id},null,"",quoteHeadersA);
      assert.equal(quotedMachineOrder.status,201,JSON.stringify(quotedMachineOrder.data));
      assert.equal(quotedMachineOrder.data.order.total,11550);
      assert.equal(quotedMachineOrder.data.order.pricing.tax,1050);
      await db.query("UPDATE mera_records SET data=jsonb_set(data,'{expiresAt}',to_jsonb('2020-01-01T00:00:00Z'::text)) WHERE id=$1",[boundMachineQuote.data.quote.id]);
      assert.equal((await call("/integrations/zidi/v1/orders","POST",{...machineQuotedIntent,quoteId:boundMachineQuote.data.quote.id},null,"",quoteHeadersA)).data.order.id,quotedMachineOrder.data.order.id);
      await call(B+"/integration-credentials/"+quoteCredentialA.data.id,"DELETE");
      assert.equal((await call("/integrations/zidi/v1/quote","POST",{menuVersion:latestVersion,items:machineQuoteItems},null,"",quoteHeadersA)).status,403);
      await call(B+"/pricing-policy","PATCH",{enabled:false,approved:true,discount:null,serviceCharge:null,tax:null});
      const categoryRoot=await call(B+"/categories","POST",{name:"Beverages",sortOrder:1});
      const categoryLeaf=await call(B+"/categories","POST",{name:"Bubble tea",parentId:categoryRoot.data.id,sortOrder:2});
      assert.equal(categoryLeaf.status,201,JSON.stringify(categoryLeaf.data));
      let categoryProduct=(await db.query("SELECT data FROM mera_records WHERE id=$1",[sized.data.id])).rows[0].data;
      const categoryBound=await call(B+"/products/"+sized.data.id,"PUT",{...categoryProduct,categoryId:categoryLeaf.data.id});
      assert.equal(categoryBound.status,200,JSON.stringify(categoryBound.data));
      assert.equal(categoryBound.data.category,"Bubble tea");
      assert.deepEqual(categoryBound.data.categoryPath.map(c=>c.name),["Beverages","Bubble tea"]);
      assert.equal((await call(B+"/menu/publish","POST",{})).status,200);
      const categoryPublished=(await call(P+"/menu","GET",undefined,null)).data;
      assert.equal(categoryPublished.categories.find(c=>c.id===categoryLeaf.data.id).name,"Bubble tea");
      assert.equal((await call(B+"/categories/"+categoryLeaf.data.id,"PATCH",{version:1,name:"Draft renamed tea"})).status,200);
      const unchangedCategoryMenu=(await call(P+"/menu","GET",undefined,null)).data;
      assert.equal(unchangedCategoryMenu.categories.find(c=>c.id===categoryLeaf.data.id).name,"Bubble tea");
      assert.equal(unchangedCategoryMenu.products.find(p=>p.id===sized.data.id).category,"Bubble tea");
      assert.equal((await call(B+"/categories/"+categoryRoot.data.id,"PATCH",{version:1,parentId:categoryLeaf.data.id})).status,409);
      assert.equal((await call(B+"/categories/"+categoryLeaf.data.id,"PATCH",{version:2,active:false})).status,409);
      const foreignCategory=(await call(foreignBase+"/categories","POST",{name:"Foreign scoped category"})).data;
      assert.equal((await call(B+"/products/"+sized.data.id,"PUT",{...categoryBound.data,categoryId:foreignCategory.id})).status,409);
      const republishedCategory=await call(B+"/menu/publish","POST",{});
      assert.equal((await call(P+"/menu","GET",undefined,null)).data.products.find(p=>p.id===sized.data.id).category,"Draft renamed tea");
      assert.equal((await call(B+"/products/availability","POST",{productIds:[sized.data.id],available:false,reason:"Pause item fixture availability"})).status,200);
      assert.equal((await call(B+"/products/availability","POST",{productIds:[sized.data.id,randomUUID()],available:true,reason:"Reject partial invalid availability batch"})).status,404);
      assert.equal((await db.query("SELECT data FROM mera_records WHERE id=$1",[sized.data.id])).rows[0].data.available,false);
      await call(B+"/products/availability","POST",{productIds:[sized.data.id],available:true,reason:"Resume fixture item availability"});
      assert.ok((await call(B+"/workspace")).data.lowStockAlerts.some(a=>a.productId===sized.data.id&&a.variantId==="large"));
      await call(B+"/stock","POST",{productId:sized.data.id,variantId:"large",quantity:4,reason:"Partial fulfillment fixture stock"});
      const partialHandoffOrder=await call(B+"/orders","POST",{requestKey:randomUUID(),menuVersion:republishedCategory.data.version,displayName:"Partial handoff fixture",items:[{productId:sized.data.id,variantId:"large",quantity:2,modifiers:[]}]});
      assert.equal(partialHandoffOrder.status,201,JSON.stringify(partialHandoffOrder.data));
      await call(B+"/orders/"+partialHandoffOrder.data.id+"/status","POST",{status:"accepted",version:1});
      const handoffTicket=(await db.query("SELECT data FROM mera_records WHERE kind='ticket' AND data->>'orderId'=$1",[partialHandoffOrder.data.id])).rows[0].data;
      const handoffPrepared=await call(B+"/tickets/"+handoffTicket.id+"/items/"+handoffTicket.items[0].orderLineId,"POST",{preparedQuantity:1,version:1});
      const handoffLinePath=B+"/orders/"+partialHandoffOrder.data.id+"/items/"+partialHandoffOrder.data.items[0].orderLineId;
      const handoffIntent={requestKey:randomUUID(),version:handoffPrepared.data.order.version,fulfilledQuantity:1};
      const handed=await call(handoffLinePath+"/fulfillment","POST",handoffIntent);
      assert.equal(handed.status,200,JSON.stringify(handed.data));
      assert.equal(handed.data.allItemsHandedOver,false);
      assert.equal((await call(handoffLinePath+"/fulfillment","POST",handoffIntent)).status,200);
      assert.equal((await call(handoffLinePath+"/fulfillment","POST",{...handoffIntent,requestKey:randomUUID()})).status,409);
      assert.equal((await call(handoffLinePath+"/fulfillment","POST",{requestKey:randomUUID(),version:handed.data.version,fulfilledQuantity:2})).status,409);
      assert.equal((await db.query("SELECT id FROM mera_records WHERE kind='ledger' AND data->>'orderId'=$1 AND data->>'type'='sale_recognition'",[partialHandoffOrder.data.id])).rowCount,0);
      assert.equal((await call(handoffLinePath+"/cancel","POST",{requestKey:randomUUID(),version:handed.data.version,quantity:2,reason:"Reject cancelling handed over or prepared units"})).status,409);
      const handoffCancel=await call(handoffLinePath+"/cancel","POST",{requestKey:randomUUID(),version:handed.data.version,quantity:1,reason:"Cancel remaining unprepared unit"});
      assert.equal(handoffCancel.status,200,JSON.stringify(handoffCancel.data));
      const handoffCollected=await call(B+"/orders/"+partialHandoffOrder.data.id+"/status","POST",{status:"collected",version:handoffCancel.data.order.version});
      assert.equal(handoffCollected.status,200,JSON.stringify(handoffCollected.data));
      assert.equal(handoffCollected.data.items[0].fulfilledQuantity,1);
      assert.equal(handoffCollected.data.status,"collected");
      const guestHelpBody={requestKey:randomUUID(),category:"payment",orderId:winner.order.id,message:"Please clarify this fixture payment receipt"};
      const guestHelp=await call(P+"/help-requests","POST",guestHelpBody,null,winner.cookie);
      assert.equal(guestHelp.status,201,JSON.stringify(guestHelp.data));
      assert.equal(guestHelp.data.externalDelivery,false);
      assert.equal((await call(P+"/help-requests","POST",guestHelpBody,null,winner.cookie)).data.id,guestHelp.data.id);
      const otherGuestCookie=winner.cookie===g1?g2:g1;
      assert.equal((await call(P+"/help-requests","POST",{...guestHelpBody,requestKey:randomUUID()},null,otherGuestCookie)).status,404);
      assert.ok(!(await call(P+"/help-requests","GET",undefined,null,otherGuestCookie)).data.requests.some(r=>r.id===guestHelp.data.id));
      const helped=await call(B+"/help-requests/"+guestHelp.data.id,"PATCH",{status:"resolved",customerReply:"Your receipt is recorded",internalNote:"Private staff fixture note"},other);
      assert.equal(helped.status,200,JSON.stringify(helped.data));
      const ownHelp=(await call(P+"/help-requests","GET",undefined,null,winner.cookie)).data.requests.find(r=>r.id===guestHelp.data.id);
      assert.equal(ownHelp.status,"resolved");
      assert.equal(ownHelp.internalNote,undefined);
      assert.equal(ownHelp.internalNotes,undefined);
      const freeProduct=await call(B+"/products","POST",{name:"Complimentary fixture",code:"FREE1",category:"Tests",price:0});
      assert.equal(freeProduct.status,201,JSON.stringify(freeProduct.data));
      const freePublication=await call(B+"/menu/publish","POST",{});
      await call(B+"/pricing-policy","PATCH",{enabled:true,approved:true,discount:null,serviceCharge:null,tax:null});
      const freeItems=[{productId:sized.data.id,variantId:"large",quantity:1,modifiers:[]},{productId:freeProduct.data.id,quantity:1,modifiers:[]}];
      const freeQuote=await call(B+"/quote","POST",{menuVersion:freePublication.data.version,items:freeItems});
      const mixedFreeOrder=await call(B+"/orders","POST",{requestKey:randomUUID(),menuVersion:freePublication.data.version,quoteId:freeQuote.data.id,displayName:"Zero credit fixture",items:freeItems});
      assert.equal(mixedFreeOrder.status,201,JSON.stringify(mixedFreeOrder.data));
      assert.equal((await call(B+"/orders/"+mixedFreeOrder.data.id+"/payments","POST",{requestKey:randomUUID(),method:"cash",amount:20000})).status,200);
      const freeCanonical=(await db.query("SELECT data FROM mera_records WHERE id=$1",[mixedFreeOrder.data.id])).rows[0].data;
      const freeLine=freeCanonical.items.find(i=>i.productId===freeProduct.data.id),freeCancelPath=B+"/orders/"+freeCanonical.id+"/items/"+freeLine.orderLineId;
      const zeroCreditQuote=await call(freeCancelPath+"/cancel-quote","POST",{quantity:1,version:freeCanonical.version});
      assert.equal(zeroCreditQuote.data.creditRequired,0);
      const refundsBeforeZero=(await db.query("SELECT id FROM mera_records WHERE kind='refund'")).rowCount;
      const zeroCreditCancel=await call(freeCancelPath+"/cancel","POST",{requestKey:randomUUID(),quantity:1,version:freeCanonical.version,reason:"Cancel complimentary unprepared item without a payout",cancellationQuoteId:zeroCreditQuote.data.id,refundAllocations:[]});
      assert.equal(zeroCreditCancel.status,200,JSON.stringify(zeroCreditCancel.data));
      assert.equal(zeroCreditCancel.data.order.total,20000);
      assert.equal(zeroCreditCancel.data.order.effectivePaid,20000);
      assert.equal((await db.query("SELECT id FROM mera_records WHERE kind='refund'")).rowCount,refundsBeforeZero);
      await call(B+"/pricing-policy","PATCH",{enabled:false,approved:true,discount:null,serviceCharge:null,tax:null});
      const approvedInvoice=await call("/organizations/"+org+"/invoices","POST",{requestKey:randomUUID(),periodStart:"2026-12-01T00:00:00Z",periodEnd:"2027-01-01T00:00:00Z"});
      assert.equal(approvedInvoice.status,201,JSON.stringify(approvedInvoice.data));
      assert.equal(approvedInvoice.data.amount,1350000);
      assert.equal(approvedInvoice.data.policySnapshot.version,approvedPolicy.data.policy.version);
      assert.equal(approvedInvoice.data.policySnapshot.status,"approved");
      assert.equal(approvedInvoice.data.policyBasis,"approved_subscription");
      assert.equal(approvedInvoice.data.notCharged,true);
      assert.equal((await db.query("SELECT policy FROM mera_organizations WHERE id=$1",[org])).rows[0].policy.monthlyPrice,999999);
      const historicalOrderId=randomUUID(),historicalLineId=randomUUID();
      const historicalOrder={id:historicalOrderId,reference:"LEGACY-READONLY",historicalReadOnly:true,historicalRecognitionBasis:"legacy_paid_basis",historicalRecognitionAt:new Date().toISOString(),historicalTaxStatus:"unresolved_source_tax_breakdown",status:"accepted",total:500000,paid:500000,refunded:0,version:1,stockHeld:false,holdExpired:false,guestId:null,items:[{orderLineId:historicalLineId,productId:sized.data.id,quantity:1,unitPrice:500000,total:500000,name:"Original historical fixture item",station:"bar"}],history:[],createdAt:new Date().toISOString()};
      await db.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'order',$4)",[historicalOrderId,org,branch,JSON.stringify(historicalOrder)]);
      const historicalBefore=(await db.query("SELECT data FROM mera_records WHERE id=$1",[historicalOrderId])).rows[0].data;
      assert.equal((await call(B+"/orders/"+historicalOrderId+"/status","POST",{status:"preparing",version:1})).data.code,"HISTORICAL_READ_ONLY");
      assert.equal((await call(B+"/orders/"+historicalOrderId+"/payments","POST",{requestKey:randomUUID(),method:"cash",amount:1000})).data.code,"HISTORICAL_READ_ONLY");
      assert.equal((await call(B+"/orders/"+historicalOrderId+"/refunds","POST",{requestKey:randomUUID(),method:"cash",amount:1000,reason:"Reject modifying imported historical money"})).data.code,"HISTORICAL_READ_ONLY");
      assert.equal((await call(B+"/orders/"+historicalOrderId+"/items/"+historicalLineId+"/cancel","POST",{requestKey:randomUUID(),quantity:1,version:1,reason:"Reject imported historical cancellation"})).data.code,"HISTORICAL_READ_ONLY");
      await assert.rejects(db.query("UPDATE mera_records SET data=data-'historicalReadOnly' WHERE id=$1",[historicalOrderId]),/historical.*read-only/i);
      await assert.rejects(db.query("DELETE FROM mera_records WHERE id=$1",[historicalOrderId]),/historical.*read-only/i);
      assert.deepEqual((await db.query("SELECT data FROM mera_records WHERE id=$1",[historicalOrderId])).rows[0].data,historicalBefore);
      const destinationBranch=randomUUID(),destinationBase="/organizations/"+org+"/branches/"+destinationBranch;
      await db.query("INSERT INTO mera_branches(id,organization_id,name,settings) VALUES($1,$2,'Destination fixture',$3)",[destinationBranch,org,JSON.stringify({orderingPaused:false})]);
      const structuredShared=await call("/organizations/"+org+"/menus","POST",{name:"Category portable fixture",items:[{...categoryBound.data,image:"",categoryId:categoryLeaf.data.id}]});
      assert.equal(structuredShared.status,201,JSON.stringify(structuredShared.data));
      assert.equal(structuredShared.data.items[0].categoryId,null);
      const portableApply=await call(destinationBase+"/menu/shared-use","POST",{menuId:structuredShared.data.id,version:1,overrides:[]});
      assert.equal(portableApply.status,200,JSON.stringify(portableApply.data));
      const portableMenu=(await call("/public/bing-chun/"+destinationBranch+"/menu","GET",undefined,null)).data;
      assert.equal(portableMenu.products[0].categoryId,null);
      assert.deepEqual(portableMenu.categories,[]);
      assert.equal((await call(destinationBase+"/menu/shared-use","POST",{menuId:structuredShared.data.id,version:1,overrides:[{code:"SIZE1",categoryId:categoryLeaf.data.id}]})).status,409);
      const destinationCategory=await call(destinationBase+"/categories","POST",{name:"Local destination category"});
      assert.equal((await call(destinationBase+"/menu/shared-use","POST",{menuId:structuredShared.data.id,version:1,overrides:[{code:"SIZE1",categoryId:destinationCategory.data.id}]})).status,200);
      const mappedMenu=(await call("/public/bing-chun/"+destinationBranch+"/menu","GET",undefined,null)).data;
      assert.equal(mappedMenu.products[0].categoryId,destinationCategory.data.id);
      assert.equal(mappedMenu.products[0].category,"Local destination category");
      assert.ok(!mappedMenu.categories.some(c=>c.id===categoryLeaf.data.id));
      const writeoffOrderId=partialHandoffOrder.data.id,writeoffPath=B+"/orders/"+writeoffOrderId+"/writeoffs";
      const reportBeforeWriteoff=(await call(B+"/workspace")).data.report;
      const stockBeforeWriteoff=(await db.query("SELECT data FROM mera_records WHERE id=$1",[sized.data.id])).rows[0].data.variants[0].stock;
      let writeoffCanonical=(await db.query("SELECT data FROM mera_records WHERE id=$1",[writeoffOrderId])).rows[0].data;
      const writeoffIntent={requestKey:randomUUID(),version:writeoffCanonical.version,amount:5000,reason:"Approve partial uncollectible fixture receivable"};
      assert.equal((await call(writeoffPath,"POST",writeoffIntent,other)).status,403);
      const firstWriteoff=await call(writeoffPath,"POST",writeoffIntent);
      assert.equal(firstWriteoff.status,200,JSON.stringify(firstWriteoff.data));
      assert.equal((await call(writeoffPath,"POST",writeoffIntent)).data.id,firstWriteoff.data.id);
      assert.equal((await call(writeoffPath,"POST",{...writeoffIntent,amount:4000})).status,409);
      writeoffCanonical=(await db.query("SELECT data FROM mera_records WHERE id=$1",[writeoffOrderId])).rows[0].data;
      assert.equal(writeoffCanonical.paid,0);
      assert.equal(writeoffCanonical.writtenOff,5000);
      assert.equal(writeoffCanonical.outstandingBalance,15000);
      assert.equal((await call(B+"/orders/"+writeoffOrderId+"/status","POST",{status:"completed",version:writeoffCanonical.version})).status,409);
      assert.equal((await call(writeoffPath,"POST",{requestKey:randomUUID(),version:writeoffCanonical.version,amount:20000,reason:"Reject writeoff above remaining receivable"})).status,409);
      assert.equal((await call(B+"/orders/"+writeoffOrderId+"/payments","POST",{requestKey:randomUUID(),amount:5000,method:"cash"})).status,200);
      writeoffCanonical=(await db.query("SELECT data FROM mera_records WHERE id=$1",[writeoffOrderId])).rows[0].data;
      const finalWriteoff=await call(writeoffPath,"POST",{requestKey:randomUUID(),version:writeoffCanonical.version,amount:10000,reason:"Approve remaining uncollectible fixture balance"});
      assert.equal(finalWriteoff.status,200,JSON.stringify(finalWriteoff.data));
      writeoffCanonical=(await db.query("SELECT data FROM mera_records WHERE id=$1",[writeoffOrderId])).rows[0].data;
      assert.equal(writeoffCanonical.paid,5000);
      assert.equal(writeoffCanonical.writtenOff,15000);
      assert.equal(writeoffCanonical.outstandingBalance,0);
      assert.equal(writeoffCanonical.paymentStatus,"partially_paid");
      assert.equal(writeoffCanonical.settlementOutcome,"settled_with_writeoff");
      assert.equal((await call(B+"/orders/"+writeoffOrderId+"/payments","POST",{requestKey:randomUUID(),amount:1,method:"cash"})).status,409);
      assert.equal((await call(B+"/orders/"+writeoffOrderId+"/status","POST",{status:"completed",version:writeoffCanonical.version})).status,200);
      const reportAfterWriteoff=(await call(B+"/workspace")).data.report;
      assert.equal(reportAfterWriteoff.netSales,reportBeforeWriteoff.netSales);
      assert.equal(reportAfterWriteoff.collections,reportBeforeWriteoff.collections+5000);
      assert.equal(reportAfterWriteoff.writeOffs,reportBeforeWriteoff.writeOffs+15000);
      assert.equal((await db.query("SELECT data FROM mera_records WHERE id=$1",[sized.data.id])).rows[0].data.variants[0].stock,stockBeforeWriteoff);
      const writeoffLedgers=(await db.query("SELECT data FROM mera_records WHERE kind='ledger' AND data->>'type'='receivable_writeoff' AND data->>'orderId'=$1",[writeoffOrderId])).rows.map(r=>r.data);
      assert.equal(writeoffLedgers.length,2);
      for(const l of writeoffLedgers){assert.equal(l.postings.reduce((n,p)=>n+p.debit-p.credit,0),0);assert.ok(l.postings.some(p=>p.account==="bad_debts"&&p.debit>0));}
      assert.equal((await call(financialLookup+writeoffIntent.requestKey)).data.kind,"writeoff");
      await assert.rejects(db.query("UPDATE mera_records SET data=data||'{\"amount\":1}'::jsonb WHERE id=$1",[firstWriteoff.data.id]),/append-only/i);
      const blockedWriteoffKey=randomUUID();
      await call(financialLookup+blockedWriteoffKey+"/abandon","POST",{kind:"writeoff",reason:"Fence delayed writeoff fixture intent"});
      assert.equal((await call(writeoffPath,"POST",{requestKey:blockedWriteoffKey,version:writeoffCanonical.version,amount:1,reason:"Delayed safely abandoned writeoff intent"})).data.code,"REQUEST_ABANDONED");
      const writeoffTable=(await call(B+"/tables","POST",{name:"Writeoff closing fixture",capacity:2,zone:"main"})).data;
      const writeoffVisit=(await call(B+"/visits","POST",{tableId:writeoffTable.id,displayName:"Debt closure fixture"})).data;
      const tableDebtOrder=await call(B+"/orders","POST",{requestKey:randomUUID(),menuVersion:freePublication.data.version,displayName:"Debt table fixture",fulfillment:"table_service",visitId:writeoffVisit.id,items:[{productId:sized.data.id,variantId:"large",quantity:1,modifiers:[]}]});
      assert.equal(tableDebtOrder.status,201,JSON.stringify(tableDebtOrder.data));
      await call(B+"/orders/"+tableDebtOrder.data.id+"/status","POST",{status:"accepted",version:1});
      const tableDebtTicket=(await db.query("SELECT data FROM mera_records WHERE kind='ticket' AND data->>'orderId'=$1",[tableDebtOrder.data.id])).rows[0].data;
      const tableDebtReady=await call(B+"/tickets/"+tableDebtTicket.id+"/status","POST",{status:"ready",version:1});
      const tableDebtCollected=await call(B+"/orders/"+tableDebtOrder.data.id+"/status","POST",{status:"collected",version:tableDebtReady.data.order.version});
      assert.equal(tableDebtCollected.status,200,JSON.stringify(tableDebtCollected.data));
      assert.equal((await call(B+"/visits/"+writeoffVisit.id+"/close","POST",{})).status,409);
      assert.equal((await call(B+"/orders/"+tableDebtOrder.data.id+"/writeoffs","POST",{requestKey:randomUUID(),version:tableDebtCollected.data.version,amount:20000,reason:"Resolve fixture table receivable without collecting cash"})).status,200);
      assert.equal((await call(B+"/visits/"+writeoffVisit.id+"/close","POST",{})).status,200);
      const minimumPolicyBody={enabled:true,approved:true,amount:50000,basis:"net_paid_bill",shortfallTreatment:"manager_review",disclosure:"This visit requires at least the disclosed net paid bill; staff reviews any shortfall."};
      const minimumPolicyA=await call(B+"/minimum-spend-policy","PATCH",minimumPolicyBody);
      assert.equal(minimumPolicyA.status,200,JSON.stringify(minimumPolicyA.data));
      const minimumTable=(await call(B+"/tables","POST",{name:"Minimum spend fixture",capacity:2,zone:"lounge"})).data;
      assert.equal((await call(B+"/visits","POST",{tableId:minimumTable.id,displayName:"Minimum visit"})).data.code,"MINIMUM_SPEND_ACK_REQUIRED");
      const minimumVisit=await call(B+"/visits","POST",{tableId:minimumTable.id,displayName:"Minimum visit",minimumSpendAcknowledged:true,minimumSpendPolicyVersion:minimumPolicyA.data.version});
      assert.equal(minimumVisit.status,201,JSON.stringify(minimumVisit.data));
      assert.equal((await call(P+"/visits/terms","POST",{tableId:minimumTable.id,code:"INCORRECT"},null,g2)).status,403);
      const minimumTerms=await call(P+"/visits/terms","POST",{tableId:minimumTable.id,code:"  "+minimumVisit.data.joiningCode.toLowerCase()+"  "},null,g2);
      assert.equal(minimumTerms.status,200,JSON.stringify(minimumTerms.data));
      assert.equal(minimumTerms.data.minimumSpendPolicy.amount,50000);
      assert.equal(minimumTerms.data.privateBillAccessGranted,false);
      assert.equal((await call("/public/visits/"+minimumVisit.data.id,"GET",undefined,null,g2)).status,404);
      const minJoinBody={visitId:minimumVisit.data.id,code:minimumVisit.data.joiningCode};
      assert.equal((await call(P+"/visits/join","POST",minJoinBody,null,g2)).data.code,"MINIMUM_SPEND_ACK_REQUIRED");
      assert.equal((await call(P+"/visits/join","POST",{...minJoinBody,minimumSpendAcknowledged:true,minimumSpendPolicyVersion:"stale-policy"},null,g2)).status,409);
      assert.equal((await call(P+"/visits/join","POST",{...minJoinBody,minimumSpendAcknowledged:true,minimumSpendPolicyVersion:minimumPolicyA.data.version},null,g2)).status,200);
      const minimumPrivate=(await call("/public/visits/"+minimumVisit.data.id,"GET",undefined,null,g2)).data;
      assert.equal(minimumPrivate.minimumSpend.policy.version,minimumPolicyA.data.version);
      assert.equal(minimumPrivate.minimumSpend.summary.shortfall,50000);
      assert.equal((await call(B+"/visits/"+minimumVisit.data.id+"/close","POST",{})).data.code,"MINIMUM_SPEND_REVIEW_REQUIRED");
      const minimumPolicyB=await call(B+"/minimum-spend-policy","PATCH",{...minimumPolicyBody,amount:60000});
      assert.equal((await call("/public/visits/"+minimumVisit.data.id,"GET",undefined,null,g2)).data.minimumSpend.policy.amount,50000);
      const minimumBookingBody={...reservation,requestKey:randomUUID(),partySize:1,startsAt:new Date(Date.now()+12*86400000).toISOString(),endsAt:new Date(Date.now()+12*86400000+3600000).toISOString()};
      assert.equal((await call(P+"/reservations","POST",minimumBookingBody,null,g1)).data.code,"MINIMUM_SPEND_ACK_REQUIRED");
      const minimumBookingIntent={...minimumBookingBody,minimumSpendAcknowledged:true,minimumSpendPolicyVersion:minimumPolicyB.data.version};
      const minimumBooking=await call(P+"/reservations","POST",minimumBookingIntent,null,g1);
      assert.equal(minimumBooking.status,201,JSON.stringify(minimumBooking.data));
      assert.equal(minimumBooking.data.minimumSpendPolicy.amount,60000);
      await call(B+"/minimum-spend-policy","PATCH",{...minimumPolicyBody,amount:70000});
      await call(B+"/settings","PATCH",{reservationsEnabled:false});
      const minimumBookingReplay=await call(P+"/reservations","POST",minimumBookingIntent,null,g1);
      assert.equal(minimumBookingReplay.status,201,JSON.stringify(minimumBookingReplay.data));
      assert.equal(minimumBookingReplay.data.id,minimumBooking.data.id);
      assert.equal(minimumBookingReplay.data.minimumSpendPolicy.version,minimumPolicyB.data.version);
      await call(B+"/settings","PATCH",{reservationsEnabled:true});
      await call(B+"/reservations/"+minimumBooking.data.id+"/deposits","POST",{requestKey:randomUUID(),amount:100000,method:"cash"});
      assert.equal((await call(B+"/reservations/"+minimumBooking.data.id+"/status","POST",{status:"confirmed"})).status,200);
      const bookedMinimumTable=(await call(B+"/tables","POST",{name:"Booked old minimum policy",capacity:2,zone:"lounge"})).data;
      const minimumSeated=await call(B+"/reservations/"+minimumBooking.data.id+"/seat","POST",{tableId:bookedMinimumTable.id,displayName:"Booked terms retained"});
      assert.equal(minimumSeated.status,200,JSON.stringify(minimumSeated.data));
      assert.equal(minimumSeated.data.visit.minimumSpendPolicy.version,minimumPolicyB.data.version);
      assert.equal(minimumSeated.data.visit.minimumSpendPolicy.amount,60000);
      const minimumOrder=await call(B+"/orders","POST",{requestKey:randomUUID(),menuVersion:freePublication.data.version,displayName:"Minimum qualifying spend fixture",fulfillment:"table_service",visitId:minimumVisit.data.id,items:[{productId:sized.data.id,variantId:"large",quantity:1,modifiers:[]}]});
      assert.equal(minimumOrder.status,201,JSON.stringify(minimumOrder.data));
      await call(B+"/orders/"+minimumOrder.data.id+"/status","POST",{status:"accepted",version:1});
      const minimumTicket=(await db.query("SELECT data FROM mera_records WHERE kind='ticket' AND data->>'orderId'=$1",[minimumOrder.data.id])).rows[0].data;
      const minimumReady=await call(B+"/tickets/"+minimumTicket.id+"/status","POST",{status:"ready",version:1});
      await call(B+"/orders/"+minimumOrder.data.id+"/status","POST",{status:"collected",version:minimumReady.data.order.version});
      assert.equal((await call(B+"/orders/"+minimumOrder.data.id+"/payments","POST",{requestKey:randomUUID(),amount:5000,method:"cash"})).status,200);
      const minimumCollected=(await db.query("SELECT data FROM mera_records WHERE id=$1",[minimumOrder.data.id])).rows[0].data;
      assert.equal((await call(B+"/orders/"+minimumOrder.data.id+"/writeoffs","POST",{requestKey:randomUUID(),version:minimumCollected.version,amount:15000,reason:"Writeoff must not qualify as customer paid spend"})).status,200);
      const minReviewPath=B+"/visits/"+minimumVisit.data.id+"/minimum-spend";
      const minimumSummary=(await call(minReviewPath)).data;
      assert.equal(minimumSummary.summary.netPaid,5000);
      assert.equal(minimumSummary.summary.shortfall,45000);
      assert.equal((await call(B+"/visits/"+minimumVisit.data.id+"/close","POST",{})).data.code,"MINIMUM_SPEND_REVIEW_REQUIRED");
      const minimumWaiverIntent={requestKey:randomUUID(),version:minimumSummary.version,expectedShortfall:45000,reason:"Manager explicitly waives fixture shortfall without charging customer"};
      assert.equal((await call(minReviewPath+"/waive","POST",minimumWaiverIntent,other)).status,403);
      assert.equal((await call(minReviewPath+"/waive","POST",{...minimumWaiverIntent,expectedShortfall:40000})).status,409);
      const ledgerBeforeWaiver=(await db.query("SELECT id FROM mera_records WHERE kind='ledger'")).rowCount;
      const waiver=await call(minReviewPath+"/waive","POST",minimumWaiverIntent);
      assert.equal(waiver.status,200,JSON.stringify(waiver.data));
      assert.equal((await call(minReviewPath+"/waive","POST",minimumWaiverIntent)).data.id,waiver.data.id);
      assert.equal((await db.query("SELECT id FROM mera_records WHERE kind='ledger'")).rowCount,ledgerBeforeWaiver);
      assert.equal((await call(minReviewPath)).data.summary.shortfall,0);
      assert.equal((await call(B+"/visits/"+minimumVisit.data.id+"/close","POST",{})).status,200);
      await assert.rejects(db.query("DELETE FROM mera_records WHERE id=$1",[waiver.data.id]),/append-only/i);
      await call(B+"/minimum-spend-policy","PATCH",{enabled:false,approved:false,amount:null,basis:null,shortfallTreatment:"manager_review",disclosure:""});
      const rotationVisit=minimumSeated.data.visit,rotationPath=B+"/visits/"+rotationVisit.id+"/joining-code";
      const beforeRotationGuest=await call("/public/visits/"+rotationVisit.id,"GET",undefined,null,g1);
      assert.equal(beforeRotationGuest.status,200,JSON.stringify(beforeRotationGuest.data));
      const rotatedCode=await call(rotationPath,"POST",{version:rotationVisit.version||1,reason:"Recover private joining code after staff refresh"});
      assert.equal(rotatedCode.status,200,JSON.stringify(rotatedCode.data));
      assert.equal(rotatedCode.data.existingGuestSessionsRetained,true);
      assert.match(rotatedCode.data.joiningCode,/^[A-F0-9]{10}$/);
      assert.equal((await call(rotationPath,"POST",{version:rotationVisit.version||1,reason:"Reject delayed stale joining code rotation"})).data.code,"STALE_VERSION");
      assert.equal((await call(P+"/visits/join","POST",{visitId:rotationVisit.id,code:rotationVisit.joiningCode,minimumSpendAcknowledged:true,minimumSpendPolicyVersion:minimumPolicyB.data.version},null,g2)).status,403);
      assert.equal((await call(P+"/visits/join","POST",{visitId:rotationVisit.id,code:rotatedCode.data.joiningCode,minimumSpendAcknowledged:true,minimumSpendPolicyVersion:minimumPolicyB.data.version},null,g2)).status,200);
      assert.equal((await call("/public/visits/"+rotationVisit.id,"GET",undefined,null,g1)).status,200);
      const storedRotation=(await db.query("SELECT data FROM mera_records WHERE id=$1",[rotationVisit.id])).rows[0].data;
      assert.equal(storedRotation.joiningCode,undefined);
      assert.equal(storedRotation.joiningCodeHash,createHash("sha256").update(rotatedCode.data.joiningCode).digest("hex"));
      const rotationAudits=(await db.query("SELECT data FROM mera_records WHERE kind='audit' AND data->>'action'='visit_joining_code_rotated'")).rows;
      assert.ok(rotationAudits.length>0);
      assert.ok(!JSON.stringify(rotationAudits).includes(rotatedCode.data.joiningCode));
      assert.equal((await call(B+"/visits/"+minimumVisit.data.id+"/joining-code","POST",{version:2,reason:"Reject rotating a closed visit"})).data.code,"VISIT_CLOSED");
      const foreignPublic="/public/foreign-asset-fixture/"+foreignOrg.data.branchId;
      const secondVenueProduct=await call(foreignBase+"/products","POST",{name:"Second venue tea",code:"OTHER1",category:"Tea",price:12300});
      assert.equal(secondVenueProduct.status,201,JSON.stringify(secondVenueProduct.data));
      const secondVenuePublished=await call(foreignBase+"/menu/publish","POST",{});
      await call(foreignBase+"/settings","PATCH",{orderingPaused:false});
      const secondVenueGuest=await call(foreignPublic+"/guests","POST",{displayName:"Second venue customer"},null,winner.cookie,{"X-Mera-Organization-Slug":"foreign-asset-fixture"});
      assert.equal(secondVenueGuest.status,201,JSON.stringify(secondVenueGuest.data));
      assert.ok(secondVenueGuest.cookies.some(c=>c.startsWith("mera_guest_"+org+"=")));
      assert.ok(secondVenueGuest.cookies.some(c=>c.startsWith("mera_guest_"+foreignOrg.data.organizationId+"=")));
      const cookieJar=new Map();
      for(const cookie of [winner.cookie,...secondVenueGuest.cookies]){const split=cookie.indexOf("=");cookieJar.set(cookie.slice(0,split),cookie.slice(split+1));}
      const multiVenueCookies=[...cookieJar].map(([k,v])=>k+"="+v).join("; ");
      const secondVenueOrder=await call(foreignPublic+"/orders","POST",{requestKey:randomUUID(),menuVersion:secondVenuePublished.data.version,displayName:"Second venue customer",items:[{productId:secondVenueProduct.data.id,quantity:1,modifiers:[]}]},null,multiVenueCookies,{"X-Mera-Organization-Slug":"foreign-asset-fixture"});
      assert.equal(secondVenueOrder.status,201,JSON.stringify(secondVenueOrder.data));
      assert.equal((await call("/public/orders/"+winner.order.id,"GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"bing-chun"})).status,200);
      assert.equal((await call("/public/orders/"+secondVenueOrder.data.id,"GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"foreign-asset-fixture"})).status,200);
      assert.equal((await call("/public/orders/"+winner.order.id,"GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"foreign-asset-fixture"})).status,404);
      assert.equal((await call("/public/orders/"+secondVenueOrder.data.id,"GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"bing-chun"})).status,404);
      assert.equal((await call("/public/visits/"+rotationVisit.id,"GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"bing-chun"})).status,200);
      assert.equal((await call("/public/visits/"+rotationVisit.id,"GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"foreign-asset-fixture"})).status,404);
      assert.equal((await call("/public/orders/"+winner.order.id+"/feedback","POST",{rating:5,text:"Wrong context denied"},null,multiVenueCookies,{"X-Mera-Organization-Slug":"foreign-asset-fixture"})).status,404);
      const wrongCookie="mera_guest_"+org+"="+cookieJar.get("mera_guest_"+foreignOrg.data.organizationId);
      assert.equal((await call("/public/orders/"+winner.order.id,"GET",undefined,null,wrongCookie,{"X-Mera-Organization-Slug":"bing-chun"})).status,401);
      const wrongIdentityGet = await call(P+"/guest","GET",undefined,null,wrongCookie,{"X-Mera-Organization-Slug":"bing-chun"});
      assert.equal(wrongIdentityGet.status,401);
      assert.equal(wrongIdentityGet.cacheControl,"no-store");
      assert.equal(wrongIdentityGet.data.sessionRef,undefined);
      const wrongContextIdentityGet = await call(P+"/guest","GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"foreign-asset-fixture"});
      assert.equal(wrongContextIdentityGet.status,404);
      assert.equal(wrongContextIdentityGet.data.sessionRef,undefined);
      assert.ok((await call(P+"/guest","GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"bing-chun"})).data.orders.some(o=>o.id===winner.order.id));
      assert.ok((await call(foreignPublic+"/guest","GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"foreign-asset-fixture"})).data.orders.some(o=>o.id===secondVenueOrder.data.id));
      const unresolvedPolicyBody={monthlyPrice:null,includedBranches:1,additionalBranchPrice:null,integratedFeeBps:10,feePayer:null,feeBasis:null,refundTreatment:null,trialDays:null,graceDays:null};
      const unresolvedSave=await call("/organizations/"+foreignOrg.data.organizationId+"/policy","PATCH",unresolvedPolicyBody);
      assert.equal(unresolvedSave.status,200,JSON.stringify(unresolvedSave.data));
      assert.equal(unresolvedSave.data.monthlyPrice,null);
      assert.equal(unresolvedSave.data.additionalBranchPrice,null);
      assert.equal((await call("/organizations/"+foreignOrg.data.organizationId+"/invoices","POST",{requestKey:randomUUID(),periodStart:"2027-02-01T00:00:00Z",periodEnd:"2027-03-01T00:00:00Z"})).data.code,"POLICY_BLOCKED");
      assert.equal((await call("/organizations/"+foreignOrg.data.organizationId+"/policy","PATCH",{...unresolvedPolicyBody,trialDays:3651})).status,400);
      assert.equal((await call("/organizations/"+foreignOrg.data.organizationId+"/policy","PATCH",{...unresolvedPolicyBody,graceDays:366})).status,400);
      const currentVenueGuest=(await call(P+"/guest","GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"bing-chun"})).data;
      const flagOrderIntent={requestKey:randomUUID(),menuVersion:freePublication.data.version,displayName:currentVenueGuest.displayName,items:[{productId:freeProduct.data.id,quantity:1,modifiers:[]}]};
      const flagContinuityOrder=await call(P+"/orders","POST",flagOrderIntent,null,multiVenueCookies,{"X-Mera-Organization-Slug":"bing-chun"});
      assert.equal(flagContinuityOrder.status,201,JSON.stringify(flagContinuityOrder.data));
      const flagVisitTable=(await call(B+"/tables","POST",{name:"Flag paused new visit",capacity:2,zone:"main"})).data;
      const flagPath="/platform/organizations/"+org+"/feature-flags";
      const flagIntent={version:1,flags:{customer_ordering:false,new_reservations:false,new_table_visits:false,zidi:false},reason:"Pause only new fixture actions while preserving existing service"};
      assert.equal((await call(flagPath,"PATCH",flagIntent)).status,401);
      const flagsPaused=await call(flagPath,"PATCH",flagIntent,owner,"pos_session="+sessionA);
      assert.equal(flagsPaused.status,200,JSON.stringify(flagsPaused.data));
      assert.equal((await call(flagPath,"PATCH",flagIntent,owner,"pos_session="+sessionA)).status,409);
      const pausedPublic=(await call(P+"/menu","GET",undefined,null)).data;
      assert.equal(pausedPublic.orderingAvailable,false);
      assert.equal(pausedPublic.features.flags.customer_ordering,false);
      assert.equal(pausedPublic.features.changedBy,undefined);
      assert.equal((await call(P+"/orders","POST",{...flagOrderIntent,requestKey:randomUUID()},null,multiVenueCookies)).data.code,"FEATURE_DISABLED");
      assert.equal((await call(P+"/quote","POST",{menuVersion:freePublication.data.version,items:flagOrderIntent.items},null,multiVenueCookies)).data.code,"FEATURE_DISABLED");
      const pausedReplay=await call(P+"/orders","POST",flagOrderIntent,null,multiVenueCookies);
      assert.equal(pausedReplay.status,201,JSON.stringify(pausedReplay.data));
      assert.equal(pausedReplay.data.id,flagContinuityOrder.data.id);
      assert.equal((await call(P+"/reservations","POST",{...minimumBookingIntent,requestKey:randomUUID()},null,g1)).data.code,"FEATURE_DISABLED");
      assert.equal((await call(P+"/reservations","POST",minimumBookingIntent,null,g1)).data.id,minimumBooking.data.id);
      assert.equal((await call(B+"/visits","POST",{tableId:flagVisitTable.id,displayName:"Feature paused fixture"})).data.code,"FEATURE_DISABLED");
      assert.equal((await call(B+"/reservations/"+minimumBooking.data.id+"/seat","POST",{tableId:bookedMinimumTable.id,displayName:"Booked terms retained"})).status,200);
      const pausedMachineMenu=await call("/integrations/zidi/v1/menu","GET",undefined,null,"",quoteHeadersB);
      assert.equal(pausedMachineMenu.status,200);
      assert.equal(pausedMachineMenu.data.orderingAvailable,false);
      assert.equal((await call("/integrations/zidi/v1/quote","POST",{menuVersion:freePublication.data.version,items:flagOrderIntent.items},null,"",quoteHeadersB)).data.code,"FEATURE_DISABLED");
      const continueAccepted=await call(B+"/orders/"+flagContinuityOrder.data.id+"/status","POST",{status:"accepted",version:1});
      assert.equal(continueAccepted.status,200,JSON.stringify(continueAccepted.data));
      const continuedExport=await fetch(base+B+"/exports/"+completedJob.artifactId+"/download",{headers:{"x-test-user":owner}});
      assert.equal(continuedExport.status,200);
      const restoreFlags=await call(flagPath,"PATCH",{version:2,flags:{customer_ordering:true,new_reservations:true,new_table_visits:true,zidi:true},reason:"Restore fixture new action feature availability"},owner,"pos_session="+sessionA);
      assert.equal(restoreFlags.status,200,JSON.stringify(restoreFlags.data));
      assert.equal((await call("/context")).data.organizations.find(o=>o.id===org).organizationWide,true);
      // An authoritative order-attempt resolution never treats absence as rejection.
      const attemptBase=P+"/order-attempts/", staffAttemptBase=B+"/order-attempts/";
      const storedAttempt=await call(attemptBase+winner.input.requestKey,"GET",undefined,null,winner.cookie);
      assert.equal(storedAttempt.status,200);
      assert.equal(storedAttempt.cacheControl,"no-store");
      assert.equal(storedAttempt.data.status,"recorded");
      assert.equal(storedAttempt.data.order.id,winner.order.id);
      assert.equal(storedAttempt.data.order.guestId,undefined);
      const recordedAbandon=await call(attemptBase+winner.input.requestKey+"/abandon","POST",{reason:"Resolve already recorded attempt"},null,winner.cookie);
      assert.equal(recordedAbandon.data.status,"recorded");
      assert.equal(recordedAbandon.data.order.id,winner.order.id);
      assert.equal((await call(attemptBase+winner.input.requestKey,"GET",undefined,null,winner.other)).data.status,"not_found");
      assert.equal((await call(staffAttemptBase+winner.input.requestKey)).data.status,"not_found");
      assert.equal((await call(foreignPublic+"/order-attempts/"+winner.input.requestKey,"GET",undefined,null,multiVenueCookies,{"X-Mera-Organization-Slug":"foreign-asset-fixture"})).data.status,"not_found");
      assert.equal((await call(attemptBase+winner.input.requestKey,"GET",undefined,null,"")).status,401);
      const fencedIntent={...flagOrderIntent,requestKey:randomUUID()};
      const absentAttempt=await call(attemptBase+fencedIntent.requestKey,"GET",undefined,null,multiVenueCookies);
      assert.equal(absentAttempt.data.status,"not_found");
      const abandonedAttempt=await call(attemptBase+fencedIntent.requestKey+"/abandon","POST",{reason:"Customer chooses to review a fresh cart"},null,multiVenueCookies);
      assert.equal(abandonedAttempt.data.status,"abandoned");
      assert.deepEqual((await call(attemptBase+fencedIntent.requestKey+"/abandon","POST",{reason:"Repeat explicit recovery request"},null,multiVenueCookies)).data,abandonedAttempt.data);
      assert.equal((await call(attemptBase+fencedIntent.requestKey,"GET",undefined,null,multiVenueCookies)).data.status,"abandoned");
      const delayedAttempt=await call(P+"/orders","POST",fencedIntent,null,multiVenueCookies);
      assert.equal(delayedAttempt.status,409);
      assert.equal(delayedAttempt.data.code,"ORDER_REQUEST_ABANDONED");
      // Another guest's tombstone cannot block this authenticated guest's intent.
      const isolatedIntent={...flagOrderIntent,requestKey:randomUUID()};
      assert.equal((await call(attemptBase+isolatedIntent.requestKey+"/abandon","POST",{reason:"Other guest independent attempt"},null,winner.other)).data.status,"abandoned");
      const isolatedCreated=await call(P+"/orders","POST",isolatedIntent,null,multiVenueCookies);
      assert.equal(isolatedCreated.status,201,JSON.stringify(isolatedCreated.data));
      assert.equal((await call(attemptBase+isolatedIntent.requestKey,"GET",undefined,null,winner.other)).data.status,"abandoned");
      const racingIntent={...flagOrderIntent,requestKey:randomUUID()};
      const [raceCreate,raceAbandon]=await Promise.all([
        call(P+"/orders","POST",racingIntent,null,multiVenueCookies),
        call(attemptBase+racingIntent.requestKey+"/abandon","POST",{reason:"Explicit concurrent recovery"},null,multiVenueCookies),
      ]);
      const raceCanonical=await call(attemptBase+racingIntent.requestKey,"GET",undefined,null,multiVenueCookies);
      const raceOrders=(await db.query("SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='order' AND data->>'requestKey'=$3",[org,branch,racingIntent.requestKey])).rows;
      if(raceCreate.status===201){assert.equal(raceAbandon.data.status,"recorded");assert.equal(raceCanonical.data.order.id,raceCreate.data.id);assert.equal(raceOrders.length,1);}
      else {assert.equal(raceCreate.data.code,"ORDER_REQUEST_ABANDONED");assert.equal(raceAbandon.data.status,"abandoned");assert.equal(raceCanonical.data.status,"abandoned");assert.equal(raceOrders.length,0);}
      const staffIntent={...flagOrderIntent,requestKey:randomUUID()};
      assert.equal((await call(staffAttemptBase+staffIntent.requestKey+"/abandon","POST",{reason:"Independent cashier attempt"},other)).data.status,"abandoned");
      const staffCreated=await call(B+"/orders","POST",staffIntent);
      assert.equal(staffCreated.status,201,JSON.stringify(staffCreated.data));
      assert.equal((await call(staffAttemptBase+staffIntent.requestKey)).data.order.id,staffCreated.data.id);
      assert.equal((await call(staffAttemptBase+staffIntent.requestKey,"GET",undefined,other)).data.status,"abandoned");
      const staffFenced={...flagOrderIntent,requestKey:randomUUID()};
      const staffAbandon=await call(staffAttemptBase+staffFenced.requestKey+"/abandon","POST",{reason:"Staff chooses fresh reviewed request"});
      assert.equal(staffAbandon.data.status,"abandoned");
      assert.deepEqual((await call(staffAttemptBase+staffFenced.requestKey+"/abandon","POST",{reason:"Explicit repeat recovery"})).data,staffAbandon.data);
      assert.equal((await call(B+"/orders","POST",staffFenced)).data.code,"ORDER_REQUEST_ABANDONED");
      assert.equal((await call(foreignBase+"/order-attempts/"+staffIntent.requestKey)).data.status,"not_found");

      const merchantSupportPath="/organizations/"+org+"/support-cases";
      const supportCaseIntent={requestKey:randomUUID(),subject:"Fixture support request",topic:"billing",message:"Please clarify the test invoice policy",branchId:branch};
      const supportCase=await call(merchantSupportPath,"POST",supportCaseIntent);
      assert.equal(supportCase.status,201,JSON.stringify(supportCase.data));
      assert.equal((await call(merchantSupportPath,"POST",supportCaseIntent)).data.id,supportCase.data.id);
      assert.equal((await call(merchantSupportPath,"POST",{...supportCaseIntent,message:"Changed support intent"})).status,409);
      assert.equal((await call(merchantSupportPath,"GET",undefined,other)).status,403);
      assert.equal((await call(merchantSupportPath,"POST",{...supportCaseIntent,requestKey:randomUUID(),branchId:foreignOrg.data.branchId})).status,404);
      const platformReply=await call("/platform/support-cases/"+supportCase.data.id,"PATCH",{version:1,status:"resolved",customerReply:"The approved snapshot is retained",internalNote:"Private operator-only fixture note"},owner,"pos_session="+sessionA);
      assert.equal(platformReply.status,200,JSON.stringify(platformReply.data));
      assert.equal((await call("/platform/support-cases/"+supportCase.data.id,"PATCH",{version:1,status:"in_progress"},owner,"pos_session="+sessionA)).status,409);
      const merchantCases=(await call(merchantSupportPath)).data.cases;
      const merchantResolved=merchantCases.find(c=>c.id===supportCase.data.id);
      assert.equal(merchantResolved.status,"resolved");
      assert.equal(merchantResolved.customerReply,"The approved snapshot is retained");
      assert.equal(merchantResolved.internalNotes,undefined);
      assert.ok(!JSON.stringify(merchantResolved).includes("Private operator-only"));
      assert.ok(!(await call("/organizations/"+foreignOrg.data.organizationId+"/support-cases")).data.cases.some(c=>c.id===supportCase.data.id));
      const unknownTaxReport=(await call(B+"/workspace")).data.report;
      assert.equal(unknownTaxReport.historicalTaxStatus,"unresolved_source_tax_breakdown");
      assert.equal(unknownTaxReport.netRevenueExTax,null);
      assert.equal(unknownTaxReport.netTaxLiability,null);
      const cancelledDepositList=await call(B+"/reservations/"+heldBooking.data.id+"/deposits");
      const outcomeDeposit=cancelledDepositList.data.deposits[0],depositOutcomePath=B+"/reservations/"+heldBooking.data.id+"/deposits/"+outcomeDeposit.id+"/outcomes";
      assert.equal(outcomeDeposit.unallocatedBalance,100000);
      const holdLedgerBefore=(await db.query("SELECT id FROM mera_records WHERE kind='ledger' AND data->>'depositId'=$1",[outcomeDeposit.id])).rowCount;
      const holdIntent={requestKey:randomUUID(),outcome:"held",expectedRemaining:100000,amount:0,reason:"Manager reviews and visibly holds cancelled booking deposit",policyReviewed:true};
      const heldOutcome=await call(depositOutcomePath,"POST",holdIntent);
      assert.equal(heldOutcome.status,200,JSON.stringify(heldOutcome.data));
      assert.equal(heldOutcome.data.providerPayoutInitiated,false);
      assert.equal((await db.query("SELECT id FROM mera_records WHERE kind='ledger' AND data->>'depositId'=$1",[outcomeDeposit.id])).rowCount,holdLedgerBefore);
      assert.equal((await call(B+"/reservations/"+heldBooking.data.id+"/status","POST",{status:"cancelled"})).status,200);
      assert.equal((await call(depositOutcomePath,"POST",{requestKey:randomUUID(),outcome:"forfeit",expectedRemaining:100000,amount:100000,taxAmount:null,reason:"Reject forfeiture before original refundable cutoff",policyReviewed:true})).data.code,"POLICY_BLOCKED");
      const returnIntent={requestKey:randomUUID(),outcome:"manual_return",expectedRemaining:100000,amount:40000,method:"cash",reason:"Record completed external cash return after reviewed cancellation",policyReviewed:true};
      assert.equal((await call(depositOutcomePath,"POST",returnIntent,other)).status,403);
      const depositReturned=await call(depositOutcomePath,"POST",returnIntent);
      assert.equal(depositReturned.status,200,JSON.stringify(depositReturned.data));
      assert.equal(depositReturned.data.deposit.unallocatedBalance,60000);
      assert.equal(depositReturned.data.deposit.refunded,40000);
      assert.equal((await call(depositOutcomePath,"POST",returnIntent)).data.record.id,depositReturned.data.record.id);
      assert.equal((await call(depositOutcomePath,"POST",{...returnIntent,requestKey:randomUUID()})).data.code,"STALE_DEPOSIT_BALANCE");
      assert.equal((await call(depositOutcomePath,"POST",{...returnIntent,requestKey:randomUUID(),expectedRemaining:60000,amount:70000})).status,409);
      const cancelledVisible=(await call(B+"/workspace")).data.deposits.find(d=>d.id===outcomeDeposit.id);
      assert.equal(cancelledVisible.unallocatedBalance,60000);
      assert.equal((await db.query("SELECT data FROM mera_records WHERE id=$1",[heldBooking.data.id])).rows[0].data.depositAmount,60000);
      const consumedDepositBalance=(await call(B+"/reservations/"+depositReservation.id+"/deposits")).data;
      assert.equal(consumedDepositBalance.unallocatedBalance,0);
      assert.equal((await call(B+"/reservations/"+depositReservation.id+"/deposits/"+deposit.data.id+"/outcomes","POST",{...returnIntent,requestKey:randomUUID(),expectedRemaining:0,amount:1})).status,409);
      const unusedSeatedDeposit=(await call(B+"/reservations/"+minimumBooking.data.id+"/deposits")).data.deposits[0];
      const unusedSeatedReturn=await call(B+"/reservations/"+minimumBooking.data.id+"/deposits/"+unusedSeatedDeposit.id+"/outcomes","POST",{...returnIntent,requestKey:randomUUID(),expectedRemaining:100000,amount:50000});
      assert.equal(unusedSeatedReturn.status,200,JSON.stringify(unusedSeatedReturn.data));
      assert.equal(unusedSeatedReturn.data.deposit.unallocatedBalance,50000);
      const seatedCreditBill=(await db.query("SELECT data FROM mera_records WHERE id=$1",[minimumSeated.data.bill.id])).rows[0].data;
      assert.equal(seatedCreditBill.allocations.filter(a=>a.orderId===null).reduce((n,a)=>n+a.amount,0),50000);
      const nonrefundablePolicy={enabled:true,amount:100000,cancellationCutoffHours:24,refundRule:"non_refundable",approved:true};
      await call(B+"/deposit-policy","PUT",nonrefundablePolicy);
      assert.equal((await call(depositOutcomePath,"POST",{requestKey:randomUUID(),outcome:"forfeit",expectedRemaining:60000,amount:60000,taxAmount:null,reason:"Current policy cannot replace original refundable booking terms",policyReviewed:true})).data.code,"POLICY_BLOCKED");
      const forfeitureBooking=await call(B+"/reservations","POST",{...reservation,requestKey:randomUUID(),partySize:1,startsAt:new Date(Date.now()+15*86400000).toISOString(),endsAt:new Date(Date.now()+15*86400000+3600000).toISOString()});
      const forfeitureDeposit=await call(B+"/reservations/"+forfeitureBooking.data.id+"/deposits","POST",{requestKey:randomUUID(),amount:100000,method:"cash"});
      assert.equal(forfeitureDeposit.status,200,JSON.stringify(forfeitureDeposit.data));
      await call(B+"/reservations/"+forfeitureBooking.data.id+"/status","POST",{status:"cancelled"});
      const forfeiturePath=B+"/reservations/"+forfeitureBooking.data.id+"/deposits/"+forfeitureDeposit.data.id+"/outcomes";
      const forfeitureIntent={requestKey:randomUUID(),outcome:"forfeit",expectedRemaining:100000,amount:60000,taxAmount:6000,reason:"Approve booked nonrefundable cancellation with explicit tax review",policyReviewed:true};
      const forfeited=await call(forfeiturePath,"POST",forfeitureIntent);
      assert.equal(forfeited.status,200,JSON.stringify(forfeited.data));
      assert.equal(forfeited.data.deposit.unallocatedBalance,40000);
      assert.equal(forfeited.data.record.providerPayoutInitiated,false);
      assert.equal((await call(forfeiturePath,"POST",forfeitureIntent)).data.record.id,forfeited.data.record.id);
      assert.equal((await call(forfeiturePath,"POST",{...returnIntent,requestKey:randomUUID(),expectedRemaining:40000,amount:40000,method:"external_transfer",reference:""})).status,400);
      const forfeitedRemainderReturned=await call(forfeiturePath,"POST",{...returnIntent,requestKey:randomUUID(),expectedRemaining:40000,amount:40000,method:"external_transfer",reference:"MANUALLY-CONFIRMED-RETURN-40"});
      assert.equal(forfeitedRemainderReturned.status,200,JSON.stringify(forfeitedRemainderReturned.data));
      assert.equal(forfeitedRemainderReturned.data.deposit.unallocatedBalance,0);
      const forfeitureLedger=(await db.query("SELECT data FROM mera_records WHERE kind='ledger' AND data->>'forfeitureId'=$1",[forfeited.data.record.id])).rows[0].data;
      assert.ok(forfeitureLedger.postings.some(p=>p.account==="reservation_forfeiture_income"&&p.credit===54000));
      assert.ok(forfeitureLedger.postings.some(p=>p.account==="tax_payable"&&p.credit===6000));
      assert.equal(forfeitureLedger.postings.reduce((n,p)=>n+p.debit-p.credit,0),0);
      await assert.rejects(db.query("UPDATE mera_records SET data=data||'{\"amount\":1}'::jsonb WHERE id=$1",[forfeited.data.record.id]),/append-only/i);
      const blockedDepositReturnKey=randomUUID();
      await call(financialLookup+blockedDepositReturnKey+"/abandon","POST",{kind:"deposit_refund",reason:"Fence delayed recorded deposit return intent"});
      assert.equal((await call(depositOutcomePath,"POST",{...returnIntent,requestKey:blockedDepositReturnKey,expectedRemaining:60000,amount:1})).data.code,"REQUEST_ABANDONED");
      const refillBooking=await call(B+"/reservations","POST",{...reservation,requestKey:randomUUID(),partySize:1,startsAt:new Date(Date.now()+18*86400000).toISOString(),endsAt:new Date(Date.now()+18*86400000+3600000).toISOString()});
      const refillDeposit=await call(B+"/reservations/"+refillBooking.data.id+"/deposits","POST",{requestKey:randomUUID(),amount:100000,method:"cash"});
      await call(B+"/reservations/"+refillBooking.data.id+"/deposits/"+refillDeposit.data.id+"/outcomes","POST",{...returnIntent,requestKey:randomUUID(),expectedRemaining:100000,amount:40000});
      assert.equal((await call(B+"/reservations/"+refillBooking.data.id+"/status","POST",{status:"confirmed"})).status,409);
      const refillTopup=await call(B+"/reservations/"+refillBooking.data.id+"/deposits","POST",{requestKey:randomUUID(),amount:40000,method:"cash"});
      assert.equal(refillTopup.status,200,JSON.stringify(refillTopup.data));
      assert.equal((await call(B+"/reservations/"+refillBooking.data.id+"/status","POST",{status:"confirmed"})).status,200);
      const refillTable=(await call(B+"/tables","POST",{name:"Returned deposit seating",capacity:2,zone:"main"})).data;
      const refillSeat=await call(B+"/reservations/"+refillBooking.data.id+"/seat","POST",{tableId:refillTable.id,displayName:"Seat only net held deposit"});
      assert.equal(refillSeat.status,200,JSON.stringify(refillSeat.data));
      assert.equal(refillSeat.data.bill.allocations.reduce((n,a)=>n+a.amount,0),100000);
      const refillStored=(await db.query("SELECT data FROM mera_records WHERE id=$1",[refillBooking.data.id])).rows[0].data;
      assert.equal(refillStored.depositGrossCollected,140000);
      assert.equal(refillStored.depositReturned,40000);
      const depositOutcomesReport=(await call(B+"/workspace")).data.report;
      assert.equal(depositOutcomesReport.depositForfeitures,60000);
      assert.ok(depositOutcomesReport.depositReturns>=170000);
      const allOutcomeLedgers=(await db.query("SELECT data FROM mera_records WHERE kind='ledger'")).rows.map(r=>r.data);
      for(const l of allOutcomeLedgers)assert.equal(l.postings.reduce((n,p)=>n+p.debit-p.credit,0),0);
      await call(foreignBase+"/settings","PATCH",{reservationsEnabled:true});
      await call(foreignBase+"/deposit-policy","PUT",nonrefundablePolicy);
      const unknownTaxBooking=await call(foreignBase+"/reservations","POST",{...reservation,requestKey:randomUUID(),partySize:1,startsAt:new Date(Date.now()+20*86400000).toISOString(),endsAt:new Date(Date.now()+20*86400000+3600000).toISOString()});
      assert.equal(unknownTaxBooking.status,201,JSON.stringify(unknownTaxBooking.data));
      const unknownTaxDeposit=await call(foreignBase+"/reservations/"+unknownTaxBooking.data.id+"/deposits","POST",{requestKey:randomUUID(),amount:100000,method:"cash"});
      assert.equal(unknownTaxDeposit.status,200,JSON.stringify(unknownTaxDeposit.data));
      await call(foreignBase+"/reservations/"+unknownTaxBooking.data.id+"/status","POST",{status:"cancelled"});
      const unknownTaxForfeit=await call(foreignBase+"/reservations/"+unknownTaxBooking.data.id+"/deposits/"+unknownTaxDeposit.data.id+"/outcomes","POST",{requestKey:randomUUID(),outcome:"forfeit",expectedRemaining:100000,amount:100000,taxAmount:null,reason:"Reviewed forfeiture retains explicitly unresolved source tax",policyReviewed:true});
      assert.equal(unknownTaxForfeit.status,200,JSON.stringify(unknownTaxForfeit.data));
      const isolatedUnknownReport=(await call(foreignBase+"/workspace")).data.report;
      assert.equal(isolatedUnknownReport.historicalTaxStatus,null);
      assert.equal(isolatedUnknownReport.taxBreakdownStatus,"unresolved");
      assert.equal(isolatedUnknownReport.netRevenueExTax,null);
      assert.equal(isolatedUnknownReport.netTaxLiability,null);
      assert.equal(isolatedUnknownReport.nonProductIncome,100000);
      assert.equal(isolatedUnknownReport.netSales,0);
      assert.equal(isolatedUnknownReport.reservationLiability,0);
      const unknownTaxLedger=(await db.query("SELECT data FROM mera_records WHERE kind='ledger' AND data->>'forfeitureId'=$1",[unknownTaxForfeit.data.record.id])).rows[0].data;
      assert.ok(unknownTaxLedger.postings.some(p=>p.account==="reservation_forfeiture_income_pending_tax"&&p.credit===100000));
      assert.equal(unknownTaxLedger.postings.reduce((n,p)=>n+p.debit-p.credit,0),0);
      const originalTransaction=db.transaction,mutationQueries=[];
      db.transaction=fn=>originalTransaction(c=>fn({query:(sql,args)=>{mutationQueries.push({sql,args});return c.query(sql,args);}}));
      try {
        const oldIntentReplay=await call(B+"/orders","POST",{...chargedIntent,requestKey:snapshotOrder.data.requestKey});
        assert.equal(oldIntentReplay.status,201,JSON.stringify(oldIntentReplay.data));
        assert.equal(oldIntentReplay.data.id,snapshotOrder.data.id);
        const hotPathOrder=await call(B+"/orders","POST",{requestKey:randomUUID(),menuVersion:freePublication.data.version,displayName:"Bounded checkout fixture",items:[{productId:freeProduct.data.id,quantity:1,modifiers:[]}]});
        assert.equal(hotPathOrder.status,201,JSON.stringify(hotPathOrder.data));
        assert.ok(mutationQueries.some(q=>q.sql.includes("data->>'requestKey'=$4")));
        assert.ok(mutationQueries.some(q=>q.sql.includes("data->'charges' @>")));
        assert.ok(mutationQueries.some(q=>q.sql.includes("data->>'stockHeld'='true'")));
        assert.ok(!mutationQueries.some(q=>q.sql.startsWith("SELECT * FROM mera_records")&&["order","bill"].includes(q.args?.[2])));
      } finally {db.transaction=originalTransaction;}
      const archiveRows=Array.from({length:220},(_,i)=>({id:randomUUID(),reference:"ARCHIVE-FIXTURE-"+String(i).padStart(3,"0"),displayName:"Archived query fixture",source:"staff",status:"completed",paymentStatus:"paid",total:0,paid:0,refunded:0,version:1,stockHeld:false,holdExpired:false,historicalReadOnly:false,staffCreatorId:owner,handlerId:null,financialPolicy:{version:"private-archive-plan"},policyVersion:"private-archive-plan",createdAt:"2025-01-15T12:00:00.000Z",collectedAt:"2025-01-15T12:30:00.000Z",completedAt:"2025-01-15T12:30:00.000Z",items:[],history:[]}));
      await db.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) SELECT value->>'id',$2,$3,'order',value FROM jsonb_array_elements($1::jsonb)",[JSON.stringify(archiveRows),org,branch]);
      const historyParams=new URLSearchParams({take:"100",q:"ARCHIVE-FIXTURE-",historical:"exclude"});
      const archivePage1=await call(B+"/orders?"+historyParams);
      assert.equal(archivePage1.status,200,JSON.stringify(archivePage1.data));
      assert.equal(archivePage1.data.orders.length,100);
      assert.equal(archivePage1.data.hasMore,true);
      historyParams.set("cursor",archivePage1.data.nextCursor);
      const archivePage2=await call(B+"/orders?"+historyParams);
      assert.equal(archivePage2.status,200,JSON.stringify(archivePage2.data));
      assert.equal(archivePage2.data.orders.length,100);
      historyParams.set("cursor",archivePage2.data.nextCursor);
      const archivePage3=await call(B+"/orders?"+historyParams);
      assert.equal(archivePage3.data.orders.length,20);
      assert.equal(archivePage3.data.hasMore,false);
      const pagedArchiveIds=[...archivePage1.data.orders,...archivePage2.data.orders,...archivePage3.data.orders].map(o=>o.id);
      assert.equal(new Set(pagedArchiveIds).size,220);
      assert.deepEqual(new Set(pagedArchiveIds),new Set(archiveRows.map(o=>o.id)));
      const changedCursor=new URLSearchParams({take:"100",q:"CHANGED-FILTER",historical:"exclude",cursor:archivePage1.data.nextCursor});
      assert.equal((await call(B+"/orders?"+changedCursor)).status,409);
      const originalCursor=new URLSearchParams({take:"100",q:"ARCHIVE-FIXTURE-",historical:"exclude",cursor:archivePage1.data.nextCursor});
      assert.equal((await call(destinationBase+"/orders?"+originalCursor)).status,409);
      assert.equal((await call(foreignBase+"/orders?"+originalCursor)).status,409);
      assert.equal((await call(B+"/orders?take=101")).status,400);
      assert.equal((await call(B+"/orders?cursor=invalid-cursor")).status,409);
      const historicalOnly=await call(B+"/orders?historical=only&q=LEGACY-READONLY");
      assert.equal(historicalOnly.data.orders.length,1);
      assert.equal(historicalOnly.data.orders[0].historicalReadOnly,true);
      const foreignOrderDetail=await call(foreignBase+"/orders/"+archiveRows[0].id);
      assert.equal(foreignOrderDetail.status,404);
      const cashierArchive=await call(B+"/orders/"+archiveRows[0].id,"GET",undefined,other);
      assert.equal(cashierArchive.status,200);
      assert.equal(cashierArchive.data.financialPolicy,undefined);
      assert.equal(cashierArchive.data.policyVersion,undefined);
      assert.equal((await call(B+"/orders?"+new URLSearchParams({take:"5",q:"ARCHIVE-FIXTURE-",staffId:owner,unassigned:"true",source:"staff",paymentStatus:"paid"}))).data.orders.length,5);
      const boundedWorkspace=await call(B+"/workspace");
      assert.equal(boundedWorkspace.status,200,JSON.stringify(boundedWorkspace.data));
      assert.equal(boundedWorkspace.data.history.bounded,true);
      assert.equal(boundedWorkspace.data.history.recentOrderLimit,200);
      assert.equal(boundedWorkspace.data.orders.length,200);
      assert.ok(!boundedWorkspace.data.orders.some(o=>o.historicalReadOnly));
      const reportBranch=(await db.query("SELECT * FROM mera_branches WHERE id=$1",[branch])).rows[0];
      const reportDate=tradingDate(new Date().toISOString(),reportBranch.timezone,reportBranch.cutoff);
      const earlierInstant=new Date(Date.now()-86400000).toISOString(),recognizedInstant=new Date().toISOString(),preRecognitionOrderId=randomUUID();
      const preRecognitionOrder={id:preRecognitionOrderId,reference:"PRE-RECOGNITION-REFUND",status:"collected",paymentStatus:"partially_refunded",total:10000,paid:10000,refunded:2000,stockHeld:false,holdExpired:false,version:1,createdAt:earlierInstant,collectedAt:recognizedInstant,items:[],history:[]};
      await db.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'order',$4)",[preRecognitionOrderId,org,branch,JSON.stringify(preRecognitionOrder)]);
      const prerefund={id:randomUUID(),orderId:preRecognitionOrderId,amount:2000,taxAmount:0,method:"cash",createdAt:earlierInstant};
      await db.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'refund',$4)",[prerefund.id,org,branch,JSON.stringify(prerefund)]);
      const reportRows=(await db.query("SELECT * FROM mera_records WHERE organization_id=$1 AND branch_id=$2 ORDER BY created_at,id",[org,branch])).rows;
      const completeReport=meraReport(reportRows,reportBranch,reportDate);
      const boundedReportData=await loadBranchReportRecords(db,{organizationId:org,branchId:branch},reportBranch,reportDate);
      const dateSelectedReport={...meraReport(boundedReportData.reportRecords,reportBranch,reportDate),reservationLiability:boundedReportData.reservationLiabilityAsOf};
      assert.deepEqual(dateSelectedReport,completeReport);
      assert.ok(boundedReportData.reportRecords.some(r=>r.id===prerefund.id));
      assert.ok(boundedReportData.reportRecords.length<reportRows.length);
      const springWindow=await tradingDayWindow(db,{timezone:"America/New_York",cutoff:0},"2026-03-08");
      assert.equal(Date.parse(springWindow.to)-Date.parse(springWindow.from),23*3600000);
      const fallWindow=await tradingDayWindow(db,{timezone:"America/New_York",cutoff:0},"2026-11-01");
      assert.equal(Date.parse(fallWindow.to)-Date.parse(fallWindow.from),25*3600000);
      // Mounted refund, typed stock and administrative APIs exercise real SQL/guards.
      const mountedLeafProduct=await call(B+"/products","POST",{name:"Mounted leaf fixture",code:"LEAF-PG",category:"Fixture",price:10000,stockMode:"counted",stock:10,variants:[{id:"small",name:"Small",price:10000,stockMode:"counted",stock:4}]});
      assert.equal(mountedLeafProduct.status,201,JSON.stringify(mountedLeafProduct.data));
      const mountedLeafPublished=await call(B+"/menu/publish","POST",{});
      assert.equal(mountedLeafPublished.status,200,JSON.stringify(mountedLeafPublished.data));
      const mountedLeafOrder=await call(B+"/orders","POST",{requestKey:randomUUID(),menuVersion:mountedLeafPublished.data.version,displayName:"Refund request fixture",items:[{productId:mountedLeafProduct.data.id,variantId:"small",quantity:1,modifiers:[]}]});
      assert.equal(mountedLeafOrder.status,201,JSON.stringify(mountedLeafOrder.data));
      const mountedLeafPayment=await call(B+"/orders/"+mountedLeafOrder.data.id+"/payments","POST",{requestKey:randomUUID(),amount:10000,method:"cash",reference:"fixture-only"});
      assert.equal(mountedLeafPayment.status,200,JSON.stringify(mountedLeafPayment.data));
      const mountedRefundRequestPath=B+"/orders/"+mountedLeafOrder.data.id+"/refund-requests";
      assert.equal((await call(B+"/refund-requests")).status,200);
      assert.equal((await call(B+"/refund-requests","GET",undefined,null)).status,401);
      const mountedRequestedRefund={requestKey:randomUUID(),amount:1000,reason:"Fixture guest requests a reviewed return"};
      assert.equal((await call(mountedRefundRequestPath,"POST",mountedRequestedRefund,other)).status,403);
      await db.query("UPDATE mera_memberships SET permissions=permissions||$1::jsonb WHERE organization_id=$2 AND user_id=$3",[JSON.stringify(["refunds.request"]),org,other]);
      const mountedPendingRefund=await call(mountedRefundRequestPath,"POST",mountedRequestedRefund,other);
      assert.equal(mountedPendingRefund.status,200,JSON.stringify(mountedPendingRefund.data));
      assert.equal(mountedPendingRefund.data.status,"pending");
      assert.equal((await call(mountedRefundRequestPath,"POST",mountedRequestedRefund,other)).data.id,mountedPendingRefund.data.id);
      assert.equal((await call(mountedRefundRequestPath,"POST",{...mountedRequestedRefund,amount:2000},other)).status,409);
      assert.equal((await call(B+"/refund-requests","GET",undefined,other)).data.requests.some(r=>r.id===mountedPendingRefund.data.id),true);
      const mountedLinkedRefund={requestKey:randomUUID(),amount:1000,reason:"Approve fixture reviewed return",method:"cash",reference:"fixture-return",refundRequestId:mountedPendingRefund.data.id};
      assert.equal((await call(B+"/orders/"+mountedLeafOrder.data.id+"/refunds","POST",mountedLinkedRefund,other)).status,403);
      const mountedMismatchedRefund=await call(B+"/orders/"+mountedLeafOrder.data.id+"/refunds","POST",{...mountedLinkedRefund,amount:2000});
      assert.equal(mountedMismatchedRefund.status,409);
      const mountedRecordedRefund=await call(B+"/orders/"+mountedLeafOrder.data.id+"/refunds","POST",mountedLinkedRefund);
      assert.equal(mountedRecordedRefund.status,200,JSON.stringify(mountedRecordedRefund.data));
      assert.equal((await call(B+"/orders/"+mountedLeafOrder.data.id+"/refunds","POST",mountedLinkedRefund)).data.id,mountedRecordedRefund.data.id);
      const mountedResolvedRefund=(await call(B+"/refund-requests")).data.requests.find(r=>r.id===mountedPendingRefund.data.id);
      assert.equal(mountedResolvedRefund.status,"recorded");assert.equal(mountedResolvedRefund.refundId,mountedRecordedRefund.data.id);assert.equal(mountedResolvedRefund.approvedBy,owner);
      assert.equal((await call(B+"/orders/"+mountedLeafOrder.data.id+"/refunds","POST",{...mountedLinkedRefund,requestKey:randomUUID()})).status,409);
      const mountedSelfRequest=await call(mountedRefundRequestPath,"POST",{...mountedRequestedRefund,requestKey:randomUUID()});
      assert.equal(mountedSelfRequest.status,200);
      assert.equal((await call(B+"/orders/"+mountedLeafOrder.data.id+"/refunds","POST",{...mountedLinkedRefund,requestKey:randomUUID(),refundRequestId:mountedSelfRequest.data.id})).status,403);
      const mountedRejectedRequest=await call(mountedRefundRequestPath,"POST",{...mountedRequestedRefund,requestKey:randomUUID()},other);
      const mountedRejectPath=B+"/refund-requests/"+mountedRejectedRequest.data.id+"/reject";
      assert.equal((await call(mountedRejectPath,"POST",{version:1,reason:"Fixture request declined after review"})).data.status,"rejected");
      assert.equal((await call(mountedRejectPath,"POST",{version:1,reason:"Reject stale fixture review again"})).status,409);
      assert.equal((await call(foreignBase+"/orders/"+mountedLeafOrder.data.id+"/refund-requests","POST",{...mountedRequestedRefund,requestKey:randomUUID()})).status,404);
      assert.equal((await call(foreignBase+"/refund-requests")).data.requests.some(r=>r.id===mountedPendingRefund.data.id),false);
      const mountedMovePath=B+"/stock/movements";
      const mountedRestockIntent={requestKey:randomUUID(),productId:mountedLeafProduct.data.id,type:"restock",quantity:3,expectedStock:9,reason:"Fixture approved finished-product restock"};
      const mountedRestocked=await call(mountedMovePath,"POST",mountedRestockIntent);
      assert.equal(mountedRestocked.status,200,JSON.stringify(mountedRestocked.data));assert.equal(mountedRestocked.data.movement.delta,3);assert.equal(mountedRestocked.data.movement.after,12);
      assert.equal((await call(mountedMovePath,"POST",mountedRestockIntent)).data.movement.id,mountedRestocked.data.movement.id);
      assert.equal((await call(mountedMovePath,"POST",{...mountedRestockIntent,requestKey:randomUUID()})).status,409);
      assert.equal((await call(mountedMovePath,"POST",{...mountedRestockIntent,requestKey:randomUUID(),type:"waste",quantity:13,expectedStock:12})).status,409);
      const mountedWaste=await call(mountedMovePath,"POST",{...mountedRestockIntent,requestKey:randomUUID(),type:"waste",quantity:2,expectedStock:12});
      assert.equal(mountedWaste.status,200);assert.equal(mountedWaste.data.movement.after,10);assert.equal(mountedWaste.data.movement.delta,-2);
      const mountedVariantLoss=await call(mountedMovePath,"POST",{...mountedRestockIntent,requestKey:randomUUID(),variantId:"small",type:"loss",quantity:1,expectedStock:3});
      assert.equal(mountedVariantLoss.status,200,JSON.stringify(mountedVariantLoss.data));assert.equal(mountedVariantLoss.data.movement.after,2);
      const mountedStoredLeaf=(await db.query("SELECT data FROM mera_records WHERE id=$1",[mountedLeafProduct.data.id])).rows[0].data;
      assert.equal(mountedStoredLeaf.stock,10);assert.equal(mountedStoredLeaf.variants[0].stock,2);
      assert.equal((await call(mountedMovePath+"?productId="+mountedLeafProduct.data.id,"GET",undefined,other)).status,403);
      const mountedMovementHistory=await call(mountedMovePath+"?productId="+mountedLeafProduct.data.id+"&take=2");
      assert.equal(mountedMovementHistory.status,200);assert.equal(mountedMovementHistory.data.movements.length,2);assert.equal(mountedMovementHistory.data.hasOlder,true);
      assert.equal((await call(foreignBase+"/stock/movements?productId="+mountedLeafProduct.data.id)).status,404);
      const mountedDraftBranch=await call("/organizations/"+org+"/branches","POST",{name:"Scoped draft branch",timezone:"Africa/Lagos",serviceModes:["counter_takeaway"]});
      assert.equal(mountedDraftBranch.status,201,JSON.stringify(mountedDraftBranch.data));assert.equal(mountedDraftBranch.data.menuVersion,0);assert.equal(mountedDraftBranch.data.settings.orderingPaused,true);assert.equal(mountedDraftBranch.data.chargesApplied,false);
      assert.equal((await call("/organizations/"+org+"/branches","POST",{name:"Forbidden draft"},other)).status,403);
      assert.equal((await call("/organizations/"+org+"/branches","POST",{name:"Invalid time",timezone:"invalid/timezone"})).status,400);
      const mountedEligibleStaff=await call(B+"/service-staff");assert.equal(mountedEligibleStaff.status,200,JSON.stringify(mountedEligibleStaff.data));assert.ok(mountedEligibleStaff.data.staff.some(u=>u.id===owner));assert.ok(!JSON.stringify(mountedEligibleStaff.data).includes("password_hash"));
      assert.equal((await call(B+"/service-staff","GET",undefined,other)).status,403);
      const mountedCustomers=await call(B+"/customers?take=1");assert.equal(mountedCustomers.status,200,JSON.stringify(mountedCustomers.data));assert.equal(mountedCustomers.data.identityScope,"current_branch_guest_activity");assert.equal(mountedCustomers.data.customers.length,1);
      assert.equal((await call(B+"/customers","GET",undefined,other)).status,403);
      const mountedOwnGuestDetails=await call(B+"/customers/"+firstIdentity.data.sessionRef);assert.equal(mountedOwnGuestDetails.status,200,JSON.stringify(mountedOwnGuestDetails.data));assert.equal(mountedOwnGuestDetails.data.customer.contactVerified,false);
      assert.equal((await call(foreignBase+"/customers/"+firstIdentity.data.sessionRef)).status,404);
      assert.ok(!JSON.stringify(mountedOwnGuestDetails.data).includes("token_hash"));
      const membership = (
        await call("/organizations/" + org + "/members")
      ).data.find((m) => m.userId === owner);
      assert.equal(
        (
          await call(
            "/organizations/" + org + "/members/" + membership.id,
            "PATCH",
            { active: false },
          )
        ).status,
        409,
      );
    } finally {
      if (server) await new Promise((r) => server.close(r));
      if (pool) await pool.end();
      await postgres.stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
