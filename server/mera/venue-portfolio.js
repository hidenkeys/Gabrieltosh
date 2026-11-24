// Synthetic portfolio only. IDs are stable within this private namespace.
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  TYPE_DEFAULTS,
  LOCATION_COLORS,
  capabilitiesToLegacyModes,
} from "../../shared/mera-venues.js";
import {
  productInputSchema,
  rolePermissions,
  proposedPolicy,
} from "../../shared/mera-contracts.js";
import { ledgerPostings } from "./domain.js";
import { claimOrganizationSlug } from "./organization-aliases.js";
export function portfolioId(key) {
  const h = createHash("sha256")
    .update(`mera:synthetic:portfolio-v1:${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const VENUE_PORTFOLIO = [
  ["kerbside-grill", "Kerbside Grill", "quick_service", ["SUR", "LKI", "IKJ"]],
  ["oak-ember", "Oak & Ember", "casual_dining", ["GDN", "TER"]],
  ["saffron-room", "Saffron Room", "reservation_restaurant", ["SRM"]],
  ["velvet-lounge", "Velvet Lounge", "lounge", ["VLT"]],
  ["pulse", "Pulse", "club", ["VIP"]],
  [
    "harbour-hotel",
    "Harbour Hotel F&B",
    "hotel_fb",
    ["RST", "POL", "LNG", "CST"],
  ],
  ["daybreak-afterdark", "Daybreak / Afterdark", "cafe", ["DAY"]],
];
export function buildVenuePortfolio({ now = new Date(), days = 14 } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 366)
    throw new Error("Invalid synthetic history length.");
  const anchor = new Date(typeof now === "function" ? now() : now);
  if (!Number.isFinite(+anchor)) throw new Error("Invalid portfolio date.");
  return VENUE_PORTFOLIO.map(([slug, name, type, codes]) => {
    const id = portfolioId(slug),
      records = [],
      users = [],
      branches = [];
    const add = (b, kind, key, data) => {
      const row = {
        id: portfolioId(`${slug}:${b.code}:${kind}:${key}`),
        organization_id: id,
        branch_id: b.id,
        kind,
        data,
      };
      row.data = { ...data, id: row.id };
      records.push(row);
      return row.data;
    };
    const roles = [
      "owner",
      "branch_manager",
      "cashier",
      "waiter",
      "kitchen",
      "bar",
      "front_desk",
      "stock_controller",
      "area_manager",
      "finance",
      "central_stock",
    ];
    for (const role of roles)
      users.push({
        id: portfolioId(`${slug}:user:${role}`),
        name: `${name} fictional ${role}`,
        username: `${slug}.${role}@example.test`,
        role,
      });
    const owner = users[0].id;
    for (const [i, code] of codes.entries()) {
      const defaults = TYPE_DEFAULTS[type],
        stockRoom = code === "CST";
      const caps = [
        ...defaults.capabilities,
        ...(type === "cafe"
          ? ["table_service", "open_tabs", "minimum_spend"]
          : []),
      ];
      const b = {
        id: portfolioId(`${slug}:${code}`),
        code,
        name: stockRoom ? "Central store" : `${name} ${code}`,
        timezone: "Africa/Lagos",
        cutoff: defaults.cutoff,
        settings: {
          venueType: type,
          capabilities: caps,
          code,
          colorTag: LOCATION_COLORS[i],
          role: stockRoom ? "stock_room" : "outlet",
          serviceModes: capabilitiesToLegacyModes(caps),
          serviceHours: defaults.hours,
          version: 1,
          address: "Fictional demo location, Example district",
          launchState: stockRoom ? "draft" : "published",
          orderingPaused: stockRoom,
          showSoldOut: true,
          holdMinutes: 10,
          manualPaymentMethods: ["cash", "external_pos", "external_transfer"],
          launchAcknowledged: !stockRoom,
          publicContact: `hello.${slug}@example.test`,
          capacity: 60,
          payLater: caps.includes("open_tabs"),
          reservationsEnabled: caps.includes("reservations"),
          syntheticPortfolio: "portfolio-v1",
        },
      };
      if (caps.includes("deposits"))
        b.settings.depositPolicy = {
          enabled: true,
          approved: true,
          amount: 500000,
          cancellationCutoffHours: 24,
          refundRule: "refundable_before_cutoff",
          version: 1,
        };
      if (caps.includes("minimum_spend"))
        b.settings.minimumSpendPolicy = {
          enabled: true,
          approved: true,
          amount: 2000000,
          basis: "net_paid_bill",
          shortfallTreatment: "manager_review",
          disclosure: "Synthetic minimum spend of NGN 20,000 per table.",
          version: portfolioId(`${b.id}:minimum-spend-policy`),
        };
      branches.push(b);
      const category = add(b, "category", "food", {
        name: "Food & drinks",
        parentId: null,
        sortOrder: 0,
        active: true,
        version: 1,
      });
      const single = (code, name, price, station = "kitchen") =>
        add(b, "product", code, {
          ...productInputSchema.parse({
            code,
            name,
            category: category.name,
            price,
            unitCost: Math.round(price * 0.4),
            stockMode: "counted",
            stock: stockRoom ? 500 : 80 + i * 11,
            station,
          }),
          categoryId: category.id,
          categoryPath: [
            {
              id: category.id,
              name: category.name,
              parentId: null,
              sortOrder: 0,
            },
          ],
        });
      const bottles = ["club", "lounge"].includes(type);
      const main = single(
        "MAIN",
        bottles
          ? "Premium bottle"
          : type === "cafe"
            ? "Breakfast toast"
            : "Grilled main",
        bottles ? 18000000 : 450000 + (code === "LKI" ? 50000 : 0),
      );
      const side = single("SIDE", "Crisp side", 150000),
        drink = single("DRINK", "House mixer", 100000, "bar");
      add(b, "product", "PACK", {
        ...productInputSchema.parse({
          code: "PACK",
          name: bottles
            ? "Bottle service: 1 premium bottle + 6 mixers, serves 6"
            : "Sharing platter: main + sides + drinks, serves 6",
          category: category.name,
          price: 20000000,
          kind: "package",
          serves: 6,
          requiresTable: bottles,
          components: [
            { productId: main.id, quantity: 1 },
            { productId: drink.id, quantity: 6 },
          ],
        }),
        categoryId: category.id,
      });
      add(b, "product", "COMBO", {
        ...productInputSchema.parse({
          code: "COMBO",
          name: "Main + side + drink",
          category: category.name,
          price: 650000,
          kind: "combo",
          choiceGroups: [main, side, drink].map((p, j) => ({
            id: `choice${j}`,
            name: ["Main", "Side", "Drink"][j],
            min: 1,
            max: 1,
            options: [{ productId: p.id, priceDelta: 0 }],
          })),
        }),
        categoryId: category.id,
      });
      if (type === "club")
        b.settings.entryProductId = single(
          "ENTRY",
          "Club entry",
          3000000,
          "bar",
        ).id;
      b.products = records
        .filter((r) => r.branch_id === b.id && r.kind === "product")
        .map((r) => r.data);
      b.settings.publishedCategories = [category];
      if (stockRoom) continue;
      const table = caps.includes("table_service")
        ? add(b, "table", "one", {
            name: type === "club" ? "VIP 1" : "Table 1",
            capacity: 6,
            zone: type === "club" ? "VIP" : "Main",
            x: 10,
            y: 10,
            status: "available",
            version: 1,
          })
        : null;
      for (let day = 0; day < days; day++) {
        const date = new Date(+anchor - day * 86400000);
        date.setUTCHours(type === "club" ? 1 : 15, 0, 0, 0);
        const at = date.toISOString();
        const shift = add(b, "shift", day, {
          openingFloat: 100000,
          status: day === 0 ? "open" : "closed",
          openedBy: owner,
          closedBy: day === 0 ? null : owner,
          createdAt: at,
          closedAt: day === 0 ? null : at,
        });
        const visit = table
          ? add(b, "visit", day, {
              tableId: table.id,
              tableIds: [table.id],
              tableName: table.name,
              displayName: "Example Party",
              guestIds: [],
              partySize: 4,
              status:
                day === 0 && caps.includes("open_tabs") ? "open" : "closed",
              createdAt: at,
              closedAt: day === 0 ? null : at,
              openedBy: owner,
              version: 1,
              minimumSpendPolicy: b.settings.minimumSpendPolicy || null,
            })
          : null;
        const amount = main.price,
          refund = day === 3 ? 100000 : 0,
          method = [
            "cash",
            "external_pos",
            "external_transfer",
            ...(type === "hotel_fb" ? ["room_charge"] : []),
          ][day % (type === "hotel_fb" ? 4 : 3)];
        const order = add(b, "order", day, {
          requestKey: portfolioId(`${b.id}:order:${day}`),
          reference: `DEMO-${code}-${day + 1}`,
          items: [
            {
              productId: main.id,
              name: main.name,
              quantity: 1,
              unitPrice: amount,
              total: amount,
              station: main.station,
              modifiers: [],
              orderLineId: portfolioId(`${b.id}:line:${day}`),
            },
          ],
          subtotal: amount,
          total: amount,
          recognitionTotal: amount,
          pricing: {
            subtotal: amount,
            total: amount,
            tax: 0,
            discount: 0,
            serviceCharge: 0,
            lines: [],
          },
          paid: amount,
          refunded: refund,
          paymentStatus: refund ? "partially_refunded" : "paid",
          status: "collected",
          displayName: "Example Guest",
          note: "Synthetic demo order",
          menuVersion: 1,
          guestId: null,
          staffCreatorId: owner,
          holdExpired: false,
          payLaterAllowed: caps.includes("open_tabs"),
          fulfillment: table ? "table_service" : "counter_pickup",
          visitId: visit?.id || null,
          source: "staff",
          stockHeld: false,
          version: 1,
          createdAt: at,
          collectedAt: at,
          history: [{ action: "collected", actorId: owner, at }],
          shiftId: shift.id,
        });
        const payment = add(b, "payment", day, {
          requestKey: portfolioId(`${b.id}:pay:${day}`),
          orderId: order.id,
          method,
          amount,
          reference:
            method === "room_charge" ? "204 Example" : "Synthetic receipt",
          recordedBy: owner,
          source: "staff_verified",
          fee: 0,
          createdAt: at,
        });
        add(b, "ledger", `sale${day}`, {
          orderId: order.id,
          postings: [
            { account: "merchant_receivable", debit: amount, credit: 0 },
            { account: "merchant_sales", debit: 0, credit: amount },
          ],
          createdAt: at,
        });
        add(b, "ledger", `pay${day}`, {
          paymentId: payment.id,
          postings: ledgerPostings(amount, method, false, true),
          createdAt: at,
        });
        const bill = add(b, "bill", day, {
          visitId: visit?.id || null,
          name: order.reference,
          status: visit?.status === "open" ? "open" : "closed",
          charges: [
            {
              id: portfolioId(`${order.id}:charge`),
              orderId: order.id,
              lineIndex: 0,
              quantity: 1,
              unitPrice: amount,
              amount,
              name: main.name,
            },
            ...(refund
              ? [
                  {
                    id: portfolioId(`${order.id}:return`),
                    orderId: order.id,
                    amount: -refund,
                    name: "Synthetic return",
                  },
                ]
              : []),
          ],
          allocations: [
            {
              paymentId: payment.id,
              orderId: order.id,
              amount: amount - refund,
            },
          ],
          total: amount - refund,
          paid: amount - refund,
          balance: 0,
          createdAt: at,
        });
        if (visit) {
          visit.billId = bill.id;
          if (visit.status === "open") table.status = "occupied";
        }
        if (refund) {
          const r = add(b, "refund", day, {
            orderId: order.id,
            amount: refund,
            taxAmount: 0,
            method,
            reason: "Synthetic return",
            approvedBy: owner,
            source: "manual_return_record",
            createdAt: at,
          });
          add(b, "ledger", `refund${day}`, {
            refundId: r.id,
            postings: ledgerPostings(refund, method, true, true),
            createdAt: at,
          });
        }
        if (caps.includes("reservations")) {
          const reservation = add(b, "reservation", day, {
            requestKey: portfolioId(`${b.id}:booking:${day}`),
            displayName: "Example Guest",
            contact: "guest@example.test",
            notes: "Synthetic reservation",
            partySize: 4,
            tableId: table?.id,
            startsAt: at,
            endsAt: new Date(+date + 3600000).toISOString(),
            status:
              day === 2 ? "no-show" : day === 4 ? "cancelled" : "confirmed",
            depositAmount: b.settings.depositPolicy?.amount || 0,
            depositRequired: b.settings.depositPolicy?.amount || 0,
            depositPolicy: b.settings.depositPolicy || null,
            createdBy: owner,
            createdAt: at,
            version: 1,
          });
          if (reservation.depositAmount) {
            const deposit = add(b, "deposit", day, {
              reservationId: reservation.id,
              amount: reservation.depositAmount,
              method: "external_transfer",
              reference: "Synthetic deposit",
              recordedBy: owner,
              createdAt: at,
            });
            add(b, "ledger", `deposit${day}`, {
              depositId: deposit.id,
              postings: [
                {
                  account: "collections_external_transfer",
                  debit: deposit.amount,
                  credit: 0,
                },
                {
                  account: "reservation_liability",
                  debit: 0,
                  credit: deposit.amount,
                },
              ],
              createdAt: at,
            });
          }
        }
        if (caps.includes("guest_list"))
          add(b, "guest_list_entry", day, {
            requestKey: portfolioId(`${b.id}:guest:${day}`),
            tradingDate: new Date(+date - 420 * 60000)
              .toISOString()
              .slice(0, 10),
            name: "Example Party",
            partySize: 6,
            host: "Fictional Host",
            contact: "guest@example.test",
            status: day === 0 ? "expected" : "arrived",
            arrivedCount: day === 0 ? 0 : 6,
            coverCharge: 3000000,
            createdBy: owner,
            updatedAt: at,
            version: 1,
          });
      }
    }
    if (codes.length > 1) {
      const b = branches[0],
        items = b.products.map((p) => ({
          ...p,
          components: p.components.map((ref) => ({
            ...ref,
            productCode: b.products.find((x) => x.id === ref.productId).code,
          })),
          choiceGroups: p.choiceGroups.map((g) => ({
            ...g,
            options: g.options.map((ref) => ({
              ...ref,
              productCode: b.products.find((x) => x.id === ref.productId).code,
            })),
          })),
        }));
      const shared = add(b, "shared_menu", "shared", {
        name: `${name} shared menu`,
        items,
        version: 1,
        updatedAt: anchor.toISOString(),
        updatedBy: owner,
      });
      for (const branch of branches)
        branch.settings.sharedMenu = {
          menuId: shared.id,
          version: 1,
          overrides:
            branch.code === "LKI" ? [{ code: "MAIN", price: 500000 }] : [],
          appliedAt: anchor.toISOString(),
        };
    }
    const central = branches.find((b) => b.code === "CST");
    if (central)
      for (const [i, status] of ["sent", "received"].entries()) {
        const target = branches[i];
        add(central, "stock_transfer", i, {
          requestKey: portfolioId(`${id}:transfer:${i}`),
          fromBranchId: central.id,
          toBranchId: target.id,
          status,
          lines: [
            {
              code: "DRINK",
              variantName: null,
              name: "House mixer",
              quantity: 10,
              unitCost: 40000,
              receivedQuantity: status === "received" ? 10 : null,
            },
          ],
          note: "Synthetic stock delivery",
          sentBy: owner,
          sentAt: anchor.toISOString(),
          receivedBy: status === "received" ? owner : null,
          receivedAt: status === "received" ? anchor.toISOString() : null,
          cancelledAt: null,
          cancelledBy: null,
          version: 1,
        });
        const source = central.products.find((p) => p.code === "DRINK");
        source.stock -= 10;
        add(central, "stock_movement", i, {
          productId: source.id,
          type: "transfer_out",
          reason: "transfer_out",
          delta: -10,
          before: source.stock + 10,
          after: source.stock,
          actorId: owner,
          quantity: -10,
          createdAt: anchor.toISOString(),
        });
        if (status === "received") {
          const p = target.products.find((p) => p.code === "DRINK");
          p.stock += 10;
          add(target, "stock_movement", "received", {
            productId: p.id,
            type: "transfer_in",
            reason: "transfer_in",
            delta: 10,
            before: p.stock - 10,
            after: p.stock,
            actorId: owner,
            quantity: 10,
            createdAt: anchor.toISOString(),
          });
        }
      }
    return {
      id,
      slug,
      name,
      users,
      branches,
      records,
      operating: {
        locationCount: codes.length > 1 ? "few" : "one",
        menuMode: codes.length > 1 ? "shared" : "per_location",
        inventoryMode: central ? "central" : "per_location",
        defaultVenueType: type,
        centralStockBranchId: central?.id || null,
        version: 1,
      },
    };
  });
}
export async function seedVenuePortfolio(
  db,
  { passwordFor, now, days = 14 } = {},
) {
  if (typeof passwordFor !== "function")
    throw new Error("A private password provider is required.");
  return db.transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(631830202)");
    const counts = {
      organizations: 0,
      skipped: 0,
      users: 0,
      branches: 0,
      records: 0,
    };
    for (const org of buildVenuePortfolio({ now, days })) {
      if (
        (
          await c.query("SELECT id FROM mera_organizations WHERE slug=$1", [
            org.slug,
          ])
        ).rows.length
      ) {
        counts.skipped++;
        continue;
      }
      await c.query(
        "INSERT INTO mera_organizations(id,name,slug,branding,onboarding,policy,subscription,operating) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          org.id,
          org.name,
          org.slug,
          JSON.stringify({
            description: "Fictional portfolio. No real service or payments.",
          }),
          JSON.stringify({
            status: "published",
            syntheticPortfolio: "portfolio-v1",
          }),
          JSON.stringify(proposedPolicy),
          JSON.stringify({
            status: "active",
            billingEnabled: false,
            includedBranchIds: org.branches
              .filter((b) => b.code !== "CST")
              .map((b) => b.id),
          }),
          JSON.stringify(org.operating),
        ],
      );
      await claimOrganizationSlug(c, org.id, org.slug);
      for (const b of org.branches)
        await c.query(
          "INSERT INTO mera_branches(id,organization_id,name,timezone,cutoff,settings,menu_version,published_menu) VALUES($1,$2,$3,$4,$5,$6,1,$7)",
          [
            b.id,
            org.id,
            b.name,
            b.timezone,
            b.cutoff,
            JSON.stringify(b.settings),
            JSON.stringify(b.code === "CST" ? [] : b.products),
          ],
        );
      for (const u of org.users) {
        const password = await passwordFor(u);
        if (typeof password !== "string" || password.length < 16)
          throw new Error(
            "Portfolio passwords require at least 16 characters.",
          );
        await c.query(
          "INSERT INTO users(id,name,username,password_hash,role) VALUES($1,$2,$3,$4,'cashier')",
          [u.id, u.name, u.username, await bcrypt.hash(password, 12)],
        );
        const wide = ["owner", "finance"].includes(u.role),
          ids = wide
            ? []
            : u.role === "area_manager"
              ? org.branches.slice(0, 2).map((b) => b.id)
              : u.role === "central_stock"
                ? org.branches.map((b) => b.id)
                : [org.branches[0].id];
        const branchRoles =
          u.role === "branch_manager" && org.slug === "kerbside-grill"
            ? {
                [org.branches[0].id]: {
                  role: "branch_manager",
                  permissions: rolePermissions.branch_manager,
                },
                [org.branches[1].id]: {
                  role: "cashier",
                  permissions: rolePermissions.cashier,
                },
              }
            : {};
        await c.query(
          "INSERT INTO mera_memberships(id,user_id,organization_id,role,permissions,branch_ids,organization_wide,branch_roles) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            portfolioId(`${u.id}:membership`),
            u.id,
            org.id,
            u.role,
            JSON.stringify(rolePermissions[u.role]),
            JSON.stringify(ids),
            wide,
            JSON.stringify(branchRoles),
          ],
        );
        counts.users++;
      }
      for (const r of org.records)
        await c.query(
          "INSERT INTO mera_records(id,organization_id,branch_id,kind,data,created_at) VALUES($1,$2,$3,$4,$5,$6)",
          [
            r.id,
            org.id,
            r.branch_id,
            r.kind,
            JSON.stringify(r.data),
            r.data.createdAt ||
              r.data.updatedAt ||
              new Date(
                typeof now === "function" ? now() : now || Date.now(),
              ).toISOString(),
          ],
        );
      counts.organizations++;
      counts.branches += org.branches.length;
      counts.records += org.records.length;
    }
    return counts;
  });
}
