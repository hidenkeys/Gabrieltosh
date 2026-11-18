import test from "node:test";
import assert from "node:assert/strict";
import {
  quote,
  transition,
  ledgerPostings,
  integratedFee,
  tradingDate,
  overlaps,
} from "../server/mera/domain.js";
const p = {
  id: "one",
  name: "Tea",
  code: "T1",
  available: true,
  price: 320000,
  size: "700ml",
  stockMode: "counted",
  stock: 1,
  station: "bar",
  variants: [],
  modifierGroups: [
    {
      id: "sweet",
      name: "Sweetness",
      min: 1,
      max: 1,
      options: [{ id: "half", name: "50%", price: 0 }],
    },
  ],
};
test("Mera server pricing enforces stock and required modifier choices", () => {
  assert.throws(() =>
    quote([{ productId: "one", quantity: 1, modifiers: [] }], [p]),
  );
  assert.throws(() =>
    quote([{ productId: "one", quantity: 2, modifiers: ["half"] }], [p]),
  );
  assert.equal(
    quote([{ productId: "one", quantity: 1, modifiers: ["half"] }], [p]).total,
    320000,
  );
  assert.throws(() =>
    quote(
      [{ productId: "one", quantity: 1, modifiers: ["half", "half"] }],
      [p],
    ),
  );
});
test("Mera order state is independent from printing and paid orders are protected", () => {
  assert.equal(
    transition(
      { status: "accepted", paid: 320000, total: 320000, refunded: 0 },
      "preparing",
    ),
    "preparing",
  );
  assert.throws(() =>
    transition(
      { status: "accepted", paid: 0, total: 320000, refunded: 0 },
      "preparing",
    ),
  );
  assert.throws(() =>
    transition(
      { status: "accepted", paid: 320000, total: 320000, refunded: 0 },
      "cancelled",
    ),
  );
});
test("Mera manual collections incur no integrated fee and live policy stays blocked", () => {
  assert.equal(integratedFee(100000, "external_pos"), 0);
  assert.equal(integratedFee(100000, "cash"), 0);
  assert.throws(() => integratedFee(100000, "mera_integrated"));
  const posts = ledgerPostings(320000, "cash");
  assert.equal(
    posts.reduce((n, p) => n + p.debit - p.credit, 0),
    0,
  );
});
test("Mera cutoff and overlapping reservation boundaries are explicit", () => {
  assert.equal(
    tradingDate("2026-11-18T00:30:00Z", "Africa/Lagos", 240),
    "2026-11-17",
  );
  assert.equal(
    overlaps(
      { startsAt: "2026-11-18T10:00:00Z", endsAt: "2026-11-18T11:00:00Z" },
      { startsAt: "2026-11-18T11:00:00Z", endsAt: "2026-11-18T12:00:00Z" },
    ),
    false,
  );
});

test("Mera sales recognition uses immutable fulfillment time, not order creation or later status", async () => {
  const { report } = await import("../server/mera/domain.js");
  const records = [
    {
      kind: "order",
      data: {
        id: "o1",
        createdAt: "2026-11-17T12:00:00Z",
        collectedAt: "2026-11-18T12:00:00Z",
        completedAt: "2026-11-19T12:00:00Z",
        status: "completed",
        total: 10000,
        paid: 10000,
        items: [{ name: "Tea", quantity: 1 }],
      },
    },
    {
      kind: "order",
      data: {
        id: "o2",
        createdAt: "2026-11-18T12:00:00Z",
        status: "submitted",
        total: 20000,
        paid: 0,
        items: [{ name: "Unpaid", quantity: 1 }],
      },
    },
    {
      kind: "refund",
      data: { orderId: "o1", createdAt: "2026-11-19T14:00:00Z", amount: 5000 },
    },
  ];
  const branch = { timezone: "Africa/Lagos", cutoff: 0 };
  assert.equal(report(records, branch, "2026-11-17").grossSales, 0);
  assert.equal(report(records, branch, "2026-11-18").grossSales, 10000);
  assert.equal(report(records, branch, "2026-11-18").products.length, 1);
  assert.equal(report(records, branch, "2026-11-19").grossSales, 0);
  assert.equal(report(records, branch, "2026-11-19").netSales, -5000);
});

test("Mera availability windows use branch timezone and exclude end boundary",async()=>{
 const {availableNow}=await import("../server/mera/domain.js");
 const windows=[{days:[3],start:"10:00",end:"11:00"}];
 assert.equal(availableNow(windows,"Africa/Lagos",new Date("2026-11-18T09:00:00Z")),true);
 assert.equal(availableNow(windows,"Africa/Lagos",new Date("2026-11-18T10:00:00Z")),false);
 assert.equal(availableNow([],"Africa/Lagos"),true);
});

test("reservation deposit collections are cash flow, never recognized sales",async()=>{
 const {report}=await import("../server/mera/domain.js");
 const result=report([{kind:"deposit",data:{amount:50000,method:"cash",createdAt:"2026-11-18T10:00:00Z"}}],{timezone:"Africa/Lagos",cutoff:0},"2026-11-18");
 assert.equal(result.collections,50000);assert.equal(result.deposits,50000);assert.equal(result.paymentMethods.cash,50000);assert.equal(result.netSales,0);
});

test("historical recognition is explicit and never fabricates fulfillment or tax evidence",async()=>{
 const {report,assertHistoricalWritable}=await import("../server/mera/domain.js");
 const order={id:"legacy-paid",status:"accepted",total:500000,paid:500000,refunded:300000,items:[],historicalReadOnly:true,historicalRecognitionBasis:"legacy_paid_basis",historicalRecognitionAt:"2026-11-18T12:00:00Z",historicalTaxStatus:"unresolved_source_tax_breakdown",createdAt:"2026-11-18T10:00:00Z"};
 const result=report([{kind:"order",data:order},{kind:"refund",data:{orderId:order.id,amount:300000,createdAt:"2026-11-18T13:00:00Z"}}],{timezone:"Africa/Lagos",cutoff:0},"2026-11-18");
 assert.equal(result.grossSales,500000);assert.equal(result.netSales,200000);assert.match(result.recognitionBasis,/legacy_paid_basis/);assert.deepEqual(result.historicalRecognitionBases,["legacy_paid_basis"]);assert.equal(result.historicalTaxStatus,"unresolved_source_tax_breakdown");assert.equal(order.collectedAt,undefined);
 assert.throws(()=>assertHistoricalWritable(order),e=>e.status===409&&e.code==="HISTORICAL_READ_ONLY");
});

test("a noncash writeoff settles debt without becoming a payment or reducing recognized revenue",async()=>{
 const {orderBalance,effectiveSettlement,paymentStatus,report}=await import("../server/mera/domain.js");
 const order={id:"debt",status:"collected",total:10000,paid:4000,refunded:0,writtenOff:6000,createdAt:"2026-11-18T10:00:00Z",collectedAt:"2026-11-18T11:00:00Z",items:[]};
 assert.equal(orderBalance(order),0);assert.equal(effectiveSettlement(order),10000);assert.equal(paymentStatus(order),"partially_paid");assert.equal(transition(order,"completed",{payLater:false}),"completed");
 const result=report([{kind:"order",data:order},{kind:"payment",data:{amount:4000,method:"cash",createdAt:order.createdAt}},{kind:"writeoff",data:{amount:6000,createdAt:order.collectedAt}}],{timezone:"Africa/Lagos",cutoff:0},"2026-11-18");
 assert.equal(result.collections,4000);assert.equal(result.netSales,10000);assert.equal(result.writeOffs,6000);assert.equal(result.outstanding,0);
});

test("bill totals stay gross while ex-tax revenue reconciles to the ledger, unknown legacy tax stays unknown",async()=>{
 const {report}=await import("../server/mera/domain.js");
 const order={id:"taxed",total:20790,paid:20790,refunded:2079,pricing:{tax:1890},items:[],createdAt:"2026-11-18T10:00:00Z",collectedAt:"2026-11-18T11:00:00Z"};
 const records=[{kind:"order",data:order},{kind:"refund",data:{orderId:order.id,amount:2079,taxAmount:189,createdAt:"2026-11-18T12:00:00Z"}}];
 const current=report(records,{timezone:"Africa/Lagos",cutoff:0},"2026-11-18");assert.equal(current.grossSales,20790);assert.equal(current.netSales,18711);assert.equal(current.netRevenueExTax,17010);assert.equal(current.netTaxLiability,1701);
 records.push({kind:"order",data:{...order,id:"legacy",total:10000,pricing:null,historicalReadOnly:true,historicalRecognitionBasis:"legacy_paid_basis",historicalRecognitionAt:order.collectedAt,historicalTaxStatus:"unresolved_source_tax_breakdown"}});
 const mixed=report(records,{timezone:"Africa/Lagos",cutoff:0},"2026-11-18");assert.equal(mixed.netSales,28711);assert.equal(mixed.netRevenueExTax,null);assert.equal(mixed.netTaxLiability,null);assert.equal(mixed.historicalNetSales,10000);
});

test("forfeited escrow is separate non-product income, with unknown tax left unresolved",async()=>{
 const {report}=await import("../server/mera/domain.js");
 const at="2026-11-18T10:00:00Z",branch={timezone:"Africa/Lagos",cutoff:0};
 const known=report([{kind:"deposit_forfeiture",data:{amount:60000,taxAmount:6000,createdAt:at}}],branch,"2026-11-18");
 assert.equal(known.netSales,0);assert.equal(known.nonProductIncome,60000);assert.equal(known.netRevenueExTax,54000);assert.equal(known.netTaxLiability,6000);assert.equal(known.collections,0);assert.deepEqual(known.products,[]);
 const unknown=report([{kind:"deposit_forfeiture",data:{amount:60000,taxAmount:null,createdAt:at}}],branch,"2026-11-18");assert.equal(unknown.netRevenueExTax,null);assert.equal(unknown.netTaxLiability,null);assert.equal(unknown.taxBreakdownStatus,"unresolved");
});
