import { z } from "zod";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { projectStaffOrder } from "./projection.js";
const fail = (message, code = "QUERY_INVALID") =>
  Object.assign(new Error(message), { status: 409, code });
const scopeWhere = "organization_id=$1 AND branch_id=$2";
const historical = "COALESCE(data->>'historicalReadOnly','false')='true'";
const created = "data->>'createdAt'";
async function boundedRows(db, sql, args, count = 2000, bytes = 16777216) {
  const budget = (
    await db.query(
      `WITH bounded AS (${sql}) SELECT COUNT(*)::int AS count,COALESCE(SUM(octet_length(data::text)),0)::text AS bytes FROM bounded`,
      args,
    )
  ).rows[0];
  if (budget.count > count || Number(budget.bytes) > bytes)
    throw fail(
      "This live queue exceeds its safe tablet snapshot budget. Use paginated history or request capacity review.",
      "SNAPSHOT_CAPACITY",
    );
  return (await db.query(sql, args)).rows;
}
export async function migrateMeraQueries(db) {
  await db.query(
    await readFile(new URL("./queries-schema.sql", import.meta.url), "utf8"),
  );
}
const recognition = `COALESCE(data->>'historicalRecognitionAt',data->>'collectedAt',data->>'completedAt',jsonb_path_query_first(data,'$.history[*] ? (@.action == "collected" || @.action == "completed")')->>'at')`;
const pageInput = z
  .object({
    take: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(2000).optional(),
    q: z.string().trim().max(120).optional(),
    status: z
      .enum([
        "submitted",
        "accepted",
        "preparing",
        "ready",
        "collected",
        "completed",
        "rejected",
        "cancelled",
      ])
      .optional(),
    source: z
      .string()
      .regex(/^[a-z_]{1,40}$/)
      .optional(),
    paymentStatus: z
      .enum([
        "unpaid",
        "pending",
        "partially_paid",
        "paid",
        "partially_refunded",
        "refunded",
        "failed",
        "expired",
      ])
      .optional(),
    staffId: z.string().uuid().optional(),
    unassigned: z.enum(["true", "false"]).optional(),
    historical: z.enum(["only", "exclude", "all"]).default("exclude"),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "The date range is reversed.",
  );
const cursorInput = z
  .object({
    organizationId: z.string(),
    branchId: z.string(),
    signature: z.string(),
    at: z.string().datetime(),
    id: z.string().uuid(),
  })
  .strict();
export function normalizeOrderPage(input) {
  return pageInput.parse(input);
}
export async function queryOrderPage(db, s, input, permissions = []) {
  const values = pageInput.parse(input),
    { cursor, ...filters } = values,
    signature = createHash("sha256")
      .update(JSON.stringify(filters))
      .digest("hex");
  const args = [s.organizationId, s.branchId],
    where = [scopeWhere, "kind='order'"];
  const bind = (value) => {
    args.push(value);
    return "$" + args.length;
  };
  if (values.historical !== "all")
    where.push(
      values.historical === "only" ? historical : `NOT (${historical})`,
    );
  for (const field of ["status", "source", "paymentStatus"])
    if (values[field]) where.push(`data->>'${field}'=${bind(values[field])}`);
  if (values.staffId) {
    const p = bind(values.staffId);
    where.push(`(data->>'handlerId'=${p} OR data->>'staffCreatorId'=${p})`);
  }
  if (values.unassigned === "true")
    where.push("NULLIF(data->>'handlerId','') IS NULL");
  if (values.q) {
    const p = bind("%" + values.q.replace(/[\\%_]/g, "\\$&") + "%");
    where.push(
      `(COALESCE(data->>'reference','')||' '||COALESCE(data->>'displayName','')||' '||COALESCE(data->>'note','')) ILIKE ${p} ESCAPE '\\'`,
    );
  }
  if (values.from)
    where.push(`(${created})>=${bind(new Date(values.from).toISOString())}`);
  if (values.to)
    where.push(`(${created})<${bind(new Date(values.to).toISOString())}`);
  if (cursor) {
    let decoded;
    try {
      decoded = cursorInput.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw fail("This history cursor is invalid. Start from the first page.");
    }
    if (
      decoded.organizationId !== s.organizationId ||
      decoded.branchId !== s.branchId ||
      decoded.signature !== signature
    )
      throw fail(
        "History scope or filters changed. Start from the first page.",
      );
    where.push(`((${created}),id)<(${bind(decoded.at)},${bind(decoded.id)})`);
  }
  const rows = (
    await db.query(
      `SELECT id,data FROM mera_records WHERE ${where.join(" AND ")} ORDER BY (${created}) DESC,id DESC LIMIT ${bind(values.take + 1)}`,
      args,
    )
  ).rows;
  const hasMore = rows.length > values.take,
    selected = rows.slice(0, values.take),
    last = selected.at(-1);
  return {
    orders: selected.map((r) => projectStaffOrder(r.data, permissions)),
    hasMore,
    nextCursor: hasMore
      ? Buffer.from(
          JSON.stringify({
            organizationId: s.organizationId,
            branchId: s.branchId,
            signature,
            at: last.data.createdAt,
            id: last.id,
          }),
        ).toString("base64url")
      : null,
    pageSize: values.take,
  };
}
export async function tradingDayWindow(db, b, date) {
  const value = z
    .string()
    .date()
    .refine((v) => v >= "1900-01-01" && v <= "2999-12-31")
    .parse(date);
  const row = (
    await db.query(
      "SELECT (($1::date::timestamp + $2::int*INTERVAL '1 minute') AT TIME ZONE $3) AS starts_at, ((($1::date+1)::timestamp + $2::int*INTERVAL '1 minute') AT TIME ZONE $3) AS ends_at",
      [value, b.cutoff, b.timezone],
    )
  ).rows[0];
  return {
    from: new Date(row.starts_at).toISOString(),
    to: new Date(row.ends_at).toISOString(),
  };
}
export async function loadBranchReportRecords(db, s, b, date) {
  const { from, to } = await tradingDayWindow(db, b, date),
    args = [s.organizationId, s.branchId, from, to];
  const condition = `${scopeWhere} AND kind='order' AND (((${created}) >= $3 AND (${created}) < $4) OR ((${recognition}) >= $3 AND (${recognition}) < $4) OR id IN (SELECT data->>'orderId' FROM mera_records WHERE ${scopeWhere} AND kind='refund' AND (${created}) >= $3 AND (${created}) < $4))`;
  const budget = (
    await db.query(
      `SELECT COUNT(*)::int AS count,COALESCE(SUM(octet_length(data::text)),0)::text AS bytes FROM mera_records WHERE ${condition}`,
      args,
    )
  ).rows[0];
  if (budget.count > 50000 || Number(budget.bytes) > 67108864)
    throw fail(
      "This trading day exceeds the current report memory budget. Request a capacity review.",
      "REPORT_CAPACITY",
    );
  const orders = (
    await db.query(`SELECT * FROM mera_records WHERE ${condition}`, args)
  ).rows;
  const events = (
    await db.query(
      `SELECT * FROM mera_records WHERE ${scopeWhere} AND kind IN ('payment','refund','deposit','writeoff','deposit_refund','deposit_forfeiture') AND (((${created}) >= $3 AND (${created}) < $4) OR (kind='refund' AND data->>'orderId'=ANY($5::text[]))) LIMIT 50001`,
      [...args, orders.map((r) => r.id)],
    )
  ).rows;
  if (events.length > 50000)
    throw fail(
      "This trading day exceeds the current report record budget. Request a capacity review.",
      "REPORT_CAPACITY",
    );
  const balance = (
    await db.query(
      `SELECT COALESCE(SUM((p->>'credit')::numeric-(p->>'debit')::numeric),0)::text AS amount FROM mera_records r CROSS JOIN LATERAL jsonb_array_elements(r.data->'postings') p WHERE r.organization_id=$1 AND r.branch_id=$2 AND r.kind='ledger' AND r.data->>'createdAt'<$3 AND p->>'account'='reservation_liability'`,
      [s.organizationId, s.branchId, to],
    )
  ).rows[0];
  const reservationLiabilityAsOf = Number(balance.amount);
  if (!Number.isSafeInteger(reservationLiabilityAsOf))
    throw fail(
      "The reservation liability total requires accounting review.",
      "REPORT_CAPACITY",
    );
  return {
    reportRecords: [...orders, ...events],
    reservationLiabilityAsOf,
    window: { from, to },
  };
}
export async function loadWorkspaceSnapshot(
  db,
  s,
  b,
  date,
  { includeReport = false } = {},
) {
  const catalogKinds = ["product", "category", "table", "template"];
  const budget = (
    await db.query(
      `SELECT COUNT(*)::int AS count,COALESCE(SUM(octet_length(data::text)),0)::text AS bytes FROM mera_records WHERE ${scopeWhere} AND kind=ANY($3::text[])`,
      [s.organizationId, s.branchId, catalogKinds],
    )
  ).rows[0];
  if (budget.count > 5000 || Number(budget.bytes) > 8388608)
    throw fail(
      "This branch catalog exceeds the supported live snapshot size. Request a capacity review.",
      "SNAPSHOT_CAPACITY",
    );
  const catalog = (
    await db.query(
      `SELECT * FROM mera_records WHERE ${scopeWhere} AND kind=ANY($3::text[]) ORDER BY created_at,id`,
      [s.organizationId, s.branchId, catalogKinds],
    )
  ).rows;
  const now = new Date().toISOString(),
    active = `NOT (${historical}) AND COALESCE(data->>'holdExpired','false')<>'true' AND COALESCE(data->>'paymentStatus','')<>'expired' AND NOT (data->>'stockHeld'='true' AND data->>'holdExpiresAt'<$3) AND (data->>'status' IN ('submitted','accepted','preparing','ready') OR (data->>'status'='collected' AND (data->>'total')::numeric-(data->>'paid')::numeric+COALESCE((data->>'cancellationRefundApplied')::numeric,0)-COALESCE((data->>'writtenOff')::numeric,0)>0))`;
  const orders = await boundedRows(
    db,
    `SELECT * FROM mera_records WHERE ${scopeWhere} AND kind='order' AND ((${active}) OR id IN (SELECT id FROM mera_records WHERE ${scopeWhere} AND kind='order' AND NOT (${historical}) ORDER BY (${created}) DESC,id DESC LIMIT 200)) ORDER BY (${created}) DESC,id DESC LIMIT 1001`,
    [s.organizationId, s.branchId, now],
    1000,
  );
  if (orders.length > 1000)
    throw fail(
      "The live order queue needs review before it can fit safely on a tablet. Use the paginated order history.",
      "SNAPSHOT_CAPACITY",
    );
  const visits = await boundedRows(
    db,
    `SELECT * FROM mera_records WHERE ${scopeWhere} AND kind='visit' AND (data->>'status'='open' OR id IN (SELECT id FROM mera_records WHERE ${scopeWhere} AND kind='visit' ORDER BY created_at DESC LIMIT 100)) ORDER BY created_at DESC LIMIT 1001`,
    [s.organizationId, s.branchId],
    1000,
    8388608,
  );
  if (visits.length > 1000)
    throw fail(
      "Too many open visits require operational review.",
      "SNAPSHOT_CAPACITY",
    );
  const visitIds = visits
      .filter((r) => r.data.status === "open")
      .map((r) => r.id),
    orderIds = orders.map((r) => r.id);
  const bills = await boundedRows(
    db,
    `SELECT * FROM mera_records WHERE ${scopeWhere} AND kind='bill' AND (data->>'visitId'=ANY($3::text[]) OR EXISTS(SELECT 1 FROM jsonb_array_elements(data->'charges') l WHERE l->>'orderId'=ANY($4::text[])) OR id IN (SELECT id FROM mera_records WHERE ${scopeWhere} AND kind='bill' ORDER BY created_at DESC LIMIT 100)) ORDER BY created_at DESC LIMIT 2001`,
    [s.organizationId, s.branchId, visitIds, orderIds],
    2000,
  );
  if (bills.length > 2000)
    throw fail(
      "The active bill queue requires capacity review.",
      "SNAPSHOT_CAPACITY",
    );
  const dependencies = new Set([
    ...orderIds,
    ...bills.flatMap((r) =>
      r.data.charges.map((l) => l.orderId).filter(Boolean),
    ),
  ]);
  if (dependencies.size > 2000)
    throw fail(
      "Active bill order links require capacity review.",
      "SNAPSHOT_CAPACITY",
    );
  const linkedOrders = await boundedRows(
    db,
    `SELECT * FROM mera_records WHERE ${scopeWhere} AND kind='order' AND id=ANY($3::text[])`,
    [s.organizationId, s.branchId, [...dependencies]],
    2000,
  );
  const activeReservationIds = (
    await db.query(
      `SELECT data->>'reservationId' AS id FROM mera_records WHERE ${scopeWhere} AND kind='deposit' AND ((COALESCE(data->>'allocated','false')<>'true' AND (data->>'amount')::numeric-COALESCE((data->>'refunded')::numeric,0)-COALESCE((data->>'forfeited')::numeric,0)>0) OR id=ANY($3::text[]))`,
      [
        s.organizationId,
        s.branchId,
        bills.flatMap((r) =>
          (r.data.allocations || [])
            .filter((a) => a.orderId === null && a.amount > 0)
            .map((a) => a.paymentId),
        ),
      ],
    )
  ).rows.map((r) => r.id);
  const otherKinds = [
    "ticket",
    "reservation",
    "shift",
    "payment",
    "refund",
    "deposit",
    "item_cancellation",
    "complaint",
    "audit",
    "writeoff",
    "deposit_refund",
    "deposit_forfeiture",
  ];
  const other = await boundedRows(
    db,
    `WITH recent AS (SELECT r.* FROM unnest($3::text[]) AS keys(kind) CROSS JOIN LATERAL (SELECT m.* FROM mera_records m WHERE m.organization_id=$1 AND m.branch_id=$2 AND m.kind=keys.kind ORDER BY m.created_at DESC,m.id DESC LIMIT 100) r), active AS (SELECT * FROM mera_records WHERE ${scopeWhere} AND kind=ANY($3::text[]) AND data->>'orderId'=ANY($4::text[]) UNION SELECT * FROM mera_records WHERE ${scopeWhere} AND kind='reservation' AND (id=ANY($5::text[]) OR (data->>'status' IN ('requested','confirmed','arrived','seated') AND data->>'endsAt'>=$6)) UNION SELECT * FROM mera_records WHERE ${scopeWhere} AND kind='deposit' AND data->>'reservationId'=ANY($5::text[]) UNION SELECT * FROM mera_records WHERE ${scopeWhere} AND kind='shift' AND data->>'status' IN ('open','pending_approval')) SELECT * FROM recent UNION SELECT * FROM active LIMIT 5001`,
    [
      s.organizationId,
      s.branchId,
      otherKinds,
      [...dependencies],
      activeReservationIds,
      now,
    ],
    5000,
    16777216,
  );
  if (other.length > 5000)
    throw fail(
      "The active operational queue requires capacity review.",
      "SNAPSHOT_CAPACITY",
    );
  const unique = new Map(
    [...catalog, ...linkedOrders, ...visits, ...bills, ...other].map((r) => [
      r.id,
      r,
    ]),
  );
  const reportData = includeReport
    ? await loadBranchReportRecords(db, s, b, date)
    : { reportRecords: [], reservationLiabilityAsOf: null };
  return {
    records: [...unique.values()].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
        a.id.localeCompare(b.id),
    ),
    ...reportData,
    history: {
      liveOrders: linkedOrders.length,
      recentOrderLimit: 200,
      historyEndpoint: "/orders",
      bounded: true,
    },
  };
}
export function mountMeraQueries(router, { db, guard, scope }) {
  const B = "/organizations/:organizationId/branches/:branchId";
  router.get(B + "/orders", guard("orders.view"), async (req, res) =>
    res.json(
      await queryOrderPage(
        db,
        scope(req),
        req.query,
        req.meraMembership.permissions,
      ),
    ),
  );
  router.get(B + "/orders/:id", guard("orders.view"), async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      s = scope(req),
      row = (
        await db.query(
          `SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND branch_id=$3 AND kind='order'`,
          [id, s.organizationId, s.branchId],
        )
      ).rows[0];
    if (!row) return res.status(404).json({ error: "Order not found." });
    res.json(projectStaffOrder(row.data, req.meraMembership.permissions));
  });
}
