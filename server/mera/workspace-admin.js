import { locationFields, locationSettings } from "./venue-access.js";
import { defaultLocationCode,deriveVenueType,TYPE_DEFAULTS } from "../../shared/mera-venues.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { resolveRole } from "./roles.js";
const B = "/organizations/:organizationId/branches/:branchId";
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status });
const pageSchema = z
  .object({
    take: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(2000).optional(),
  })
  .strict();
const cursorSchema = z
  .object({
    organizationId: z.string(),
    branchId: z.string(),
    guestId: z.string().uuid(),
    lastAt: z.string().datetime(),
  })
  .strict();
const uuidPattern =
  "^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$";
const aggregate = `WITH activity AS (SELECT kind,data,created_at,data->>'guestId' AS guest_id,COALESCE(NULLIF(data->>'createdAt','')::timestamptz,NULLIF(data->>'recordedAt','')::timestamptz,created_at) AS event_at FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind IN ('order','reservation','complaint','customer_consent') AND data->>'guestId' ~ '${uuidPattern}' AND EXISTS(SELECT 1 FROM mera_guests guest WHERE guest.id=mera_records.data->>'guestId' AND guest.organization_id=$1)), grouped AS (SELECT guest_id,COUNT(*) FILTER(WHERE kind='order')::int AS order_count,COUNT(*) FILTER(WHERE kind='reservation')::int AS reservation_count,COUNT(*) FILTER(WHERE kind='complaint')::int AS feedback_count,MAX(event_at) AS last_at,(array_agg(NULLIF(data->>'displayName','') ORDER BY event_at DESC) FILTER(WHERE NULLIF(data->>'displayName','') IS NOT NULL))[1] AS display_name FROM activity GROUP BY guest_id) `;
const consentSql = `COALESCE((SELECT jsonb_build_object('marketing',a.data->'marketing','recordedAt',a.data->>'recordedAt','explicit',true,'deliveryAvailable',false) FROM activity a WHERE a.guest_id=g.guest_id AND a.kind='customer_consent' AND a.data->>'source'='explicit_guest_preference' ORDER BY a.event_at DESC,a.data->>'id' DESC LIMIT 1),'{"marketing":false,"recordedAt":null,"explicit":false,"deliveryAvailable":false}'::jsonb) AS consent`;
export function customerSummary(row) {
  return {
    guestId: row.guest_id,
    displayName: row.display_name || "Guest session",
    orders: Number(row.order_count),
    reservations: Number(row.reservation_count),
    feedback: Number(row.feedback_count),
    lastAt: new Date(row.last_at).toISOString(),
    consent: {
      marketing:
        row.consent?.explicit === true && row.consent.marketing === true,
      recordedAt:
        row.consent?.explicit === true ? row.consent.recordedAt : null,
      explicit: row.consent?.explicit === true,
      deliveryAvailable: false,
    },
    identityScope: "current_branch_guest_activity",
    contactVerified: false,
  };
}
export function customerActivityView(kind, data) {
  if (kind === "order")
    return {
      id: data.id,
      reference: data.reference,
      status: data.status,
      paymentStatus: data.paymentStatus,
      total: data.total,
      paid: data.paid,
      refunded: data.refunded,
      createdAt: data.createdAt,
    };
  if (kind === "reservation")
    return {
      id: data.id,
      status: data.status,
      partySize: data.partySize,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      createdAt: data.createdAt,
    };
  if (kind === "complaint")
    return {
      id: data.id,
      orderId: data.orderId,
      category: data.category,
      rating: data.rating,
      text: data.text,
      status: data.status,
      createdAt: data.createdAt,
    };
  return null;
}
export function mountMeraWorkspaceAdmin(router, { db, guard, scope, event }) {
  router.post(
    "/organizations/:organizationId/branches",
    guard("organization.manage"),
    async (req, res) => {
      if (!req.meraMembership?.organization_wide)
        throw fail("Organization-wide management access is required.", 403);
      const input = z
        .object({
          ...locationFields,
          requestKey: z.string().uuid(),
          name: z.string().trim().min(1).max(100),
          timezone: z
            .string()
            .refine((value) => {
              try {
                new Intl.DateTimeFormat("en", { timeZone: value });
                return true;
              } catch {
                return false;
              }
            }, "Use an IANA timezone.")
            .default("Africa/Lagos"),
          currency: z.literal("NGN").default("NGN"),
          serviceModes: z
            .array(
              z.enum([
                "counter_takeaway",
                "table_service",
                "reservations",
                "lounge_club",
              ]),
            )
            .min(1)
            .max(4)
            .default(["counter_takeaway"]),
          cutoff: z.number().int().min(0).max(1439).default(0),
        })
        .strict()
        .parse(req.body);
      input.serviceModes = [...new Set(input.serviceModes)].sort();
      res.status(201).set("Cache-Control", "no-store").json(
        await db.transaction(async (c) => {
          const org = (
            await c.query(
              "SELECT id FROM mera_organizations WHERE id=$1 FOR UPDATE",
              [req.params.organizationId],
            )
          ).rows[0];
          if (!org) throw fail("Organization not found.", 404);
          const previous = (await c.query(
            "SELECT data FROM mera_records WHERE organization_id=$1 AND kind='branch_creation' AND data->>'requestKey'=$2 LIMIT 1",
            [org.id,input.requestKey],
          )).rows[0]?.data;
          if (previous) {
            const same = previous.actorId === req.user.id &&
              ["name", "timezone", "currency", "cutoff"].every(key => previous.intent[key] === input[key]) &&
              previous.intent.serviceModes.length === input.serviceModes.length &&
              previous.intent.serviceModes.every((mode,index) => mode === input.serviceModes[index]) &&
              Object.keys(locationFields).every(key=>JSON.stringify(previous.intent[key])===JSON.stringify(input[key]));
            if (!same) throw Object.assign(fail("This request key belongs to a different branch creation intent."), { code: "IDEMPOTENCY_CONFLICT" });
            return previous.result;
          }
          const branchId = randomUUID(),
            settings = {
              ...locationSettings(Object.fromEntries(Object.keys(locationFields).filter(k=>input[k]!==undefined).map(k=>[k,input[k]]))),
              serviceModes: locationSettings(input).serviceModes,
              orderingPaused: true,
              reservationsEnabled: false,
              showSoldOut: true,
              capacity: 30,
              holdMinutes: 10,
            };
          const existing=(await c.query("SELECT id,settings FROM mera_branches WHERE organization_id=$1",[org.id])).rows;
          settings.code=input.code||defaultLocationCode(input.name,existing.map(b=>b.settings?.code));
          if(existing.some(b=>b.settings?.code===settings.code))throw fail("Location code is already in use.");
          settings.venueType ||= deriveVenueType(settings);
          settings.payLater = TYPE_DEFAULTS[settings.venueType].payLater;
          settings.role ||= 'outlet'; settings.colorTag ||= 'forest';settings.version=1;
          await c.query(
            "INSERT INTO mera_branches(id,organization_id,name,timezone,currency,cutoff,settings,menu_version,published_menu) VALUES($1,$2,$3,$4,$5,$6,$7,0,$8)",
            [
              branchId,
              org.id,
              input.name,
              input.timezone,
              input.currency,
              input.cutoff,
              JSON.stringify(settings),
              "[]",
            ],
          );
          await event(
            c,
            { organizationId: org.id, branchId },
            "branch_created_draft",
            req.user,
            { name: input.name, menuVersion: 0, chargesApplied: false },
          );
          const result = {
            id: branchId,
            organizationId: org.id,
            ...input,
            settings,
            menuVersion: 0,
            published: false,
            chargesApplied: false,
            entitlementsRequireReadinessReview: true,
          };
          const operation = { id: randomUUID(), requestKey: input.requestKey, actorId: req.user.id, intent: input, result, createdAt: new Date().toISOString() };
          await c.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'branch_creation',$4)", [operation.id,org.id,branchId,JSON.stringify(operation)]);
          return result;
        }),
      );
    },
  );
  router.get(B + "/service-staff", guard("orders.assign"), async (req, res) => {
    const s = scope(req),
      rows = (
        await db.query(
          "SELECT u.id,u.name,m.role FROM mera_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.active=true AND u.active=true AND (m.organization_wide=true OR m.branch_ids ? $2) ORDER BY u.name,u.id LIMIT 501",
          [s.organizationId, s.branchId],
        )
      ).rows;
    const available = new Set();
    for (const role of new Set(rows.map((row) => row.role))) {
      try {
        await resolveRole(db, s.organizationId, role);
        available.add(role);
      } catch {
        /* Revoked custom roles never supply assignment candidates. */
      }
    }
    res.json({
      staff: rows
        .slice(0, 500)
        .filter((row) => available.has(row.role))
        .map(({ id, name }) => ({ id, name })),
      truncated: rows.length > 500,
    });
  });
  router.get(
    B + "/customers",
    guard("organization.manage"),
    async (req, res) => {
      const input = pageSchema.parse(req.query),
        s = scope(req);
      let cursor;
      try {
        cursor = input.cursor
          ? cursorSchema.parse(
              JSON.parse(
                Buffer.from(input.cursor, "base64url").toString("utf8"),
              ),
            )
          : null;
      } catch {
        throw fail("Customer cursor is invalid.", 400);
      }
      if (
        cursor &&
        (cursor.organizationId !== s.organizationId ||
          cursor.branchId !== s.branchId)
      )
        throw fail("Customer cursor belongs to another branch.", 400);
      const rows = (
        await db.query(
          aggregate +
            `SELECT g.*,${consentSql} FROM grouped g ${cursor ? "WHERE (g.last_at,g.guest_id)<($3::timestamptz,$4)" : ""} ORDER BY g.last_at DESC,g.guest_id DESC LIMIT $${cursor ? 5 : 3}`,
          cursor
            ? [
                s.organizationId,
                s.branchId,
                cursor.lastAt,
                cursor.guestId,
                input.take + 1,
              ]
            : [s.organizationId, s.branchId, input.take + 1],
        )
      ).rows;
      const selected = rows.slice(0, input.take),
        last = selected.at(-1);
      res.set("Cache-Control", "no-store").json({
        customers: selected.map(customerSummary),
        nextCursor:
          rows.length > input.take && last
            ? Buffer.from(
                JSON.stringify({
                  ...s,
                  guestId: last.guest_id,
                  lastAt: new Date(last.last_at).toISOString(),
                }),
              ).toString("base64url")
            : null,
        identityScope: "current_branch_guest_activity",
      });
    },
  );
  router.get(
    B + "/customers/:guestId",
    guard("organization.manage"),
    async (req, res) => {
      const guestId = z.string().uuid().parse(req.params.guestId),
        input = z
          .object({ take: z.coerce.number().int().min(1).max(50).default(50) })
          .strict()
          .parse(req.query),
        s = scope(req);
      const customer = (
        await db.query(
          aggregate +
            `SELECT g.*,${consentSql} FROM grouped g WHERE g.guest_id=$3`,
          [s.organizationId, s.branchId, guestId],
        )
      ).rows[0];
      if (!customer)
        throw fail("Customer activity not found in this branch.", 404);
      const rows = (
        await db.query(
          "SELECT kind,data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND data->>'guestId'=$3 AND kind IN ('order','reservation','complaint') ORDER BY created_at DESC,id DESC LIMIT $4",
          [s.organizationId, s.branchId, guestId, input.take + 1],
        )
      ).rows.slice(0, input.take + 1);
      const visible = rows.slice(0, input.take);
      res.set("Cache-Control", "no-store").json({
        customer: customerSummary(customer),
        orders: visible
          .filter((row) => row.kind === "order")
          .map((row) => customerActivityView(row.kind, row.data)),
        reservations: visible
          .filter((row) => row.kind === "reservation")
          .map((row) => customerActivityView(row.kind, row.data)),
        feedback: visible
          .filter((row) => row.kind === "complaint")
          .map((row) => customerActivityView(row.kind, row.data)),
        truncated: rows.length > input.take,
        identityScope: "current_branch_guest_activity",
      });
    },
  );
}
