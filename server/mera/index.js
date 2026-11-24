import { memberUpdateSchema, validateMemberAssignment } from "./member-assignment.js";
import { hasCapability } from "../../shared/mera-venues.js";
import { locationFields, locationSettings, effectiveBranchAccess, canSeeBranch, assertCapability, assertBranchFeature } from "./venue-access.js";
import { mountMeraOperating } from "./operating.js";
import { mountMeraOverview } from "./overview.js";
import { mountMeraGuestList } from "./guest-list.js";
import { validateProductReferences, stockLines } from "./product-kinds.js";
import { migrateInboundForwarding } from "./inbound-forwarding.js";
import { migrateCompanyLeads, mountCompanyLeads } from "./company-leads.js";
import {withAccessLock,authorizeAccessTarget,beginAccessOperation,recordAccessOperation,recordAccess,mountMeraAccessAttempts} from "./access-attempts.js";
import {assertExpectedPrintActor,beginPrintStudioOperation,recordPrintStudioOperation,cleanReprintJob,mountMeraPrintStudioAttempts} from "./print-studio-attempts.js";
import {assertExpectedBillActor,beginBillChange,recordBillChange,mountMeraBillAttempts} from "./bill-attempts.js";
import {assertExpectedShiftActor,replayShiftOperation,assertShiftRequestActive,recordShiftOperation,mountMeraShiftAttempts} from "./shift-attempts.js";
import { assertReservationRequestActive, assertStaffReservationRequestActive, assertExpectedReservationActor, mountMeraReservationAttempts } from "./reservation-attempts.js";
import { mountMeraRefundRequests, reviewRefundRequest, completeRefundRequest } from "./refund-requests.js";
import { mountMeraWorkspaceAdmin } from "./workspace-admin.js";
import { mountMeraStockHistory } from "./stock-history.js";
import { mountMeraStockTransfers } from "./stock-transfers.js";
import { assertOrderRequestActive, mountMeraOrderAttempts } from "./order-attempts.js";
import express from "express";
import { organizationSlugSchema,migrateMeraAliases,claimOrganizationSlug,resolveOrganizationSlug,mountMeraOrganizationAliases } from "./organization-aliases.js";
import { enqueuePaidDocuments,mountMeraPrinting } from "./printing.js";
import { migrateMeraQueries,mountMeraQueries,loadWorkspaceSnapshot } from "./queries.js";
import { mountMeraDepositOutcomes,depositView } from "./deposit-outcomes.js";
import { projectStaffOrder,projectPreparationFacts } from "./projection.js";
import { mountMeraPlatformSupport } from "./platform-support.js";
import { organizationFeatures,assertOrganizationFeature,mountMeraFeatureFlags } from "./feature-flags.js";
import { mountMeraVisitAccess } from "./visit-access.js";
import { minimumSpendSnapshot,publicMinimumSpend,minimumSpendSummary,assertMinimumSpendAcknowledged,mountMeraMinimumSpend } from "./minimum-spend.js";
import { mountMeraWriteoffs } from "./writeoff.js";
import { mountMeraCategories } from "./categories.js";
import { mountMeraHelp } from "./help.js";
import { mountMeraFulfillment } from "./fulfillment.js";
import { bindProductCategory, publishedCounterProducts } from "./catalog.js";
import { mountMeraFinancialRequests,assertFinancialRequestActive } from "./financial-requests.js";
import { subscriptionEntitlement } from "./subscriptions.js";
import { migrateMeraAssets,mountMeraAssets,assertMeraAsset } from "./assets.js";
import { mountMeraPricing, resolveQuotedPricing, createPricingQuote } from "./pricing.js";
import { mountMeraShifts } from "./shifts.js";
import { mountMeraTableService } from "./table-service.js";
import { mountMeraCancellation } from "./cancellation.js";
import { mountMeraReadiness } from "./readiness.js";
import { mountMeraReservationPolicy, assertReservationWindow, reservationOverlaps } from "./reservation-policy.js";
import { mountMeraMenus } from "./menus.js";
import { mountMeraReconciliation } from "./reconciliation.js";
import { migrateMeraIdentity, mountMeraIdentity, requireVerifiedOwner } from "./identity.js";
import { mountMeraCustomerFollowup } from "./customer-followup.js";
import { mountMeraRoles, resolveRole } from "./roles.js";
import { mountMeraTickets } from "./tickets.js";
import { migrateMeraPlatform, mountMeraPlatform } from "./platform.js";
import { mountMeraOperations } from "./operations.js";
import { mountMeraZidi } from "./zidi.js";
import { mountMeraQr } from "./qr.js";
import { createPreviewTokens, previewWriteGuard, mountMeraQrPreview } from "./qr-preview.js";
import { z } from "zod";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  rolePermissions,
  permissions,
  proposedPolicy,
  orderInputSchema,
  paymentInputSchema,
  productInputSchema,
  reservationInputSchema,
  CONTRACT_VERSION,
  availabilityWindowSchema,
} from "../../shared/mera-contracts.js";
import {
  fail,
  assertHistoricalWritable,
  availableNow,
  providers,
  quote,
  transition,
  paymentStatus,
  paidForBill,
  effectiveSettlement,
  orderBalance,
  ledgerPostings,
  report,
  tradingDate,
  overlaps,
} from "./domain.js";
export const DEMO_ORGANIZATION = "10000000-0000-4000-8000-000000000001",
  DEMO_BRANCH = "20000000-0000-4000-8000-000000000001";
const hash = (s) =>
  createHash("sha256")
    .update(s || "")
    .digest("hex");
const now = () => new Date().toISOString();
const intentHash = (input) => {
  const normalized = JSON.parse(JSON.stringify(input));
  delete normalized.requestKey;
  if (normalized.items)
    normalized.items = normalized.items.map((line) => {
      const value={...line,modifiers:[...(line.modifiers||[])].sort()};
      if(value.choices?.length)value.choices=[...value.choices].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
      else delete value.choices;
      return value;
    });
  const canonical = (v) =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  return hash(JSON.stringify(canonical(normalized)));
};
const slugSchema=organizationSlugSchema;
const uuid = z.string().uuid();
export const branchSettingsInputSchema = z
        .object({
          ...locationFields,
          requestKey:z.string().uuid().optional(),
          version:z.number().int().positive().optional(),
          orderingPaused: z.boolean().optional(),
          payLater: z.boolean().optional(),
          reservationsEnabled: z.boolean().optional(),
          capacity: z.number().int().min(1).max(1000).optional(),
          holdMinutes: z.number().int().min(1).max(60).optional(),
          showSoldOut: z.boolean().optional(),
          serviceModes: z
            .array(
              z.enum([
                "counter_takeaway",
                "table_service",
                "reservations",
                "lounge_club",
              ]),
            )
            .optional(),
          address: z.string().max(300).optional(),
          serviceHours:z.array(availabilityWindowSchema).max(30).optional(),
          timezone:z.string().refine(v=>{try{new Intl.DateTimeFormat("en",{timeZone:v});return true;}catch{return false;}},"Invalid IANA timezone").optional(),
          cutoff:z.number().int().min(0).max(1439).optional(),
        })
        .strict();
export async function migrateMera(db) {
  await db.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  await migrateMeraPlatform(db);
  await migrateMeraIdentity(db);
  await migrateInboundForwarding(db);
  await migrateMeraAssets(db);
  await migrateMeraQueries(db);
  await migrateMeraAliases(db);
  await migrateCompanyLeads(db);
}
export async function seedMeraDemo(db) {
  if (process.env.NODE_ENV === "production" || process.env.MERA_DEMO !== "true")
    throw fail(
      "MERA demo seeding is permitted only in explicit non-production demo mode.",
    );
  if (!db.userId) throw fail("An explicit development owner is required.");
  await db.transaction(async (c) => {
    await c.query(
      "INSERT INTO mera_organizations(id,name,slug,branding,policy,subscription) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
      [
        DEMO_ORGANIZATION,
        "Bing Chun",
        "bing-chun",
        JSON.stringify({
          primary: "#1558c9",
          accent: "#83ddf7",
          description: "A little joy in every cup.",
          logo: "/brand/brand-logo.png",
        }),
        JSON.stringify(proposedPolicy),
        JSON.stringify({
          status: "trialing",
          billingEnabled: false,
          includedBranchIds: [DEMO_BRANCH],
        }),
      ],
    );
    await claimOrganizationSlug(c,DEMO_ORGANIZATION,"bing-chun");
    await c.query(
      "INSERT INTO mera_branches(id,organization_id,name,settings) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
      [
        DEMO_BRANCH,
        DEMO_ORGANIZATION,
        "Surulere",
        JSON.stringify({
          address: "75A Bode Thomas Street, Surulere, Lagos",
          serviceModes: ["counter_takeaway", "table_service", "reservations"],
          payLater: false,
          orderingPaused: false,
          showSoldOut: true,
          reservationsEnabled: true,
          openingHours: null,
          capacity: 30,
          holdMinutes: 10,
        }),
      ],
    );
    await c.query(
      "INSERT INTO mera_memberships(id,user_id,organization_id,role,permissions,organization_wide) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(user_id,organization_id) DO NOTHING",
      [
        randomUUID(),
        db.userId,
        DEMO_ORGANIZATION,
        "owner",
        JSON.stringify(permissions),
      ],
    );
    const existing = (
      await c.query(
        "SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='product'",
        [DEMO_ORGANIZATION, DEMO_BRANCH],
      )
    ).rows;
    if (!existing.length) {
      const legacy = (
        await c.query("SELECT * FROM products ORDER BY category,code")
      ).rows;
      const published = [];
      for (const p of legacy) {
        const id = randomUUID();
        const data = {
          id,
          code: p.code,
          name: p.name,
          category: p.category,
          parentCategory: null,
          description: "",
          price: p.price,
          size: p.size,
          available: p.available && !p.needs_review,
          stockMode: "unlimited",
          stock: 0,
          station: p.category === "Ice cream series" ? "kitchen" : "bar",
          variants: [],
          modifierGroups: [],
          allergens: [],
          dietary: [],
          imageCode: p.code,
        };
        await c.query(
          "INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,$4,$5)",
          [id, DEMO_ORGANIZATION, DEMO_BRANCH, "product", JSON.stringify(data)],
        );
        if (data.available) published.push(data);
      }
      await c.query(
        "UPDATE mera_branches SET menu_version=1,published_menu=$1 WHERE id=$2",
        [JSON.stringify(published), DEMO_BRANCH],
      );
    }
  });
}
export function redactMeraFinancialPolicy(value) {
  if (value instanceof Date) return value.toJSON();
  if (Array.isArray(value)) return value.map(redactMeraFinancialPolicy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key])=>key!=="financialPolicy"&&!(Object.hasOwn(value,"financialPolicy")&&key==="policyVersion"))
    .map(([key,item])=>[key,redactMeraFinancialPolicy(item)]));
  return value;
}
// Station roles receive the same ticket scope enforced by preparation writes and UI.
export function projectStationTickets(tickets, role, permissions) {
  if (!permissions.includes("orders.prepare")) return [];
  return ["kitchen", "bar"].includes(role)
    ? tickets.filter((ticket) => ticket.station === role)
    : tickets;
}

export function createMeraRouter(db) {
  const router = express.Router();
  const commercial=(access=[])=>access.includes("billing.manage")||access.includes("organization.manage");
  const safeSubscription=(value={},access=[])=>commercial(access)?value:Object.fromEntries(["status","trialEndsAt","paidThrough","dueAt","billingEnabled"].filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
  router.use((req,res,next)=>{
    const json=res.json.bind(res);
    res.json=(body)=>{
      if(commercial(req.meraMembership?.permissions))return json(body);
      return json(redactMeraFinancialPolicy(body));
    };
    next();
  });
  const previewTokens = createPreviewTokens();
  router.use("/public", previewWriteGuard);
  const rateBuckets = new Map();
  router.use("/public", (req, res, next) => {
    const key = req.ip + ":" + (req.method === "GET" ? "read" : "write");
    const stamp = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || stamp - bucket.start > 60000) {
      bucket = { start: stamp, count: 0 };
      if (rateBuckets.size > 10000) rateBuckets.clear();
      rateBuckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > (req.method === "GET" ? 300 : 60))
      return res.status(429).json({
        error: "Too many requests. Please wait a minute.",
        code: "RATE_LIMITED",
      });
    next();
  });
  const q = (sql, p = []) => db.query(sql, p);
  const readRecords = async (c, org, branch, kind) =>
    (
      await c.query(
        "SELECT * FROM mera_records WHERE organization_id=$1 AND branch_id=$2" +
          (kind ? " AND kind=$3" : "") +
          " ORDER BY created_at,id",
        kind ? [org, branch, kind] : [org, branch],
      )
    ).rows;
  const requestRecord=async(c,s,kind,key)=>(await c.query("SELECT id,data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind=$3 AND data ? 'requestKey' AND data->>'requestKey'=$4 ORDER BY created_at,id LIMIT 1",[s.organizationId,s.branchId,kind,key])).rows[0];
  const record = async (c, scope, kind, data, id = randomUUID()) => {
    if(data.orderId && ["payment","refund","ledger","ticket","item_cancellation","item_fulfillment","writeoff"].includes(kind)){
      const source=(await c.query("SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND branch_id=$3 AND kind='order'",[data.orderId,scope.organizationId,scope.branchId])).rows[0];
      assertHistoricalWritable(source?.data);
    }
    const row = { ...data, id };
    await c.query(
      "INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,$4,$5)",
      [id, scope.organizationId, scope.branchId, kind, JSON.stringify(row)],
    );
    return row;
  };
  const update = async (c, scope, kind, id, data) => {
    assertHistoricalWritable(data);
    if(kind==="order"){data.effectivePaid=paidForBill(data);data.effectiveSettlement=effectiveSettlement(data);data.outstandingBalance=orderBalance(data);}
    const result = await c.query(
      "UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind=$5 RETURNING id",
      [JSON.stringify(data), id, scope.organizationId, scope.branchId, kind],
    );
    if (!result.rows.length) throw fail("Record not found.", 404);
    return data;
  };
  const find = async (c, scope, kind, id) => {
    const r = (
      await c.query(
        "SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND branch_id=$3 AND kind=$4",
        [id, scope.organizationId, scope.branchId, kind],
      )
    ).rows[0];
    if (!r) throw fail("Record not found.", 404);
    return r.data;
  };
  const event = (c, scope, action, actor, details = {}) =>
    record(c, scope, "audit", {
      action,
      actorId: actor?.id || null,
      actorName: actor?.name || actor?.displayName || "Guest",
      details,
      createdAt: now(),
    });
  const locked = async (scope, fn) =>
    db.transaction(async (c) => {
      const b = (
        await c.query(
          "SELECT * FROM mera_branches WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [scope.branchId, scope.organizationId],
        )
      ).rows[0];
      if (!b) throw fail("Branch not found.", 404);
      return fn(c, b);
    });
  const branchView = (b) => ({
    id: b.id,
    organizationId: b.organization_id,
    name: b.name,
    timezone: b.timezone,
    currency: b.currency,
    cutoff: b.cutoff,
    settings: b.settings,
  });
  async function membership(req, org, branch, permission) {
    if (!req.user) throw fail("Sign in to continue.", 401, "UNAUTHENTICATED");
    let m = (
      await q(
        "SELECT * FROM mera_memberships WHERE user_id=$1 AND organization_id=$2 AND active=true",
        [req.user.id, org],
      )
    ).rows[0];
    m = effectiveBranchAccess(m, branch);
    if (
      !m ||
      !(Array.isArray(permission)
        ? permission.some((p) => m.permissions.includes(p))
        : m.permissions.includes(permission))
    )
      throw fail(
        "You do not have access to this organization or branch.",
        403,
        "FORBIDDEN",
      );
    if(!rolePermissions[m.role]) {
      let custom;
      try { custom=await resolveRole(db,org,m.role); } catch { throw fail("Your organization role is unavailable.",403,"FORBIDDEN"); }
      m.permissions=m.permissions.filter(p=>custom.permissions.includes(p));
      if(!(Array.isArray(permission)?permission.some(p=>m.permissions.includes(p)):m.permissions.includes(permission)))throw fail("Your organization role no longer grants this permission.",403,"FORBIDDEN");
    }
    return m;
  }
  const scope = (req) => ({
    organizationId: req.params.organizationId,
    branchId: req.params.branchId,
  });
  const guard = (p) => async (req, res, next) => {
    try {
      req.meraMembership = await membership(
        req,
        req.params.organizationId,
        req.params.branchId,
        p,
      );
      next();
    } catch (e) {
      next(e);
    }
  };
  router.get("/context", async (req, res) => {
    if (!req.user) throw fail("Sign in to continue.", 401);
    const rows = (
      await q(
        "SELECT m.*,o.name,o.slug,o.branding,o.onboarding,o.subscription,o.policy,o.platform_flags,o.operating FROM mera_memberships m JOIN mera_organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.active=true",
        [req.user.id],
      )
    ).rows;
    const organizations = [];
    for (const m of rows) {
      const branches = (
        await q(
          "SELECT * FROM mera_branches WHERE organization_id=$1 ORDER BY name",
          [m.organization_id],
        )
      ).rows.filter((b) => canSeeBranch(m,b.id));
      organizations.push({
        id: m.organization_id,
        name: m.name,
        slug: m.slug,
        branding: m.branding,
        onboarding: m.onboarding,
        subscription: safeSubscription(m.subscription,m.permissions),
        policy:commercial(m.permissions)?m.policy:null,
        features:organizationFeatures(m),
        entitlements:subscriptionEntitlement(m.subscription,m.subscription?.approvedPolicySnapshot||m.policy,Date.now(),process.env.MERA_DEMO==="true"&&process.env.NODE_ENV!=="production"),
        branches: branches.map(b=>({...branchView(b),permissions:effectiveBranchAccess(m,b.id).permissions,role:effectiveBranchAccess(m,b.id).role})),
        permissions: effectiveBranchAccess(m).permissions,
        operating:m.operating||{},
        role: m.role,
        branchIds: m.branch_ids,
        branchRoles:m.branch_roles||{},
        organizationWide:!!m.organization_wide,
      });
    }
    res.json({
      contractVersion: CONTRACT_VERSION,
      user: { id: req.user.id, name: req.user.name },
      organizations,
      providers,
      policy: proposedPolicy,
      demo: process.env.MERA_DEMO === "true",
    });
  });
  // Advisory only: organization creation still performs the atomic claim.
  router.get("/organizations/address-availability", async (req, res) => {
    if (!req.user) throw fail("Sign in to continue.", 401);
    const parsed = organizationSlugSchema.safeParse(req.query.slug);
    if (!parsed.success) return res.json({ available: false, reason: "invalid_or_reserved" });
    const slug = parsed.data;
    const [canonical, claimed] = await Promise.all([
      db.query("SELECT id FROM mera_organizations WHERE slug=$1 LIMIT 1", [slug]),
      db.query("SELECT organization_id FROM mera_slug_claims WHERE slug=$1 LIMIT 1", [slug]),
    ]);
    const available = !canonical.rows.length && !claimed.rows.length;
    res.json({ available, reason: available ? "available" : "already_claimed" });
  });
  router.post("/organizations", async (req, res) => {
    await requireVerifiedOwner(req,db);
    if (!req.user) throw fail("Sign in to continue.", 401);
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        slug: slugSchema,
        branchName: z.string().trim().min(1).max(100),
      })
      .parse(req.body);
    const organizationId = randomUUID(),
      branchId = randomUUID();
    await db.transaction(async (c) => {
      await c.query(
        "INSERT INTO mera_organizations(id,name,slug,policy,subscription) VALUES($1,$2,$3,$4,$5)",
        [
          organizationId,
          input.name,
          input.slug,
          JSON.stringify(proposedPolicy),
          JSON.stringify({
            status: "trialing",
            billingEnabled: false,
            includedBranchIds: [branchId],
          }),
        ],
      );
      await claimOrganizationSlug(c,organizationId,input.slug);
      await c.query(
        "INSERT INTO mera_branches(id,organization_id,name,settings) VALUES($1,$2,$3,$4)",
        [
          branchId,
          organizationId,
          input.branchName,
          JSON.stringify({
            payLater: false,
            orderingPaused: true,
            reservationsEnabled: false,
            capacity: 30,
          }),
        ],
      );
      await c.query(
        "INSERT INTO mera_memberships(id,user_id,organization_id,role,permissions,organization_wide) VALUES($1,$2,$3,$4,$5,true)",
        [
          randomUUID(),
          req.user.id,
          organizationId,
          "owner",
          JSON.stringify(permissions),
        ],
      );
    });
    res.status(201).json({ organizationId, branchId });
  });
  router.patch(
    "/organizations/:organizationId/onboarding",
    guard("organization.manage"),
    async (req, res) => {
      if (!req.meraMembership.organization_wide) throw fail("Organization-wide management access is required.",403,"FORBIDDEN");
      const input = z
        .object({
          step: z.number().int().min(1).max(14),
          data: z.record(z.unknown()),
        })
        .strict()
        .parse(req.body);
      const onboarding = await db.transaction(async c => {
        const organization = (await c.query("SELECT onboarding FROM mera_organizations WHERE id=$1 FOR UPDATE",[req.params.organizationId])).rows[0];
        if (!organization) throw fail("Organization not found.",404);
        const previous = organization.onboarding || {};
        const merged = {...previous,step:input.step,data:{...(previous.data||{}),...input.data},updatedAt:now()};
        if (!Object.hasOwn(previous,"verification")) merged.verification="owner_email_verification_pending";
        await c.query("UPDATE mera_organizations SET onboarding=$1 WHERE id=$2",[JSON.stringify(merged),req.params.organizationId]);
        return merged;
      });
      res.json({ saved: true, step: input.step, onboarding });
    },
  );
  const B = "/organizations/:organizationId/branches/:branchId";
  router.get(
    B + "/workspace",
    guard([
      "orders.view",
      "orders.create",
      "menu.edit",
      "stock.adjust",
      "reports.view",
      "reservations.manage",
      "tables.manage",
      "shifts.manage",
    ]),
    async (req, res) => {
      const s = scope(req),
        b = (
          await q(
            "SELECT * FROM mera_branches WHERE organization_id=$1 AND id=$2",
            [s.organizationId, s.branchId],
          )
        ).rows[0];
      if (!b) throw fail("Branch not found.", 404);
      const access=req.meraMembership.permissions;
      const reportDate=String(req.query.date||tradingDate(now(),b.timezone,b.cutoff));
      const snapshot=await loadWorkspaceSnapshot(db,s,b,reportDate,{includeReport:access.includes("reports.view")});
      const records=snapshot.records;
      const by = (kind) =>
        records
          .filter((r) => r.kind === kind)
          .map((r) => r.data)
          .reverse();
      const org = (
        await q(
          "SELECT policy,subscription,onboarding,platform_flags FROM mera_organizations WHERE id=$1",
          [s.organizationId],
        )
      ).rows[0];
      res.json({
        branch: branchView(b),
        serverTime:now(),
        history:access.includes("orders.view")?snapshot.history:null,
        reportWindow:access.includes("reports.view")?snapshot.window:null,
        delayedOrderThresholdMinutes:15,
        delayedOrders:access.includes("orders.view")?by("order").filter(o=>!o.historicalReadOnly&&!o.holdExpired&&o.paymentStatus!=="expired"&&!(o.stockHeld&&Date.parse(o.holdExpiresAt)<=Date.now())&&["submitted","accepted","preparing","ready"].includes(o.status)&&Date.now()-Date.parse(o.createdAt)>15*60000).map(o=>({id:o.id,reference:o.reference,createdAt:o.createdAt,ageMinutes:Math.floor((Date.now()-Date.parse(o.createdAt))/60000)})):[],
        counterProducts: access.includes("orders.create") ? publishedCounterProducts(b,by("product")) : [],
        products: access.some((p) =>
          [
            "menu.edit",
            "menu.publish",
            "stock.adjust",
            "orders.create",
            "orders.view",
          ].includes(p),
        )
          ? by("product")
          : [],
        bills:
          access.includes("payments.record") || access.includes("tables.manage")
            ? by("bill")
                .filter((b) => b.status !== "merged")
                .map(billAmounts)
            : [],
        tickets: projectStationTickets(by("ticket"),req.meraMembership.role,access),
        preparationFacts:projectPreparationFacts(by("order"),by("ticket"),access),
        categories:access.includes("menu.edit")?by("category"):(b.settings.publishedCategories||[]),
        lowStockAlerts:access.some(p=>["menu.edit","stock.adjust"].includes(p))?by("product").flatMap(p=>[
          ...(p.stockMode==="counted"&&p.stock<=(p.lowStockThreshold??5)?[{productId:p.id,variantId:null,name:p.name,size:p.size,stock:p.stock,threshold:p.lowStockThreshold??5}]:[]),
          ...p.variants.filter(v=>v.stockMode==="counted"&&v.stock<=(v.lowStockThreshold??5)).map(v=>({productId:p.id,variantId:v.id,name:p.name,size:v.name,stock:v.stock,threshold:v.lowStockThreshold??5})),
        ]):[],
        menuVersion: b.menu_version,
        orders: access.includes("orders.view") ? by("order").map(o=>projectStaffOrder(o,access)) : [],
        tables: access.includes("tables.manage") ? by("table") : [],
        reservations: access.includes("reservations.manage")
          ? by("reservation")
          : [],
        visits: access.includes("tables.manage") ? by("visit") : [],
        shifts: access.includes("shifts.manage") ? by("shift") : [],
        payments: access.includes("payments.record") ? by("payment") : [],
        deposits:access.some(p=>["payments.record","refunds.approve"].includes(p))?by("deposit").map(d=>depositView(d,by("bill"))):[],
        refunds:access.includes("refunds.approve")?by("refund").map(r=>({...r,cancellationAppliedAmount:by("item_cancellation").flatMap(c=>c.refundAllocations||[]).filter(a=>a.refundId===r.id).reduce((n,a)=>n+a.amount,0)})):[],
        complaints: access.includes("organization.manage")
          ? by("complaint")
          : [],
        audit: access.includes("organization.manage")
          ? by("audit").slice(0, 100)
          : [],
        report:access.includes("reports.view")?{...report(snapshot.reportRecords,b,reportDate),reservationLiability:snapshot.reservationLiabilityAsOf}:null,
        subscription: safeSubscription(org.subscription,access),
        entitlements:subscriptionEntitlement(org.subscription,org.subscription?.approvedPolicySnapshot||org.policy,Date.now(),process.env.MERA_DEMO==="true"&&process.env.NODE_ENV!=="production"),
        policy: commercial(access)?org.policy:null,
        features:organizationFeatures(org),
        providers,
        onboarding: org.onboarding,
        permissions: access,
      });
    },
  );
  router.post(B + "/products", guard("menu.edit"), async (req, res) => {
    const input = productInputSchema.parse(req.body);
    await assertMeraAsset(db,req.params.organizationId,req.params.branchId,input.image);
    if(!req.meraMembership.permissions.includes("stock.adjust") && (input.stock>0 || input.variants.some(v=>v.stock>0))) throw fail("Opening stock requires stock adjustment permission.",403);
    res.status(201).json(
      await locked(scope(req), async (c) => {
        validateProductReferences(input,(await readRecords(c,scope(req).organizationId,scope(req).branchId,"product")).map(r=>r.data));
        const p = await record(c, scope(req), "product", await bindProductCategory(c,scope(req),input));
        await event(c, scope(req), "product_created", req.user, {
          productId: p.id,
        });
        return p;
      }),
    );
  });
  router.put(B + "/products/:id", guard("menu.edit"), async (req, res) => {
    const input = productInputSchema.parse(req.body);
    await assertMeraAsset(db,req.params.organizationId,req.params.branchId,input.image);
    res.json(
      await locked(scope(req), async (c) => {
        const old = await find(c, scope(req), "product", req.params.id);
        // Catalog edits cannot overwrite balances concurrently consumed by checkout.
        input.stock=old.stock; input.stockMode=input.kind==="single"?old.stockMode:"unlimited";
        const referenceProducts=(await readRecords(c,scope(req).organizationId,scope(req).branchId,"product")).map(r=>r.data);
        const prospective=referenceProducts.map(p=>p.id===old.id?{...input,id:old.id}:p);
        for(const product of prospective)validateProductReferences(product,prospective);
        input.variants=input.variants.map(v=>{const previous=old.variants.find(o=>o.id===v.id);return {...v,stock:previous?.stock||0,stockMode:input.kind==="single"?previous?.stockMode||"unlimited":"unlimited"};});
        const removed=old.variants.filter(v=>!input.variants.some(i=>i.id===v.id));
        const activeOrders=(await readRecords(c,scope(req).organizationId,scope(req).branchId,"order")).map(r=>r.data).filter(o=>o.stockHeld);
        if(removed.some(v=>(v.stockMode==="counted" && v.stock>0) || activeOrders.some(o=>stockLines(o.items).some(l=>l.productId===old.id && l.variantId===v.id)))) throw fail("Retain sizes with remaining stock or active stock holds.",409);
        if(!Object.hasOwn(req.body,"categoryId"))input.categoryId=old.categoryId||null;
        const p = await update(c, scope(req), "product", old.id, await bindProductCategory(c,scope(req),{...input,id:old.id}));
        await event(c, scope(req), "product_updated", req.user, {
          productId: p.id,
        });
        return p;
      }),
    );
  });
  router.post(B+"/products/availability",guard("menu.edit"),async(req,res)=>{
    const input=z.object({productIds:z.array(uuid).min(1).max(200).refine(v=>new Set(v).size===v.length),available:z.boolean(),reason:z.string().trim().min(3).max(300)}).strict().parse(req.body);
    res.json(await locked(scope(req),async c=>{
      const products=await Promise.all(input.productIds.map(id=>find(c,scope(req),"product",id)));
      for(const product of products){product.available=input.available;await update(c,scope(req),"product",product.id,product);}
      await event(c,scope(req),"bulk_product_availability",req.user,input);return {updated:products.length,available:input.available};
    }));
  });
  const publicationInput = z.object({requestKey:uuid,previewHash:z.string().regex(/^[a-f0-9]{64}$/),expectedVersion:z.number().int().nonnegative()}).strict();
  const publicationIdentity = req => ({actorId:req.user.id,organizationId:req.params.organizationId,branchId:req.params.branchId});
  async function publicationPreview(c,b,s) {
    const products = await Promise.all((await readRecords(c,b.organization_id,b.id,"product")).map(r=>r.data).filter(p=>p.available).map(p=>bindProductCategory(c,s,p)));
    const categories=(await readRecords(c,b.organization_id,b.id,"category")).map(r=>r.data).filter(category=>category.active);
    const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
    return {publishedVersion:b.menu_version,products,categories,previewHash:hash(JSON.stringify(canonical({organizationId:s.organizationId,branchId:s.branchId,publishedVersion:b.menu_version,products,categories})))};
  }
  router.get(B+"/menu/publication-preview",guard("menu.publish"),async(req,res)=>{
    res.set("Cache-Control","no-store").json({...await locked(scope(req),(c,b)=>publicationPreview(c,b,scope(req))),...publicationIdentity(req)});
  });
  const publicationAttemptPath=B+"/menu/publication-attempts/:requestKey";
  async function resolvePublicationAttempt(req,res,abandon) {
    res.set("Cache-Control","no-store");
    const requestKey=uuid.parse(req.params.requestKey), input=abandon?z.object({reason:z.string().trim().min(3).max(500)}).strict().parse(req.body):null;
    const result=await locked(scope(req),async c=>{
      const recorded=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='menu_publication' AND data->>'requestKey'=$3 AND data->>'actorId'=$4 LIMIT 1",[req.params.organizationId,req.params.branchId,requestKey,req.user.id])).rows[0]?.data;
      if(recorded)return {status:"recorded",version:recorded.version};
      let abandoned=(await c.query("SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='menu_publication_resolution' AND data->>'requestKey'=$3 AND data->>'actorId'=$4 LIMIT 1",[req.params.organizationId,req.params.branchId,requestKey,req.user.id])).rows[0];
      if(!abandoned&&input){abandoned=await record(c,scope(req),"menu_publication_resolution",{requestKey,actorId:req.user.id,status:"abandoned",reason:input.reason,createdAt:now()});await event(c,scope(req),"menu_publication_abandoned",req.user,{requestKey,resolutionId:abandoned.id,reason:input.reason});}
      return abandoned?{status:"abandoned",resolutionId:abandoned.id}:{status:"not_found"};
    });
    res.json({...result,...publicationIdentity(req)});
  }
  router.get(publicationAttemptPath,guard("menu.publish"),(req,res)=>resolvePublicationAttempt(req,res,false));
  router.post(publicationAttemptPath+"/abandon",guard("menu.publish"),(req,res)=>resolvePublicationAttempt(req,res,true));
  router.post(B + "/menu/publish", guard("menu.publish"), async (req, res) => {
    const reviewed=Object.keys(req.body||{}).length?publicationInput.parse(req.body):null;
    res.set("Cache-Control","no-store").json(
      await locked(scope(req), async (c, b) => {
        if(reviewed){
          const previous=await requestRecord(c,scope(req),"menu_publication",reviewed.requestKey);
          if(previous){if(previous.data.actorId!==req.user.id||previous.data.previewHash!==reviewed.previewHash||previous.data.expectedVersion!==reviewed.expectedVersion)throw fail("This key belongs to another publication intent.",409,"IDEMPOTENCY_CONFLICT");return {version:previous.data.version};}
          const abandoned=(await c.query("SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='menu_publication_resolution' AND data->>'requestKey'=$3 AND data->>'actorId'=$4 LIMIT 1",[req.params.organizationId,req.params.branchId,reviewed.requestKey,req.user.id])).rows[0];
          if(abandoned)throw fail("This publication request was safely abandoned. Review a fresh preview before publishing.",409,"MENU_PUBLICATION_ABANDONED");
        }
        const preview=await publicationPreview(c,b,scope(req));
        if(reviewed&&(reviewed.expectedVersion!==preview.publishedVersion||reviewed.previewHash!==preview.previewHash))throw fail("The menu changed after review. Load a fresh publication preview.",409,"MENU_PUBLICATION_CHANGED");
        await c.query(
          "UPDATE mera_branches SET published_menu=$1,menu_version=menu_version+1,settings=jsonb_set(settings,'{publishedCategories}',$2::jsonb) WHERE id=$3 AND organization_id=$4",
          [JSON.stringify(preview.products),JSON.stringify(preview.categories), b.id, b.organization_id],
        );
        const version=b.menu_version+1;
        if(reviewed)await record(c,scope(req),"menu_publication",{...reviewed,actorId:req.user.id,version,createdAt:now()});
        await event(c, scope(req), "menu_published", req.user, {version,reviewed:!!reviewed,...(reviewed?{requestKey:reviewed.requestKey,previewHash:reviewed.previewHash}: {})});
        return { version };
      }),
    );
  });
  router.post(B + "/stock", guard("stock.adjust"), async (req, res) => {
    const input = z
      .object({
        productId: uuid,
        variantId:z.string().min(1).max(100).optional(),
        quantity: z.number().int().min(0).max(1000000),
        reason: z.string().trim().min(3).max(300),
      })
      .parse(req.body);
    res.json(
      await locked(scope(req), async (c) => {
        const p = await find(c, scope(req), "product", input.productId);
        if((p.kind||"single")!=="single")throw fail("Adjust the component items for a package or combo.",409,"COMPONENT_STOCK_ONLY");
        const target=input.variantId ? p.variants.find(v=>v.id===input.variantId) : p;
        if(!target) throw fail("Variant not found.",404);
        const before = target.stock||0;
        target.stock = input.quantity;
        target.stockMode = "counted";
        await update(c, scope(req), "product", p.id, p);
        await record(c, scope(req), "stock_movement", {
          productId: p.id,
          variantId:input.variantId||null,
          type: "adjustment",
          quantity: target.stock - before,
          reason: input.reason,
          actorId: req.user.id,
          actorName: req.user.name,
          createdAt: now(),
        });
        return p;
      }),
    );
  });
  async function assertManualMethod(c,s,method) {
    const branch=(await c.query("SELECT settings FROM mera_branches WHERE id=$1 AND organization_id=$2",[s.branchId,s.organizationId])).rows[0];
    if(method==="room_charge") { assertCapability(branch,"room_charge"); return; }
    const allowed=branch.settings.manualPaymentMethods;
    if(Array.isArray(allowed) && !allowed.includes(method)) throw fail("This manual payment method is not enabled by the branch launch policy.",409,"PAYMENT_METHOD_DISABLED");
  }
  async function releaseExpired(c, s) {
    const records=(await c.query("SELECT id,data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='order' AND data->>'stockHeld'='true' AND data->>'historicalReadOnly' IS DISTINCT FROM 'true' AND data->>'holdExpiresAt'<=$3 ORDER BY created_at,id",[s.organizationId,s.branchId,now()])).rows;
    for (const r of records) {
      const o = r.data;
      if (o.stockHeld && Date.parse(o.holdExpiresAt) <= Date.now()) {
        for (const line of stockLines(o.items)) {
          const p = await find(c, s, "product", line.productId);
          if (p.stockMode === "counted") p.stock += line.quantity;
          const variant=p.variants?.find(v=>v.id===line.variantId);
          if(variant?.stockMode==="counted") variant.stock+=line.quantity;
          await update(c,s,"product",p.id,p);
        }
        o.stockHeld = false;
        o.holdExpired = true;
        o.paymentStatus = "expired";
        o.version++;
        await update(c, s, "order", o.id, o);
        await event(c, s, "stock_hold_expired", null, { orderId: o.id });
      }
    }
  }
  const billAmounts = (b) => ({
    ...b,
    total: b.charges.reduce((n, c) => n + c.amount, 0),
    paid: b.allocations.reduce((n, a) => n + a.amount, 0),
    balance:
      b.charges.reduce((n, c) => n + c.amount, 0) -
      b.allocations.reduce((n, a) => n + a.amount, 0),
  });
  async function attachBill(c, s, order) {
    const attached=(await c.query("SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='bill' AND data->'charges' @> $3::jsonb LIMIT 1",[s.organizationId,s.branchId,JSON.stringify([{orderId:order.id}])])).rows[0];
    if(attached)return;
    let bill=order.visitId?(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='bill' AND data->>'visitId'=$3 AND data->>'status'='open' ORDER BY created_at,id LIMIT 1",[s.organizationId,s.branchId,order.visitId])).rows[0]?.data:null;
    if (!bill)
      bill = await record(c, s, "bill", {
        visitId: order.visitId || null,
        name: order.visitId ? "Table bill" : order.reference,
        status: "open",
        charges: [],
        allocations: [],
        createdAt: now(),
      });
    for (const [lineIndex, line] of order.items.entries())
      bill.charges.push({
        id: randomUUID(),
        orderId: order.id,
        lineIndex,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.total,
        name: line.name,
      });
    for(const adjustment of order.pricing?.lines||[]) bill.charges.push({id:randomUUID(),orderId:order.id,lineIndex:null,quantity:null,unitPrice:0,amount:adjustment.amount,name:adjustment.label,type:adjustment.type});
    if (order.paid > 0)
      bill.allocations.push({
        paymentId: "opening-" + order.id,
        orderId: order.id,
        amount: order.paid,
      });
    let due = order.total - paidForBill(order);
    for (const credit of [...bill.allocations]) {
      if (credit.orderId !== null || credit.amount <= 0 || !due) continue;
      const consumed = Math.min(due, credit.amount);
      credit.amount -= consumed;
      bill.allocations.push({
        paymentId: credit.paymentId,
        orderId: order.id,
        amount: consumed,
        source: "reservation_deposit",
      });
      order.paid += consumed;
      due -= consumed;
      await record(c, s, "ledger", {
        depositId: credit.paymentId,
        orderId: order.id,
        postings: [
          { account: "reservation_liability", debit: consumed, credit: 0 },
          {
            account: "customer_collections_liability",
            debit: 0,
            credit: consumed,
          },
        ],
        createdAt: now(),
      });
    }
    bill.allocations = bill.allocations.filter((a) => a.amount !== 0);
    order.paymentStatus = paymentStatus(order);
    if (paidForBill(order) === order.total) order.stockHeld = false;
    await update(c, s, "bill", bill.id, billAmounts(bill));
    order.billId = bill.id;
    await update(c, s, "order", order.id, order);
  }
  async function allocateOrderPayment(c, s, orderId, paymentId, amount) {
    const order = await find(c, s, "order", orderId);
    await attachBill(c, s, order);
    let remaining = amount;
    const bills=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='bill' AND data->>'status'='open' AND data->'charges' @> $3::jsonb ORDER BY created_at,id",[s.organizationId,s.branchId,JSON.stringify([{orderId}])])).rows.map(r=>r.data);
    for (const b of bills) {
      const due =
        b.charges
          .filter((l) => l.orderId === orderId)
          .reduce((n, l) => n + l.amount, 0) -
        b.allocations
          .filter((a) => a.orderId === orderId)
          .reduce((n, a) => n + a.amount, 0);
      const allocated = Math.min(remaining, Math.max(0, due));
      if (allocated) {
        b.allocations.push({ paymentId, orderId, amount: allocated });
        remaining -= allocated;
        await update(c, s, "bill", b.id, billAmounts(b));
      }
      if (!remaining) break;
    }
    if (remaining)
      throw fail(
        "Payment could not be allocated consistently.",
        409,
        "ALLOCATION_CONFLICT",
      );
  }
  async function createOrder(c, b, s, input, actor, guestId, source) {
    const existing = await requestRecord(c,s,"order",input.requestKey);
    if (existing) {
      if (existing.data.intentHash !== intentHash(input))
        throw fail(
          "This request key was already used for a different order. Review the cart before submitting a new request.",
          409,
          "IDEMPOTENCY_CONFLICT",
        );
      if (
        existing.data.guestId !== guestId ||
        (source === "zidi"
          ? existing.data.integrationCredentialId !== actor?.id
          : existing.data.staffCreatorId !== (actor?.id || null))
      )
        throw fail("This request key belongs to a different actor.", 409);
      return existing.data;
    }
    if (source === "customer_qr" || source === "staff") {
      await assertOrderRequestActive(c, s, input.requestKey, source === "customer_qr" ? "guest" : "staff", guestId || actor.id);
    }
    if(b.settings.role==="stock_room")throw fail("Stock rooms cannot take orders.",409,"CAPABILITY_OFF");
    await releaseExpired(c, s);
    const organization = (
      await c.query(
        "SELECT subscription,policy,platform_flags FROM mera_organizations WHERE id=$1",
        [s.organizationId],
      )
    ).rows[0];
    if(source==="customer_qr") { assertCapability(b,"qr_ordering"); assertBranchFeature(b,"customer_ordering"); assertOrganizationFeature(organization,"customer_ordering"); }
    if(source==="zidi") { assertBranchFeature(b,"zidi"); assertOrganizationFeature(organization,"zidi"); }
    const entitlements=subscriptionEntitlement(organization.subscription,organization.subscription?.approvedPolicySnapshot||organization.policy,Date.now(),process.env.MERA_DEMO==="true"&&process.env.NODE_ENV!=="production");
    if (!entitlements.newOrdersAllowed)
      throw fail(
        "New ordering is restricted for this organization. Existing orders and account exports remain available.",
        409,
        "SUBSCRIPTION_RESTRICTED",
      );
    const financialPolicy=organization.subscription?.approvedPolicySnapshot||organization.policy;
    const branchCount = Number(
      (
        await c.query(
          "SELECT COUNT(*) AS count FROM mera_branches WHERE organization_id=$1 AND settings->>'role' IS DISTINCT FROM 'stock_room'",
          [s.organizationId],
        )
      ).rows[0].count,
    );
    if (
      branchCount > financialPolicy.includedBranches &&
      financialPolicy.additionalBranchPrice === null &&
      !(organization.subscription.includedBranchIds || [DEMO_BRANCH]).includes(
        s.branchId,
      )
    )
      throw fail(
        "Additional branch entitlement requires an approved policy.",
        409,
        "ENTITLEMENT_UNRESOLVED",
      );
    if (b.settings.orderingPaused)
      throw fail("Ordering is temporarily paused.", 409, "ORDERING_PAUSED");
    if (input.menuVersion !== b.menu_version || !b.menu_version)
      throw fail(
        "The menu changed. Review the latest prices.",
        409,
        "MENU_CHANGED",
      );
    if (input.fulfillment === "table_service") {
      if (source === "zidi")
        throw fail(
          "The table-visit integration authorization contract is not configured.",
          409,
          "INTEGRATION_SCOPE_REQUIRED",
        );
      if (!input.visitId)
        throw fail("Join a current table visit before ordering.");
      const visit = await find(c, s, "visit", input.visitId);
      if (
        visit.status !== "open" ||
        (guestId && !visit.guestIds.includes(guestId))
      )
        throw fail("Join this visit using its private joining code.", 403);
    }
    let reservationContext=false;
    if(input.reservationId){
      if(source==="zidi")throw fail("Reservation integration scope is not configured.",409,"INTEGRATION_SCOPE_REQUIRED");
      const reservation=await find(c,s,"reservation",input.reservationId);
      if(!["confirmed","arrived","seated"].includes(reservation.status))throw fail("A confirmed active reservation is required.",409,"TABLE_REQUIRED");
      if(guestId&&reservation.guestId!==guestId)throw fail("This reservation belongs to another guest.",403);
      reservationContext=true;
    }
    const current = (
      await readRecords(c, s.organizationId, s.branchId, "product")
    ).map((r) => r.data);
    const published = publishedCounterProducts(b,current);
    if(!availableNow(b.settings.serviceHours,b.timezone)) throw fail("Ordering is closed outside branch service hours.",409,"BRANCH_CLOSED");
    const priced = quote(input.items, published, {tableContext:reservationContext||(input.fulfillment==="table_service"&&!!input.visitId)});
    const pricing=await resolveQuotedPricing(c,s,b,input,actor,guestId,priced.total);
    const quantities = new Map();
    for (const l of stockLines(priced.items))
      quantities.set(
        l.productId,
        (quantities.get(l.productId) || 0) + l.quantity,
      );
    for (const [id, qty] of quantities) {
      const p = current.find((p) => p.id === id);
      if (p.stockMode === "counted") {
        if (p.stock < qty) throw fail("Not enough stock.", 409, "OUT_OF_STOCK");
        p.stock -= qty;
        await update(c, s, "product", p.id, p);
        await record(c, s, "stock_movement", {
          productId: p.id,
          type: "checkout_hold",
          quantity: -qty,
          createdAt: now(),
        });
      }
    }
    const variantTotals=new Map();
    for(const line of stockLines(priced.items)) if(line.variantId) {const key=line.productId+":"+line.variantId; const old=variantTotals.get(key);variantTotals.set(key,{...line,quantity:(old?.quantity||0)+line.quantity});}
    for(const line of variantTotals.values()) {
      const product=await find(c,s,"product",line.productId),variant=product.variants.find(v=>v.id===line.variantId);
      if(variant?.stockMode==="counted") {
        if(variant.stock<line.quantity) throw fail("Not enough stock for this size.",409,"OUT_OF_STOCK");
        variant.stock-=line.quantity;
        await update(c,s,"product",product.id,product);
        await record(c,s,"stock_movement",{productId:product.id,variantId:variant.id,type:"checkout_hold",quantity:-line.quantity,createdAt:now()});
      }
    }
    const stamp = now();
    const order = await record(c, s, "order", {
      ...priced,
      total:pricing.total,
      pricing,
      items: priced.items.map((line) => ({...line, orderLineId: randomUUID()})),
      requestKey: input.requestKey,
      intentHash: intentHash(input),
      reference: "M-" + randomBytes(4).toString("hex").toUpperCase(),
      status: "submitted",
      paymentStatus: pricing.total===0?"paid":"unpaid",
      paid: 0,
      refunded: 0,
      version: 1,
      guestId,
      displayName: input.displayName,
      fulfillment: input.fulfillment,
      visitId: input.visitId || null,
      payLaterAllowed:!!input.visitId && (b.settings.payLater || hasCapability(b.settings,"open_tabs")),
      reservationId:input.reservationId||null,
      source,
      staffCreatorId: source === "zidi" ? null : actor?.id || null,
      staffCreatorName:source==="zidi"?null:actor?.name||null,
      integrationCredentialId: source === "zidi" ? actor?.id || null : null,
      handlerId: null,
      history: [
        { action: "submitted", actorId: actor?.id || guestId, at: stamp },
      ],
      stockHeld: pricing.total>0,
      holdExpired: false,
      holdExpiresAt: new Date(
        Date.now() +
          Math.min(60, Math.max(1, b.settings.holdMinutes || 10)) * 60000,
      ).toISOString(),
      note: input.note,
      menuVersion: b.menu_version,
      policyVersion:financialPolicy.version,
      financialPolicy,
      createdAt: stamp,
    });
    await attachBill(c, s, order);
    await enqueuePaidDocuments(c,s,order,actor,{kind:"reservation_deposit_allocation",id:order.billId});
    for (const station of new Set(stockLines(priced.items).map((i) => i.station)))
      await record(c, s, "ticket", {
        orderId: order.id,
        station,
        status: "queued",
        version: 1,
        items: order.items.filter(i=>i.components?.length?i.components.some(c=>c.station===station):i.station===station).map(i => ({...i,components:i.components?.filter(c=>c.station===station),preparedQuantity: 0})),
        createdAt: stamp,
      });
    await event(c, s, "order_submitted", actor, { orderId: order.id, source });
    return order;
  }
  router.post(B + "/orders", guard("orders.create"), async (req, res) => {
    const input = orderInputSchema.parse(req.body);
    res
      .status(201)
      .json(
        await locked(scope(req), (c, b) =>
          createOrder(c, b, scope(req), input, req.user, null, "staff"),
        ),
      );
  });
  router.post(B + "/orders/:id/status", async (req, res) => {
    const input = z
      .object({
        status: z.enum([
          "accepted",
          "preparing",
          "ready",
          "collected",
          "completed",
          "rejected",
          "cancelled",
        ]),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    req.meraMembership=await membership(
      req,
      req.params.organizationId,
      req.params.branchId,
      ["preparing", "ready"].includes(input.status)
        ? "orders.prepare"
        : "orders.fulfill",
    );
    res.json(
      await locked(scope(req), async (c, b) => {
        await releaseExpired(c, scope(req));
        const o = assertHistoricalWritable(await find(c, scope(req), "order", req.params.id));
        if (o.version !== input.version)
          throw fail(
            "This order changed. Refresh before continuing.",
            409,
            "STALE_VERSION",
          );
        if (input.status === "ready") {
          const tickets = (await readRecords(c, scope(req).organizationId, scope(req).branchId, "ticket")).map(r=>r.data).filter(t=>t.orderId===o.id);
          if (!tickets.length || !tickets.every(t=>["ready","cancelled"].includes(t.status))) throw fail("All required station tickets must be ready first.",409,"STATIONS_PENDING");
        }
        if(o.visitId && !o.payLaterAllowed && !b.settings.payLater && ["preparing","ready","collected"].includes(input.status) && paidForBill(o)<o.total)assertCapability(b,"open_tabs");
        transition(o, input.status, { payLater: o.payLaterAllowed || b.settings.payLater || (!!o.visitId && hasCapability(b.settings,"open_tabs")) });
        if (o.holdExpired && ["accepted", "preparing"].includes(input.status))
          throw fail(
            "The stock hold expired. Create a new order or resolve the exception.",
            409,
          );
        if (
          o.stockHeld &&
          (["cancelled", "rejected"].includes(input.status) ||
            (b.settings.payLater && input.status === "accepted"))
        ) {
          if (["cancelled", "rejected"].includes(input.status))
            for (const line of stockLines(o.items)) {
              const p = await find(c, scope(req), "product", line.productId);
              if (p.stockMode === "counted") p.stock += line.quantity;
              const variant=p.variants?.find(v=>v.id===line.variantId);
              if(variant?.stockMode==="counted") variant.stock+=line.quantity;
              await update(c,scope(req),"product",p.id,p);
            }
          o.stockHeld = false;
        }
        o.status = input.status;
        if(input.status==="collected")for(const line of o.items){line.fulfilledQuantity=line.quantity;line.lastFulfilledAt=now();}
        if (input.status === "collected" && !o.collectedAt) {
          o.collectedAt = now();
          const recognitionTax=o.recognitionPricing?.tax??o.pricing?.tax??0;
          const postings = [
            { account: "merchant_sales", debit: 0, credit: (o.recognitionTotal??o.total)-recognitionTax },
            ...(recognitionTax?[{account:"tax_payable",debit:0,credit:recognitionTax}]:[]),
          ];
          if (o.paid - o.refunded > 0)
            postings.push({
              account: "customer_collections_liability",
              debit: o.paid - o.refunded,
              credit: 0,
            });
          if ((o.recognitionTotal??o.total) - o.paid > 0)
            postings.push({
              account: "merchant_receivable",
              debit: (o.recognitionTotal??o.total) - o.paid,
              credit: 0,
            });
          if (o.refunded > 0)
            postings.push({
              account: "sales_returns",
              debit: o.refunded-(o.refundedTax||0),
              credit: 0,
            });
          if(o.refundedTax)postings.push({account:"tax_payable",debit:o.refundedTax,credit:0});
          if((o.recognitionTotal??o.total)>0) await record(c, scope(req), "ledger", {
            orderId: o.id,
            type: "sale_recognition",
            postings,
            createdAt: o.collectedAt,
          });
        }
        if (input.status === "completed" && !o.completedAt)
          o.completedAt = now();
        o.version++;
        o.handlerId = req.user.id;
        o.handlerName = req.user.name;
        o.history.push({
          action: input.status,
          actorId: req.user.id,
          actorName: req.user.name,
          at: now(),
        });
        if (["cancelled", "rejected"].includes(input.status)) {
          const bills = (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "bill",
            )
          )
            .map((r) => r.data)
            .filter((b) => b.status === "open");
          for (const bill of bills) {
            if (bill.charges.some((l) => l.orderId === o.id)) {
              bill.charges = bill.charges.filter((l) => l.orderId !== o.id);
              if (
                bill.allocations
                  .filter((a) => a.orderId === o.id)
                  .reduce((n, a) => n + a.amount, 0) !== 0
              )
                throw fail(
                  "Refund allocated collections before cancelling.",
                  409,
                );
              bill.allocations = bill.allocations.filter(
                (a) => a.orderId !== o.id,
              );
              await update(c, scope(req), "bill", bill.id, billAmounts(bill));
            }
          }
        }
        await update(c, scope(req), "order", o.id, o);
        await event(c, scope(req), "order_status", req.user, {
          orderId: o.id,
          status: o.status,
        });
        return o;
      }),
    );
  });
  router.post(
    B + "/orders/:id/assign",
    guard("orders.assign"),
    async (req, res) => {
      const input = z
        .object({ userId: uuid, version: z.number().int() })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const member = (
            await c.query(
              "SELECT m.*,u.name AS assignee_name FROM mera_memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.organization_id=$2 AND m.active=true AND u.active=true",
              [input.userId, req.params.organizationId],
            )
          ).rows[0];
          if (
            !member ||
            (!member.organization_wide &&
              !canSeeBranch(member,req.params.branchId))
          )
            throw fail("The assignee does not have branch access.");
          const o = assertHistoricalWritable(await find(c, scope(req), "order", req.params.id));
          if (o.version !== input.version) throw fail("Order changed.", 409);
          o.history.push({
            action: "assigned",
            from: o.handlerId,
            to: input.userId,
            actorId: req.user.id,
            actorName: req.user.name,
            at: now(),
          });
          o.handlerId = input.userId;
          o.handlerName = member.assignee_name?.trim() || null;
          o.version++;
          return update(c, scope(req), "order", o.id, o);
        }),
      );
    },
  );
  router.post(
    B + "/orders/:id/payments",
    guard("payments.record"),
    async (req, res) => {
      const input = paymentInputSchema.parse(req.body);
      if(input.method==="room_charge") await membership(req,req.params.organizationId,req.params.branchId,"room_charge.post");
      if (input.method === "external_transfer" && !input.reference)
        throw fail("A verified transfer reference is required.");
      res.json(
        await locked(scope(req), async (c) => {
          await releaseExpired(c, scope(req));
          const existing = await requestRecord(c,scope(req),"payment",input.requestKey);
          if (existing) {
            if (existing.data.intentHash !== intentHash(input) || existing.data.recordedBy !== req.user.id)
              throw fail(
                "This request key was used for different payment details.",
                409,
                "IDEMPOTENCY_CONFLICT",
              );
            if (
              existing.data.orderId !== req.params.id ||
              existing.data.amount !== input.amount ||
              existing.data.method !== input.method
            )
              throw fail("Payment key conflict.", 409);
            return existing.data;
          }
          const o = assertHistoricalWritable(await find(c, scope(req), "order", req.params.id));
          if (o.holdExpired || ["cancelled", "rejected"].includes(o.status))
            throw fail(
              "The order cannot accept payment. Resolve its stock/payment exception.",
              409,
              "PAYMENT_EXCEPTION",
            );
          if (input.amount > orderBalance(o))
            throw fail(
              "Payment exceeds the outstanding amount. Record and resolve excess funds separately.",
              409,
              "EXCESS_PAYMENT",
            );
          await assertFinancialRequestActive(c,scope(req),input.requestKey,"payment",req.user.id);
          await assertManualMethod(c,scope(req),input.method);
          const payment = await record(c, scope(req), "payment", {
            ...input,
            intentHash: intentHash(input),
            orderId: o.id,
            source: "staff_verified",
            recordedBy: req.user.id,
            fee: 0,
            policyVersion: o.policyVersion,
            financialPolicy: o.financialPolicy,
            createdAt: now(),
          });
          await record(c, scope(req), "ledger", {
            paymentId: payment.id,
            postings: ledgerPostings(
              input.amount,
              input.method,
              false,
              !!o.collectedAt,
            ),
            createdAt: now(),
          });
          await allocateOrderPayment(
            c,
            scope(req),
            o.id,
            payment.id,
            input.amount,
          );
          o.paid += input.amount;
          o.paymentStatus = paymentStatus(o);
          if (paidForBill(o) === o.total) o.stockHeld = false;
          o.version++;
          o.history.push({
            action: "payment_recorded",
            amount: input.amount,
            method: input.method,
            actorId: req.user.id,
            actorName: req.user.name,
            at: now(),
          });
          await update(c, scope(req), "order", o.id, o);
          await enqueuePaidDocuments(c,scope(req),o,req.user,{kind:"payment",id:payment.id});
          await event(c, scope(req), "payment_recorded", req.user, {
            orderId: o.id,
            paymentId: payment.id,
            amount: input.amount,
          });
          return payment;
        }),
      );
    },
  );
  router.post(
    B + "/orders/:id/refunds",
    guard("refunds.approve"),
    async (req, res) => {
      const input = z
        .object({
          requestKey: uuid,
          amount: z.number().int().positive(),
          reason: z.string().trim().min(3).max(300),
          method: z.enum(["cash", "external_pos", "external_transfer"]),
          reference:z.string().max(200).default(""),
          cancellationQuoteId:uuid.optional(),
          refundRequestId:uuid.optional(),
        })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const existing = await requestRecord(c,scope(req),"refund",input.requestKey);
          if (existing) {
            if ((existing.data.intentHash !== intentHash(input) || existing.data.approvedBy !== req.user.id))
              throw fail(
                "This request key was used for different payment details.",
                409,
                "IDEMPOTENCY_CONFLICT",
              );
            if (
              existing.data.orderId !== req.params.id ||
              existing.data.amount !== input.amount
            )
              throw fail("Refund key conflict.", 409);
            return existing.data;
          }
          const o = assertHistoricalWritable(await find(c, scope(req), "order", req.params.id));
          const reviewedRequest = await reviewRefundRequest(c,{find},scope(req),input,o,req.user.id);
          if(input.cancellationQuoteId && (await readRecords(c,scope(req).organizationId,scope(req).branchId,"refund")).some(r=>r.data.cancellationQuoteId===input.cancellationQuoteId))throw fail("This cancellation quote already has a recorded refund.",409);
          if (input.amount > o.paid - o.refunded)
            throw fail("Refund exceeds collected funds.");
          await assertFinancialRequestActive(c,scope(req),input.requestKey,"refund",req.user.id);
          let plannedTax=null;
          if(input.cancellationQuoteId){
            const review=await find(c,scope(req),"cancellation_quote",input.cancellationQuoteId);
            const line=o.items.find(l=>l.orderLineId===review.orderLineId);
            if(review.orderId!==o.id||review.previousTotal!==o.total||review.creditRequired!==input.amount||review.lineQuantity!==line?.quantity||review.policyVersion!==o.pricing?.policyVersion||Date.parse(review.expiresAt)<=Date.now())throw fail("Review a current cancellation quote before recording its refund.",409,"CANCELLATION_QUOTE_CHANGED");
            if((await readRecords(c,scope(req).organizationId,scope(req).branchId,"refund")).some(r=>r.data.cancellationQuoteId===review.id))throw fail("This cancellation quote already has a recorded refund.",409);
            plannedTax=review.refundTaxAmount;
          }
          const originalTax=o.recognitionPricing?.tax??o.pricing?.tax??0;
          const remainingTax=originalTax-(o.refundedTax||0);
          const taxAmount=plannedTax??Math.min(remainingTax,Number((BigInt(input.amount)*BigInt(originalTax)+BigInt(o.recognitionTotal??o.total)/2n)/BigInt(o.recognitionTotal??o.total)));
          if(taxAmount<0||taxAmount>remainingTax)throw fail("Refund tax credits require accounting review.",409,"REFUND_TAX_REVIEW_REQUIRED");
          const refund = await record(c, scope(req), "refund", {
            taxAmount,
            ...input,
            intentHash: intentHash(input),
            orderId: o.id,
            approvedBy: req.user.id,
            source: "manual_return_record",
            createdAt: now(),
          });
          await record(c, scope(req), "ledger", {
            refundId: refund.id,
            postings: o.collectedAt && taxAmount ? [
              ...(input.amount-taxAmount?[{account:"sales_returns",debit:input.amount-taxAmount,credit:0}]:[]),
              {account:"tax_payable",debit:taxAmount,credit:0},
              {account:"collections_"+input.method,debit:0,credit:input.amount},
            ] : ledgerPostings(input.amount,input.method,true,!!o.collectedAt),
            createdAt: now(),
          });
          let remainingRefund = input.amount;
          for(const bill of (await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='bill' AND data->>'status' IN ('open','closed') AND data->'charges' @> $3::jsonb ORDER BY created_at,id",[req.params.organizationId,req.params.branchId,JSON.stringify([{orderId:o.id}])])).rows.map(r=>r.data)) {
            const netAllocated = bill.allocations
              .filter((a) => a.orderId === o.id)
              .reduce((n, a) => n + a.amount, 0);
            const amount = Math.min(remainingRefund, Math.max(0, netAllocated));
            if (amount) {
              bill.charges.push({
                id: randomUUID(),
                orderId: o.id,
                lineIndex: null,
                quantity: null,
                unitPrice: 0,
                amount: -amount,
                name: "Refund credit",
                refundId: refund.id,
              });
              bill.allocations.push({
                paymentId: refund.id,
                orderId: o.id,
                amount: -amount,
                source: "refund",
              });
              await update(c, scope(req), "bill", bill.id, billAmounts(bill));
              remainingRefund -= amount;
            }
            if (!remainingRefund) break;
          }
          if (remainingRefund)
            throw fail(
              "Refund allocations could not be reconciled.",
              409,
              "ALLOCATION_CONFLICT",
            );
          o.refunded += input.amount;
          o.refundedTax=(o.refundedTax||0)+taxAmount;
          o.paymentStatus = paymentStatus(o);
          o.version++;
          o.history.push({
            action: "refund_recorded",
            actorId: req.user.id,
            actorName: req.user.name,
            amount: input.amount,
            at: now(),
          });
          await update(c, scope(req), "order", o.id, o);
          await event(c, scope(req), "refund_recorded", req.user, {
            orderId: o.id,
            amount: input.amount,
          });
          await completeRefundRequest(c,{update,event},scope(req),reviewedRequest,refund,req.user);
          return refund;
        }),
      );
    },
  );
  router.post(B + "/tables", guard("tables.manage"), async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(80),
        capacity: z.number().int().min(1).max(100),
        zone: z.string().max(80).default("Main floor"),
        x: z.number().min(0).max(100).default(0),
        y: z.number().min(0).max(100).default(0),
      })
      .parse(req.body);
    res
      .status(201)
      .json(
        await locked(scope(req), (c) =>
          record(c, scope(req), "table", { ...input, status: "available" }),
        ),
      );
  });
  router.post(B + "/visits", guard("tables.manage"), async (req, res) => {
    const input = z
      .object({ tableId: uuid, displayName: z.string().trim().min(1).max(100),minimumSpendAcknowledged:z.boolean().optional(),minimumSpendPolicyVersion:z.string().max(120).optional() })
      .parse(req.body);
    res.status(201).json(
      await locked(scope(req), async (c,b) => {
        const organization=(await c.query("SELECT platform_flags FROM mera_organizations WHERE id=$1",[b.organization_id])).rows[0];
        assertCapability(b,"table_service");
        assertBranchFeature(b,"new_table_visits");
        assertOrganizationFeature(organization,"new_table_visits");
        const minimumSpendPolicy=minimumSpendSnapshot(b);
        assertMinimumSpendAcknowledged(minimumSpendPolicy,input);
        const table = await find(c, scope(req), "table", input.tableId);
        if (table.status !== "available")
          throw fail("This table is not available.", 409);
        const code = randomBytes(4).toString("hex").toUpperCase();
        const visit = await record(c, scope(req), "visit", {
          tableId: table.id,
          tableName: table.name,
          status: "open",
          minimumSpendPolicy,
          minimumSpendAcknowledgements:minimumSpendPolicy?[{actorId:req.user.id,actorType:"staff",policyVersion:minimumSpendPolicy.version,at:now()}]:[],
          displayName: input.displayName,
          guestIds: [],
          joiningCodeHash: hash(code),
          openedBy: req.user.id,
          createdAt: now(),
        });
        const bill = await record(c, scope(req), "bill", {
          visitId: visit.id,
          name: table.name + " bill",
          status: "open",
          charges: [],
          allocations: [],
          createdAt: now(),
        });
        visit.billId = bill.id;
        await update(c, scope(req), "visit", visit.id, visit);
        table.status = "occupied";
        await update(c, scope(req), "table", table.id, table);
        await event(c, scope(req), "visit_opened", req.user, {
          visitId: visit.id,
          tableId: table.id,
        });
        const { joiningCodeHash, ...safe } = visit;
        return { ...safe, joiningCode: code };
      }),
    );
  });
  router.post(
    B + "/visits/:id/close",
    guard("tables.manage"),
    async (req, res) => {
      res.json(
        await locked(scope(req), async (c) => {
          const visit = await find(c, scope(req), "visit", req.params.id);
          if(visit.status!=="open")throw fail("This visit is already closed.",409);
          const orders = (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "order",
            )
          )
            .map((r) => r.data)
            .filter(
              (o) =>
                o.visitId === visit.id &&
                !["rejected", "cancelled"].includes(o.status),
            );
          if (
            orders.some(
              (o) =>
                orderBalance(o)>0 ||
                !["collected", "completed"].includes(o.status),
            )
          )
            throw fail(
              "Outstanding balances or active orders prevent visit closure.",
              409,
            );
          if(minimumSpendSummary(visit,orders).shortfall>0)throw fail("Add qualifying paid orders or obtain a reviewed minimum-spend waiver before closing.",409,"MINIMUM_SPEND_REVIEW_REQUIRED");
          const visitBills = (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "bill",
            )
          )
            .map((r) => r.data)
            .filter((b) => b.visitId === visit.id && b.status === "open");
          if (visitBills.some((b) => billAmounts(b).balance !== 0))
            throw fail(
              "Resolve outstanding bill balances and unused deposits before closure.",
              409,
            );
          for (const b of visitBills) {
            b.status = "closed";
            await update(c, scope(req), "bill", b.id, billAmounts(b));
          }
          visit.status = "closed";
          visit.closedAt = now();
          visit.guestIds = [];
          visit.joiningCodeHash = null;
          await update(c, scope(req), "visit", visit.id, visit);
          for(const tableId of new Set(visit.tableIds||[visit.tableId])){
            const table=await find(c,scope(req),"table",tableId);table.status="cleaning";
            await update(c,scope(req),"table",table.id,table);
          }
          await event(c, scope(req), "visit_closed", req.user, {
            visitId: visit.id,
          });
          return visit;
        }),
      );
    },
  );
  router.post(
    B + "/tables/:id/status",
    guard("tables.manage"),
    async (req, res) => {
      const { status,reason } = z
        .object({ status: z.enum(["available", "cleaning", "unavailable"]),reason:z.string().trim().min(3).max(300) })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const table = await find(c, scope(req), "table", req.params.id);
          const active=(await readRecords(c,scope(req).organizationId,scope(req).branchId,"visit")).some(r=>r.data.status==="open" && (r.data.tableIds||[r.data.tableId]).includes(table.id));
          if (table.status === "occupied" || active)
            throw fail(
              "Close the current visit before resetting the table.",
              409,
            );
          const from=table.status;
          table.status = status;
          await event(c,scope(req),"table_status_changed",req.user,{tableId:table.id,from,status,reason});
          return update(c, scope(req), "table", table.id, table);
        }),
      );
    },
  );
  async function reservation(c, b, s, input, actor, guestId) {
    const repeat=(await requestRecord(c,s,"reservation",input.requestKey))?.data;
    if (repeat) {
      if (repeat.intentHash !== intentHash(input))
        throw fail(
          "This request key was used for a different reservation.",
          409,
          "IDEMPOTENCY_CONFLICT",
        );
      if (
        repeat.guestId !== guestId ||
        repeat.createdBy !== (actor?.id || null)
      )
        throw fail("Reservation key conflict.", 409);
      return repeat;
    }
    if (guestId && !actor) await assertReservationRequestActive(c,s,input.requestKey,guestId);
    if(actor && actor.type!=="integration" && !guestId) await assertStaffReservationRequestActive(c,s,input.requestKey,actor.id);
    const organization=(await c.query("SELECT platform_flags FROM mera_organizations WHERE id=$1",[s.organizationId])).rows[0];
    assertCapability(b,"reservations");
    assertBranchFeature(b,"new_reservations");
    if(b.settings.depositPolicy?.enabled || b.settings.depositRequired) assertCapability(b,"deposits");
    assertOrganizationFeature(organization,"new_reservations");
    if(actor?.type==="integration") { assertBranchFeature(b,"zidi"); assertOrganizationFeature(organization,"zidi"); }
    if (!b.settings.reservationsEnabled)
      throw fail("Reservations are not enabled at this branch.", 409);
    if (
      (b.settings.depositRequired && !b.settings.depositPolicy?.approved) ||
      (b.settings.minimumSpend && !b.settings.minimumSpendPolicy?.approved)
    )
      throw fail(
        "Deposit and minimum-spend policies require explicit approval before reservations can be accepted.",
        409,
        "POLICY_BLOCKED",
      );
    if (
      Date.parse(input.startsAt) < Date.now() ||
      Date.parse(input.endsAt) - Date.parse(input.startsAt) > 86400000
    )
      throw fail("Choose a future reservation lasting at most 24 hours.");
    const minimumSpendPolicy=minimumSpendSnapshot(b);
    assertMinimumSpendAcknowledged(minimumSpendPolicy,input);
    assertReservationWindow(input,b);
    const timing=b.settings.reservationPolicy;
    const buffer=timing?.enabled&&timing.approved?((timing.bufferBeforeMinutes||0)+(timing.bufferAfterMinutes||0))*60000:0;
    const existing=(await c.query("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='reservation' AND data->>'status' NOT IN ('cancelled','no-show','completed') AND (data->>'startsAt')::timestamptz<$3::timestamptz AND (data->>'endsAt')::timestamptz>$4::timestamptz ORDER BY created_at,id",[s.organizationId,s.branchId,new Date(Date.parse(input.endsAt)+buffer).toISOString(),new Date(Date.parse(input.startsAt)-buffer).toISOString()])).rows.map(r=>r.data);
    const overlapping = existing.filter(
      (r) =>
        !["cancelled", "no-show", "completed"].includes(r.status) &&
        reservationOverlaps(r, input,b),
    );
    if (input.tableId) {
      const table = await find(c, s, "table", input.tableId);
      if (
        table.capacity < input.partySize ||
        overlapping.some((r) => r.tableId === table.id)
      )
        throw fail(
          "That table does not have capacity for this booking.",
          409,
          "CAPACITY_CONFLICT",
        );
    }
    if (
      overlapping.reduce((n, r) => n + r.partySize, 0) + input.partySize >
      (b.settings.capacity || 30)
    )
      throw fail(
        "The branch is fully booked for that time.",
        409,
        "CAPACITY_CONFLICT",
      );
    const r = await record(c, s, "reservation", {
      ...input,
      intentHash: intentHash(input),
      guestId,
      createdBy: actor?.id || null,
      status: "requested",
      depositAmount: 0,
      depositRequired: b.settings.depositPolicy?.enabled
        ? b.settings.depositPolicy.amount
        : 0,
      depositPolicy: b.settings.depositPolicy || null,
      minimumSpendPolicy,
      minimumSpendAcknowledgement:minimumSpendPolicy?{actorId:actor?.id||guestId,actorType:actor?"staff":"guest",policyVersion:minimumSpendPolicy.version,at:now()}:null,
      createdAt: now(),
    });
    await event(c, s, "reservation_requested", actor, { reservationId: r.id });
    return r;
  }
  router.post(
    B + "/reservations",
    guard("reservations.manage"),
    async (req, res) => {
      assertExpectedReservationActor(req);
      const input = reservationInputSchema.parse(req.body);
      res
        .status(201)
        .json(
          await locked(scope(req), (c, b) =>
            reservation(c, b, scope(req), input, req.user, null),
          ),
        );
    },
  );
  router.post(
    B + "/reservations/:id/status",
    guard("reservations.manage"),
    async (req, res) => {
      const { status } = z
        .object({
          status: z.enum([
            "confirmed",
            "arrived",
            "seated",
            "completed",
            "cancelled",
            "no-show",
          ]),
        })
        .parse(req.body);
      const allowed = {
        requested: ["confirmed", "cancelled"],
        confirmed: ["arrived", "cancelled", "no-show"],
        arrived: ["seated", "cancelled"],
        seated: ["completed"],
        completed: [],
        cancelled: [],
        "no-show": [],
      };
      res.json(
        await locked(scope(req), async (c) => {
          const r = await find(c, scope(req), "reservation", req.params.id);
          if (!allowed[r.status]?.includes(status))
            throw fail("Invalid reservation transition.", 409);
          if (
            status === "confirmed" &&
            (r.depositRequired || 0) > (r.depositAmount || 0)
          )
            throw fail(
              "The required deposit has not been verified.",
              409,
              "DEPOSIT_REQUIRED",
            );
          r.status = status;
          r.updatedBy = req.user.id;
          await event(c, scope(req), "reservation_status", req.user, {
            reservationId: r.id,
            status,
          });
          return update(c, scope(req), "reservation", r.id, r);
        }),
      );
    },
  );
  router.post(B + "/shifts", guard("shifts.manage"), async (req, res) => {
    assertExpectedShiftActor(req);
    const input=z.object({openingFloat:z.number().int().min(0),requestKey:uuid.optional()}).parse(req.body);
    res.status(201).json(await locked(scope(req),async c=>{
      const s=scope(req),attempt={requestKey:input.requestKey,actorId:req.user.id,operation:"open",intent:{openingFloat:input.openingFloat}};
      const prior=await replayShiftOperation(c,s,attempt);if(prior)return prior;
      await assertShiftRequestActive(c,s,attempt);
      if((await readRecords(c,s.organizationId,s.branchId,"shift")).some(r=>r.data.status==="open"))throw fail("Close the existing branch shift first.",409);
      const shift=await record(c,s,"shift",{openingFloat:input.openingFloat,status:"open",openedBy:req.user.id,createdAt:now()});
      await recordShiftOperation(c,s,record,attempt,shift);
      return shift;
    }));
  });
  router.post(
    B + "/shifts/:id/movements",
    guard("shifts.manage"),
    async (req, res) => {
      const input = z
        .object({
          requestKey:uuid,
          direction: z.enum(["in", "out"]),
          amount: z.number().int().positive(),
          reason: z.string().trim().min(3).max(300),
        })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const previous=(await readRecords(c,scope(req).organizationId,scope(req).branchId,"cash_movement")).map(r=>r.data).find(r=>r.requestKey===input.requestKey);
          if(previous){if(previous.intentHash!==intentHash(input)||previous.shiftId!==req.params.id||previous.actorId!==req.user.id)throw fail("Cash movement request key conflict.",409,"IDEMPOTENCY_CONFLICT");return previous;}
          await assertFinancialRequestActive(c,scope(req),input.requestKey,"cash_movement",req.user.id);
          const shift = await find(c, scope(req), "shift", req.params.id);
          if (shift.status !== "open") throw fail("The shift is closed.", 409);
          return record(c, scope(req), "cash_movement", {
            ...input,
            intentHash:intentHash(input),
            shiftId: shift.id,
            actorId: req.user.id,
            actorName: req.user.name,
            createdAt: now(),
          });
        }),
      );
    },
  );
  router.post(
    B + "/shifts/:id/close",
    guard("shifts.manage"),
    async (req, res) => {
      assertExpectedShiftActor(req);
      const input = z
        .object({
          requestKey:uuid.optional(),
          countedCash: z.number().int().min(0),
          reason: z.string().trim().max(300).default(""),
        })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const s=scope(req),attempt={requestKey:input.requestKey,actorId:req.user.id,operation:"close",shiftId:req.params.id,intent:{countedCash:input.countedCash,reason:input.reason,shiftId:req.params.id}};
          const prior=await replayShiftOperation(c,s,attempt);if(prior)return prior;
          await assertShiftRequestActive(c,s,attempt);
          const shift = await find(c, scope(req), "shift", req.params.id);
          if (shift.status !== "open")
            throw fail("The shift is already closed.", 409);
          const rs=(await c.query("SELECT kind,data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind IN ('payment','deposit','refund','deposit_refund','cash_movement') AND (data->>'createdAt')::timestamptz>=$3::timestamptz",[req.params.organizationId,req.params.branchId,shift.createdAt])).rows;
          let expectedCash = shift.openingFloat;
          for (const r of rs) {
            if (Date.parse(r.data.createdAt) < Date.parse(shift.createdAt))
              continue;
            if (["payment","deposit"].includes(r.kind) && r.data.method === "cash")
              expectedCash += r.data.amount;
            if (["refund","deposit_refund"].includes(r.kind) && r.data.method === "cash")
              expectedCash -= r.data.amount;
            if (r.kind === "cash_movement" && r.data.shiftId === shift.id)
              expectedCash +=
                r.data.direction === "in" ? r.data.amount : -r.data.amount;
          }
          const variance = input.countedCash - expectedCash;
          if (variance && !input.reason)
            throw fail("Explain the cash variance before closing.");
          Object.assign(shift, {
            countedCash:input.countedCash,
            reason:input.reason,
            expectedCash,
            variance,
            status: variance ? "pending_approval" : "closed",
            closedAt: now(),
            closedBy: req.user.id,
          });
          await event(c, scope(req), "shift_closed", req.user, {
            shiftId: shift.id,
            variance,
          });
          const result=await update(c, scope(req), "shift", shift.id, shift);
          await recordShiftOperation(c,s,record,attempt,result);
          return result;
        }),
      );
    },
  );
  router.get(
    "/organizations/:organizationId/members",
    guard("members.manage"),
    async (req, res) =>
      res.json(
        (
          await q(
            'SELECT m.id,m.user_id AS "userId",m.role,m.permissions,m.branch_ids AS "branchIds",m.branch_roles AS "branchRoles",m.organization_wide AS "organizationWide",m.active,m.version,u.name FROM mera_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1',
            [req.params.organizationId],
          )
        ).rows,
      ),
  );
  router.get("/organizations/:organizationId/invitations",guard("members.manage"),async(req,res)=>res.json((await q('SELECT id,email,role,branch_ids AS "branchIds",branch_roles AS "branchRoles",expires_at AS "expiresAt",revoked,accepted FROM mera_invitations WHERE organization_id=$1 ORDER BY expires_at DESC',[req.params.organizationId])).rows.map(i=>({...i,delivery:"not_sent"}))));
  router.post("/organizations/:organizationId/invitations",guard("members.manage"),async(req,res)=>{
    const input=z.object({requestKey:uuid.optional(),email:z.string().email().max(200),role:z.string().min(1).max(100),branchRoles:z.record(uuid,z.object({role:z.string().min(1).max(100),permissions:z.array(z.enum(permissions)).optional()}).strict()).optional(),branch_roles:z.record(uuid,z.object({role:z.string().min(1).max(100),permissions:z.array(z.enum(permissions)).optional()}).strict()).optional(),branchIds:z.array(uuid).max(100).transform(v=>[...new Set(v)].sort())}).parse(req.body);
    let immediateToken=null;
    const result=await withAccessLock(db,req,async c=>{
      const branchRoles=input.branch_roles||input.branchRoles||{};
      if(Object.keys(branchRoles).length&&!input.requestKey)throw fail("Branch role invitations require a request key.",400);
      const intent={email:input.email,role:input.role,branchIds:input.branchIds,...(Object.keys(branchRoles).length?{branch_roles:structuredClone(branchRoles)}:{})},attempt={requestKey:input.requestKey,operation:"invitation_create",targetId:null,intent};
      await authorizeAccessTarget(c,req,attempt.operation,null,intent);
      const prior=await beginAccessOperation(c,req,attempt);if(prior)return prior;
      const grants=(await resolveRole(c,req.params.organizationId,input.role)).permissions;
      const branches=(await c.query("SELECT id FROM mera_branches WHERE organization_id=$1",[req.params.organizationId])).rows.map(b=>b.id);
      if(input.branchIds.some(id=>!branches.includes(id)))throw fail("Invalid branch scope.",403);
      for(const [id,grant] of Object.entries(branchRoles)) {
        if(!branches.includes(id))throw fail("Invalid branch scope.",403);
        const role=await resolveRole(c,req.params.organizationId,grant.role);
        grant.permissions ||= role.permissions;
        if(grant.permissions.some(p=>!role.permissions.includes(p)||!req.meraMembership.permissions.includes(p)) || (grant.role==='owner' && req.meraMembership.role!=='owner'))throw fail("Cannot grant privileges beyond your authority.",403);
      }
      const token=randomBytes(32).toString("hex"),id=randomUUID(),expiresAt=new Date(Date.now()+48*3600000).toISOString();
      await c.query("INSERT INTO mera_invitations(id,organization_id,token_hash,email,role,permissions,branch_ids,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,req.params.organizationId,hash(token),input.email,input.role,JSON.stringify(grants),JSON.stringify(input.branchIds),expiresAt]);
      if(Object.keys(branchRoles).length)await c.query("UPDATE mera_invitations SET branch_roles=$1 WHERE id=$2 AND organization_id=$3",[JSON.stringify(branchRoles),id,req.params.organizationId]);
      const demo=process.env.MERA_DEMO==="true"&&process.env.NODE_ENV!=="production";
      const safe={id,email:input.email,role:input.role,branchIds:input.branchIds,expiresAt,delivery:"not_sent",reason:providers.email.reason,developmentTokenRecoverable:false,developmentTokenUnavailable:true,needsExplicitRevokeAndReinvite:demo};
      await recordAccessOperation(c,req,attempt,safe);
      await recordAccess(c,req,"audit",{action:"invitation_created",actorId:req.user.id,details:{invitationId:id,role:input.role},createdAt:now()});
      if(demo)immediateToken=token;
      return safe;
    });
    res.status(201).json(immediateToken?{...result,developmentToken:immediateToken,developmentTokenUnavailable:false,needsExplicitRevokeAndReinvite:false}:result);
  });
  router.delete("/organizations/:organizationId/invitations/:id",guard("members.manage"),async(req,res)=>{
    const input=z.object({requestKey:uuid.optional()}).parse(req.body||{});
    res.json(await withAccessLock(db,req,async c=>{
      const target=await authorizeAccessTarget(c,req,"invitation_revoke",req.params.id),attempt={requestKey:input.requestKey,operation:"invitation_revoke",targetId:req.params.id,intent:{}};
      const prior=await beginAccessOperation(c,req,attempt);if(prior)return prior;
      if(target.accepted)throw fail("This invitation was already accepted. Review the membership to manage access.",409,"INVITATION_ACCEPTED");
      await c.query("UPDATE mera_invitations SET revoked=true WHERE id=$1 AND organization_id=$2",[req.params.id,req.params.organizationId]);
      const result={revoked:true};await recordAccessOperation(c,req,attempt,result);await recordAccess(c,req,"audit",{action:"invitation_revoked",actorId:req.user.id,details:{invitationId:req.params.id},createdAt:now()});return result;
    }));
  });
  router.patch("/organizations/:organizationId/members/:id",guard("members.manage"),async(req,res)=>{
    const input=memberUpdateSchema.parse(req.body);
    res.json(await withAccessLock(db,req,async c=>{
      const {requestKey,...intent}=input;
      const target=await authorizeAccessTarget(c,req,"membership_update",req.params.id,input),attempt={requestKey,operation:"membership_update",targetId:req.params.id,intent};
      const prior=await beginAccessOperation(c,req,attempt);if(prior)return prior;
      const editing=input.role!==undefined;
      if(editing && (target.version||1)!==input.version)throw fail("Staff access changed. Refresh before editing.",409,"STALE_VERSION");
      const grants=editing?await validateMemberAssignment(c,req,input):null;
      if((input.active===false || (editing&&input.role!=="owner"))&&target.role==="owner"){
        const owners=(await c.query("SELECT id FROM mera_memberships WHERE organization_id=$1 AND role='owner' AND active=true",[req.params.organizationId])).rows;
        if(target.active&&owners.length<=1)throw fail("The last active owner cannot be removed.",409);
      }
      let result;
      if(editing){
        await c.query("UPDATE mera_memberships SET role=$1,permissions=$2,branch_ids=$3,branch_roles=$4,organization_wide=$5,version=version+1 WHERE id=$6 AND organization_id=$7",[input.role,JSON.stringify(grants.permissions),JSON.stringify(input.branchIds),JSON.stringify(grants.branchRoles),input.organizationWide,target.id,req.params.organizationId]);
        result={role:input.role,branchIds:input.branchIds,branch_roles:grants.branchRoles,organizationWide:input.organizationWide,version:(target.version||1)+1};
      }else{
        await c.query("UPDATE mera_memberships SET active=$1,version=version+1 WHERE id=$2 AND organization_id=$3",[input.active,target.id,req.params.organizationId]);
        result={active:input.active};
      }
      await recordAccessOperation(c,req,attempt,result);await recordAccess(c,req,"audit",{action:"membership_access_updated",actorId:req.user.id,details:{membershipId:target.id,before:{role:target.role,branchIds:target.branch_ids,branch_roles:target.branch_roles,active:target.active,version:target.version},...result},createdAt:now()});return result;
    }));
  });

  router.post("/invitations/accept", async (req, res) => {
    if (!req.user) throw fail("Sign in to accept an invitation.", 401);
    if (
      process.env.MERA_DEMO !== "true" ||
      process.env.NODE_ENV === "production"
    )
      throw fail(
        "Verified email acceptance requires the configured identity/email provider.",
        503,
        "PROVIDER_BLOCKED",
      );
    const { token } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(req.body);
    await db.transaction(async (c) => {
      const preliminary=(await c.query("SELECT organization_id FROM mera_invitations WHERE token_hash=$1",[hash(token)])).rows[0];
      if(!preliminary)throw fail("Invitation is invalid, expired or revoked.",409);
      await c.query("SELECT id FROM mera_organizations WHERE id=$1 FOR UPDATE",[preliminary.organization_id]);
      const invite = (
        await c.query(
          "SELECT * FROM mera_invitations WHERE token_hash=$1 FOR UPDATE",
          [hash(token)],
        )
      ).rows[0];
      if (
        !invite ||
        invite.revoked ||
        invite.accepted ||
        new Date(invite.expires_at) <= new Date()
      )
        throw fail("Invitation is invalid, expired or revoked.", 409);
      const currentRole=await resolveRole(c,invite.organization_id,invite.role);
      await c.query(
        "INSERT INTO mera_memberships(id,user_id,organization_id,role,permissions,branch_ids,organization_wide,branch_roles) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,organization_id) DO NOTHING",
        [
          randomUUID(),
          req.user.id,
          invite.organization_id,
          invite.role,
          JSON.stringify(currentRole.permissions),
          JSON.stringify(invite.branch_ids),
          invite.role==="owner",
          JSON.stringify(invite.branch_roles||{}),
        ],
      );
      await c.query("UPDATE mera_invitations SET accepted=true WHERE id=$1", [
        invite.id,
      ]);
    });
    res.json({ accepted: true, simulation: true, emailVerified: false });
  });
  async function publicContext(req) {
    const organization=await resolveOrganizationSlug(db,req.params.slug);
    if (!organization) throw fail("Menu not found.", 404);
    const b = (
      await q(
        "SELECT * FROM mera_branches WHERE id=$1 AND organization_id=$2",
        [req.params.branchId, organization.id],
      )
    ).rows[0];
    if (!b) throw fail("Branch not found.", 404);
    if(b.settings.role==="stock_room")throw fail("Menu not found.",404);
    const preview = Object.hasOwn(req.query, "preview") ? previewTokens.verify(req.query.preview, organization.id, b.id) : null;
    if (!preview && process.env.MERA_DEMO!=="true" && (organization.onboarding?.status!=="published" || b.settings.launchState!=="published")) throw fail("Menu not found.",404);
    return {
      organization,
      b,
      preview,
      s: { organizationId: organization.id, branchId: b.id },
    };
  }
  const guestCookieName=organizationId=>"mera_guest_"+organizationId;
  const guestCookieOptions=expiresAt=>({httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",maxAge:Math.max(0,Math.min(86400000,new Date(expiresAt).getTime()-Date.now())),path:"/"});
  async function guest(req, organizationId) {
    const context=req.get("X-Mera-Organization-Slug");
    if(context&&organizationId){const expected=await resolveOrganizationSlug(db,context);if(!expected||expected.id!==organizationId)throw fail("This private request belongs to another organization context.",404,"GUEST_CONTEXT_MISMATCH");}
    const token = (organizationId&&req.cookies?.[guestCookieName(organizationId)])||req.cookies?.mera_guest;
    if (!token)
      throw fail(
        "Add your name to start a secure guest session.",
        401,
        "GUEST_REQUIRED",
      );
    const g = (
      await q(
        "SELECT * FROM mera_guests WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP",
        [hash(token)],
      )
    ).rows[0];
    if (!g || (organizationId && g.organization_id !== organizationId))
      throw fail(
        "Start a guest session for this organization.",
        401,
        "GUEST_REQUIRED",
      );
    return g;
  }
  async function guestRecord(req,kind,label){
    const row=(await q("SELECT * FROM mera_records WHERE id=$1 AND kind=$2",[req.params.id,kind])).rows[0];
    if(!row)throw fail(label+" not found.",404);
    return {row,g:await guest(req,row.organization_id)};
  }
  const publicOrder = (o) => ({
    id: o.id,
    reference: o.reference,
    displayName: o.displayName,
    status: o.status,
    paymentStatus: o.paymentStatus,
    total: o.total,
    pricing:o.pricing?{subtotal:o.pricing.subtotal,discount:o.pricing.discount,serviceCharge:o.pricing.serviceCharge,tax:o.pricing.tax,total:o.pricing.total,lines:o.pricing.lines,policyVersion:o.pricing.policyVersion}:null,
    effectivePaid:paidForBill(o),
    effectiveSettlement:effectiveSettlement(o),
    outstandingBalance:orderBalance(o),
    writtenOff:o.writtenOff||0,
    settlementOutcome:o.settlementOutcome||null,
    recognitionTotal:o.recognitionTotal??o.total,
    paid: o.paid,
    refunded: o.refunded,
    items: o.items,
    version: o.version,
    fulfillment: o.fulfillment,
    visitId: o.visitId,
    createdAt: o.createdAt,
    collectedAt: o.collectedAt,
    holdExpired: o.holdExpired,
    history: o.history.map(({ action, at, amount, method }) => ({
      action,
      at,
      amount,
      method,
    })),
  });
  const P = "/public/:slug/:branchId";
  router.get(P + "/menu", async (req, res) => {
    const { organization, b, s, preview } = await publicContext(req);
    if (preview) res.set("Cache-Control", "no-store");
    else await locked(s, (c) => releaseExpired(c, s));
    const live = (await readRecords(db, organization.id, b.id, "product")).map(
      (r) => r.data,
    );
    const menuBranch = preview && !b.menu_version ? {...b, published_menu: live} : b;
    const products = publishedCounterProducts(menuBranch,live)
      .map(({unitCost, ...product}) => product)
      .filter(
        (p) =>
          b.settings.showSoldOut ||
          (p.available && (p.stockMode === "unlimited" || p.stock > 0)),
      );
    const tables = (await readRecords(db, organization.id, b.id, "table")).map(
      (r) => ({ id: r.id, name: r.data.name }),
    );
    res.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        branding: organization.branding,
      },
      branch: {...branchView(b),settings:{...b.settings,minimumSpendPolicy:publicMinimumSpend(b.settings.minimumSpendPolicy)}},
      minimumSpendPolicy:publicMinimumSpend(b.settings.minimumSpendPolicy),
      version: b.menu_version,
      features:organizationFeatures(organization),
      products,
      preview: !!preview,
      previewMessage: preview ? "Preview, orders are off" : null,
      categories:b.settings.publishedCategories||[],
      tables,
      providers,
      orderingAvailable: !preview && hasCapability(b.settings,"qr_ordering") && b.settings.platformFlags?.flags?.customer_ordering!==false && organizationFeatures(organization).flags.customer_ordering && !b.settings.orderingPaused && !!b.menu_version && availableNow(b.settings.serviceHours,b.timezone) && subscriptionEntitlement(organization.subscription,organization.subscription?.approvedPolicySnapshot||organization.policy,Date.now(),process.env.MERA_DEMO==="true"&&process.env.NODE_ENV!=="production").newOrdersAllowed,
      pricingPolicy:b.settings.pricingPolicy||null,
      reservationPolicy: {
        minimumSpendPolicy:publicMinimumSpend(b.settings.minimumSpendPolicy),
        enabled: !preview && hasCapability(b.settings,"reservations") && b.settings.platformFlags?.flags?.new_reservations!==false && !!b.settings.reservationsEnabled,
        depositRequired: !!b.settings.depositRequired,
        minimumSpend: b.settings.minimumSpend || 0,
        depositPolicy: b.settings.depositPolicy
          ? {
              amount: b.settings.depositPolicy.amount,
              approved: !!b.settings.depositPolicy.approved,
              cancellationCutoffHours:
                b.settings.depositPolicy.cancellationCutoffHours,
              refundRule: b.settings.depositPolicy.refundRule,
            }
          : null,
      },
    });
  });
  router.post(P + "/guests", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const { organization } = await publicContext(req);
    const { displayName } = z
      .object({ displayName: z.string().trim().min(1).max(100) })
      .parse(req.body);
    let existing;
    try {
      existing = await guest(req, organization.id);
    } catch(error) {if(error.code!=="GUEST_REQUIRED")throw error;}
    if (existing) {
      await q("UPDATE mera_guests SET display_name=$1 WHERE id=$2", [
        displayName,
        existing.id,
      ]);
      if(!req.cookies?.[guestCookieName(organization.id)])res.cookie(guestCookieName(organization.id),req.cookies.mera_guest,guestCookieOptions(existing.expires_at));
      return res.json({ displayName, expiresAt: existing.expires_at, sessionRef: existing.id });
    }
    const previousLatest=req.cookies?.mera_guest?(await q("SELECT * FROM mera_guests WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP",[hash(req.cookies.mera_guest)])).rows[0]:null;
    const guestId = randomUUID();
    const token = randomBytes(32).toString("hex"),
      expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
    await q(
      "INSERT INTO mera_guests(id,token_hash,organization_id,display_name,expires_at) VALUES($1,$2,$3,$4,$5)",
      [guestId, hash(token), organization.id, displayName, expiresAt],
    );
    res.cookie("mera_guest",token,guestCookieOptions(expiresAt));
    if(previousLatest&&!req.cookies?.[guestCookieName(previousLatest.organization_id)])res.cookie(guestCookieName(previousLatest.organization_id),req.cookies.mera_guest,guestCookieOptions(previousLatest.expires_at));
    res.cookie(guestCookieName(organization.id),token,guestCookieOptions(expiresAt));
    res.status(201).json({ displayName, expiresAt, sessionRef: guestId });
  });
  router.post(P + "/orders", async (req, res) => {
    const { organization, s } = await publicContext(req);
    const g = await guest(req, organization.id);
    const input = orderInputSchema.parse(req.body);
    input.displayName = g.display_name;
    res
      .status(201)
      .json(
        publicOrder(
          await locked(s, (c, b) =>
            createOrder(c, b, s, input, null, g.id, "customer_qr"),
          ),
        ),
      );
  });
  router.get("/public/orders/:id", async (req, res) => {
    const {row,g}=await guestRecord(req,"order","Order");
    if (!row || row.data.guestId !== g.id) throw fail("Order not found.", 404);
    const o = row.data;
    res.json(publicOrder(o));
  });
  router.post(P + "/reservations", async (req, res) => {
    const { organization, s } = await publicContext(req);
    const g = await guest(req, organization.id);
    const input = reservationInputSchema.parse(req.body);
    input.displayName = g.display_name;
    res
      .status(201)
      .json(await locked(s, async(c,b)=>{const result=await reservation(c,b,s,input,null,g.id);return {...result,minimumSpendPolicy:publicMinimumSpend(result.minimumSpendPolicy)};}));
  });
  router.post(P + "/visits/join", async (req, res) => {
    const { organization, s } = await publicContext(req);
    const g = await guest(req, organization.id);
    const input = z
      .object({ visitId: uuid.optional(), tableId: uuid.optional(), code: z.string().min(1).max(80),minimumSpendAcknowledged:z.boolean().optional(),minimumSpendPolicyVersion:z.string().max(120).optional() }).strict()
      .refine(v => Boolean(v.visitId) !== Boolean(v.tableId), "Provide exactly one visit or table")
      .parse(req.body);
    res.json(
      await locked(s, async (c) => {
        const v = input.visitId ? await find(c, s, "visit", input.visitId) : (await readRecords(c,s.organizationId,s.branchId,"visit")).map(r=>r.data).find(v=>(v.tableIds||[v.tableId]).includes(input.tableId) && v.status==="open");
        if (!v) throw fail("The visit or joining code is invalid.",403);
        if (
          v.status !== "open" ||
          v.joiningCodeHash !== hash(input.code.trim().toUpperCase())
        )
          throw fail("The visit or joining code is invalid.", 403);
        assertMinimumSpendAcknowledged(v.minimumSpendPolicy,input);
        if(v.minimumSpendPolicy){v.minimumSpendAcknowledgements||=[];if(!v.minimumSpendAcknowledgements.some(a=>a.guestId===g.id&&a.policyVersion===v.minimumSpendPolicy.version))v.minimumSpendAcknowledgements.push({guestId:g.id,actorType:"guest",policyVersion:v.minimumSpendPolicy.version,at:now()});}
        if (!v.guestIds.includes(g.id)) v.guestIds.push(g.id);
        await update(c, s, "visit", v.id, v);
        return {
          id: v.id,
          tableId: v.tableId,
          tableIds:v.tableIds||[v.tableId],
          tableName: v.tableName,
          status: v.status,
        };
      }),
    );
  });
  router.get("/public/visits/:id", async (req, res) => {
    const {row,g}=await guestRecord(req,"visit","Visit");
    if (!row || row.data.status !== "open" || !row.data.guestIds.includes(g.id))
      throw fail("Visit not found.", 404);
    const orders=(await q("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='order' AND data->>'visitId'=$3 ORDER BY created_at,id",[row.organization_id,row.branch_id,row.id])).rows.map(r=>r.data);
    res.json({
      minimumSpend:{policy:publicMinimumSpend(row.data.minimumSpendPolicy),summary:minimumSpendSummary(row.data,orders)},
      visit: {
        id: row.id,
        tableId: row.data.tableId,
        tableIds:row.data.tableIds||[row.data.tableId],
        tableName: row.data.tableName,
        status: row.data.status,
      },
      orders: orders.map((o) => ({
        id: o.id,
        reference: o.reference,
        displayName: o.displayName,
        status: o.status,
        total: o.total,
        paid: o.paid,
        effectivePaid:paidForBill(o),
        writtenOff:o.writtenOff||0,
        balance:orderBalance(o),
        items: o.items,
      })),
      bills: (await q("SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='bill' AND data->>'visitId'=$3 AND data->>'status'='open' ORDER BY created_at,id",[row.organization_id,row.branch_id,row.id])).rows.map(r=>r.data)
        .map((b) => {
          const a = billAmounts(b);
          return {
            id: a.id,
            name: a.name,
            total: a.total,
            paid: a.paid,
            balance: a.balance,
            charges: a.charges.map((l) => ({
              id: l.id,
              name: l.name,
              quantity: l.quantity,
              amount: l.amount,
            })),
          };
        }),
      balance: orders
        .filter((o) => !["cancelled", "rejected"].includes(o.status))
        .reduce((n, o) => n + orderBalance(o), 0),
    });
  });
  router.post("/public/orders/:id/feedback", async (req, res) => {
    const {row,g}=await guestRecord(req,"order","Order");
    const input = z
      .object({
        rating: z.number().int().min(1).max(5),
        text: z.string().trim().max(2000),
        category: z
          .enum(["feedback", "service", "food", "payment", "other"])
          .default("feedback"),
      })
      .parse(req.body);
    if (
      !row ||
      row.data.guestId !== g.id ||
      !["collected", "completed"].includes(row.data.status)
    )
      throw fail("Feedback is available only for your completed orders.", 403);
    const s = { organizationId: row.organization_id, branchId: row.branch_id };
    res.status(201).json(
      await locked(s, async (c) => {
        const existing = (
          await readRecords(c, s.organizationId, s.branchId, "complaint")
        ).find((r) => r.data.orderId === row.id && r.data.guestId === g.id);
        if (existing)
          throw fail(
            "Feedback has already been submitted for this order.",
            409,
          );
        return record(c, s, "complaint", {
          ...input,
          orderId: row.id,
          guestId: g.id,
          status: "open",
          published: false,
          createdAt: now(),
        });
      }),
    );
  });
  router.get("/integrations/zidi", async (req, res) => {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.MERA_DEMO !== "true"
    )
      throw fail(
        "The verified Zidi integration is not configured.",
        503,
        "PROVIDER_BLOCKED",
      );
    if (!req.user) throw fail("Sign in to the development simulator.", 401);
    res.json({
      mode: "simulator",
      contractVersion: CONTRACT_VERSION,
      requiresScopedCredentials: true,
      capabilities: [
        "published_menu",
        "create_order",
        "order_status",
        "reservation",
      ],
      paymentConfirmation: false,
      provider: providers.zidi,
    });
  });
  router.patch(
    B + "/settings",
    guard("organization.manage"),
    async (req, res) => {
      const input = branchSettingsInputSchema.parse(req.body);
      res.json(
        await locked(scope(req), async (c, b) => {
          const {timezone,cutoff,requestKey,version,...settingsInput}=input;
          const attempt={requestKey,operation:"branch_settings",targetId:b.id,intent:input};
          const prior=await beginAccessOperation(c,req,attempt); if(prior)return prior;
          if(version!==undefined && version!==(b.settings.version||1))throw fail("Location settings changed. Refresh before editing.",409,"STALE_VERSION");
          if(Object.keys(locationFields).some(key=>input[key]!==undefined) && (!requestKey || version===undefined))throw fail("Location changes require a request key and version.",400);
          if(input.code) { const duplicate=(await c.query("SELECT id FROM mera_branches WHERE organization_id=$1 AND settings->>'code'=$2 AND id<>$3",[b.organization_id,input.code,b.id])).rows[0]; if(duplicate)throw fail("Location code is already in use.",409); }
          const settings = { ...b.settings, ...locationSettings(settingsInput),version:(b.settings.version||1)+1 };
          await recordAccessOperation(c,req,attempt,settings);
          if(timezone!==undefined || cutoff!==undefined) await c.query("UPDATE mera_branches SET timezone=$1,cutoff=$2 WHERE id=$3 AND organization_id=$4",[timezone??b.timezone,cutoff??b.cutoff,b.id,b.organization_id]);
          await c.query(
            "UPDATE mera_branches SET settings=$1 WHERE id=$2 AND organization_id=$3",
            [JSON.stringify(settings), b.id, b.organization_id],
          );
          await event(c, scope(req), "branch_settings_updated", req.user, {
            settings,
          });
          return settings;
        }),
      );
    },
  );
  router.patch(
    "/organizations/:organizationId/branding",
    guard("organization.manage"),
    async (req, res) => {
      const branding = z
        .object({
          primary: z.string().regex(/^#[a-fA-F0-9]{6}$/),
          accent: z.string().regex(/^#[a-fA-F0-9]{6}$/),
          description: z.string().max(500),
          font: z.enum(["system", "serif", "sans"]).default("system"),
          logo:z.string().max(200).optional(),
          coverImage:z.string().max(200).optional(),
        })
        .strict()
        .parse(req.body);
      const oldBranding=(await q("SELECT branding FROM mera_organizations WHERE id=$1",[req.params.organizationId])).rows[0].branding;
      for(const field of ["logo","coverImage"]) if(branding[field]!==undefined && branding[field]!==oldBranding[field]) await assertMeraAsset(db,req.params.organizationId,null,branding[field]);
      await q("UPDATE mera_organizations SET branding=$1 WHERE id=$2", [
        JSON.stringify({...oldBranding,...branding}),
        req.params.organizationId,
      ]);
      res.json(branding);
    },
  );
  router.patch(
    "/organizations/:organizationId/policy",
    guard("billing.manage"),
    async (req, res) => {
      const input = z
        .object({
          monthlyPrice: z.number().int().safe().min(0).max(100000000000).nullable(),
          includedBranches: z.number().int().min(1).max(100),
          additionalBranchPrice: z.number().int().safe().min(0).max(100000000000).nullable(),
          integratedFeeBps: z.number().int().min(0).max(10000),
          feePayer: z.enum(["merchant", "customer"]).nullable(),
          feeBasis: z.enum(["collection", "sales"]).nullable(),
          refundTreatment: z.enum(["return_fee", "retain_fee"]).nullable(),
          trialDays: z.number().int().min(0).max(3650).nullable(),
          graceDays: z.number().int().min(0).max(365).nullable(),
        })
        .strict()
        .parse(req.body);
      const policy = {
        ...input,
        currency: "NGN",
        version: randomUUID(),
        effectiveAt: now(),
        status: "proposed",
        liveBillingEnabled: false,
      };
      await q("UPDATE mera_organizations SET policy=$1 WHERE id=$2", [
        JSON.stringify(policy),
        req.params.organizationId,
      ]);
      res.json(policy);
    },
  );
  router.get(P + "/guest", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const { organization, s } = await publicContext(req);
    if (!req.cookies?.[guestCookieName(organization.id)] && !req.cookies?.mera_guest)
      return res.json({ guest: null });
    const g = await guest(req, organization.id);
    const orders = (
      await q(
        "SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='order' ORDER BY created_at DESC",
        [organization.id, s.branchId],
      )
    ).rows
      .map((r) => r.data)
      .filter((o) => o.guestId === g.id)
      .map((o) => ({
        id: o.id,
        reference: o.reference,
        status: o.status,
        paymentStatus: o.paymentStatus,
        total: o.total,
        createdAt: o.createdAt,
      }));
    const reservations = (
      await readRecords(db, organization.id, s.branchId, "reservation")
    )
      .map((r) => r.data)
      .filter((r) => r.guestId === g.id)
      .map((r) => ({
        id: r.id,
        status: r.status,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        partySize: r.partySize,
        depositAmount: r.depositAmount || 0,
        depositGrossCollected:r.depositGrossCollected??r.depositAmount??0,
        depositReturned:r.depositReturned||0,
        depositForfeited:r.depositForfeited||0,
        depositDisposition:r.depositDisposition||null,
        depositRequired: r.depositRequired || 0,
        minimumSpendPolicy:publicMinimumSpend(r.minimumSpendPolicy),
        visitId: r.visitId || null,
      }));
    const openVisits = (
      await readRecords(db, organization.id, s.branchId, "visit")
    )
      .map((r) => r.data)
      .filter((v) => v.status === "open" && v.guestIds.includes(g.id))
      .map((v) => ({ id: v.id, tableId: v.tableId,tableIds:v.tableIds||[v.tableId], tableName: v.tableName }));
    res.json({ displayName: g.display_name, sessionRef: g.id, orders, reservations, openVisits });
  });
  router.post(
    B + "/bills/:id/split",
    guard("payments.record"),
    async (req, res) => {
      assertExpectedBillActor(req);
      const input = z
        .object({
          requestKey:uuid.optional(),
          name: z.string().trim().min(1).max(80),
          amount: z.number().int().positive().optional(),
          items: z
            .array(
              z.object({
                chargeId: uuid,
                quantity: z.number().int().positive(),
              }),
            )
            .min(1)
            .optional(),
        })
        .refine((v) => !!v.amount !== !!v.items, "Choose amount or items")
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const s=scope(req),attempt={requestKey:input.requestKey,actorId:req.user.id,billId:req.params.id,operation:"split",intent:{name:input.name,amount:input.amount??null,items:input.items??null}};
          const prior=await beginBillChange(c,s,attempt);if(prior)return prior;
          const source = billAmounts(
            await find(c, scope(req), "bill", req.params.id),
          );
          if (source.status !== "open")
            throw fail("Only open bills can be split.", 409);
          if(source.visitId && (await find(c,s,"visit",source.visitId)).status!=="open")throw fail("Only bills from an open visit can be changed.",409,"VISIT_CLOSED");
          const outstandingByOrder = new Map();
          for (const line of source.charges)
            outstandingByOrder.set(
              line.orderId,
              (outstandingByOrder.get(line.orderId) || 0) + line.amount,
            );
          for (const a of source.allocations)
            if (a.orderId)
              outstandingByOrder.set(
                a.orderId,
                (outstandingByOrder.get(a.orderId) || 0) - a.amount,
              );
          const charges = [];
          if (input.items) {
            if (
              new Set(input.items.map((i) => i.chargeId)).size !==
              input.items.length
            )
              throw fail("Duplicate charge selection.");
            for (const selection of input.items) {
              const charge = source.charges.find(
                (l) => l.id === selection.chargeId,
              );
              if (
                !charge ||
                charge.quantity === null ||
                selection.quantity > charge.quantity
              )
                throw fail("Select whole available item units.");
              const amount = selection.quantity * charge.unitPrice;
              charges.push({
                ...charge,
                id: randomUUID(),
                originChargeId: charge.originChargeId || charge.id,
                quantity: selection.quantity,
                amount,
              });
              charge.quantity -= selection.quantity;
              charge.amount -= amount;
            }
          } else {
            let left = input.amount;
            for (const charge of source.charges) {
              if (left <= 0) break;
              const alreadyMoving = charges
                .filter((l) => l.orderId === charge.orderId)
                .reduce((n, l) => n + l.amount, 0);
              const orderDue = Math.max(
                0,
                (outstandingByOrder.get(charge.orderId) || 0) - alreadyMoving,
              );
              const move = Math.min(left, Math.max(0, charge.amount), orderDue);
              if (move) {
                charges.push({
                  ...charge,
                  id: randomUUID(),
                  originChargeId: charge.originChargeId || charge.id,
                  quantity: null,
                  amount: move,
                });
                charge.amount -= move;
                charge.quantity = null;
                left -= move;
              }
            }
            if (left)
              throw fail(
                "Split amount exceeds the outstanding bill amount.",
                409,
              );
          }
          for (const orderId of new Set(charges.map((l) => l.orderId))) {
            if (
              charges
                .filter((l) => l.orderId === orderId)
                .reduce((n, l) => n + l.amount, 0) >
              (outstandingByOrder.get(orderId) || 0)
            )
              throw fail(
                "Paid item allocations must stay with the original bill.",
                409,
                "ALLOCATION_CONFLICT",
              );
          }
          const moved = charges.reduce((n, l) => n + l.amount, 0);
          if (moved > source.balance)
            throw fail(
              "Only the outstanding balance may be split. Existing payments stay on the source bill.",
              409,
            );
          source.charges = source.charges.filter((l) => l.amount !== 0);
          await update(c, scope(req), "bill", source.id, billAmounts(source));
          const bill = await record(
            c,
            scope(req),
            "bill",
            billAmounts({
              name: input.name,
              visitId: source.visitId,
              status: "open",
              charges,
              allocations: [],
              createdAt: now(),
            }),
          );
          await event(c, scope(req), "bill_split", req.user, {
            sourceId: source.id,
            billId: bill.id,
            amount: moved,
          });
          const result={source:billAmounts(source),bill};
          await recordBillChange(c,s,record,attempt,result);
          return result;
        }),
      );
    },
  );
  router.post(
    B + "/bills/:id/merge",
    guard("payments.record"),
    async (req, res) => {
      assertExpectedBillActor(req);
      const { sourceBillIds,requestKey } = z
        .object({ requestKey:uuid.optional(),sourceBillIds: z.array(uuid).min(1).max(30) })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const s=scope(req),attempt={requestKey,actorId:req.user.id,billId:req.params.id,operation:"merge",intent:{sourceBillIds}};
          const prior=await beginBillChange(c,s,attempt);if(prior)return prior;
          const target = await find(c, scope(req), "bill", req.params.id);
          if (target.status !== "open")
            throw fail("Target bill is not open.", 409);
          if(!target.visitId || (await find(c,s,"visit",target.visitId)).status!=="open")throw fail("Only bills from the same open visit can be merged.",409,"VISIT_CLOSED");
          if (
            sourceBillIds.includes(target.id) ||
            new Set(sourceBillIds).size !== sourceBillIds.length
          )
            throw fail("Select distinct source bills.");
          for (const id of sourceBillIds) {
            const source = await find(c, scope(req), "bill", id);
            if (
              source.status !== "open" ||
              !source.visitId ||
              source.visitId !== target.visitId
            )
              throw fail(
                "Only open bills from the same current visit can be merged.",
                409,
              );
            target.charges.push(...source.charges);
            target.allocations.push(...source.allocations);
            source.status = "merged";
            source.mergedInto = target.id;
            source.charges = [];
            source.allocations = [];
            await update(c, scope(req), "bill", source.id, billAmounts(source));
          }
          await update(c, scope(req), "bill", target.id, billAmounts(target));
          await event(c, scope(req), "bills_merged", req.user, {
            targetId: target.id,
            sourceBillIds,
          });
          const result=billAmounts(target);
          await recordBillChange(c,s,record,attempt,result);
          return result;
        }),
      );
    },
  );
  router.post(
    B + "/bills/:id/payments",
    guard("payments.record"),
    async (req, res) => {
      const input = paymentInputSchema.parse(req.body);
      if(input.method==="room_charge") await membership(req,req.params.organizationId,req.params.branchId,"room_charge.post");
      if (input.method === "external_transfer" && !input.reference)
        throw fail("A verified transfer reference is required.");
      res.json(
        await locked(scope(req), async (c) => {
          await releaseExpired(c, scope(req));
          const existing = await requestRecord(c,scope(req),"payment",input.requestKey);
          if (existing) {
            if ((existing.data.intentHash !== intentHash(input) || existing.data.recordedBy !== req.user.id))
              throw fail(
                "This request key was used for different payment details.",
                409,
                "IDEMPOTENCY_CONFLICT",
              );
            if (
              existing.data.billId !== req.params.id ||
              existing.data.amount !== input.amount ||
              existing.data.method !== input.method
            )
              throw fail("Payment key conflict.", 409);
            return {
              payment: existing.data,
              bill: billAmounts(
                await find(c, scope(req), "bill", req.params.id),
              ),
            };
          }
          const bill = billAmounts(
            await find(c, scope(req), "bill", req.params.id),
          );
          if (bill.status !== "open" || input.amount > bill.balance)
            throw fail("Payment exceeds this open bill balance.", 409);
          await assertFinancialRequestActive(c,scope(req),input.requestKey,"payment",req.user.id);
          await assertManualMethod(c,scope(req),input.method);
          const payment = await record(c, scope(req), "payment", {
            ...input,
            intentHash: intentHash(input),
            billId: bill.id,
            source: "staff_verified",
            recordedBy: req.user.id,
            fee: 0,
            createdAt: now(),
          });
          let left = input.amount;
          const collectionPostings = [
            {
              account: "collections_" + input.method,
              debit: input.amount,
              credit: 0,
            },
          ];
          for (const orderId of new Set(
            bill.charges.filter((l) => l.orderId).map((l) => l.orderId),
          )) {
            const order = assertHistoricalWritable(await find(c, scope(req), "order", orderId));
            const due =
              bill.charges
                .filter((l) => l.orderId === orderId)
                .reduce((n, l) => n + l.amount, 0) -
              bill.allocations
                .filter((a) => a.orderId === orderId)
                .reduce((n, a) => n + a.amount, 0);
            const allocated = Math.min(left, Math.max(0, due));
            if (!allocated) continue;
            if (
              order.holdExpired ||
              ["cancelled", "rejected"].includes(order.status) ||
              allocated > orderBalance(order)
            )
              throw fail("Order allocation is no longer valid.", 409);
            bill.allocations.push({
              paymentId: payment.id,
              orderId,
              amount: allocated,
            });
            collectionPostings.push({
              account: order.collectedAt
                ? "merchant_receivable"
                : "customer_collections_liability",
              debit: 0,
              credit: allocated,
            });
            order.paid += allocated;
            order.paymentStatus = paymentStatus(order);
            if (paidForBill(order) === order.total) order.stockHeld = false;
            order.version++;
            order.history.push({
              action: "payment_recorded",
              actorId: req.user.id,
              actorName: req.user.name,
              amount: allocated,
              at: now(),
            });
            await update(c, scope(req), "order", order.id, order);
            await enqueuePaidDocuments(c,scope(req),order,req.user,{kind:"bill_payment",id:payment.id});
            left -= allocated;
            if (!left) break;
          }
          if (left) throw fail("Payment could not be fully allocated.", 409);
          await record(c, scope(req), "ledger", {
            paymentId: payment.id,
            postings: collectionPostings,
            createdAt: now(),
          });
          await update(c, scope(req), "bill", bill.id, billAmounts(bill));
          await event(c, scope(req), "bill_payment_recorded", req.user, {
            billId: bill.id,
            amount: input.amount,
          });
          return { payment, bill: billAmounts(bill) };
        }),
      );
    },
  );
  router.patch(B + "/tables/:id", guard("tables.manage"), async (req, res) => {
    const input = z
      .object({
        name: z.string().min(1).max(80).optional(),
        capacity: z.number().int().min(1).max(100).optional(),
        zone: z.string().max(80).optional(),
        x: z.number().min(0).max(100).optional(),
        y: z.number().min(0).max(100).optional(),
      })
      .strict()
      .parse(req.body);
    res.json(
      await locked(scope(req), async (c) => {
        const table = await find(c, scope(req), "table", req.params.id);
        const updated = { ...table, ...input };
        await event(c, scope(req), "table_updated", req.user, {
          tableId: table.id,
        });
        return update(c, scope(req), "table", table.id, updated);
      }),
    );
  });
  router.put(
    B + "/deposit-policy",
    guard("organization.manage"),
    async (req, res) => {
      const input = z
        .object({
          enabled: z.boolean(),
          amount: z.number().int().min(0),
          cancellationCutoffHours: z.number().int().min(0).max(720),
          refundRule: z.enum(["refundable_before_cutoff", "non_refundable"]),
          approved: z.literal(true),
        })
        .strict()
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c, b) => {
          if(input.enabled)assertCapability(b,"deposits");
          const settings = {
            ...b.settings,
            depositPolicy: input,
            depositRequired: input.enabled,
          };
          await c.query(
            "UPDATE mera_branches SET settings=$1 WHERE id=$2 AND organization_id=$3",
            [JSON.stringify(settings), b.id, b.organization_id],
          );
          await event(c, scope(req), "deposit_policy_configured", req.user, {
            policy: input,
          });
          return input;
        }),
      );
    },
  );
  router.post(
    B + "/reservations/:id/deposits",
    guard("payments.record"),
    async (req, res) => {
      const input = paymentInputSchema.parse(req.body);
      if(input.method==="room_charge") await membership(req,req.params.organizationId,req.params.branchId,"room_charge.post");
      res.json(
        await locked(scope(req), async (c, b) => {
          const reservation = await find(
            c,
            scope(req),
            "reservation",
            req.params.id,
          );
          const existing = await requestRecord(c,scope(req),"deposit",input.requestKey);
          if (existing) {
            if ((existing.data.intentHash !== intentHash(input) || existing.data.recordedBy !== req.user.id))
              throw fail(
                "This request key was used for different payment details.",
                409,
                "IDEMPOTENCY_CONFLICT",
              );
            if (
              existing.data.reservationId !== reservation.id ||
              existing.data.amount !== input.amount
            )
              throw fail("Deposit key conflict.", 409);
            return existing.data;
          }
          const policy = reservation.depositPolicy||b.settings.depositPolicy;
          if (!policy?.approved || !policy.enabled)
            throw fail(
              "An approved deposit policy is required.",
              409,
              "POLICY_BLOCKED",
            );
          if (input.method === "external_transfer" && !input.reference)
            throw fail("A verified transfer reference is required.");
          if (
            !["requested", "confirmed", "arrived"].includes(
              reservation.status,
            ) ||
            reservation.visitId
          )
            throw fail("Reservation cannot accept a deposit.", 409);
          const deposits = (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "deposit",
            )
          )
            .map((r) => r.data)
            .filter((d) => d.reservationId === reservation.id);
          if (
            input.amount >
            (reservation.depositRequired??policy.amount) - deposits.reduce((n, d) => n + d.amount-(d.refunded||0)-(d.forfeited||0), 0)
          )
            throw fail("Deposit exceeds the required deposit balance.", 409);
          await assertFinancialRequestActive(c,scope(req),input.requestKey,"deposit",req.user.id);
          await assertManualMethod(c,scope(req),input.method);
          const deposit = await record(c, scope(req), "deposit", {
            ...input,
            intentHash: intentHash(input),
            reservationId: reservation.id,
            recordedBy: req.user.id,
            allocated: false,
            refunded:0,forfeited:0,version:1,
            policySnapshot: policy,
            createdAt: now(),
          });
          await record(c, scope(req), "ledger", {
            depositId: deposit.id,
            postings: [
              {
                account: "collections_" + input.method,
                debit: input.amount,
                credit: 0,
              },
              {
                account: "reservation_liability",
                debit: 0,
                credit: input.amount,
              },
            ],
            createdAt: now(),
          });
          reservation.depositGrossCollected=(reservation.depositGrossCollected??reservation.depositAmount??0)+input.amount;
          reservation.depositAmount =
            (reservation.depositAmount || 0) + input.amount;
          await update(
            c,
            scope(req),
            "reservation",
            reservation.id,
            reservation,
          );
          await event(c, scope(req), "deposit_recorded", req.user, {
            reservationId: reservation.id,
            amount: input.amount,
          });
          return deposit;
        }),
      );
    },
  );
  router.post(
    B + "/reservations/:id/seat",
    guard("reservations.manage"),
    async (req, res) => {
      const input = z
        .object({ tableId: uuid, displayName: z.string().min(1).max(100) })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const reservation = await find(
            c,
            scope(req),
            "reservation",
            req.params.id,
          );
          if (reservation.visitId) {
            const visit = await find(
              c,
              scope(req),
              "visit",
              reservation.visitId,
            );
            return {
              visit: { ...visit, joiningCodeHash: undefined },
              bill: billAmounts(
                await find(c, scope(req), "bill", visit.billId),
              ),
            };
          }
          if (!["confirmed", "arrived"].includes(reservation.status))
            throw fail("Confirm the reservation before seating.", 409);
          const table = await find(c, scope(req), "table", input.tableId);
          if (
            table.status !== "available" ||
            table.capacity < reservation.partySize
          )
            throw fail("This table is unavailable or too small.", 409);
          const code = randomBytes(4).toString("hex").toUpperCase();
          const visit = await record(c, scope(req), "visit", {
            reservationId: reservation.id,
            minimumSpendPolicy:reservation.minimumSpendPolicy||null,
            minimumSpendAcknowledgements:reservation.minimumSpendAcknowledgement?[reservation.minimumSpendAcknowledgement]:[],
            tableId: table.id,
            tableName: table.name,
            displayName: input.displayName,
            status: "open",
            guestIds: reservation.guestId ? [reservation.guestId] : [],
            joiningCodeHash: hash(code),
            openedBy: req.user.id,
            createdAt: now(),
          });
          const bill = await record(c, scope(req), "bill", {
            visitId: visit.id,
            name: table.name + " bill",
            status: "open",
            charges: [],
            allocations: [],
            createdAt: now(),
          });
          const deposits = (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "deposit",
            )
          )
            .map((r) => r.data)
            .filter((d) => d.reservationId === reservation.id && !d.allocated);
          for (const d of deposits) {
            const remaining=Math.max(0,d.amount-(d.refunded||0)-(d.forfeited||0));
            if(!remaining)continue;
            bill.allocations.push({
              paymentId: d.id,
              orderId: null,
              amount: remaining,
              source: "reservation_deposit",
            });
            d.allocated = true;
            d.allocatedAmount=remaining;d.version=(d.version||1)+1;
            d.billId = bill.id;
            await update(c, scope(req), "deposit", d.id, d);
          }
          await update(c, scope(req), "bill", bill.id, billAmounts(bill));
          visit.billId = bill.id;
          await update(c, scope(req), "visit", visit.id, visit);
          table.status = "occupied";
          await update(c, scope(req), "table", table.id, table);
          reservation.status = "seated";
          reservation.visitId = visit.id;
          await update(
            c,
            scope(req),
            "reservation",
            reservation.id,
            reservation,
          );
          await event(c, scope(req), "reservation_seated", req.user, {
            reservationId: reservation.id,
            visitId: visit.id,
            depositAmount: deposits.reduce((n, d) => n + d.amount-(d.refunded||0)-(d.forfeited||0), 0),
          });
          return {
            visit: { ...visit, joiningCodeHash: undefined, joiningCode: code },
            bill: billAmounts(bill),
          };
        }),
      );
    },
  );
  router.get(B + "/templates", guard("menu.edit"), async (req, res) => {
    const rows = await readRecords(
      db,
      req.params.organizationId,
      req.params.branchId,
      "template",
    );
    if(rows[0]) return res.json(rows[0].data);
    const organization=(await db.query("SELECT name FROM mera_organizations WHERE id=$1",[req.params.organizationId])).rows[0];
    if(!organization?.name) throw fail("Organization template defaults are unavailable.",404,"NOT_FOUND");
    res.json(
      {
        receipt: {
          businessName: organization.name,
          footer: "Thank you. See you again soon.",
          showStaff: true,
          paperWidth: 58,
        },
        label: { width: 50, height: 40 },
      },
    );
  });
  router.put(B + "/templates", guard("menu.edit"), async (req, res) => {
    assertExpectedPrintActor(req);
    const parsed = z
      .object({
        requestKey:uuid.optional(),
        receipt: z.object({
          businessName: z.string().min(1).max(100),
          footer: z.string().max(300),
          showStaff: z.boolean(),
          paperWidth: z.union([z.literal(58), z.literal(80)]),
        }),
        label: z.object({
          width: z.number().min(20).max(60),
          height: z.number().min(15).max(150),
        }),
      })
      .parse(req.body);
    const input={receipt:parsed.receipt,label:parsed.label};
    res.json(
      await locked(scope(req), async (c) => {
        const s=scope(req),attempt={requestKey:parsed.requestKey,actorId:req.user.id,operation:"template_save",targetId:null,intent:input};
        const prior=await beginPrintStudioOperation(c,s,attempt);if(prior)return prior;
        const old = (
          await readRecords(
            c,
            req.params.organizationId,
            req.params.branchId,
            "template",
          )
        )[0];
        const value = old
          ? await update(c, scope(req), "template", old.id, {
              ...input,
              version:(old.data.version||1)+1,
              id: old.id,
            })
          : await record(c, scope(req), "template", {...input,version:1});
        await event(c, scope(req), "print_template_updated", req.user, {});
        await recordPrintStudioOperation(c,s,record,attempt,value);
        return value;
      }),
    );
  });
  router.get(B + "/print-jobs", guard("orders.view"), async (req, res) =>
    res.json(
      (
        await readRecords(
          db,
          req.params.organizationId,
          req.params.branchId,
          "print_job",
        )
      ).map((r) => r.data),
    ),
  );
  router.post(
    B + "/print-jobs/:id/reprint",
    guard("orders.fulfill"),
    async (req, res) => {
      assertExpectedPrintActor(req);
      const { reason,requestKey } = z
        .object({ requestKey:uuid.optional(),reason: z.string().trim().min(3).max(300) })
        .parse(req.body);
      res.status(201).json(
        await locked(scope(req), async (c) => {
          const job = await find(c, scope(req), "print_job", req.params.id);
          const s=scope(req),attempt={requestKey,actorId:req.user.id,operation:"reprint",targetId:job.id,intent:{reason}};
          const prior=await beginPrintStudioOperation(c,s,attempt);if(prior)return prior;
          const duplicate=await record(c,s,"print_job",cleanReprintJob(job,{reason,actorId:req.user.id,createdAt:now()}));
          await event(c, scope(req), "reprint_requested", req.user, {
            jobId: duplicate.id,
            reason,
          });
          await recordPrintStudioOperation(c,s,record,attempt,duplicate);
          return duplicate;
        }),
      );
    },
  );

  mountMeraRefundRequests(router,{db,guard,scope,locked,readRecords,find,record,update,event});
  mountMeraWorkspaceAdmin(router,{db,guard,scope,event});
  mountMeraOperating(router,{db,guard,event});
  mountMeraOverview(router,{db,guard});
  mountMeraGuestList(router,{db,guard,scope,locked,record,readRecords,find,update,event});
  mountMeraStockHistory(router,{db,guard,scope,locked,find,record,update,event});
  mountMeraStockTransfers(router,{db,membership,record,update,event});
  mountMeraReservationAttempts(router,{publicContext,guest,locked,record,event,guard,scope});
  mountMeraShiftAttempts(router,{guard,scope,locked,record,event});
  mountMeraBillAttempts(router,{guard,scope,locked,find,record,event});
  mountMeraPrintStudioAttempts(router,{guard,scope,locked,find,record,event});
  mountMeraAccessAttempts(router,{db,guard});
  mountMeraOrderAttempts(router,{guard,scope,locked,record,event,publicContext,guest,publicOrder});
  mountMeraPrinting(router,{db,guard,scope,locked,find,record,update,event});
  mountMeraQueries(router,{db,guard,scope});
  mountMeraDepositOutcomes(router,{db,guard,scope,locked,record,readRecords,find,update,event});
  mountMeraVisitAccess(router,{guard,scope,locked,find,update,event});
  mountMeraMinimumSpend(router,{db,guard,scope,locked,record,readRecords,find,update,event,publicContext,guest});
  mountMeraWriteoffs(router,{guard,scope,locked,find,readRecords,record,update,event,orderBalance});
  mountMeraCategories(router,{db,guard,scope,locked,record,readRecords,find,update,event});
  mountMeraHelp(router,{db,guard,scope,locked,record,readRecords,find,update,event,publicContext,guest});
  mountMeraFulfillment(router,{guard,scope,locked,record,readRecords,find,update,event,paidForBill});
  mountMeraFinancialRequests(router,{db,guard,scope,locked,record,event});
  mountMeraAssets(router,{db,guard,scope,event});
  mountMeraPricing(router,{guard,scope,locked,record,readRecords,event,publicContext,guest});
  mountMeraShifts(router,{db,guard,scope,locked,find,update,event});
  mountMeraTableService(router,{db,guard,scope,locked,record,readRecords,find,update,event});
  mountMeraCancellation(router,{guard,scope,locked,find,readRecords,record,event});
  mountMeraReadiness(router,{db,guard,scope,locked,readRecords,event});
  mountMeraReservationPolicy(router,{guard,scope,locked,event});
  mountMeraMenus(router,{db,guard,scope,locked,record,readRecords,event});
  mountMeraReconciliation(router,{db,guard,scope,locked,record,readRecords,find,event});
  mountMeraIdentity(router,{db});
  mountMeraRoles(router, {db,guard});
  mountMeraTickets(router, {guard,scope,locked,find,readRecords,event});
  const platformAccess=mountMeraPlatform(router, { db, providers, proposedPolicy });
  mountCompanyLeads(router,{db,platformGuard:platformAccess.guard,platformAudit:platformAccess.audit});
  mountMeraOrganizationAliases(router,{db,platformGuard:platformAccess.guard,platformAudit:platformAccess.audit});
  mountMeraFeatureFlags(router,{db,platformGuard:platformAccess.guard,platformAudit:platformAccess.audit});
  mountMeraPlatformSupport(router,{db,guard,platformGuard:platformAccess.guard,platformAudit:platformAccess.audit});
  mountMeraOperations(router, {
    db,
    guard,
    scope,
    locked,
    record,
    readRecords,
    event,
    find,
  });
  mountMeraZidi(router, {
    db,
    guard,
    scope,
    locked,
    record,
    readRecords,
    find,
    event,
    quoteOrder:(s,body,actor)=>createPricingQuote({locked,record,readRecords},s,body,actor,null),
    createOrder,
    reservation,
  });
  mountMeraCustomerFollowup(router,{db,publicContext,guest,locked,readRecords,find,update,event,publicOrder});
  mountMeraQrPreview(router,{db,guard,scope,find,tokens:previewTokens});
  mountMeraQr(router, {
    publicContext,
    guest,
    db,
    guard,
    scope,
    locked,
    record,
    readRecords,
    event,
    find,
  });
  router.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: "Please check the submitted fields.",
        code: "VALIDATION_ERROR",
        issues: err.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    if (err.code === "23505")
      return res.status(409).json({
        error: "That identifier or subdomain is already in use.",
        code: "CONFLICT",
      });
    if (err.status)
      return res
        .status(err.status)
        .json({ error: err.message, code: err.code || "INVALID_REQUEST" });
    console.error("Mera request failed", err.code || err.name);
    res.status(500).json({
      error: "The request could not be completed.",
      code: "SERVER_ERROR",
    });
  });
  return router;
}
