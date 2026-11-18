import { z } from "zod";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
const fail = (message, status = 409, code = "MINIMUM_SPEND_REVIEW_REQUIRED") =>
  Object.assign(new Error(message), { status, code });
const policyInput = z
  .object({
    enabled: z.boolean(),
    approved: z.boolean(),
    amount: z.number().int().safe().min(0).max(100000000000).nullable(),
    basis: z.literal("net_paid_bill").nullable(),
    shortfallTreatment: z.literal("manager_review"),
    disclosure: z.string().trim().max(500),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      p.enabled &&
      (!p.approved ||
        !p.amount ||
        p.basis !== "net_paid_bill" ||
        p.disclosure.length < 10)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Review the amount, net-paid-bill basis and customer disclosure before enabling minimum spend.",
      });
  });
export function minimumSpendSnapshot(branch) {
  const policy = branch.settings?.minimumSpendPolicy;
  if (!policy?.enabled) {
    if (branch.settings?.minimumSpend > 0)
      throw fail(
        "An explicit minimum-spend policy must be reviewed before opening this visit.",
      );
    return null;
  }
  const { version, configuredAt, configuredBy, ...value } = policy;
  if (typeof version !== "string" || !version)
    throw fail("The reviewed minimum-spend policy needs a stable version.");
  policyInput.parse(value);
  return JSON.parse(JSON.stringify(policy));
}
export function publicMinimumSpend(policy) {
  return policy?.enabled
    ? {
        enabled: true,
        approved: !!policy.approved,
        amount: policy.amount,
        basis: policy.basis,
        shortfallTreatment: policy.shortfallTreatment,
        disclosure: policy.disclosure,
        version: policy.version,
      }
    : null;
}
export function minimumSpendSummary(visit, orders) {
  const policy = visit.minimumSpendPolicy;
  if (!policy?.enabled)
    return {
      enabled: false,
      target: 0,
      netPaid: 0,
      waived: 0,
      shortfall: 0,
      basis: null,
    };
  let netPaid = 0;
  for (const order of orders.filter(
    (o) =>
      o.visitId === visit.id && !["cancelled", "rejected"].includes(o.status),
  )) {
    netPaid += Math.min(order.total, Math.max(0, order.paid - order.refunded));
    if (!Number.isSafeInteger(netPaid))
      throw fail("The qualifying spend requires accounting review.");
  }
  const waived = Math.min(policy.amount, visit.minimumSpendWaived || 0);
  return {
    enabled: true,
    target: policy.amount,
    netPaid,
    waived,
    shortfall: Math.max(0, policy.amount - netPaid - waived),
    basis: policy.basis,
    policyVersion: policy.version,
    disclosure: policy.disclosure,
  };
}
export function assertMinimumSpendAcknowledged(policy, input) {
  if (
    policy?.enabled &&
    (!input.minimumSpendAcknowledged ||
      input.minimumSpendPolicyVersion !== policy.version)
  )
    throw fail(
      "Review and acknowledge the exact minimum-spend terms before continuing.",
      409,
      "MINIMUM_SPEND_ACK_REQUIRED",
    );
}
export function mountMeraMinimumSpend(
  router,
  {
    db,
    guard,
    scope,
    locked,
    record,
    readRecords,
    find,
    update,
    event,
    publicContext,
    guest,
  },
) {
  const B = "/organizations/:organizationId/branches/:branchId",
    P = "/public/:slug/:branchId";
  router.patch(
    B + "/minimum-spend-policy",
    guard("organization.manage"),
    async (req, res) => {
      const input = policyInput.parse(req.body);
      res.json(
        await locked(scope(req), async (c, b) => {
          const policy = {
              ...input,
              version: randomUUID(),
              configuredAt: new Date().toISOString(),
              configuredBy: req.user.id,
            },
            settings = {
              ...b.settings,
              minimumSpendPolicy: policy,
              minimumSpend: policy.enabled ? policy.amount : 0,
            };
          await c.query(
            "UPDATE mera_branches SET settings=$1 WHERE id=$2 AND organization_id=$3",
            [JSON.stringify(settings), b.id, b.organization_id],
          );
          await event(
            c,
            scope(req),
            "minimum_spend_policy_reviewed",
            req.user,
            { policy },
          );
          return policy;
        }),
      );
    },
  );
  router.get(
    B + "/visits/:id/minimum-spend",
    guard(["tables.manage", "payments.record", "refunds.approve"]),
    async (req, res) => {
      const s = scope(req),
        visit = await find(db, s, "visit", req.params.id),
        orders = (
          await readRecords(db, s.organizationId, s.branchId, "order")
        ).map((r) => r.data);
      res.json({
        summary: minimumSpendSummary(visit, orders),
        policy: publicMinimumSpend(visit.minimumSpendPolicy),
        version: visit.version || 1,
      });
    },
  );
  router.post(
    B + "/visits/:id/minimum-spend/waive",
    guard("refunds.approve"),
    async (req, res) => {
      const input = z
          .object({
            requestKey: z.string().uuid(),
            version: z.number().int().positive(),
            expectedShortfall: z.number().int().safe().positive(),
            reason: z.string().trim().min(10).max(500),
          })
          .strict()
          .parse(req.body),
        s = scope(req);
      const intentHash = createHash("sha256")
        .update(
          JSON.stringify({
            ...input,
            visitId: req.params.id,
            actorId: req.user.id,
          }),
        )
        .digest("hex");
      res.json(
        await locked(s, async (c) => {
          const previous = (
            await readRecords(
              c,
              s.organizationId,
              s.branchId,
              "minimum_spend_waiver",
            )
          ).find((r) => r.data.requestKey === input.requestKey)?.data;
          if (previous) {
            if (previous.intentHash !== intentHash)
              throw fail("This key records a different minimum-spend review.");
            return previous;
          }
          const visit = await find(c, s, "visit", req.params.id);
          if (visit.status !== "open" || (visit.version || 1) !== input.version)
            throw fail(
              "Review the current open visit before waiving a shortfall.",
            );
          const orders = (
              await readRecords(c, s.organizationId, s.branchId, "order")
            ).map((r) => r.data),
            summary = minimumSpendSummary(visit, orders);
          if (!summary.enabled || summary.shortfall !== input.expectedShortfall)
            throw fail(
              "The qualifying spend changed. Review the current shortfall.",
            );
          const waiver = await record(c, s, "minimum_spend_waiver", {
            ...input,
            intentHash,
            visitId: visit.id,
            amount: summary.shortfall,
            approvedBy: req.user.id,
            policySnapshot: visit.minimumSpendPolicy,
            createdAt: new Date().toISOString(),
          });
          visit.minimumSpendWaived =
            (visit.minimumSpendWaived || 0) + summary.shortfall;
          visit.version = (visit.version || 1) + 1;
          await update(c, s, "visit", visit.id, visit);
          await event(c, s, "minimum_spend_shortfall_waived", req.user, {
            visitId: visit.id,
            waiverId: waiver.id,
            amount: waiver.amount,
            reason: input.reason,
          });
          return waiver;
        }),
      );
    },
  );
  router.post(P + "/visits/terms", async (req, res) => {
    const input = z
      .object({
        visitId: z.string().uuid().optional(),
        tableId: z.string().uuid().optional(),
        code: z.string().min(1).max(80),
      })
      .strict()
      .refine((v) => !!v.visitId !== !!v.tableId)
      .parse(req.body);
    const { organization, s } = await publicContext(req);
    await guest(req, organization.id);
    const visit = input.visitId
      ? await find(db, s, "visit", input.visitId)
      : (await readRecords(db, s.organizationId, s.branchId, "visit"))
          .map((r) => r.data)
          .find(
            (v) =>
              v.status === "open" &&
              (v.tableIds || [v.tableId]).includes(input.tableId),
          );
    const code = createHash("sha256")
      .update(input.code.trim().toUpperCase())
      .digest("hex");
    if (
      !visit ||
      visit.status !== "open" ||
      !visit.joiningCodeHash ||
      visit.joiningCodeHash.length !== 64 ||
      !timingSafeEqual(Buffer.from(code), Buffer.from(visit.joiningCodeHash))
    )
      throw fail(
        "Ask staff for the current visit code.",
        403,
        "VISIT_CODE_REQUIRED",
      );
    res.set("Cache-Control", "no-store").json({
      visitId: visit.id,
      minimumSpendPolicy: publicMinimumSpend(visit.minimumSpendPolicy),
      privateBillAccessGranted: false,
    });
  });
}
