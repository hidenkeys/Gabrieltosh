import { proposedPolicy } from "../../shared/mera-contracts.js";
export const fail = (message, status = 400, code = "INVALID_REQUEST") =>
  Object.assign(new Error(message), { status, code });
export const providers = {
  rubies: {
    state: "blocked",
    reason:
      "Verified Rubies agreement, credentials, webhook contract and wallet/settlement approval required.",
  },
  get zidi() {
    return {
      state:
        process.env.NODE_ENV === "production" ||
        process.env.MERA_DEMO !== "true"
          ? "blocked"
          : "simulator",
      reason: "Actual Zidi credentials and signed API/event contract required.",
    };
  },
  email: {
    state: "blocked",
    reason: "Email delivery provider and sending authorization required.",
  },
  printing: {
    state: "browser",
    reason:
      "Physical receipt/sticker calibration required; submission does not prove output.",
  },
};
export function assertMoney(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 100000000000)
    throw fail("Invalid amount.");
  return n;
}
export function availableNow(windows, timezone="Africa/Lagos", at=new Date()) {
  if(!windows?.length) return true;
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:timezone,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(at).map(p=>[p.type,p.value]));
  const day=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(parts.weekday), time=parts.hour+":"+parts.minute;
  return windows.some(w=>w.days.includes(day)&&time>=w.start&&time<w.end);
}
export function quote(items, products) {
  const result = items.map((line) => {
    const p = products.find((p) => p.id === line.productId);
    if (!p || !p.available)
      throw fail("A selected item is unavailable.", 409, "MENU_CHANGED");
    if (p.stockMode === "counted" && p.stock < line.quantity)
      throw fail("Not enough stock.", 409, "OUT_OF_STOCK");
    let unit = p.price;
    let variant = null;
    if (p.variants.length) {
      variant = p.variants.find((v) => v.id === line.variantId);
      if (!variant) throw fail("Select a valid product size.");
      if(variant.stockMode==="counted" && variant.stock<line.quantity) throw fail("Not enough stock for this size.",409,"OUT_OF_STOCK");
      unit = variant.price;
    } else if (line.variantId) throw fail("Invalid size.");
    const selected = new Set(line.modifiers);
    if (selected.size !== line.modifiers.length)
      throw fail("Duplicate modifiers.");
    const modifiers = [];
    for (const group of p.modifierGroups) {
      const chosen = group.options.filter((o) => selected.has(o.id));
      if (chosen.length < group.min || chosen.length > group.max)
        throw fail(
          `Choose ${group.min}–${group.max} options for ${group.name}.`,
        );
      for (const option of chosen) {
        modifiers.push({
          id: option.id,
          name: option.name,
          price: option.price,
        });
        unit += option.price;
        selected.delete(option.id);
      }
    }
    if (selected.size) throw fail("Unknown modifier.");
    assertMoney(unit);
    return {
      productId: p.id,
      variantId: variant?.id || null,
      code: p.code,
      categoryId:p.categoryId||null,
      category:p.category,
      categoryPath:p.categoryPath||[],
      name: p.name,
      size: variant?.name || p.size,
      quantity: line.quantity,
      unitPrice: unit,
      total: assertMoney(unit * line.quantity),
      modifiers,
      station: p.station,
    };
  });
  return {
    items: result,
    total: assertMoney(result.reduce((n, i) => n + i.total, 0)),
  };
}
export const transitions = {
  submitted: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready"],
  ready: ["collected"],
  collected: ["completed"],
  completed: [],
  rejected: [],
  cancelled: [],
};
export function transition(order, next, { payLater = false } = {}) {
  if (!transitions[order.status]?.includes(next))
    throw fail(
      "That order transition is not allowed.",
      409,
      "INVALID_TRANSITION",
    );
  if (
    ["preparing", "ready", "collected", "completed"].includes(next) &&
    !payLater &&
    paidForBill(order) < order.total
  )
    throw fail(
      "Payment must be confirmed before preparation.",
      409,
      "PAYMENT_REQUIRED",
    );
  if (next === "completed" && paidForBill(order) < order.total)
    throw fail("The outstanding bill must be settled.", 409);
  if (["cancelled", "rejected"].includes(next) && order.paid > order.refunded)
    throw fail("Refund the payment before cancelling.", 409);
  return next;
}
export const paidForBill = order => order.paid-(order.cancellationRefundApplied||0);
export function paymentStatus(order) {
  if (order.refunded === order.paid && order.refunded > 0) return "refunded";
  if (order.cancellationRefundApplied && paidForBill(order)>=order.total) return "paid";
  if (order.refunded > 0) return "partially_refunded";
  if (order.paid >= order.total) return "paid";
  if (order.paid > 0) return "partially_paid";
  return "unpaid";
}
export function ledgerPostings(
  amount,
  method,
  refund = false,
  recognized = false,
) {
  assertMoney(amount);
  const debit = refund
      ? recognized
        ? "sales_returns"
        : "customer_collections_liability"
      : `collections_${method}`,
    credit = refund
      ? `collections_${method}`
      : recognized
        ? "merchant_receivable"
        : "customer_collections_liability";
  return [
    { account: debit, debit: amount, credit: 0 },
    { account: credit, debit: 0, credit: amount },
  ];
}
export function integratedFee(amount, origin, policy = proposedPolicy) {
  assertMoney(amount);
  if (origin !== "mera_integrated") return 0;
  if (
    !policy.liveBillingEnabled ||
    !policy.feeBasis ||
    !policy.feePayer ||
    !policy.refundTreatment
  )
    throw fail("Commercial fee policy is not approved.", 409, "POLICY_BLOCKED");
  return Number(
    (BigInt(amount) * BigInt(policy.integratedFeeBps) + 5000n) / 10000n,
  );
}
export function tradingDate(instant, timezone, cutoff = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const date = new Date(`${v.year}-${v.month}-${v.day}T12:00:00Z`);
  if (Number(v.hour) * 60 + Number(v.minute) < cutoff)
    date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
export function overlaps(a, b) {
  return (
    Date.parse(a.startsAt) < Date.parse(b.endsAt) &&
    Date.parse(b.startsAt) < Date.parse(a.endsAt)
  );
}
export function report(records, branch, date) {
  const day = (instant) => tradingDate(instant, branch.timezone, branch.cutoff);
  const allOrders = records
    .filter((r) => r.kind === "order")
    .map((r) => r.data);
  const recognizedAt = (o) =>
    o.collectedAt ||
    o.completedAt ||
    o.history?.find((h) => h.action === "collected" || h.action === "completed")
      ?.at;
  const orders = allOrders.filter((o) => day(o.createdAt) === date);
  const payments = records
    .filter((r) => ["payment","deposit"].includes(r.kind) && day(r.data.createdAt) === date)
    .map((r) => r.data);
  const refunds = records
    .filter((r) => r.kind === "refund" && day(r.data.createdAt) === date)
    .map((r) => r.data);
  const recognized = allOrders.filter(
    (o) => recognizedAt(o) && day(recognizedAt(o)) === date,
  );
  const grossSales = recognized.reduce((n, o) => n + (o.recognitionTotal??o.total)-(o.recognitionPricing?.tax??o.pricing?.tax??0), 0);
  const salesReturns = records
    .filter((r) => r.kind === "refund")
    .map((r) => r.data)
    .filter((r) => {
      const o = allOrders.find((o) => o.id === r.orderId);
      if (!o || !recognizedAt(o)) return false;
      const instant =
        Date.parse(r.createdAt) > Date.parse(recognizedAt(o))
          ? r.createdAt
          : recognizedAt(o);
      return day(instant) === date;
    })
    .reduce((n, r) => n + r.amount-(r.taxAmount||0), 0);
  return {
    date,
    grossOrderValue: orders
      .filter((o) => !["cancelled", "rejected"].includes(o.status))
      .reduce((n, o) => n + o.total, 0),
    recognitionBasis: "immutable_collected_at",
    grossSales,
    recognizedTax:recognized.reduce((n,o)=>n+(o.recognitionPricing?.tax??o.pricing?.tax??0),0),
    discounts:recognized.reduce((n,o)=>n+(o.recognitionPricing?.discount??o.pricing?.discount??0),0),
    serviceCharges:recognized.reduce((n,o)=>n+(o.recognitionPricing?.serviceCharge??o.pricing?.serviceCharge??0),0),
    deposits:records.filter(r=>r.kind==="deposit" && day(r.data.createdAt)===date).reduce((n,r)=>n+r.data.amount,0),
    collections: payments.reduce((n, p) => n + p.amount, 0),
    refunds: refunds.reduce((n, r) => n + r.amount, 0),
    salesReturns,
    netSales: grossSales - salesReturns,
    outstanding: orders
      .filter((o) => !["cancelled", "rejected"].includes(o.status))
      .reduce((n, o) => n + Math.max(0, o.total - paidForBill(o)), 0),
    orders: orders.length,
    products: recognized.flatMap((o) => o.items),
    paymentMethods: Object.fromEntries(
      ["cash", "external_pos", "external_transfer"].map((m) => [
        m,
        payments
          .filter((p) => p.method === m)
          .reduce((n, p) => n + p.amount, 0),
      ]),
    ),
  };
}
