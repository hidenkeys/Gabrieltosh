import { resolveContents, stockLines } from "./product-kinds.js";
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
export function assertHistoricalWritable(record) {
  if(record?.historicalReadOnly)throw fail("Imported historical records are read-only; use the original system or an explicit reviewed migration correction.",409,"HISTORICAL_READ_ONLY");
  return record;
}
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
export function quote(items, products, {tableContext=false}={}) {
  const result = items.map((line) => {
    const p = products.find((p) => p.id === line.productId);
    if (!p || !p.available)
      throw fail("A selected item is unavailable.", 409, "MENU_CHANGED");
    if (p.stockMode === "counted" && p.stock < line.quantity)
      throw fail("Not enough stock.", 409, "OUT_OF_STOCK");
    if(p.requiresTable&&!tableContext)throw fail("This package requires a current table visit or reservation.",409,"TABLE_REQUIRED");
    const components=resolveContents(p,line.choices||[],products);
    let unit = p.price+components.reduce((n,c)=>n+(c.priceDelta||0),0);
    let variant = null;
    if (p.variants.length) {
      variant = p.variants.find((v) => v.id === line.variantId);
      if (!variant) throw fail("Select a valid product size.");
      if(variant.stockMode==="counted" && variant.stock<line.quantity) throw fail("Not enough stock for this size.",409,"OUT_OF_STOCK");
      unit = variant.price+components.reduce((n,c)=>n+(c.priceDelta||0),0);
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
      kind:p.kind||"single",
      serves:p.serves??null,
      choices:line.choices||[],
      components,
      productId: p.id,
      variantId: variant?.id || null,
      code: p.code,
      categoryId:p.categoryId||null,
      category:p.category,
      categoryPath:p.categoryPath||[],
      allergens:[...(p.allergens||[])],
      dietary:[...(p.dietary||[])],
      name: p.name,
      size: variant?.name || p.size,
      quantity: line.quantity,
      unitPrice: unit,
      total: assertMoney(unit * line.quantity),
      modifiers,
      station: p.station,
    };
  });
  const demand=new Map();
  for(const l of stockLines(result)){const key=l.productId+":"+(l.variantId||"");const old=demand.get(key);demand.set(key,{...l,quantity:(old?.quantity||0)+l.quantity});}
  const totals=new Map();
  for(const l of demand.values()){const p=products.find(p=>p.id===l.productId),v=p?.variants?.find(v=>v.id===l.variantId);totals.set(p.id,(totals.get(p.id)||0)+l.quantity);if(v?.stockMode==="counted"&&v.stock<l.quantity)throw fail("Not enough component stock.",409,"OUT_OF_STOCK");}
  for(const [id,q] of totals){const p=products.find(p=>p.id===id);if(p.stockMode==="counted"&&p.stock<q)throw fail("Not enough component stock.",409,"OUT_OF_STOCK");}
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
  assertHistoricalWritable(order);
  if (!transitions[order.status]?.includes(next))
    throw fail(
      "That order transition is not allowed.",
      409,
      "INVALID_TRANSITION",
    );
  if (
    ["preparing", "ready", "collected", "completed"].includes(next) &&
    !payLater &&
    (next==="completed"?effectiveSettlement(order):paidForBill(order)) < order.total
  )
    throw fail(
      "Payment must be confirmed before preparation.",
      409,
      "PAYMENT_REQUIRED",
    );
  if (next === "completed" && orderBalance(order)>0)
    throw fail("The outstanding bill must be settled.", 409);
  if (["cancelled", "rejected"].includes(next) && order.paid > order.refunded)
    throw fail("Refund the payment before cancelling.", 409);
  return next;
}
export const paidForBill = order => order.paid-(order.cancellationRefundApplied||0);
export const effectiveSettlement=order=>paidForBill(order)+(order.writtenOff||0);
export const orderBalance=order=>Math.max(0,order.total-effectiveSettlement(order));
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
  const day=instant=>tradingDate(instant,branch.timezone,branch.cutoff);
  const data=kind=>records.filter(r=>r.kind===kind).map(r=>r.data);
  const onDay=rows=>rows.filter(r=>r.createdAt&&day(r.createdAt)===date);
  const sum=rows=>rows.reduce((n,r)=>n+r.amount,0);
  const allOrders=data("order"),orderMap=new Map(allOrders.map(o=>[o.id,o]));
  const recognizedAt=o=>(o.historicalReadOnly&&["legacy_paid_basis","fulfilled_only"].includes(o.historicalRecognitionBasis)&&o.historicalRecognitionAt)||o.collectedAt||o.completedAt||o.history?.find(h=>["collected","completed"].includes(h.action))?.at;
  const orders=allOrders.filter(o=>day(o.createdAt)===date);
  const recognized=allOrders.filter(o=>recognizedAt(o)&&day(recognizedAt(o))===date).sort((a,b)=>Date.parse(recognizedAt(a))-Date.parse(recognizedAt(b))||String(a.id||"").localeCompare(String(b.id||"")));
  const payments=onDay([...data("payment"),...data("deposit")]);
  const refunds=onDay([...data("refund"),...data("deposit_refund")]);
  const recognizedRefunds=data("refund").filter(r=>{const o=orderMap.get(r.orderId);if(!o||!recognizedAt(o))return false;return day(Date.parse(r.createdAt)>Date.parse(recognizedAt(o))?r.createdAt:recognizedAt(o))===date;});
  const forfeitures=onDay(data("deposit_forfeiture"));
  const gross=o=>o.recognitionTotal??o.total;
  const tax=o=>o.recognitionPricing?.tax??o.pricing?.tax??0;
  const grossSales=recognized.reduce((n,o)=>n+gross(o),0),salesReturns=sum(recognizedRefunds),netSales=grossSales-salesReturns;
  const historical=recognized.filter(o=>o.historicalReadOnly);
  const unresolvedHistoricalTax=recognized.some(o=>o.historicalTaxStatus==="unresolved_source_tax_breakdown")||recognizedRefunds.some(r=>orderMap.get(r.orderId)?.historicalTaxStatus==="unresolved_source_tax_breakdown");
  const unresolvedOtherTax=forfeitures.some(r=>r.taxAmount===null||r.taxAmount===undefined);
  const knownRecognizedTax=recognized.filter(o=>o.historicalTaxStatus!=="unresolved_source_tax_breakdown").reduce((n,o)=>n+tax(o),0);
  const knownTaxReturns=recognizedRefunds.filter(r=>orderMap.get(r.orderId)?.historicalTaxStatus!=="unresolved_source_tax_breakdown").reduce((n,r)=>n+(r.taxAmount||0),0);
  const knownOtherTax=forfeitures.reduce((n,r)=>n+(r.taxAmount||0),0);
  const nonProductIncome=sum(forfeitures);
  const salesRevenueExTax=unresolvedHistoricalTax?null:netSales-knownRecognizedTax+knownTaxReturns;
  const nonProductIncomeExTax=unresolvedOtherTax?null:nonProductIncome-knownOtherTax;
  const netRevenueExTax=salesRevenueExTax===null||nonProductIncomeExTax===null?null:salesRevenueExTax+nonProductIncomeExTax;
  const netTaxLiability=unresolvedHistoricalTax||unresolvedOtherTax?null:knownRecognizedTax-knownTaxReturns+knownOtherTax;
  const reservationLiability=records.filter(r=>r.kind==="ledger"&&r.data.createdAt&&day(r.data.createdAt)<=date).flatMap(r=>r.data.postings||[]).filter(p=>p.account==="reservation_liability").reduce((n,p)=>n+p.credit-p.debit,0);
  const counts={}; for(const o of orders) counts[o.status||"unknown"]=(counts[o.status||"unknown"]||0)+1;
  const staff=new Map(); let unattributedEvents=0;
  for(const o of allOrders) for(const h of o.history||[]) {
    if(!h.at||day(h.at)!==date) continue;
    const actorType=h.actorType||"unknown", name=typeof h.actorName==="string"&&h.actorName.trim()?h.actorName.trim():null;
    if(!name) unattributedEvents++;
    // Identity is used only to avoid conflating distinct staff sharing a name; never projected.
    const key=JSON.stringify([h.actorId||null,name,actorType]);
    const entry=staff.get(key)||{name,actorType,eventCount:0,actions:{}};
    entry.eventCount++; const action=h.action||"unknown";entry.actions[action]=(entry.actions[action]||0)+1;staff.set(key,entry);
  }
  return {
    metadata:{currency:branch.currency||"NGN",moneyUnit:"kobo",timezone:branch.timezone,cutoffMinutes:branch.cutoff||0},
    orderStates:{basis:"current_state_of_orders_created_on_trading_day",counts,total:orders.length},
    staffActivity:{basis:"recorded_order_history_events_on_trading_day",entries:[...staff.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,entry])=>entry),unattributedEvents},
    platformFees:{status:"unavailable",amount:null,reason:"No authoritative branch-scoped Mera fee assessment records are available in this report."},
    date,grossOrderValue:orders.filter(o=>!["cancelled","rejected"].includes(o.status)).reduce((n,o)=>n+o.total,0),
    recognitionBasis:[...new Set(recognized.map(o=>o.historicalReadOnly?o.historicalRecognitionBasis:"immutable_collected_at"))].sort().join("+")||"immutable_collected_at",
    historicalRecognitionBases:[...new Set(historical.map(o=>o.historicalRecognitionBasis))].sort(),
    historicalTaxStatus:unresolvedHistoricalTax?"unresolved_source_tax_breakdown":null,
    historicalGrossSales:historical.reduce((n,o)=>n+gross(o),0),
    historicalNetSales:historical.reduce((n,o)=>n+gross(o),0)-sum(recognizedRefunds.filter(r=>orderMap.get(r.orderId)?.historicalReadOnly)),
    grossSales,salesReturns,netSales,
    recognizedTax:unresolvedHistoricalTax?null:knownRecognizedTax,
    refundedTax:unresolvedHistoricalTax?null:knownTaxReturns,
    netRevenueExTax,salesRevenueExTax,netTaxLiability,
    taxBreakdownStatus:unresolvedHistoricalTax||unresolvedOtherTax?"unresolved":"recorded",
    nonProductIncome,nonProductIncomeExTax,
    discounts:recognized.reduce((n,o)=>n+(o.recognitionPricing?.discount??o.pricing?.discount??0),0),
    serviceCharges:recognized.reduce((n,o)=>n+(o.recognitionPricing?.serviceCharge??o.pricing?.serviceCharge??0),0),
    deposits:sum(onDay(data("deposit"))),depositReturns:sum(onDay(data("deposit_refund"))),depositForfeitures:nonProductIncome,reservationLiability,
    collections:sum(payments),refunds:sum(refunds),writeOffs:sum(onDay(data("writeoff"))),
    outstanding:orders.filter(o=>!["cancelled","rejected"].includes(o.status)).reduce((n,o)=>n+orderBalance(o),0),
    orders:orders.length,products:recognized.flatMap(o=>o.items),
    paymentMethods:Object.fromEntries(["cash","external_pos","external_transfer"].map(method=>[method,sum(payments.filter(p=>p.method===method))])),
  };
}
