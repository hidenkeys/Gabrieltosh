// Fixture-only import evidence. This is deliberately not an HTTP or production cutover API.
import { createHash } from "node:crypto";
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status, code: "LEGACY_IMPORT_BLOCKED" });
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const legacyPayloadHash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value)))))
    .digest("hex");
export function legacyRecordId(scope, kind, sourceId) {
  const hex = legacyPayloadHash({ scope, kind, sourceId })
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = "8";
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
const money = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw fail(`Invalid integer minor amount: ${name}.`);
  return value;
};
const instant = (value, name) => {
  if (!value || !Number.isFinite(Date.parse(value)))
    throw fail(`Historical ${name} evidence is required.`);
  return new Date(value).toISOString();
};
const method = (value) => {
  const mapping = {
    cash: "cash",
    card: "external_pos",
    transfer: "external_transfer",
  };
  if (!mapping[value]) throw fail("Historical payment method is unresolved.");
  return mapping[value];
};
export function planLegacyImport({
  organizationId,
  branchId,
  batchId,
  payload,
  recognitionPolicy,
}) {
  if (recognitionPolicy !== "legacy_paid_basis")
    throw fail(
      "Explicit legacy_paid_basis is required; fulfilled_only remains unsupported.",
    );
  if (
    !organizationId ||
    !branchId ||
    !batchId ||
    !Array.isArray(payload?.orders) ||
    !Array.isArray(payload?.refunds) ||
    !Array.isArray(payload?.audits)
  )
    throw fail("A complete fixture batch and explicit scope are required.");
  const scope = { organizationId, branchId },
    batchRecordId = legacyRecordId(scope, "import_batch", batchId),
    hash = legacyPayloadHash({ payload, recognitionPolicy }),
    records = [];
  const orders = new Map(),
    refundTotals = new Map();
  for (const refund of payload.refunds)
    refundTotals.set(
      refund.order_id,
      (refundTotals.get(refund.order_id) || 0) + money(refund.amount, "refund"),
    );
  const add = (kind, sourceId, data) => {
    const id = legacyRecordId(scope, kind, sourceId);
    records.push({
      id,
      kind,
      data: {
        ...data,
        id,
        historicalReadOnly: true,
        importBatchId: batchRecordId,
        sourceSystem: "bing-chun-pos",
        sourceId,
      },
    });
    return id;
  };
  const ledger = (sourceId, amount, debit, credit, at, links) => {
    if (amount)
      add("ledger", sourceId, {
        ...links,
        createdAt: at,
        historicalRecognitionBasis: recognitionPolicy,
        postings: [
          { account: debit, debit: amount, credit: 0 },
          { account: credit, debit: 0, credit: amount },
        ],
      });
  };
  for (const original of payload.orders) {
    if (orders.has(original.id) || !original.id)
      throw fail("Duplicate or missing source order identity.");
    const snapshot = JSON.parse(JSON.stringify(original));
    const createdAt = instant(original.created_at, "order timestamp");
    const subtotal = money(original.subtotal, "subtotal"),
      discount = money(original.discount ?? 0, "discount"),
      total = money(original.total, "order total");
    if (subtotal - discount !== total)
      throw fail("Historical subtotal, discount and total do not reconcile.");
    if (!Array.isArray(original.items) || !original.items.length)
      throw fail("Historical item snapshots are required.");
    let itemSum = 0;
    const items = original.items.map((line, index) => {
      if (
        !Number.isSafeInteger(line.quantity) ||
        line.quantity < 1 ||
        !line.name
      )
        throw fail("Historical item quantity and name are required.");
      const unit = money(line.unitPrice, "item unit price"),
        lineTotal = money(line.lineTotal, "item total");
      if (unit * line.quantity !== lineTotal)
        throw fail("Historical item totals do not reconcile.");
      itemSum += lineTotal;
      return {
        ...line,
        orderLineId: legacyRecordId(
          scope,
          "order_line",
          original.id + ":" + index,
        ),
        total: lineTotal,
        legacySnapshot: line,
        modifiers: (line.toppings || []).map((t) => ({ ...t })),
        station: line.station || "legacy_unassigned",
      };
    });
    if (itemSum !== subtotal)
      throw fail("Historical item sum does not match subtotal.");
    const paid = !!original.paid_at;
    if (
      !["unpaid", "paid", "refunded"].includes(original.payment_status) ||
      paid === (original.payment_status === "unpaid")
    )
      throw fail("Historical payment evidence and status conflict.");
    const refunded = refundTotals.get(original.id) || 0;
    if (refunded > total || refunded !== (original.refund_amount || 0))
      throw fail("Historical refund totals do not reconcile.");
    if (original.payment_status === "refunded" && refunded !== total)
      throw fail("Refunded status requires evidenced full refund.");
    const paidAt = paid ? instant(original.paid_at, "paid timestamp") : null;
    const recognizedAt = paidAt;
    const orderId = add("order", original.id, {
      reference: "LEGACY-" + original.number,
      legacyStatus: original.status,
      status:
        original.payment_status === "refunded"
          ? "cancelled"
          : original.status === "pending"
            ? "submitted"
            : "accepted",
      paymentStatus: original.payment_status,
      displayName: "Historical counter customer",
      guestId: null,
      items,
      subtotal,
      discount,
      total,
      paid: paid ? total : 0,
      refunded,
      version: 1,
      stockHeld: false,
      stockMode: "historical_no_stock_effect",
      history: [],
      createdAt,
      updatedAt: instant(
        original.updated_at || original.created_at,
        "update timestamp",
      ),
      handlerId: original.staff_id,
      handlerName: original.staff_name,
      note: original.note || "",
      legacySnapshot: snapshot,
      historicalRecognitionBasis: recognitionPolicy,
      historicalRecognitionAt: recognizedAt,
      recognitionTotal: recognizedAt ? total : undefined,
      historicalTaxStatus: "unresolved_source_tax_breakdown",
      historicalReadOnly: true,
    });
    orders.set(original.id, { orderId, paid, recognizedAt, total });
    add("audit", "order-snapshot:" + original.id, {
      action: "legacy_order_imported",
      orderId,
      sourceSnapshot: snapshot,
      sourceSha256: legacyPayloadHash(snapshot),
      recognitionPolicy,
      createdAt,
    });
    if (paid) {
      const paymentMethod = method(original.payment_method);
      const paymentId = add("payment", original.id, {
        orderId,
        amount: total,
        method: paymentMethod,
        recordedBy: original.paid_by,
        recordedByName: original.paid_by_name,
        createdAt: paidAt,
        source: "legacy_evidenced_collection",
        historicalRecognitionBasis: recognitionPolicy,
      });
      ledger(
        "payment:" + original.id,
        total,
        "collections_" + paymentMethod,
        "merchant_sales",
        paidAt,
        { orderId, paymentId },
      );
    }
  }
  for (const original of payload.refunds) {
    const order = orders.get(original.order_id);
    if (!order?.paid)
      throw fail("Refund must reference an evidenced imported paid order.");
    const at = instant(original.created_at, "refund timestamp"),
      paymentMethod = method(original.method);
    const refundId = add("refund", original.id, {
      orderId: order.orderId,
      amount: original.amount,
      method: paymentMethod,
      reason: original.reason,
      approvedByName: original.staff_name,
      createdAt: at,
      legacySnapshot: original,
      historicalRecognitionBasis: recognitionPolicy,
    });
    ledger(
      "refund:" + original.id,
      original.amount,
      order.recognizedAt ? "sales_returns" : "customer_collections_liability",
      "collections_" + paymentMethod,
      at,
      { orderId: order.orderId, refundId },
    );
  }
  for (const audit of payload.audits) {
    if (!orders.has(audit.order_id))
      throw fail("Source audit references an order outside this batch.");
    add("audit", "source:" + audit.id, {
      action: "legacy_source_audit",
      orderId: orders.get(audit.order_id).orderId,
      sourceSnapshot: audit,
      createdAt: instant(audit.created_at, "audit timestamp"),
    });
  }
  if (new Set(records.map((r) => r.id)).size !== records.length)
    throw fail("Duplicate source record identity.");
  const payments = records.filter((r) => r.kind === "payment"),
    refunds = records.filter((r) => r.kind === "refund");
  const summary = {
    orders: orders.size,
    payments: payments.length,
    refunds: refunds.length,
    grossMinorUnits: payments.reduce((n, r) => n + r.data.amount, 0),
    refundMinorUnits: refunds.reduce((n, r) => n + r.data.amount, 0),
    recognitionBasis: recognitionPolicy,
    operationalReadOnly: true,
    taxBreakdown: "unresolved",
    productionCutoverApproved: false,
  };
  summary.netMinorUnits = summary.grossMinorUnits - summary.refundMinorUnits;
  return { batchRecordId, hash, records, summary };
}
export async function importLegacyFixture(options) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.MERA_LEGACY_IMPORT_FIXTURE !== "true"
  )
    throw fail(
      "Fixture-only historical import requires explicit non-production opt-in.",
    );
  if (
    Object.keys(options).some(
      (key) =>
        ![
          "db",
          "organizationId",
          "branchId",
          "batchId",
          "payload",
          "recognitionPolicy",
        ].includes(key),
    )
  )
    throw fail(
      "Importer accepts no database URLs or caller connection overrides.",
    );
  const { db, organizationId, branchId } = options;
  const target = (
    await db.query(
      "SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port",
    )
  ).rows[0];
  if (
    !/^mera_fixture_import_[a-f0-9]+$/.test(target?.name) ||
    !["127.0.0.1", "::1"].includes(target.address) ||
    target.port !== 55444
  )
    throw fail(
      "Importer requires its own isolated fixture database on loopback port 55444.",
    );
  const plan = planLegacyImport(options);
  return db.transaction(async (c) => {
    const branch = await c.query(
      "SELECT id FROM mera_branches WHERE organization_id=$1 AND id=$2 FOR UPDATE",
      [organizationId, branchId],
    );
    if (!branch.rows.length) throw fail("Import branch not found.", 404);
    const prior = (
      await c.query(
        "SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND branch_id=$3 AND kind='import_batch'",
        [plan.batchRecordId, organizationId, branchId],
      )
    ).rows[0]?.data;
    if (prior) {
      if (prior.payloadHash !== plan.hash)
        throw fail(
          "This import batch was already used for changed source data.",
        );
      return { ...prior.summary, replayed: true };
    }
    if (
      (
        await c.query("SELECT id FROM mera_records WHERE id=ANY($1::text[])", [
          plan.records.map((r) => r.id),
        ])
      ).rows.length
    )
      throw fail("Source records overlap a previous import batch.");
    for (const row of [
      ...plan.records,
      {
        id: plan.batchRecordId,
        kind: "import_batch",
        data: {
          id: plan.batchRecordId,
          payloadHash: plan.hash,
          summary: plan.summary,
          historicalReadOnly: true,
        },
      },
    ])
      await c.query(
        "INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,$4,$5)",
        [row.id, organizationId, branchId, row.kind, JSON.stringify(row.data)],
      );
    return { ...plan.summary, replayed: false };
  });
}
