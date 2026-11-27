import { minimumSpendSnapshot } from "./minimum-spend.js";
import { effectiveCapabilities } from "../../shared/mera-venues.js";
import { availabilityWindowSchema } from "../../shared/mera-contracts.js";
import { allowedCurrencies } from "../../shared/mera-money.js";
import { validPublicContact } from "./public-contact.js";
import { z } from "zod";
import { billingEnabled, subscriptionEntitlement } from "./subscriptions.js";
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
    const settings = b.settings || {};
    const caps = effectiveCapabilities(settings);
    const records = async (kind) =>
      (await readRecords(c, s.organizationId, s.branchId, kind)).map(
        (r) => r.data,
      );
    const tables =
      caps.includes("table_service") || caps.includes("room_charge")
        ? await records("table")
        : [];
    const codes = caps.includes("table_service")
      ? await records("qr_code")
      : [];
    const activeTables = tables.filter(
      (t) => t.active !== false && t.status !== "unavailable",
    );
    const hoursReady =
      Array.isArray(settings.serviceHours) &&
      settings.serviceHours.length > 0 &&
      settings.serviceHours.every(
        (w) => availabilityWindowSchema.safeParse(w).success,
      );
    const capabilityChecks = [];
    const add = (cap, label, ready, detail, fixTarget) => {
      if (caps.includes(cap))
        capabilityChecks.push({
          id: cap,
          label,
          ready: !!ready,
          detail,
          fixTarget,
        });
    };
    add(
      "table_service",
      "Tables and table QR codes",
      activeTables.some((t) =>
        codes.some(
          (q) => q.active !== false && q.kind === "table" && q.tableId === t.id,
        ),
      ),
      "Create an active table and its table QR code in Tables before going live.",
      "tables",
    );
    add(
      "reservations",
      "Reservation capacity and hours",
      settings.reservationsEnabled === true &&
        Number.isInteger(settings.capacity) &&
        settings.capacity > 0 &&
        hoursReady,
      "Enable reservations and set guest capacity and service hours in location settings.",
      "operations",
    );
    add(
      "deposits",
      "Booking deposit policy",
      settings.depositPolicy?.approved === true &&
        settings.depositPolicy?.enabled === true &&
        Number.isSafeInteger(settings.depositPolicy?.amount) &&
        settings.depositPolicy.amount > 0 &&
        ["refundable_before_cutoff", "non_refundable"].includes(
          settings.depositPolicy.refundRule,
        ),
      "Review and approve the booking deposit amount and refund rules.",
      "deposits",
    );
    let minimumReady = false;
    if (caps.includes("minimum_spend")) {
      try {
        minimumReady = !!minimumSpendSnapshot(b);
      } catch {
        /* The checklist offers the policy editor instead of failing the request. */
      }
    }
    add(
      "minimum_spend",
      "Minimum spend policy",
      minimumReady,
      "Review and approve the minimum spend amount and guest terms.",
      "minimum-spend",
    );
    if (caps.includes("guest_list")) {
      const entries = await records("guest_list_entry");
      add(
        "guest_list",
        "Door and guest list",
        entries.some((e) => !e.deleted) ||
          settings.guestListWalkInsOnly === true,
        "Add a guest list entry at the door, or explicitly choose walk-ins only in location settings.",
        "door",
      );
    }
    add(
      "room_charge",
      "Rooms for room service",
      activeTables.some((t) => t.zone?.trim().toLowerCase() === "rooms"),
      "Create a room such as Room 204 in the Rooms zone in Tables, then create its table QR code.",
      "tables",
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
        id: "service_hours",
        label: "Service hours",
        ready: hoursReady,
        detail: "Set the days and times this location serves guests.",
        fixTarget: "operations",
      },
      ...capabilityChecks,
      ...(billingEnabled()
        ? [
            {
              id: "subscription_access",
              label: "Subscription access reviewed",
              ready: entitlements.newOrdersAllowed,
              detail: entitlements.warning,
            },
          ]
        : []),
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
        ready: [
          org.branding?.contact,
          org.branding?.phone,
          org.branding?.email,
          b.settings?.contact,
          b.settings?.phone,
          b.settings?.publicContact,
        ].some(validPublicContact),
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
        ready: true,
        detail:
          "Standard receipt and sticker layouts are applied automatically. You can customise them later.",
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
      billingEnabled: billingEnabled(),
      checks: checks.map((c) => ({
        ...c,
        detail:
          c.detail ||
          {
            identity: "Set the business and location names.",
            timezone: "Choose a valid timezone and supported currency.",
            contacts: "Add a customer phone number or email.",
            menu: "Publish a menu with at least one item.",
            manual_branch_policy:
              "Choose the manual payment methods staff can record.",
          }[c.id] ||
          "Review this setting before going live.",
        fixTarget:
          c.fixTarget ||
          {
            owner_identity: "account",
            identity: "business",
            timezone: "operations",
            contacts: "business",
            menu: "menu",
            printing: "printing",
            manual_branch_policy: "payments",
            subscription_access: "billing",
          }[c.id],
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
          publicContact: z
            .string()
            .trim()
            .max(160)
            .refine(
              validPublicContact,
              "Enter a valid customer phone number or email.",
            )
            .optional(),
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
        if (b.settings.role === "stock_room")
          throw error("Stock rooms cannot go live.");
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
