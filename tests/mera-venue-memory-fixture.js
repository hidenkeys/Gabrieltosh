import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMeraRouter } from "../server/mera/index.js";
import { buildVenuePortfolio } from "../server/mera/venue-portfolio.js";
import { rolePermissions } from "../shared/mera-contracts.js";

// The MEMORY_DB route-handler pattern used by mera-package-order.test.js.
// No sockets, PostgreSQL, environment database URL or remote services.
export function venueMemoryFixture(slug) {
  const org = buildVenuePortfolio({ days: 1 }).find((o) => o.slug === slug);
  const b = structuredClone(org.branches[0]);
  Object.assign(b, {
    organization_id: org.id,
    currency: "NGN",
    menu_version: 1,
    published_menu: b.products,
  });
  const owner = org.users.find((u) => u.role === "owner");
  Object.assign(org, {
    branding: {},
    policy: {},
    subscription: { status: "active" },
    onboarding: { status: "published" },
  });
  // Configure a full-day test trading window; exercise hours validation separately.
  b.settings.serviceHours = [
    { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" },
  ];
  let rows = structuredClone(
    org.records.filter(
      (r) =>
        r.branch_id === b.id &&
        ["table", "product", "category"].includes(r.kind),
    ),
  );
  for (const row of rows)
    if (row.kind === "table") row.data.status = "available";
  const guests = [];
  const member = {
    role: "owner",
    organization_wide: true,
    branch_ids: [],
    permissions: rolePermissions.owner,
  };
  const db = {
    async transaction(fn) {
      const before = structuredClone(rows);
      try {
        return await fn(db);
      } catch (e) {
        rows = before;
        throw e;
      }
    },
    async query(sql, args = []) {
      let result;
      if (sql.includes("mera_owner_identities"))
        result = [{ user_id: owner.id }];
      else if (sql.includes("mera_memberships")) result = [member];
      else if (sql.startsWith("INSERT INTO mera_guests")) {
        guests.push({
          id: args[0],
          token_hash: args[1],
          organization_id: args[2],
          display_name: args[3],
          expires_at: args[4],
        });
        result = [];
      } else if (sql.includes("mera_guests"))
        result = guests.filter(
          (g) =>
            g.token_hash === args[0] && Date.parse(g.expires_at) > Date.now(),
        );
      else if (sql.includes("mera_branches"))
        result = sql.includes("COUNT(*)") ? [{ count: 1 }] : [b];
      else if (sql.includes("mera_organizations")) result = [org];
      else if (sql.startsWith("INSERT INTO mera_records")) {
        if (sql.includes("jsonb_array_elements"))
          for (const data of JSON.parse(args[0]))
            rows.push({
              id: data.id,
              organization_id: args[1],
              branch_id: args[2],
              kind: "print_job",
              data,
            });
        else {
          const [id, organization_id, branch_id] = args;
          const kind = sql.match(/,'([^']+)'/)?.[1] || args[3];
          const json = sql.includes("'audit'") ? args[3] : args[4];
          rows.push({
            id,
            organization_id,
            branch_id,
            kind,
            data: JSON.parse(json),
          });
        }
        result = [];
      } else if (sql.startsWith("UPDATE mera_records")) {
        const [json, id, organization_id, branch_id] = args;
        const kind = sql.match(/kind='([^']+)'/)?.[1] || args[4];
        const row = rows.find(
          (r) =>
            r.id === id &&
            r.organization_id === organization_id &&
            r.branch_id === branch_id &&
            r.kind === kind,
        );
        if (row) row.data = JSON.parse(json);
        result = row ? [{ id }] : [];
      } else if (sql.includes("mera_records")) {
        const literalKind = sql.match(/kind='([^']+)'/)?.[1];
        if (sql.includes("WHERE id=$1"))
          result = rows.filter(
            (r) =>
              r.id === args[0] &&
              (args.length === 1 || r.organization_id === args[1]) &&
              (args.length < 3 || r.branch_id === args[2]) &&
              r.kind === (literalKind || args[3]),
          );
        else {
          const kind = literalKind || args[2];
          result = rows.filter(
            (r) =>
              r.organization_id === args[0] &&
              r.branch_id === args[1] &&
              (!kind || r.kind === kind),
          );
          if (sql.includes("data ? 'requestKey'"))
            result = result.filter((r) => r.data.requestKey === args[3]);
          if (sql.includes("data->>'orderId'=$3"))
            result = result.filter((r) => r.data.orderId === args[2]);
          if (sql.includes("data->>'visitId'=$3"))
            result = result.filter(
              (r) => r.data.visitId === args[2] && r.data.status === "open",
            );
          if (sql.includes("data->>'stockHeld'='true'"))
            result = result.filter(
              (r) => r.data.stockHeld && r.data.holdExpiresAt <= args[2],
            );
          if (sql.includes("data->'charges' @>"))
            result = result.filter((r) =>
              r.data.charges?.some(
                (c) => c.orderId === JSON.parse(args[2])[0].orderId,
              ),
            );
          if (sql.includes("data->>'guestId'=$3"))
            result = result.filter(
              (r) =>
                r.data.guestId === args[2] &&
                r.data.source === "customer_qr" &&
                ["submitted", "accepted", "preparing", "ready"].includes(
                  r.data.status,
                ) &&
                r.data.paymentStatus !== "paid",
            );
          if (sql.includes("COUNT(*)")) result = [{ count: result.length }];
        }
      } else throw Error("Unexpected MEMORY_DB SQL: " + sql);
      return { rows: structuredClone(result) };
    },
  };
  const router = createMeraRouter(db),
    B = "/organizations/:organizationId/branches/:branchId",
    P = "/public/:slug/:branchId";
  const cookies = {};
  async function invoke(
    path,
    body,
    { guest = false, method = "post", params = {} } = {},
  ) {
    const route = router.stack.find(
      (l) =>
        l.route?.path ===
          (path.startsWith("/public/") ? path : (guest ? P : B) + path) &&
        l.route.methods[method],
    )?.route;
    assert.ok(route, `Mounted route ${method} ${path}`);
    let response;
    const req = {
      params: {
        organizationId: org.id,
        branchId: b.id,
        slug: org.slug,
        ...params,
      },
      body,
      query: {},
      cookies,
      hostname: "localhost",
      protocol: "https",
      get: (name) => (name === "host" ? "localhost" : undefined),
      user: guest ? undefined : owner,
      meraMembership: member,
    };
    const res = {
      status() {
        return this;
      },
      set() {
        return this;
      },
      cookie(k, v) {
        cookies[k] = v;
        return this;
      },
      json(v) {
        response = v;
        return this;
      },
      redirect(code, url) {
        response = { code, url };
      },
    };
    // Execute the mounted authorization middleware as well as the route handler.
    for (const layer of route.stack) {
      let next = false;
      await layer.handle(req, res, (e) => {
        if (e) throw e;
        next = true;
      });
      if (!next) break;
    }
    return response;
  }
  return {
    db,
    org,
    b,
    owner,
    invoke,
    records: (kind) =>
      rows.filter((r) => r.kind === kind).map((r) => structuredClone(r.data)),
  };
}
