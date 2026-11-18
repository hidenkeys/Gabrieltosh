import { z } from "zod";
export const CONTRACT_VERSION = "1.1.0";
export const MERA_API = "/api/mera/v1";
export const permissions = [
  "organization.manage",
  "members.manage",
  "menu.edit",
  "menu.publish",
  "stock.adjust",
  "orders.view",
  "orders.create",
  "orders.assign",
  "orders.prepare",
  "orders.fulfill",
  "payments.record",
  "refunds.request",
  "refunds.approve",
  "reservations.manage",
  "tables.manage",
  "shifts.manage",
  "reports.view",
  "reports.export",
  "billing.manage",
];
export const rolePermissions = {
  owner: permissions,
  organization_admin: permissions.filter((p) => p !== "billing.manage"),
  branch_manager: permissions.filter(
    (p) =>
      !["organization.manage", "members.manage", "billing.manage"].includes(p),
  ),
  cashier: [
    "orders.view",
    "orders.create",
    "payments.record",
    "refunds.request",
    "orders.fulfill",
    "shifts.manage",
  ],
  waiter: [
    "refunds.request",
    "orders.view",
    "orders.create",
    "orders.assign",
    "orders.fulfill",
    "tables.manage",
  ],
  kitchen: ["orders.view", "orders.prepare"],
  bar: ["orders.view", "orders.prepare"],
  front_desk: ["reservations.manage", "tables.manage", "orders.view"],
  stock_controller: ["stock.adjust", "menu.edit"],
  reports_only: ["reports.view"],
};
export const orderStates = [
  "submitted",
  "accepted",
  "preparing",
  "ready",
  "collected",
  "completed",
  "rejected",
  "cancelled",
];
export const paymentStates = [
  "unpaid",
  "pending",
  "partially_paid",
  "paid",
  "partially_refunded",
  "refunded",
  "failed",
  "expired",
];
export const moneySchema = z.number().int().safe().min(0).max(100000000000);
export const orderInputSchema = z.object({
  requestKey: z.string().uuid(),
  menuVersion: z.number().int().positive(),
  quoteId:z.string().uuid().optional(),
  displayName: z.string().trim().min(1).max(100),
  fulfillment: z
    .enum(["counter_pickup", "takeaway", "table_service"])
    .default("counter_pickup"),
  visitId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
        variantId: z.string().max(100).optional(),
        modifiers: z.array(z.string().max(100)).max(30).default([]),
      }),
    )
    .min(1)
    .max(100),
  note: z.string().max(500).default(""),
});
export const paymentInputSchema = z.object({
  requestKey: z.string().uuid(),
  amount: moneySchema.refine((n) => n > 0),
  method: z.enum(["cash", "external_pos", "external_transfer"]),
  reference: z.string().trim().max(120).default(""),
});
export const reservationInputSchema = z
  .object({
    requestKey: z.string().uuid(),
    displayName: z.string().trim().min(1).max(100),
    contact: z.string().trim().min(3).max(160),
    partySize: z.number().int().min(1).max(100),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    tableId: z.string().uuid().optional(),
    notes: z.string().max(500).default(""),
    minimumSpendAcknowledged:z.boolean().optional(),
    minimumSpendPolicyVersion:z.string().max(120).optional(),
  })
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "Reservation must end after it starts",
  );
export const availabilityWindowSchema=z.object({days:z.array(z.number().int().min(0).max(6)).min(1).max(7),start:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),end:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)}).refine(v=>v.end>v.start,"End must follow start; split overnight windows");
export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().max(30),
  category: z.string().trim().min(1).max(100),
  parentCategory: z.string().max(100).nullable().default(null),
  categoryId:z.string().uuid().nullable().default(null),
  description: z.string().max(1000).default(""),
  price: moneySchema,
  size: z.string().max(40).default(""),
  available: z.boolean().default(true),
  stockMode: z.enum(["unlimited", "counted"]).default("unlimited"),
  stock: z.number().int().min(0).max(1000000).default(0),
  lowStockThreshold:z.number().int().min(0).max(1000000).default(5),
  station: z.enum(["kitchen", "bar"]).default("bar"),
  availabilityWindows:z.array(availabilityWindowSchema).max(30).default([]),
  variants: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        price: moneySchema,
        stockMode:z.enum(["unlimited","counted"]).default("unlimited"),
        stock:z.number().int().min(0).max(1000000).default(0),
        lowStockThreshold:z.number().int().min(0).max(1000000).default(5),
      }),
    )
    .max(30)
    .default([]),
  modifierGroups: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        min: z.number().int().min(0),
        max: z.number().int().min(1).max(30),
        options: z
          .array(
            z.object({
              id: z.string().min(1),
              name: z.string().min(1),
              price: moneySchema,
            }),
          )
          .min(1),
      }),
    )
    .max(10)
    .default([]),
  allergens: z.array(z.string().max(80)).default([]),
  dietary: z.array(z.string().max(80)).default([]),
  imageCode: z.string().max(30).default(""),
  image:z.string().regex(/^(?:|\/api\/mera\/v1\/public\/assets\/[a-f\d-]{36})$/i).default(""),
});
export const proposedPolicy = {
  version: "proposal-1",
  currency: "NGN",
  monthlyPrice: 1350000,
  includedBranches: 1,
  additionalBranchPrice: null,
  integratedFeeBps: 10,
  feePayer: null,
  feeBasis: null,
  refundTreatment: null,
  trialDays: null,
  graceDays: null,
  liveBillingEnabled: false,
  status: "proposed",
};
export const branchPath = (organizationId, branchId) =>
  `${MERA_API}/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(branchId)}`;
