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
      for (const status of ["preparing", "ready", "collected", "completed"]) {
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
      });
      const nextVisit = (
        await call(B + "/visits", "POST", {
          tableId: table.id,
          displayName: "New Visit",
        })
      ).data;
      assert.notEqual(nextVisit.id, visit.id);
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
      const exportJob = await call(B + "/exports", "POST", {
        date: exportDate,
        requestKey: randomUUID(),
      });
      assert.equal(exportJob.status, 202, JSON.stringify(exportJob.data));
      assert.equal(await processMeraJobs(db), true);
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
