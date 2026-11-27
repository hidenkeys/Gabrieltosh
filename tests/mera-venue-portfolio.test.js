import test from "node:test";
import assert from "node:assert/strict";
import { newDb, DataType } from "pg-mem";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  buildVenuePortfolio,
  seedVenuePortfolio,
} from "../server/mera/venue-portfolio.js";
import { branchSettingsInputSchema } from "../server/mera/index.js";
import {
  productInputSchema,
  orderInputSchema,
  paymentInputSchema,
  reservationInputSchema,
} from "../shared/mera-contracts.js";
import {
  TYPE_DEFAULTS,
  capabilitiesToLegacyModes,
} from "../shared/mera-venues.js";
import { minimumSpendSnapshot } from "../server/mera/minimum-spend.js";
import { buildOverview } from "../server/mera/overview.js";
import {
  effectiveBranchAccess,
  canSeeBranch,
} from "../server/mera/venue-access.js";
import { assertVenueSeedTarget } from "../scripts/seed-mera-venues.js";
import { meraPreviewConfig } from "../scripts/mera-preview-config.js";
const now = "2026-11-24T12:00:00.000Z";
test("portfolio products, location settings, references and capabilities satisfy application contracts", () => {
  const all = buildVenuePortfolio({ now });
  assert.equal(all.length, 7);
  assert.deepEqual(all, buildVenuePortfolio({ now }));
  for (const org of all)
    for (const b of org.branches) {
      const s = b.settings;
      minimumSpendSnapshot(b);
      // Validate the writable fields with the exact server settings PATCH schema.
      branchSettingsInputSchema.parse(
        Object.fromEntries(
          [
            "venueType",
            "capabilities",
            "code",
            "colorTag",
            "role",
            "entryProductId",
            "serviceModes",
            "serviceHours",
            "version",
            "address",
            "payLater",
            "reservationsEnabled",
            "capacity",
            "holdMinutes",
            "orderingPaused",
            "showSoldOut",
          ]
            .filter((k) => s[k] !== undefined)
            .map((k) => [k, s[k]]),
        ),
      );
      for (const cap of TYPE_DEFAULTS[s.venueType].capabilities)
        assert.ok(s.capabilities.includes(cap));
      assert.deepEqual(
        s.serviceModes,
        capabilitiesToLegacyModes(s.capabilities),
      );
      assert.equal(b.cutoff, TYPE_DEFAULTS[s.venueType].cutoff);
      assert.equal(
        s.payLater,
        TYPE_DEFAULTS[s.venueType].payLater ||
          s.capabilities.includes("open_tabs"),
      );
      for (const p of b.products) {
        productInputSchema.parse(p);
        z.string().uuid().parse(p.id);
        for (const ref of [
          ...p.components,
          ...p.choiceGroups.flatMap((g) => g.options),
        ])
          assert.equal(
            b.products.find((x) => x.id === ref.productId)?.kind,
            "single",
          );
      }
      assert.equal(new Set(b.products.map((p) => p.kind)).size, 3);
    }
  for (const org of all)
    for (const r of org.records) {
      if (r.kind === "order")
        orderInputSchema.parse({
          ...r.data,
          visitId: r.data.visitId || undefined,
        });
      if (r.kind === "payment") paymentInputSchema.parse(r.data);
      if (r.kind === "reservation") reservationInputSchema.parse(r.data);
      if (r.kind === "ledger")
        assert.equal(
          r.data.postings.reduce((n, p) => n + p.debit - p.credit, 0),
          0,
        );
    }
  const hotel = all.find((o) => o.slug === "harbour-hotel");
  assert.equal(hotel.operating.inventoryMode, "central");
  assert.equal(
    hotel.records.filter((r) => r.kind === "stock_transfer").length,
    2,
  );
  const pulse = all.find((o) => o.slug === "pulse").branches[0];
  assert.ok(pulse.products.some((p) => p.id === pulse.settings.entryProductId));
  assert.equal(pulse.cutoff, 420);
});
test("history produces recognized revenue, refunds, room charges and no-shows in the real overview", () => {
  for (const org of buildVenuePortfolio({ now })) {
    const overview = buildOverview(org.branches, org.records, {
      from: "2026-11-09",
      to: "2026-11-25",
    });
    assert.equal(
      overview.totals.orders,
      14 * org.branches.filter((b) => b.settings.role !== "stock_room").length,
    );
    assert.ok(overview.totals.revenue > 0);
    assert.ok(overview.totals.refunds > 0);
    const expected = org.records
      .filter((r) => r.kind === "order")
      .reduce((n, r) => n + r.data.total - r.data.refunded, 0);
    assert.equal(overview.totals.revenue, expected);
    if (org.slug === "harbour-hotel") {
      assert.ok(overview.totals.roomCharges > 0);
      assert.equal(overview.branches.length, 3);
      assert.equal(overview.stock.inTransit.length, 1);
    }
    if (org.branches[0].settings.reservationsEnabled)
      assert.ok(overview.totals.noShows > 0);
  }
});
test("local guard refuses production, QA instance, remote hosts and wrong ports", () => {
  const good = {
    MERA_PREVIEW_INSTANCE: "venues",
    MERA_PREVIEW_DB_PORT: "55451",
    DATABASE_URL: "postgres://demo:unused@127.0.0.1:55451/postgres",
  };
  assert.doesNotThrow(() =>
    assertVenueSeedTarget(good, meraPreviewConfig(good)),
  );
  for (const patch of [
    { NODE_ENV: "production" },
    { MERA_PREVIEW_INSTANCE: "ux-next" },
    { MERA_PREVIEW_INSTANCE: "" },
    { DATABASE_URL: "postgres://demo:unused@remote:55451/postgres" },
    { DATABASE_URL: "postgres://demo:unused@127.0.0.1:55441/postgres" },
    {
      DATABASE_URL:
        "postgres://demo:unused@127.0.0.1:55451/postgres?host=remote",
    },
  ])
    assert.throws(() => {
      const env = { ...good, ...patch };
      assertVenueSeedTarget(env, meraPreviewConfig(env));
    });
});
async function memoryFixture() {
  const memory = newDb();
  memory.public.registerFunction({
    name: "pg_advisory_xact_lock",
    args: [DataType.integer],
    returns: DataType.integer,
    implementation: () => 1,
  });
  const { Pool } = memory.adapters.createPg(),
    pool = new Pool();
  await pool.query(
    "CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,username TEXT UNIQUE,password_hash TEXT,role TEXT)",
  );
  const schema = await readFile(
    new URL("../server/mera/schema.sql", import.meta.url),
    "utf8",
  );
  await pool.query(schema.split("CREATE OR REPLACE FUNCTION")[0]);
  await pool.query(
    "ALTER TABLE mera_organizations ADD COLUMN operating JSONB NOT NULL DEFAULT '{}'; ALTER TABLE mera_memberships ADD COLUMN branch_roles JSONB NOT NULL DEFAULT '{}'",
  );
  await pool.query(
    "CREATE TABLE mera_slug_claims(slug TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES mera_organizations(id))",
  );
  const db = {
    query: (s, v) => pool.query(s, v),
    transaction: async (fn) => {
      const backup = memory.backup();
      try {
        return await fn(db);
      } catch (e) {
        backup.restore();
        throw e;
      }
    },
  };
  return { db, pool };
}
// This seeds 77 real bcrypt cost-12 hashes, which exceeds 30s on slower runners.
test("in-memory seed skips existing slugs, preserves edits and enforces per-location roles", { timeout: 180000 }, async () => {
  const { db, pool } = await memoryFixture();
  try {
    const counts = await seedVenuePortfolio(db, {
      now,
      days: 1,
      passwordFor: () => "synthetic-test-password-only",
    });
    assert.equal(counts.organizations, 7);
    assert.equal(counts.users, 77);
    const org = buildVenuePortfolio({ now, days: 1 })[0];
    await db.query("UPDATE mera_organizations SET name=$1 WHERE id=$2", [
      "Preserved edit",
      org.id,
    ]);
    const existingRestaurant = buildVenuePortfolio({ now, days: 1 })[1]
      .branches[0];
    const preservedSettings = {
      ...existingRestaurant.settings,
      payLater: false,
    };
    await db.query("UPDATE mera_branches SET settings=$1 WHERE id=$2", [
      JSON.stringify(preservedSettings),
      existingRestaurant.id,
    ]);
    const again = await seedVenuePortfolio(db, {
      now,
      passwordFor: () => {
        throw new Error("must not rotate");
      },
    });
    assert.equal(again.skipped, 7);
    assert.equal(again.users, 0);
    assert.deepEqual(
      (
        await db.query("SELECT settings FROM mera_branches WHERE id=$1", [
          existingRestaurant.id,
        ])
      ).rows[0].settings,
      preservedSettings,
    );
    assert.equal(
      (
        await db.query("SELECT name FROM mera_organizations WHERE id=$1", [
          org.id,
        ])
      ).rows[0].name,
      "Preserved edit",
    );
    const members = (
      await db.query(
        "SELECT * FROM mera_memberships WHERE organization_id=$1",
        [org.id],
      )
    ).rows;
    const cashier = members.find((m) => m.role === "cashier");
    assert.equal(canSeeBranch(cashier, org.branches[1].id), false);
    const manager = members.find((m) => m.role === "branch_manager");
    assert.equal(
      effectiveBranchAccess(manager, org.branches[0].id).role,
      "branch_manager",
    );
    assert.equal(
      effectiveBranchAccess(manager, org.branches[1].id).role,
      "cashier",
    );
  } finally {
    await pool.end();
  }
});
test("in-memory seed rolls back all organizations on a password failure", async () => {
  const { db, pool } = await memoryFixture();
  try {
    await assert.rejects(
      seedVenuePortfolio(db, {
        now,
        passwordFor: () => {
          throw new Error("private provider failed");
        },
      }),
    );
    assert.equal(
      (await db.query("SELECT * FROM mera_organizations")).rows.length,
      0,
    );
  } finally {
    await pool.end();
  }
});

test("pay-at-end venue defaults enable preparation without changing pay-first defaults", () => {
  for (const type of [
    "casual_dining",
    "reservation_restaurant",
    "lounge",
    "club",
    "hotel_fb",
  ])
    assert.equal(TYPE_DEFAULTS[type].payLater, true, type);
  for (const type of ["quick_service", "cafe"])
    assert.equal(TYPE_DEFAULTS[type].payLater, false, type);
});
