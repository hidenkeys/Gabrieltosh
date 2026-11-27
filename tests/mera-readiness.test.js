import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mountMeraReadiness } from "../server/mera/readiness.js";
import {
  assertReservationWindow,
  reservationOverlaps,
  cancellationNeedsReview,
} from "../server/mera/reservation-policy.js";
test("approved booking policies enforce timing, buffers and cancellation review", () => {
  const now = Date.parse("2026-11-18T10:00:00Z"),
    branch = {
      settings: {
        reservationPolicy: {
          approved: true,
          enabled: true,
          minimumLeadMinutes: 60,
          maximumAdvanceDays: 30,
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 10,
          cancellationCutoffMinutes: 120,
        },
      },
    };
  assert.throws(() =>
    assertReservationWindow({ startsAt: "2026-11-18T10:30:00Z" }, branch, now),
  );
  assert.throws(() =>
    assertReservationWindow({ startsAt: "2027-01-01T10:30:00Z" }, branch, now),
  );
  assert.doesNotThrow(() =>
    assertReservationWindow({ startsAt: "2026-11-18T12:00:00Z" }, branch, now),
  );
  const first = {
    startsAt: "2026-11-18T12:00:00Z",
    endsAt: "2026-11-18T13:00:00Z",
  };
  assert.equal(
    reservationOverlaps(
      first,
      { startsAt: "2026-11-18T13:10:00Z", endsAt: "2026-11-18T14:00:00Z" },
      branch,
    ),
    true,
  );
  assert.equal(
    reservationOverlaps(
      first,
      { startsAt: "2026-11-18T13:20:00Z", endsAt: "2026-11-18T14:00:00Z" },
      branch,
    ),
    false,
  );
  assert.equal(
    cancellationNeedsReview(
      { ...first, depositAmount: 0 },
      branch,
      now + 60000,
    ),
    true,
  );
  assert.equal(
    cancellationNeedsReview(
      { ...first, depositAmount: 100 },
      branch,
      now - 86400000,
    ),
    true,
  );
});
test("publishing a branch requires readiness and never claims hosting or provider verification", async () => {
  const old = {
    NODE_ENV: process.env.NODE_ENV,
    MERA_DEMO: process.env.MERA_DEMO,
  };
  process.env.NODE_ENV = "development";
  process.env.MERA_DEMO = "true";
  let branch = {
      id: "branch",
      organization_id: "org",
      name: "Branch",
      timezone: "Africa/Lagos",
      currency: "NGN",
      menu_version: 1,
      published_menu: [{ id: "product" }],
      settings: {serviceHours: [{days:[0,1,2,3,4,5,6],start:"00:00",end:"23:59"}]},
    },
    writes = 0;
  const db = {
    query: async (sql, args) => {
      if (sql.startsWith("SELECT * FROM mera_organizations"))
        return {
          rows: [
            {
              name: "Business",
              slug: "business",
              branding: {},
              policy: { status: "proposed" },
            },
          ],
        };
      if (sql.includes("mera_owner_identities")) return { rows: [] };
      if (sql.startsWith("SELECT * FROM mera_branches"))
        return { rows: [branch] };
      if (sql.startsWith("UPDATE mera_branches")) {
        writes++;
        branch = { ...branch, settings: JSON.parse(args[0]) };
      }
      return { rows: [] };
    },
  };
  const app = express();
  app.use(express.json());
  const router = express.Router();
  mountMeraReadiness(router, {
    db,
    guard: () => (_r, _s, next) => next(),
    scope: () => ({ organizationId: "org", branchId: "branch" }),
    locked: async (_s, fn) => fn(db, branch),
    readRecords: async () => [],
    event: async () => {},
  });
  app.use(router);
  app.use((err, _req, res, _next) =>
    res.status(err.status || 400).json({ error: err.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base =
      "http://127.0.0.1:" +
      server.address().port +
      "/organizations/org/branches/branch",
    headers = { "content-type": "application/json" };
  try {
    assert.equal(
      (await (await fetch(base + "/readiness")).json()).canPublish,
      false,
    );
    assert.equal(
      (
        await fetch(base + "/launch", {
          method: "POST",
          headers,
          body: JSON.stringify({ confirm: true }),
        })
      ).status,
      409,
    );
    assert.equal(writes, 0);
    const configured = await fetch(base + "/launch-policy", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        manualPaymentMethods: ["cash"],
        launchAcknowledged: true,
        publicContact: "hello@venue.test",
      }),
    });
    assert.equal(configured.status, 200);
    const launch = await (
      await fetch(base + "/launch", {
        method: "POST",
        headers,
        body: JSON.stringify({ confirm: true }),
      })
    ).json();
    assert.equal(launch.launchState, "published");
    assert.equal(launch.checks.find(c=>c.id==="printing").status,"ready");
    // Going live is what lets customers order: a newly created location starts paused.
    assert.equal(branch.settings.orderingPaused, false);
    assert.equal(launch.publicHostingVerified, false);
    assert.equal(launch.paymentProviderState, "blocked");
  } finally {
    await new Promise((r) => server.close(r));
    for (const key of Object.keys(old))
      old[key] === undefined
        ? delete process.env[key]
        : (process.env[key] = old[key]);
  }
});

test("receipt defaults are ready without saved templates (no listening socket)", async () => {
  const handlers = new Map();
  const branch = {id:"branch",organization_id:"org",name:"Branch",timezone:"Africa/Lagos",currency:"NGN",menu_version:1,published_menu:[{id:"item"}],settings:{serviceHours:[{days:[0],start:"08:00",end:"22:00"}],publicContact:"hello@venue.test",manualPaymentMethods:["cash"]}};
  const db={query:async(sql)=>({rows:sql.includes("mera_owner_identities")?[{user_id:"owner"}]:sql.includes("mera_organizations")?[{name:"Venue",slug:"venue",branding:{}}]:[branch]})};
  mountMeraReadiness({get:(path,...middleware)=>handlers.set(path,middleware.at(-1)),patch:()=>{},post:()=>{}},{db,guard:()=>()=>{},scope:()=>({organizationId:"org",branchId:"branch"}),locked:async(_scope,fn)=>fn(db,branch),readRecords:async()=>[],event:async()=>{}});
  let result;
  await handlers.get("/organizations/:organizationId/branches/:branchId/readiness")({}, {json:value=>{result=value;}});
  assert.equal(result.checks.find(c=>c.id==="printing").status,"ready");
  assert.equal(result.canPublish,true);
});
