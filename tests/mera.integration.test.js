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
          data: await response.json(),
          cookie: response.headers.get("set-cookie")?.split(";")[0],
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
      await call(B + "/stock", "POST", {
        productId: selected.id,
        quantity: 1,
        reason: "Last unit test",
      });
      const g1 = (
        await call(P + "/guests", "POST", { displayName: "Guest One" }, null)
      ).cookie;
      const g2 = (
        await call(P + "/guests", "POST", { displayName: "Guest Two" }, null)
      ).cookie;
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
      assert.equal(reused.cookie, undefined);
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
