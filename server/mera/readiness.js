import { allowedCurrencies } from "../../shared/mera-money.js";
import { validPublicContact } from "./public-contact.js";
import { z } from "zod";
import { subscriptionEntitlement } from "./subscriptions.js";
const B = "/organizations/:organizationId/branches/:branchId";
const error = (message, status = 409) =>
  Object.assign(new Error(message), { status });
const demo = () =>
  process.env.MERA_DEMO === "true" && process.env.NODE_ENV !== "production";
export function mountMeraReadiness(
  router,
  { db, guard, scope, locked, readRecords, event },
) {
  async function inspect(c, s, b) {
    const org = (
      await c.query("SELECT * FROM mera_organizations WHERE id=$1", [
        s.organizationId,
      ])
    ).rows[0];
    const owner = (
      await c.query(
        "SELECT m.user_id FROM mera_memberships m JOIN mera_owner_identities i ON i.user_id=m.user_id WHERE m.organization_id=$1 AND m.active=true AND m.role='owner' AND i.verified_at IS NOT NULL AND i.verification_mode='provider' LIMIT 1",
        [s.organizationId],
      )
    ).rows[0];
    const templates = await readRecords(
      c,
      s.organizationId,
      s.branchId,
      "template",
    );
    let validTimezone = true;
    try {
      new Intl.DateTimeFormat("en", { timeZone: b.timezone }).format();
    } catch {
      validTimezone = false;
    }
    const entitlements = subscriptionEntitlement(
      org.subscription,
      org.subscription?.approvedPolicySnapshot || org.policy,
      Date.now(),
      demo(),
    );
    const checks = [
      {
        id: "subscription_access",
        label: "Subscription access reviewed",
        ready: entitlements.newOrdersAllowed,
        detail: entitlements.warning,
      },
      {
        id: "owner_identity",
        label: "Verified owner identity",
        ready: !!owner || demo(),
        detail: demo()
          ? "Development owner exception; real verification is still required for launch."
          : "An active owner must complete verified contact registration.",
      },
      {
        id: "identity",
        label: "Organization and branch details",
        ready: !!org.name && !!org.slug && !!b.name,
      },
      {
        id: "timezone",
        label: "Trading timezone and currency",
        ready: validTimezone && allowedCurrencies.includes(b.currency),
      },
      {
        id: "contacts",
        label: "Customer contact details",
        ready: [org.branding?.contact, org.branding?.phone, org.branding?.email,
          b.settings?.contact, b.settings?.phone, b.settings?.publicContact].some(validPublicContact),
      },
      {
        id: "menu",
        label: "Published menu snapshot",
        ready:
          b.menu_version > 0 &&
          Array.isArray(b.published_menu) &&
          b.published_menu.length > 0,
      },
      {
        id: "printing",
        label: "Receipt and sticker layouts",
        ready: templates.length > 0,
        detail:
          "Layout configuration does not establish physical printer output.",
      },
      {
        id: "manual_branch_policy",
        label: "Manual payment methods reviewed",
        ready:
          Array.isArray(b.settings?.manualPaymentMethods) &&
          b.settings.manualPaymentMethods.length > 0,
      },
    ];
    return {
      checks: checks.map((c) => ({
        ...c,
        status: c.ready ? "ready" : "blocked",
      })),
      canPublish: checks.every((c) => c.ready),
      launchState: b.settings?.launchState || "draft",
      paymentProviderState: "blocked",
      simulation: demo(),
      policyDisclosure: {
        status: org.policy?.status || "proposed",
        liveBillingEnabled: false,
      },
      publicHostingVerified: false,
    };
  }
  router.get(
    B + "/readiness",
    guard("organization.manage"),
    async (req, res) => {
      const s = scope(req),
        b = (
          await db.query(
            "SELECT * FROM mera_branches WHERE id=$1 AND organization_id=$2",
            [s.branchId, s.organizationId],
          )
        ).rows[0];
      res.json(await inspect(db, s, b));
    },
  );
  router.patch(
    B + "/launch-policy",
    guard("organization.manage"),
    async (req, res) => {
      const input = z
        .object({
          manualPaymentMethods: z
            .array(z.enum(["cash", "external_pos", "external_transfer"]))
            .max(3)
            .refine((v) => new Set(v).size === v.length),
          launchAcknowledged: z.literal(true).optional(),
          publicContact: z.string().trim().max(160).refine(validPublicContact, "Enter a valid customer phone number or email.").optional(),
        })
        .strict()
        .parse(req.body);
      const result = await locked(scope(req), async (c, b) => {
        const settings = { ...b.settings, ...input };
        await c.query(
          "UPDATE mera_branches SET settings=$1 WHERE id=$2 AND organization_id=$3",
          [JSON.stringify(settings), b.id, b.organization_id],
        );
        await event(c, scope(req), "launch_policy_reviewed", req.user, input);
        return inspect(c, scope(req), { ...b, settings });
      });
      res.json(result);
    },
  );
  router.post(B + "/launch", guard("organization.manage"), async (req, res) => {
    z.object({ confirm: z.literal(true) })
      .strict()
      .parse(req.body);
    res.json(
      await locked(scope(req), async (c, b) => {
        if(b.settings.role==="stock_room")throw error("Stock rooms cannot go live.");
        const readiness = await inspect(c, scope(req), b);
        if (!readiness.canPublish)
          throw error(
            "Complete the blocked readiness checks before publishing this branch.",
          );
        const settings = {
          ...b.settings,
          launchState: "published",
          publishedAt: new Date().toISOString(),
          // New locations start with ordering paused; going live is when customers can order.
          orderingPaused: false,
        };
        await c.query(
          "UPDATE mera_branches SET settings=$1 WHERE id=$2 AND organization_id=$3",
          [JSON.stringify(settings), b.id, b.organization_id],
        );
        await c.query(
          "UPDATE mera_organizations SET onboarding=jsonb_set(onboarding,'{status}','\"published\"') WHERE id=$1",
          [b.organization_id],
        );
        await event(c, scope(req), "branch_published", req.user, {
          mode: "manual_payments",
          providerState: "blocked",
        });
        return {
          ...readiness,
          launchState: "published",
          publicHostingVerified: false,
        };
      }),
    );
  });
}
