import { z } from "zod";
import { report, tradingDate, fail } from "./domain.js";
import { canSeeBranch } from "./venue-access.js";
import {
  deriveVenueType,
  defaultLocationCode,
  effectiveCapabilities,
} from "../../shared/mera-venues.js";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid date.",
  );
export function overviewRange(branch, preset, instant) {
  const to = tradingDate(instant, branch.timezone, branch.cutoff);
  const day = new Date(to + "T12:00:00Z");
  if (preset === "yesterday") day.setUTCDate(day.getUTCDate() - 1);
  if (preset === "this_week")
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  if (preset === "this_month") day.setUTCDate(1);
  const from = day.toISOString().slice(0, 10);
  return { from, to: preset === "yesterday" ? from : to };
}
export function buildOverview(
  branches,
  records,
  selection,
  instant = new Date().toISOString(),
) {
  const totals = {
      revenue: 0,
      orders: 0,
      averageOrder: 0,
      refunds: 0,
      roomCharges: 0,
      covers: 0,
      reservations: 0,
      noShows: 0,
    },
    mix = new Map(),
    lowStock = [],
    valueByBranch = [];
  const inRange = (value, b, range) =>
    value &&
    tradingDate(value, b.timezone, b.cutoff) >= range.from &&
    tradingDate(value, b.timezone, b.cutoff) <= range.to;
  const views = [];
  for (const b of branches) {
    const range = selection.preset
      ? overviewRange(b, selection.preset, instant)
      : selection;
    const rows = records.filter((r) => r.branch_id === b.id),
      products = rows.filter((r) => r.kind === "product").map((r) => r.data);
    const counted = products.flatMap((p) => [
      ...(p.stockMode === "counted" ? [p] : []),
      ...(p.variants || [])
        .filter((v) => v.stockMode === "counted")
        .map((v) => ({
          ...v,
          unitCost: v.unitCost === undefined ? p.unitCost : v.unitCost,
          name: `${p.name} — ${v.name}`,
          id: p.id,
        })),
    ]);
    valueByBranch.push({
      branchId: b.id,
      value: counted.some((p) => p.unitCost == null)
        ? null
        : counted.reduce((n, p) => n + p.stock * p.unitCost, 0),
    });
    for (const p of counted)
      if (p.stock <= (p.lowStockThreshold ?? p.threshold ?? 5))
        lowStock.push({
          branchId: b.id,
          productId: p.id,
          name: p.name,
          stock: p.stock,
          threshold: p.lowStockThreshold ?? p.threshold ?? 5,
        });
    if (b.settings?.role === "stock_room") continue;
    let revenue = 0,
      orders = 0,
      refunds = 0;
    for (
      let day = range.from;
      day <= range.to;
      day = new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10)
    ) {
      const daily = report(rows, b, day);
      revenue += daily.netSales;
      orders += daily.orders;
      refunds += daily.refunds;
    }
    const data = (kind) =>
        rows.filter((r) => r.kind === kind).map((r) => r.data),
      selected = (kind) =>
        data(kind).filter((r) => inRange(r.createdAt, b, range));
    const payments = [...selected("payment"), ...selected("deposit")];
    for (const p of payments)
      mix.set(p.method, (mix.get(p.method) || 0) + p.amount);
    totals.revenue += revenue;
    totals.orders += orders;
    totals.refunds += refunds;
    totals.roomCharges += payments
      .filter((p) => p.method === "room_charge")
      .reduce((n, p) => n + p.amount, 0);
    const reservations = data("reservation").filter((r) =>
      inRange(r.startsAt || r.createdAt, b, range),
    );
    totals.reservations += reservations.length;
    totals.noShows += reservations.filter((r) => r.status === "no-show").length;
    totals.covers += data("guest_list_entry")
      .filter(
        (r) =>
          !r.deleted &&
          r.tradingDate >= range.from &&
          r.tradingDate <= range.to,
      )
      .reduce((n, r) => n + (r.arrivedCount || 0), 0);
    views.push({
      id: b.id,
      currency: b.currency || "NGN",
      name: b.name,
      code: b.settings?.code || defaultLocationCode(b.name),
      colorTag: b.settings?.colorTag || "forest",
      venueType: deriveVenueType(b.settings),
      capabilities: effectiveCapabilities(b.settings),
      range,
      revenue,
      orders,
      averageOrder: orders ? Math.round(revenue / orders) : 0,
      refunds,
      openVisits: data("visit").filter((v) => v.status === "open").length,
      onShift: data("shift").filter((s) => s.status === "open").length,
    });
  }
  totals.averageOrder = totals.orders
    ? Math.round(totals.revenue / totals.orders)
    : 0;
  const visible = new Set(branches.map((b) => b.id));
  return {
    range: selection,
    currency: new Set(views.map(b => b.currency)).size > 1 ? null : views[0]?.currency || "NGN",
    totals,
    paymentMix: [...mix].map(([method, amount]) => ({ method, amount })),
    branches: views,
    stock: {
      lowStock,
      valueByBranch,
      inTransit: records
        .filter(
          (r) =>
            r.kind === "stock_transfer" &&
            r.data.status === "sent" &&
            (visible.has(r.data.fromBranchId) ||
              visible.has(r.data.toBranchId)),
        )
        .map((r) => r.data),
    },
  };
}
export function mountMeraOverview(
  router,
  { db, guard, now = () => new Date().toISOString() },
) {
  router.get(
    "/organizations/:organizationId/overview",
    guard("organization.overview"),
    async (req, res) => {
      const query = z
        .object({
          from: date.optional(),
          to: date.optional(),
          preset: z
            .enum(["today", "yesterday", "this_week", "this_month"])
            .optional(),
          branchIds: z.string().max(10000).optional(),
        })
        .strict()
        .refine(
          (v) =>
            v.preset
              ? !v.from && !v.to
              : !!v.from &&
                !!v.to &&
                v.from <= v.to &&
                Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000,
          "Choose a range of up to 367 days.",
        )
        .parse(req.query);
      const all = (
        await db.query(
          "SELECT * FROM mera_branches WHERE organization_id=$1 ORDER BY name,id",
          [req.params.organizationId],
        )
      ).rows;
      const requested = query.branchIds?.split(",").filter(Boolean);
      if (
        requested?.some(
          (id) =>
            !all.some(
              (b) => b.id === id && canSeeBranch(req.meraMembership, id),
            ),
        )
      )
        throw fail(
          "You do not have access to these locations.",
          403,
          "FORBIDDEN",
        );
      const branches = all.filter(
        (b) =>
          canSeeBranch(req.meraMembership, b.id) &&
          (!requested || requested.includes(b.id)),
      );
      const records = (
        await db.query(
          "SELECT * FROM mera_records WHERE organization_id=$1 AND (branch_id = ANY($2::text[]) OR (kind='stock_transfer' AND data->>'toBranchId' = ANY($2::text[])))",
          [req.params.organizationId, branches.map((b) => b.id)],
        )
      ).rows;
      res.json(
        buildOverview(
          branches,
          records,
          query.preset
            ? { preset: query.preset }
            : { from: query.from, to: query.to },
          now(),
        ),
      );
    },
  );
}
