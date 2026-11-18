import express from "express";
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
  availableNow,
  providers,
  quote,
  transition,
  paymentStatus,
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
    normalized.items = normalized.items.map((line) => ({
      ...line,
      modifiers: [...(line.modifiers || [])].sort(),
    }));
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
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(50)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
  .refine(
    (s) =>
      ![
        "www",
        "app",
        "admin",
        "api",
        "support",
        "billing",
        "mera",
        "platform",
      ].includes(s),
    "That subdomain is reserved.",
  );
const uuid = z.string().uuid();
export async function migrateMera(db) {
  await db.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  await migrateMeraPlatform(db);
  await migrateMeraIdentity(db);
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
export function createMeraRouter(db) {
  const router = express.Router();
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
  const record = async (c, scope, kind, data, id = randomUUID()) => {
    const row = { ...data, id };
    await c.query(
      "INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,$4,$5)",
      [id, scope.organizationId, scope.branchId, kind, JSON.stringify(row)],
    );
    return row;
  };
  const update = async (c, scope, kind, id, data) => {
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
    const m = (
      await q(
        "SELECT * FROM mera_memberships WHERE user_id=$1 AND organization_id=$2 AND active=true",
        [req.user.id, org],
      )
    ).rows[0];
    if (
      !m ||
      (!m.organization_wide && (!branch || !m.branch_ids.includes(branch))) ||
      !(Array.isArray(permission)
        ? permission.some((p) => m.permissions.includes(p))
        : m.permissions.includes(permission))
    )
      throw fail(
        "You do not have access to this organization or branch.",
        403,
        "FORBIDDEN",
      );
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
        "SELECT m.*,o.name,o.slug,o.branding,o.onboarding,o.subscription FROM mera_memberships m JOIN mera_organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.active=true",
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
      ).rows.filter((b) => m.organization_wide || m.branch_ids.includes(b.id));
      organizations.push({
        id: m.organization_id,
        name: m.name,
        slug: m.slug,
        branding: m.branding,
        onboarding: m.onboarding,
        subscription: m.subscription,
        branches: branches.map(branchView),
        permissions: m.permissions,
        role: m.role,
        branchIds: m.branch_ids,
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
      const input = z
        .object({
          step: z.number().int().min(1).max(14),
          data: z.record(z.unknown()),
        })
        .parse(req.body);
      await q("UPDATE mera_organizations SET onboarding=$1 WHERE id=$2", [
        JSON.stringify({
          step: input.step,
          data: input.data,
          updatedAt: now(),
          verification: "owner_email_verification_pending",
        }),
        req.params.organizationId,
      ]);
      res.json({ saved: true, step: input.step });
    },
  );
  const B = "/organizations/:organizationId/branches/:branchId";
  router.get(
    B + "/workspace",
    guard([
      "orders.view",
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
      const records = await readRecords(db, s.organizationId, s.branchId);
      const by = (kind) =>
        records
          .filter((r) => r.kind === kind)
          .map((r) => r.data)
          .reverse();
      const org = (
        await q(
          "SELECT policy,subscription,onboarding FROM mera_organizations WHERE id=$1",
          [s.organizationId],
        )
      ).rows[0];
      const access = req.meraMembership.permissions;
      res.json({
        branch: branchView(b),
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
        tickets: access.includes("orders.prepare") ? by("ticket") : [],
        menuVersion: b.menu_version,
        orders: access.includes("orders.view") ? by("order") : [],
        tables: access.includes("tables.manage") ? by("table") : [],
        reservations: access.includes("reservations.manage")
          ? by("reservation")
          : [],
        visits: access.includes("tables.manage") ? by("visit") : [],
        shifts: access.includes("shifts.manage") ? by("shift") : [],
        payments: access.includes("payments.record") ? by("payment") : [],
        complaints: access.includes("organization.manage")
          ? by("complaint")
          : [],
        audit: access.includes("organization.manage")
          ? by("audit").slice(0, 100)
          : [],
        report: access.includes("reports.view")
          ? report(
              records,
              b,
              String(
                req.query.date || tradingDate(now(), b.timezone, b.cutoff),
              ),
            )
          : null,
        subscription: org.subscription,
        policy: org.policy,
        providers,
        onboarding: org.onboarding,
        permissions: access,
      });
    },
  );
  router.post(B + "/products", guard("menu.edit"), async (req, res) => {
    const input = productInputSchema.parse(req.body);
    if(!req.meraMembership.permissions.includes("stock.adjust") && (input.stock>0 || input.variants.some(v=>v.stock>0))) throw fail("Opening stock requires stock adjustment permission.",403);
    res.status(201).json(
      await locked(scope(req), async (c) => {
        const p = await record(c, scope(req), "product", input);
        await event(c, scope(req), "product_created", req.user, {
          productId: p.id,
        });
        return p;
      }),
    );
  });
  router.put(B + "/products/:id", guard("menu.edit"), async (req, res) => {
    const input = productInputSchema.parse(req.body);
    res.json(
      await locked(scope(req), async (c) => {
        const old = await find(c, scope(req), "product", req.params.id);
        // Catalog edits cannot overwrite balances concurrently consumed by checkout.
        input.stock=old.stock; input.stockMode=old.stockMode;
        input.variants=input.variants.map(v=>{const previous=old.variants.find(o=>o.id===v.id);return {...v,stock:previous?.stock||0,stockMode:previous?.stockMode||"unlimited"};});
        const removed=old.variants.filter(v=>!input.variants.some(i=>i.id===v.id));
        const activeOrders=(await readRecords(c,scope(req).organizationId,scope(req).branchId,"order")).map(r=>r.data).filter(o=>o.stockHeld);
        if(removed.some(v=>(v.stockMode==="counted" && v.stock>0) || activeOrders.some(o=>o.items.some(l=>l.productId===old.id && l.variantId===v.id)))) throw fail("Retain sizes with remaining stock or active stock holds.",409);
        const p = await update(c, scope(req), "product", old.id, {
          ...input,
          id: old.id,
        });
        await event(c, scope(req), "product_updated", req.user, {
          productId: p.id,
        });
        return p;
      }),
    );
  });
  router.post(B + "/menu/publish", guard("menu.publish"), async (req, res) => {
    res.json(
      await locked(scope(req), async (c, b) => {
        const products = (
          await readRecords(c, b.organization_id, b.id, "product")
        )
          .map((r) => r.data)
          .filter((p) => p.available);
        await c.query(
          "UPDATE mera_branches SET published_menu=$1,menu_version=menu_version+1 WHERE id=$2 AND organization_id=$3",
          [JSON.stringify(products), b.id, b.organization_id],
        );
        await event(c, scope(req), "menu_published", req.user, {
          version: b.menu_version + 1,
        });
        return { version: b.menu_version + 1 };
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
    const allowed=branch.settings.manualPaymentMethods;
    if(Array.isArray(allowed) && !allowed.includes(method)) throw fail("This manual payment method is not enabled by the branch launch policy.",409,"PAYMENT_METHOD_DISABLED");
  }
  async function releaseExpired(c, s) {
    const records = await readRecords(c, s.organizationId, s.branchId, "order");
    for (const r of records) {
      const o = r.data;
      if (o.stockHeld && Date.parse(o.holdExpiresAt) <= Date.now()) {
        for (const line of o.items) {
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
    const bills = (
      await readRecords(c, s.organizationId, s.branchId, "bill")
    ).map((r) => r.data);
    if (bills.some((b) => b.charges.some((l) => l.orderId === order.id)))
      return;
    let bill = order.visitId
      ? bills.find((b) => b.visitId === order.visitId && b.status === "open")
      : null;
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
    if (order.paid > 0)
      bill.allocations.push({
        paymentId: "opening-" + order.id,
        orderId: order.id,
        amount: order.paid,
      });
    let due = order.total - order.paid;
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
    if (order.paid === order.total) order.stockHeld = false;
    await update(c, s, "bill", bill.id, billAmounts(bill));
    order.billId = bill.id;
    await update(c, s, "order", order.id, order);
  }
  async function allocateOrderPayment(c, s, orderId, paymentId, amount) {
    const order = await find(c, s, "order", orderId);
    await attachBill(c, s, order);
    let remaining = amount;
    const bills = (await readRecords(c, s.organizationId, s.branchId, "bill"))
      .map((r) => r.data)
      .filter((b) => b.status === "open");
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
    await releaseExpired(c, s);
    const existing = (
      await readRecords(c, s.organizationId, s.branchId, "order")
    ).find((r) => r.data.requestKey === input.requestKey);
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
    const organization = (
      await c.query(
        "SELECT subscription,policy FROM mera_organizations WHERE id=$1",
        [s.organizationId],
      )
    ).rows[0];
    if (["suspended", "cancelled"].includes(organization.subscription.status))
      throw fail(
        "New ordering is restricted for this organization. Existing orders and account exports remain available.",
        409,
        "SUBSCRIPTION_RESTRICTED",
      );
    const branchCount = Number(
      (
        await c.query(
          "SELECT COUNT(*) AS count FROM mera_branches WHERE organization_id=$1",
          [s.organizationId],
        )
      ).rows[0].count,
    );
    if (
      branchCount > organization.policy.includedBranches &&
      organization.policy.additionalBranchPrice === null &&
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
    const current = (
      await readRecords(c, s.organizationId, s.branchId, "product")
    ).map((r) => r.data);
    const published = b.published_menu.map((p) => {
      const live = current.find((l) => l.id === p.id);
      return {
        ...p,
        available: !!live?.available && availableNow(p.availabilityWindows,b.timezone),
        variants:p.variants.map(v=>({...v,stockMode:live?.variants?.find(l=>l.id===v.id)?.stockMode || "unlimited",stock:live?.variants?.find(l=>l.id===v.id)?.stock || 0})),
        stock: live?.stock || 0,
        stockMode: live?.stockMode || "unlimited",
      };
    });
    if(!availableNow(b.settings.serviceHours,b.timezone)) throw fail("Ordering is closed outside branch service hours.",409,"BRANCH_CLOSED");
    const priced = quote(input.items, published);
    const quantities = new Map();
    for (const l of priced.items)
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
    for(const line of priced.items) if(line.variantId) {const key=line.productId+":"+line.variantId; const old=variantTotals.get(key);variantTotals.set(key,{...line,quantity:(old?.quantity||0)+line.quantity});}
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
      items: priced.items.map((line) => ({...line, orderLineId: randomUUID()})),
      requestKey: input.requestKey,
      intentHash: intentHash(input),
      reference: "M-" + randomBytes(4).toString("hex").toUpperCase(),
      status: "submitted",
      paymentStatus: "unpaid",
      paid: 0,
      refunded: 0,
      version: 1,
      guestId,
      displayName: input.displayName,
      fulfillment: input.fulfillment,
      visitId: input.visitId || null,
      source,
      staffCreatorId: source === "zidi" ? null : actor?.id || null,
      integrationCredentialId: source === "zidi" ? actor?.id || null : null,
      handlerId: null,
      history: [
        { action: "submitted", actorId: actor?.id || guestId, at: stamp },
      ],
      stockHeld: true,
      holdExpired: false,
      holdExpiresAt: new Date(
        Date.now() +
          Math.min(60, Math.max(1, b.settings.holdMinutes || 10)) * 60000,
      ).toISOString(),
      note: input.note,
      menuVersion: b.menu_version,
      policyVersion: (
        await c.query("SELECT policy FROM mera_organizations WHERE id=$1", [
          s.organizationId,
        ])
      ).rows[0].policy.version,
      financialPolicy: (
        await c.query("SELECT policy FROM mera_organizations WHERE id=$1", [
          s.organizationId,
        ])
      ).rows[0].policy,
      createdAt: stamp,
    });
    await attachBill(c, s, order);
    for (const station of new Set(priced.items.map((i) => i.station)))
      await record(c, s, "ticket", {
        orderId: order.id,
        station,
        status: "queued",
        version: 1,
        items: order.items.filter((i) => i.station === station).map(i => ({...i, preparedQuantity: 0})),
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
    await membership(
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
        const o = await find(c, scope(req), "order", req.params.id);
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
        transition(o, input.status, { payLater: b.settings.payLater });
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
            for (const line of o.items) {
              const p = await find(c, scope(req), "product", line.productId);
              if (p.stockMode === "counted") p.stock += line.quantity;
              const variant=p.variants?.find(v=>v.id===line.variantId);
              if(variant?.stockMode==="counted") variant.stock+=line.quantity;
              await update(c,scope(req),"product",p.id,p);
            }
          o.stockHeld = false;
        }
        o.status = input.status;
        if (input.status === "collected" && !o.collectedAt) {
          o.collectedAt = now();
          const postings = [
            { account: "merchant_sales", debit: 0, credit: o.total },
          ];
          if (o.paid - o.refunded > 0)
            postings.push({
              account: "customer_collections_liability",
              debit: o.paid - o.refunded,
              credit: 0,
            });
          if (o.total - o.paid > 0)
            postings.push({
              account: "merchant_receivable",
              debit: o.total - o.paid,
              credit: 0,
            });
          if (o.refunded > 0)
            postings.push({
              account: "sales_returns",
              debit: o.refunded,
              credit: 0,
            });
          await record(c, scope(req), "ledger", {
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
              "SELECT * FROM mera_memberships WHERE user_id=$1 AND organization_id=$2 AND active=true",
              [input.userId, req.params.organizationId],
            )
          ).rows[0];
          if (
            !member ||
            (!member.organization_wide &&
              !member.branch_ids.includes(req.params.branchId))
          )
            throw fail("The assignee does not have branch access.");
          const o = await find(c, scope(req), "order", req.params.id);
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
      if (input.method === "external_transfer" && !input.reference)
        throw fail("A verified transfer reference is required.");
      res.json(
        await locked(scope(req), async (c) => {
          await releaseExpired(c, scope(req));
          const existing = (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "payment",
            )
          ).find((r) => r.data.requestKey === input.requestKey);
          if (existing) {
            if (existing.data.intentHash !== intentHash(input))
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
          const o = await find(c, scope(req), "order", req.params.id);
          if (o.holdExpired || ["cancelled", "rejected"].includes(o.status))
            throw fail(
              "The order cannot accept payment. Resolve its stock/payment exception.",
              409,
              "PAYMENT_EXCEPTION",
            );
          if (input.amount > o.total - o.paid)
            throw fail(
              "Payment exceeds the outstanding amount. Record and resolve excess funds separately.",
              409,
              "EXCESS_PAYMENT",
            );
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
          if (o.paid === o.total) o.stockHeld = false;
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
          await record(c, scope(req), "print_job", {
            orderId: o.id,
            status: "queued",
            kind: "receipt",
            physicalConfirmed: false,
            createdAt: now(),
          });
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
        })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const existing = (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "refund",
            )
          ).find((r) => r.data.requestKey === input.requestKey);
          if (existing) {
            if (existing.data.intentHash !== intentHash(input))
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
          const o = await find(c, scope(req), "order", req.params.id);
          if (input.amount > o.paid - o.refunded)
            throw fail("Refund exceeds collected funds.");
          const refund = await record(c, scope(req), "refund", {
            ...input,
            intentHash: intentHash(input),
            orderId: o.id,
            approvedBy: req.user.id,
            source: "manual_return_record",
            createdAt: now(),
          });
          await record(c, scope(req), "ledger", {
            refundId: refund.id,
            postings: ledgerPostings(
              input.amount,
              input.method,
              true,
              !!o.collectedAt,
            ),
            createdAt: now(),
          });
          let remainingRefund = input.amount;
          for (const bill of (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "bill",
            )
          )
            .map((r) => r.data)
            .filter((b) => b.status === "open" || b.status === "closed")) {
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
      .object({ tableId: uuid, displayName: z.string().trim().min(1).max(100) })
      .parse(req.body);
    res.status(201).json(
      await locked(scope(req), async (c) => {
        const table = await find(c, scope(req), "table", input.tableId);
        if (table.status !== "available")
          throw fail("This table is not available.", 409);
        const code = randomBytes(4).toString("hex").toUpperCase();
        const visit = await record(c, scope(req), "visit", {
          tableId: table.id,
          tableName: table.name,
          status: "open",
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
                o.paid < o.total ||
                !["collected", "completed"].includes(o.status),
            )
          )
            throw fail(
              "Outstanding balances or active orders prevent visit closure.",
              409,
            );
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
          const table = await find(c, scope(req), "table", visit.tableId);
          table.status = "cleaning";
          await update(c, scope(req), "table", table.id, table);
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
      const { status } = z
        .object({ status: z.enum(["available", "cleaning", "unavailable"]) })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const table = await find(c, scope(req), "table", req.params.id);
          if (table.status === "occupied")
            throw fail(
              "Close the current visit before resetting the table.",
              409,
            );
          table.status = status;
          return update(c, scope(req), "table", table.id, table);
        }),
      );
    },
  );
  async function reservation(c, b, s, input, actor, guestId) {
    if (!b.settings.reservationsEnabled)
      throw fail("Reservations are not enabled at this branch.", 409);
    if (
      (b.settings.depositRequired && !b.settings.depositPolicy?.approved) ||
      b.settings.minimumSpend
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
    const existing = (
      await readRecords(c, s.organizationId, s.branchId, "reservation")
    ).map((r) => r.data);
    const repeat = existing.find((r) => r.requestKey === input.requestKey);
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
    assertReservationWindow(input,b);
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
      createdAt: now(),
    });
    await event(c, s, "reservation_requested", actor, { reservationId: r.id });
    return r;
  }
  router.post(
    B + "/reservations",
    guard("reservations.manage"),
    async (req, res) => {
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
    const { openingFloat } = z
      .object({ openingFloat: z.number().int().min(0) })
      .parse(req.body);
    res.status(201).json(
      await locked(scope(req), async (c) => {
        if (
          (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "shift",
            )
          ).some((r) => r.data.status === "open")
        )
          throw fail("Close the existing branch shift first.", 409);
        return record(c, scope(req), "shift", {
          openingFloat,
          status: "open",
          openedBy: req.user.id,
          createdAt: now(),
        });
      }),
    );
  });
  router.post(
    B + "/shifts/:id/movements",
    guard("shifts.manage"),
    async (req, res) => {
      const input = z
        .object({
          direction: z.enum(["in", "out"]),
          amount: z.number().int().positive(),
          reason: z.string().trim().min(3).max(300),
        })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const shift = await find(c, scope(req), "shift", req.params.id);
          if (shift.status !== "open") throw fail("The shift is closed.", 409);
          return record(c, scope(req), "cash_movement", {
            ...input,
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
      const input = z
        .object({
          countedCash: z.number().int().min(0),
          reason: z.string().trim().max(300).default(""),
        })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const shift = await find(c, scope(req), "shift", req.params.id);
          if (shift.status !== "open")
            throw fail("The shift is already closed.", 409);
          const rs = await readRecords(
            c,
            req.params.organizationId,
            req.params.branchId,
          );
          let expectedCash = shift.openingFloat;
          for (const r of rs) {
            if (Date.parse(r.data.createdAt) < Date.parse(shift.createdAt))
              continue;
            if (r.kind === "payment" && r.data.method === "cash")
              expectedCash += r.data.amount;
            if (r.kind === "refund" && r.data.method === "cash")
              expectedCash -= r.data.amount;
            if (r.kind === "cash_movement" && r.data.shiftId === shift.id)
              expectedCash +=
                r.data.direction === "in" ? r.data.amount : -r.data.amount;
          }
          const variance = input.countedCash - expectedCash;
          if (variance && !input.reason)
            throw fail("Explain the cash variance before closing.");
          Object.assign(shift, {
            ...input,
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
          return update(c, scope(req), "shift", shift.id, shift);
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
            'SELECT m.id,m.user_id AS "userId",m.role,m.permissions,m.branch_ids AS "branchIds",m.organization_wide AS "organizationWide",m.active,u.name FROM mera_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1',
            [req.params.organizationId],
          )
        ).rows,
      ),
  );
  router.get("/organizations/:organizationId/invitations",guard("members.manage"),async(req,res)=>res.json((await q('SELECT id,email,role,branch_ids AS "branchIds",expires_at AS "expiresAt",revoked,accepted FROM mera_invitations WHERE organization_id=$1 ORDER BY expires_at DESC',[req.params.organizationId])).rows.map(i=>({...i,delivery:"not_sent"}))));
  router.post(
    "/organizations/:organizationId/invitations",
    guard("members.manage"),
    async (req, res) => {
      const input = z
        .object({
          email: z.string().email().max(200),
          role: z.string().min(1).max(100),
          branchIds: z.array(uuid).max(100),
        })
        .parse(req.body);
      const requester = req.meraMembership;
      const grants = (await resolveRole(db,req.params.organizationId,input.role)).permissions;
      if (
        grants.some((p) => !requester.permissions.includes(p)) ||
        (input.role === "owner" && requester.role !== "owner")
      )
        throw fail("Cannot grant privileges beyond your authority.", 403);
      const branches = (
        await q("SELECT id FROM mera_branches WHERE organization_id=$1", [
          req.params.organizationId,
        ])
      ).rows.map((b) => b.id);
      if (
        input.branchIds.some(
          (id) =>
            !branches.includes(id) ||
            (!requester.organization_wide &&
              !requester.branch_ids.includes(id)),
        )
      )
        throw fail("Invalid branch scope.", 403);
      const token = randomBytes(32).toString("hex"),
        id = randomUUID(),
        expiresAt = new Date(Date.now() + 48 * 3600000).toISOString();
      await q(
        "INSERT INTO mera_invitations(id,organization_id,token_hash,email,role,permissions,branch_ids,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          req.params.organizationId,
          hash(token),
          input.email,
          input.role,
          JSON.stringify(grants),
          JSON.stringify(input.branchIds),
          expiresAt,
        ],
      );
      res.status(201).json({
        id,
        email: input.email,
        role: input.role,
        expiresAt,
        delivery: "not_sent",
        reason: providers.email.reason,
        ...(process.env.MERA_DEMO === "true" &&
        process.env.NODE_ENV !== "production"
          ? { developmentToken: token }
          : {}),
      });
    },
  );
  router.delete(
    "/organizations/:organizationId/invitations/:id",
    guard("members.manage"),
    async (req, res) => {
      await q(
        "UPDATE mera_invitations SET revoked=true WHERE id=$1 AND organization_id=$2",
        [req.params.id, req.params.organizationId],
      );
      res.json({ revoked: true });
    },
  );
  router.patch(
    "/organizations/:organizationId/members/:id",
    guard("members.manage"),
    async (req, res) => {
      const { active } = z.object({ active: z.boolean() }).parse(req.body);
      await db.transaction(async (c) => {
        await c.query(
          "SELECT id FROM mera_organizations WHERE id=$1 FOR UPDATE",
          [req.params.organizationId],
        );
        const target = (
          await c.query(
            "SELECT * FROM mera_memberships WHERE id=$1 AND organization_id=$2",
            [req.params.id, req.params.organizationId],
          )
        ).rows[0];
        if (!target) throw fail("Membership not found.", 404);
        if (!active && target.role === "owner") {
          const owners = (
            await c.query(
              "SELECT id FROM mera_memberships WHERE organization_id=$1 AND role='owner' AND active=true",
              [req.params.organizationId],
            )
          ).rows;
          if (owners.length <= 1)
            throw fail("The last active owner cannot be removed.", 409);
        }
        await c.query(
          "UPDATE mera_memberships SET active=$1 WHERE id=$2 AND organization_id=$3",
          [active, target.id, req.params.organizationId],
        );
      });
      res.json({ active });
    },
  );
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
      await c.query(
        "INSERT INTO mera_memberships(id,user_id,organization_id,role,permissions,branch_ids) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,organization_id) DO NOTHING",
        [
          randomUUID(),
          req.user.id,
          invite.organization_id,
          invite.role,
          JSON.stringify(invite.permissions),
          JSON.stringify(invite.branch_ids),
        ],
      );
      await c.query("UPDATE mera_invitations SET accepted=true WHERE id=$1", [
        invite.id,
      ]);
    });
    res.json({ accepted: true, simulation: true, emailVerified: false });
  });
  async function publicContext(req) {
    const organization = (
      await q("SELECT * FROM mera_organizations WHERE slug=$1", [
        req.params.slug.toLowerCase(),
      ])
    ).rows[0];
    if (!organization) throw fail("Menu not found.", 404);
    const b = (
      await q(
        "SELECT * FROM mera_branches WHERE id=$1 AND organization_id=$2",
        [req.params.branchId, organization.id],
      )
    ).rows[0];
    if (!b) throw fail("Branch not found.", 404);
    if(process.env.MERA_DEMO!=="true" && (organization.onboarding?.status!=="published" || b.settings.launchState!=="published")) throw fail("Menu not found.",404);
    return {
      organization,
      b,
      s: { organizationId: organization.id, branchId: b.id },
    };
  }
  async function guest(req, organizationId) {
    const token = req.cookies?.mera_guest;
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
  const publicOrder = (o) => ({
    id: o.id,
    reference: o.reference,
    displayName: o.displayName,
    status: o.status,
    paymentStatus: o.paymentStatus,
    total: o.total,
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
    const { organization, b, s } = await publicContext(req);
    await locked(s, (c) => releaseExpired(c, s));
    const live = (await readRecords(db, organization.id, b.id, "product")).map(
      (r) => r.data,
    );
    const products = b.published_menu
      .map((p) => {
        const current = live.find((l) => l.id === p.id);
        return {
          ...p,
          available: !!current?.available && availableNow(p.availabilityWindows,b.timezone),
          variants:p.variants.map(v=>({...v,stockMode:current?.variants?.find(l=>l.id===v.id)?.stockMode || "unlimited",stock:current?.variants?.find(l=>l.id===v.id)?.stock || 0})),
          stock: current?.stock || 0,
          stockMode: current?.stockMode || "unlimited",
        };
      })
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
      branch: branchView(b),
      version: b.menu_version,
      products,
      tables,
      providers,
      orderingAvailable: !b.settings.orderingPaused && !!b.menu_version && availableNow(b.settings.serviceHours,b.timezone),
      reservationPolicy: {
        enabled: !!b.settings.reservationsEnabled,
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
    const { organization } = await publicContext(req);
    const { displayName } = z
      .object({ displayName: z.string().trim().min(1).max(100) })
      .parse(req.body);
    let existing;
    try {
      existing = await guest(req, organization.id);
    } catch {}
    if (existing) {
      await q("UPDATE mera_guests SET display_name=$1 WHERE id=$2", [
        displayName,
        existing.id,
      ]);
      return res.json({ displayName, expiresAt: existing.expires_at });
    }
    const token = randomBytes(32).toString("hex"),
      expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
    await q(
      "INSERT INTO mera_guests(id,token_hash,organization_id,display_name,expires_at) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), hash(token), organization.id, displayName, expiresAt],
    );
    res.cookie("mera_guest", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400000,
      path: "/",
    });
    res.status(201).json({ displayName, expiresAt });
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
    const g = await guest(req);
    const row = (
      await q(
        "SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND kind='order'",
        [req.params.id, g.organization_id],
      )
    ).rows[0];
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
      .json(await locked(s, (c, b) => reservation(c, b, s, input, null, g.id)));
  });
  router.post(P + "/visits/join", async (req, res) => {
    const { organization, s } = await publicContext(req);
    const g = await guest(req, organization.id);
    const input = z
      .object({ visitId: uuid.optional(), tableId: uuid.optional(), code: z.string().min(1).max(80) }).strict()
      .refine(v => Boolean(v.visitId) !== Boolean(v.tableId), "Provide exactly one visit or table")
      .parse(req.body);
    res.json(
      await locked(s, async (c) => {
        const v = input.visitId ? await find(c, s, "visit", input.visitId) : (await readRecords(c,s.organizationId,s.branchId,"visit")).map(r=>r.data).find(v=>v.tableId===input.tableId && v.status==="open");
        if (!v) throw fail("The visit or joining code is invalid.",403);
        if (
          v.status !== "open" ||
          v.joiningCodeHash !== hash(input.code.trim().toUpperCase())
        )
          throw fail("The visit or joining code is invalid.", 403);
        if (!v.guestIds.includes(g.id)) v.guestIds.push(g.id);
        await update(c, s, "visit", v.id, v);
        return {
          id: v.id,
          tableId: v.tableId,
          tableName: v.tableName,
          status: v.status,
        };
      }),
    );
  });
  router.get("/public/visits/:id", async (req, res) => {
    const g = await guest(req);
    const row = (
      await q(
        "SELECT * FROM mera_records WHERE id=$1 AND organization_id=$2 AND kind='visit'",
        [req.params.id, g.organization_id],
      )
    ).rows[0];
    if (!row || row.data.status !== "open" || !row.data.guestIds.includes(g.id))
      throw fail("Visit not found.", 404);
    const orders = (
      await readRecords(db, row.organization_id, row.branch_id, "order")
    )
      .map((r) => r.data)
      .filter((o) => o.visitId === row.id);
    res.json({
      visit: {
        id: row.id,
        tableId: row.data.tableId,
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
        items: o.items,
      })),
      bills: (await readRecords(db, row.organization_id, row.branch_id, "bill"))
        .map((r) => r.data)
        .filter((b) => b.visitId === row.id && b.status === "open")
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
        .reduce((n, o) => n + Math.max(0, o.total - o.paid), 0),
    });
  });
  router.post("/public/orders/:id/feedback", async (req, res) => {
    const g = await guest(req);
    const input = z
      .object({
        rating: z.number().int().min(1).max(5),
        text: z.string().trim().max(2000),
        category: z
          .enum(["feedback", "service", "food", "payment", "other"])
          .default("feedback"),
      })
      .parse(req.body);
    const row = (
      await q(
        "SELECT * FROM mera_records WHERE id=$1 AND organization_id=$2 AND kind='order'",
        [req.params.id, g.organization_id],
      )
    ).rows[0];
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
      const input = z
        .object({
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
        .strict()
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c, b) => {
          const {timezone,cutoff,...settingsInput}=input;
          const settings = { ...b.settings, ...settingsInput };
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
        })
        .strict()
        .parse(req.body);
      await q("UPDATE mera_organizations SET branding=$1 WHERE id=$2", [
        JSON.stringify(branding),
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
          monthlyPrice: z.number().int().min(0),
          includedBranches: z.number().int().min(1).max(100),
          additionalBranchPrice: z.number().int().min(0).nullable(),
          integratedFeeBps: z.number().int().min(0).max(10000),
          feePayer: z.enum(["merchant", "customer"]).nullable(),
          feeBasis: z.enum(["collection", "sales"]).nullable(),
          refundTreatment: z.enum(["return_fee", "retain_fee"]).nullable(),
          trialDays: z.number().int().min(0).nullable(),
          graceDays: z.number().int().min(0).nullable(),
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
    const { organization, s } = await publicContext(req);
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
        depositRequired: r.depositRequired || 0,
        visitId: r.visitId || null,
      }));
    const openVisits = (
      await readRecords(db, organization.id, s.branchId, "visit")
    )
      .map((r) => r.data)
      .filter((v) => v.status === "open" && v.guestIds.includes(g.id))
      .map((v) => ({ id: v.id, tableId: v.tableId, tableName: v.tableName }));
    res.json({ displayName: g.display_name, orders, reservations, openVisits });
  });
  router.post(
    B + "/bills/:id/split",
    guard("payments.record"),
    async (req, res) => {
      const input = z
        .object({
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
          const source = billAmounts(
            await find(c, scope(req), "bill", req.params.id),
          );
          if (source.status !== "open")
            throw fail("Only open bills can be split.", 409);
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
          return { source: billAmounts(source), bill };
        }),
      );
    },
  );
  router.post(
    B + "/bills/:id/merge",
    guard("payments.record"),
    async (req, res) => {
      const { sourceBillIds } = z
        .object({ sourceBillIds: z.array(uuid).min(1).max(30) })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const target = await find(c, scope(req), "bill", req.params.id);
          if (target.status !== "open")
            throw fail("Target bill is not open.", 409);
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
          return billAmounts(target);
        }),
      );
    },
  );
  router.post(
    B + "/bills/:id/payments",
    guard("payments.record"),
    async (req, res) => {
      const input = paymentInputSchema.parse(req.body);
      if (input.method === "external_transfer" && !input.reference)
        throw fail("A verified transfer reference is required.");
      res.json(
        await locked(scope(req), async (c) => {
          await releaseExpired(c, scope(req));
          const existing = (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "payment",
            )
          ).find((r) => r.data.requestKey === input.requestKey);
          if (existing) {
            if (existing.data.intentHash !== intentHash(input))
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
            const order = await find(c, scope(req), "order", orderId);
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
              allocated > order.total - order.paid
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
            if (order.paid === order.total) order.stockHeld = false;
            order.version++;
            order.history.push({
              action: "payment_recorded",
              actorId: req.user.id,
              actorName: req.user.name,
              amount: allocated,
              at: now(),
            });
            await update(c, scope(req), "order", order.id, order);
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
      res.json(
        await locked(scope(req), async (c, b) => {
          const policy = b.settings.depositPolicy;
          if (!policy?.approved || !policy.enabled)
            throw fail(
              "An approved deposit policy is required.",
              409,
              "POLICY_BLOCKED",
            );
          if (input.method === "external_transfer" && !input.reference)
            throw fail("A verified transfer reference is required.");
          const reservation = await find(
            c,
            scope(req),
            "reservation",
            req.params.id,
          );
          const existing = (
            await readRecords(
              c,
              req.params.organizationId,
              req.params.branchId,
              "deposit",
            )
          ).find((r) => r.data.requestKey === input.requestKey);
          if (existing) {
            if (existing.data.intentHash !== intentHash(input))
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
            policy.amount - deposits.reduce((n, d) => n + d.amount, 0)
          )
            throw fail("Deposit exceeds the required deposit balance.", 409);
          await assertManualMethod(c,scope(req),input.method);
          const deposit = await record(c, scope(req), "deposit", {
            ...input,
            intentHash: intentHash(input),
            reservationId: reservation.id,
            recordedBy: req.user.id,
            allocated: false,
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
            bill.allocations.push({
              paymentId: d.id,
              orderId: null,
              amount: d.amount,
              source: "reservation_deposit",
            });
            d.allocated = true;
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
            depositAmount: deposits.reduce((n, d) => n + d.amount, 0),
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
    res.json(
      rows[0]?.data || {
        receipt: {
          businessName: "Bing Chun",
          footer: "Thank you. See you again soon.",
          showStaff: true,
          paperWidth: 58,
        },
        label: { width: 50, height: 40 },
      },
    );
  });
  router.put(B + "/templates", guard("menu.edit"), async (req, res) => {
    const input = z
      .object({
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
    res.json(
      await locked(scope(req), async (c) => {
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
              id: old.id,
            })
          : await record(c, scope(req), "template", input);
        await event(c, scope(req), "print_template_updated", req.user, {});
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
      const { reason } = z
        .object({ reason: z.string().trim().min(3).max(300) })
        .parse(req.body);
      res.status(201).json(
        await locked(scope(req), async (c) => {
          const job = await find(c, scope(req), "print_job", req.params.id);
          const duplicate = await record(c, scope(req), "print_job", {
            ...job,
            id: undefined,
            originalJobId: job.id,
            status: "queued",
            duplicate: true,
            reason,
            requestedBy: req.user.id,
            physicalConfirmed: false,
            createdAt: now(),
          });
          await event(c, scope(req), "reprint_requested", req.user, {
            jobId: duplicate.id,
            reason,
          });
          return duplicate;
        }),
      );
    },
  );

  mountMeraCancellation(router,{guard,scope,locked,find,readRecords,record,event});
  mountMeraReadiness(router,{db,guard,scope,locked,readRecords,event});
  mountMeraReservationPolicy(router,{guard,scope,locked,event});
  mountMeraMenus(router,{db,guard,scope,locked,record,readRecords,event});
  mountMeraReconciliation(router,{db,guard,scope,locked,record,readRecords,find,event});
  mountMeraIdentity(router,{db});
  mountMeraRoles(router, {db,guard});
  mountMeraTickets(router, {guard,scope,locked,find,readRecords,event});
  mountMeraPlatform(router, { db, providers, proposedPolicy });
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
    createOrder,
    reservation,
  });
  mountMeraCustomerFollowup(router,{db,publicContext,guest,locked,readRecords,find,update,event});
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
