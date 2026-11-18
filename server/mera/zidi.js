// Local, contract-tested adapter. This is NOT a verified Zidi provider contract.
import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  orderInputSchema,
  reservationInputSchema,
  CONTRACT_VERSION,
} from "../../shared/mera-contracts.js";
import { fail,availableNow } from "./domain.js";
import { subscriptionEntitlement } from "./subscriptions.js";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const allowed = [
  "published_menu.read",
  "orders.create",
  "orders.read",
  "reservations.create",
];
export function mountMeraZidi(
  router,
  {
    db,
    guard,
    scope,
    locked,
    record,
    readRecords,
    find,
    event,
    createOrder,
    quoteOrder,
    reservation,
  },
) {
  const B = "/organizations/:organizationId/branches/:branchId";
  const enabled = () =>
    process.env.MERA_DEMO === "true" && process.env.NODE_ENV !== "production";
  router.get(
    B + "/integration-credentials",
    guard("organization.manage"),
    async (req, res) =>
      res.json(
        (
          await readRecords(
            db,
            req.params.organizationId,
            req.params.branchId,
            "integration_credential",
          )
        ).map(({ data }) => ({
          id: data.id,
          name: data.name,
          scopes: data.scopes,
          active: data.active,
          createdAt: data.createdAt,
          mode: "simulator",
        })),
      ),
  );
  router.post(
    B + "/integration-credentials",
    guard("organization.manage"),
    async (req, res) => {
      if (!enabled())
        throw fail(
          "Live Zidi credentials are not enabled before provider verification.",
          503,
          "PROVIDER_BLOCKED",
        );
      const input = z
        .object({
          name: z.string().trim().min(1).max(100),
          scopes: z.array(z.enum(allowed)).min(1).max(4),
        })
        .parse(req.body);
      const id = randomUUID(),
        secret = randomBytes(32).toString("hex");
      const credential = await locked(scope(req), async (c) => {
        const v = await record(
          c,
          scope(req),
          "integration_credential",
          {
            name: input.name,
            scopes: [...new Set(input.scopes)],
            active: true,
            tokenHash: digest(secret),
            createdAt: new Date().toISOString(),
          },
          id,
        );
        await event(c, scope(req), "integration_credential_created", req.user, {
          credentialId: id,
          scopes: v.scopes,
        });
        return v;
      });
      res
        .status(201)
        .json({
          id: credential.id,
          name: credential.name,
          scopes: credential.scopes,
          token: `mz_${id}.${secret}`,
          mode: "simulator",
          message:
            "Copy this development credential now. It will not be shown again.",
        });
    },
  );
  router.delete(
    B + "/integration-credentials/:id",
    guard("organization.manage"),
    async (req, res) => {
      await locked(scope(req), async (c) => {
        const credential = await find(
          c,
          scope(req),
          "integration_credential",
          req.params.id,
        );
        credential.active = false;
        await c.query(
          "UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind='integration_credential'",
          [
            JSON.stringify(credential),
            credential.id,
            req.params.organizationId,
            req.params.branchId,
          ],
        );
        await event(c, scope(req), "integration_credential_revoked", req.user, {
          credentialId: credential.id,
        });
      });
      res.json({ revoked: true });
    },
  );
  const I = "/integrations/zidi/v1";
  router.use(I, async (req, res, next) => {
    try {
      if (!enabled())
        throw fail(
          "Zidi live access requires a verified external contract and credentials.",
          503,
          "PROVIDER_BLOCKED",
        );
      const match = /^Bearer mz_([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(
        req.get("authorization") || "",
      );
      if (!match)
        throw fail(
          "A scoped integration credential is required.",
          401,
          "INTEGRATION_AUTH_REQUIRED",
        );
      const row = (
        await db.query(
          "SELECT * FROM mera_records WHERE id=$1 AND kind='integration_credential'",
          [match[1]],
        )
      ).rows[0];
      if (
        !row ||
        !row.data.active ||
        !timingSafeEqual(
          Buffer.from(row.data.tokenHash, "hex"),
          Buffer.from(digest(match[2]), "hex"),
        )
      )
        throw fail("Integration credential is invalid or revoked.", 403);
      req.meraIntegration = {
        scope: { organizationId: row.organization_id, branchId: row.branch_id },
        credential: row.data,
        actor: { id: row.id, name: row.data.name, type: "integration" },
      };
      next();
    } catch (e) {
      next(e);
    }
  });
  const authorize = (req, permission) => {
    if (!req.meraIntegration.credential.scopes.includes(permission))
      throw fail(
        "This credential lacks the required integration scope.",
        403,
        "INTEGRATION_SCOPE_REQUIRED",
      );
    return req.meraIntegration;
  };
  router.get(I + "/menu", async (req, res) => {
    const { scope: s } = authorize(req, "published_menu.read");
    const b = (
      await db.query(
        "SELECT * FROM mera_branches WHERE id=$1 AND organization_id=$2",
        [s.branchId, s.organizationId],
      )
    ).rows[0];
    if (!b) throw fail("Branch not found.", 404);
    const live = (
      await readRecords(db, s.organizationId, s.branchId, "product")
    ).map((r) => r.data);
    const organization=(await db.query("SELECT policy,subscription FROM mera_organizations WHERE id=$1",[s.organizationId])).rows[0];
    res.json({
      mode: "simulator",
      contractVersion: CONTRACT_VERSION,
      organizationId: s.organizationId,
      branchId: s.branchId,
      menuVersion: b.menu_version,
      pricingPolicy:b.settings.pricingPolicy||null,
      pricingPolicyRequired:!!b.settings.pricingPolicy?.enabled,
      categories:b.settings.publishedCategories||[],
      capabilities:{quote:true,outboundEvents:{state:"blocked",reason:"Signed outbound events require a verified external Zidi contract and delivery configuration."}},
      orderingAvailable: !b.settings.orderingPaused && b.menu_version > 0 && availableNow(b.settings.serviceHours,b.timezone) && subscriptionEntitlement(organization.subscription,organization.subscription?.approvedPolicySnapshot||organization.policy,Date.now(),true).newOrdersAllowed,
      products: b.published_menu
        .map((p) => {
          const current = live.find((l) => l.id === p.id);
          return {
            ...p,
            available: !!current?.available && availableNow(p.availabilityWindows,b.timezone),
            variants:p.variants.map(v=>({...v,stockMode:current?.variants.find(i=>i.id===v.id)?.stockMode||"unlimited",stock:current?.variants.find(i=>i.id===v.id)?.stock||0})),
            stock: current?.stock || 0,
            stockMode: current?.stockMode || "unlimited",
          };
        })
        .filter((p) => p.available),
    });
  });
  router.post(I+"/quote",async(req,res)=>{const i=authorize(req,"orders.create");res.status(201).json({mode:"simulator",quote:await quoteOrder(i.scope,req.body,i.actor)});});
  router.post(I + "/orders", async (req, res) => {
    const i = authorize(req, "orders.create");
    const input = orderInputSchema.parse(req.body);
    const order = await locked(i.scope, (c, b) =>
      createOrder(c, b, i.scope, input, i.actor, null, "zidi"),
    );
    res
      .status(201)
      .json({
        mode: "simulator",
        order: {
          id: order.id,
          reference: order.reference,
          status: order.status,
          paymentStatus: order.paymentStatus,
          total: order.total,
          pricing:order.pricing?{subtotal:order.pricing.subtotal,discount:order.pricing.discount,serviceCharge:order.pricing.serviceCharge,tax:order.pricing.tax,total:order.pricing.total,lines:order.pricing.lines,policyVersion:order.pricing.policyVersion}:null,
          items: order.items,
          version: order.version,
        },
      });
  });
  router.get(I + "/orders/:id", async (req, res) => {
    const i = authorize(req, "orders.read");
    const order = await find(db, i.scope, "order", req.params.id);
    if (order.source !== "zidi" || order.integrationCredentialId !== i.actor.id)
      throw fail("Order not found.", 404);
    res.json({
      mode: "simulator",
      order: {
        id: order.id,
        reference: order.reference,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        paid: order.paid,
        items: order.items,
        version: order.version,
      },
    });
  });
  router.post(I + "/reservations", async (req, res) => {
    const i = authorize(req, "reservations.create");
    const input = reservationInputSchema.parse(req.body);
    const value = await locked(i.scope, (c, b) =>
      reservation(c, b, i.scope, input, i.actor, null),
    );
    res
      .status(201)
      .json({
        mode: "simulator",
        reservation: {
          id: value.id,
          status: value.status,
          startsAt: value.startsAt,
          endsAt: value.endsAt,
          partySize: value.partySize,
          depositRequired: value.depositRequired,
          depositAmount: value.depositAmount,
        },
      });
  });
  router.post(I + "/orders/:id/payments", async () => {
    throw fail(
      "An integration cannot confirm customer payment. Provider verification is not configured.",
      503,
      "PROVIDER_BLOCKED",
    );
  });
}
