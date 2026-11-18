import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  claimOrganizationSlug,
  resolveOrganizationSlug,
  mountMeraOrganizationAliases,
  organizationSlugSchema,
  migrateMeraAliases,
} from "../server/mera/organization-aliases.js";
function fixture() {
  const first = randomUUID(),
    second = randomUUID(),
    organizations = new Map([
      [first, { id: first, name: "First venue", slug: "first-venue" }],
      [second, { id: second, name: "Second venue", slug: "second-venue" }],
    ]),
    claims = new Map(),
    audits = [];
  let route;
  const query = async (sql, p = []) => {
    if (sql.startsWith("SELECT id FROM mera_organizations WHERE slug"))
      return {
        rows: [...organizations.values()]
          .filter((o) => o.slug === p[0])
          .map((o) => ({ id: o.id })),
      };
    if (sql.startsWith("INSERT INTO mera_slug_claims")) {
      if (!claims.has(p[0])) claims.set(p[0], p[1]);
      return { rows: [] };
    }
    if (sql.startsWith("SELECT organization_id"))
      return {
        rows: claims.has(p[0]) ? [{ organization_id: claims.get(p[0]) }] : [],
      };
    if (sql.startsWith("SELECT o.*")) {
      const id = claims.get(p[0]),
        found = id
          ? organizations.get(id)
          : [...organizations.values()].find((o) => o.slug === p[0]);
      return { rows: found ? [{ ...found }] : [] };
    }
    if (sql.startsWith("SELECT id,name,slug"))
      return {
        rows: organizations.has(p[0]) ? [{ ...organizations.get(p[0]) }] : [],
      };
    if (sql.startsWith("UPDATE mera_organizations")) {
      organizations.get(p[1]).slug = p[0];
      return { rows: [] };
    }
    throw Error(sql);
  };
  const db = { query, transaction: (fn) => fn({ query }) };
  mountMeraOrganizationAliases(
    {
      post: (path, guard, handler) => {
        assert.equal(path, "/platform/organizations/:organizationId/rename");
        route = { guard, handler };
      },
    },
    {
      db,
      platformGuard: (req, res, next) => {
        if (!req.operator)
          throw Object.assign(Error("Operator required"), { status: 403 });
        next();
      },
      platformAudit: async (c, req, action, org, details) =>
        audits.push({ actor: req.user.id, action, org, details }),
    },
  );
  return {
    first,
    second,
    db,
    claims,
    organizations,
    audits,
    async rename(id, body, operator = true) {
      let value;
      const req = {
          params: { organizationId: id },
          body,
          operator,
          user: { id: "operator" },
        },
        res = {
          json(v) {
            value = v;
            return this;
          },
        };
      await route.guard(req, res, () => {});
      await route.handler(req, res);
      return value;
    },
  };
}
test("rename preserves old claims, resolves canonical identity and permits same-owner rename-back", async () => {
  const f = fixture();
  const initial = await resolveOrganizationSlug(f.db, "first-venue");
  assert.equal(initial.id, f.first);
  const changed = await f.rename(f.first, {
    expectedSlug: "first-venue",
    newSlug: "New-Name",
    reason: "Approved fixture rename",
  });
  assert.equal(changed.slug, "new-name");
  assert.equal(
    (await resolveOrganizationSlug(f.db, "first-venue")).slug,
    "new-name",
  );
  assert.equal((await resolveOrganizationSlug(f.db, "new-name")).id, f.first);
  await assert.rejects(
    claimOrganizationSlug(f.db, f.second, "first-venue"),
    (e) => e.status === 409,
  );
  await f.rename(f.first, {
    expectedSlug: "new-name",
    newSlug: "first-venue",
    reason: "Approved rename back",
  });
  assert.equal(
    (await resolveOrganizationSlug(f.db, "new-name")).slug,
    "first-venue",
  );
  assert.equal(f.audits.length, 2);
  assert.equal(f.audits[0].details.oldAliasPreserved, true);
});
test("namespace claims reject canonical and preserved collisions; stale or unauthorized rename fails", async () => {
  const f = fixture();
  await assert.rejects(
    claimOrganizationSlug(f.db, f.first, "second-venue"),
    (e) => e.status === 409,
  );
  await assert.rejects(
    f.rename(f.first, {
      expectedSlug: "stale-name",
      newSlug: "free-name",
      reason: "Approved fixture rename",
    }),
    (e) => e.status === 409,
  );
  assert.equal(f.claims.has("free-name"), false);
  await assert.rejects(
    f.rename(
      f.first,
      {
        expectedSlug: "first-venue",
        newSlug: "free-name",
        reason: "Approved fixture rename",
      },
      false,
    ),
    (e) => e.status === 403,
  );
  assert.equal(f.organizations.get(f.first).slug, "first-venue");
});
test("reserved addresses and malformed slugs are blocked; migration backfills without stealing claims", async () => {
  for (const slug of [
    "admin",
    "API",
    "platform",
    "www",
    "support",
    "-bad",
    "bad--name",
    "a",
    "https://external.example",
  ])
    assert.equal(organizationSlugSchema.safeParse(slug).success, false);
  assert.equal(organizationSlugSchema.parse(" Venue-Name "), "venue-name");
  const calls = [];
  await migrateMeraAliases({
    query: async (sql) => {
      calls.push(sql);
    },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /CREATE TABLE IF NOT EXISTS mera_slug_claims/);
  assert.match(calls[0], /ON CONFLICT\(slug\) DO NOTHING/);
  assert.match(calls[0], /RAISE EXCEPTION/);
});
