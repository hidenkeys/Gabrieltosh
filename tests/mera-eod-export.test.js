import test from 'node:test';
import assert from 'node:assert/strict';
import {report} from '../server/mera/domain.js';
import {exportReportCSV} from '../server/mera/operations.js';
const branch={name:'=QA branch',timezone:'Africa/Lagos',cutoff:240,currency:'NGN'};
const at='2026-11-18T05:00:00Z';
test('EOD states are current created-day cohort while staff uses actual day history, including older orders',()=>{
 const records=[{kind:'order',data:{id:'new',createdAt:at,status:'cancelled',total:100,items:[],history:[{at,action:'submitted',actorId:'secret-id',actorName:'=Staff',actorType:'staff'}]}},{kind:'order',data:{id:'old',createdAt:'2026-11-17T05:00:00Z',status:'completed',total:200,collectedAt:at,items:[],history:[{at,action:'collected',actorId:'other-id'},{at:'2026-11-17T05:00:00Z',action:'submitted',actorName:'Yesterday'}]}}];
 const r=report(records,branch,'2026-11-18');
 assert.deepEqual(r.orderStates.counts,{cancelled:1});assert.equal(r.orderStates.total,1);
 assert.equal(r.grossSales,200);assert.equal(r.staffActivity.entries.length,2);assert.equal(r.staffActivity.unattributedEvents,1);assert.ok(r.staffActivity.entries.some(e=>e.name===null));assert.ok(!JSON.stringify(r.staffActivity).includes('secret-id'));assert.equal(r.platformFees.amount,null);assert.equal(r.platformFees.status,'unavailable');assert.equal(r.metadata.cutoffMinutes,240);
});
test('CSV v2 includes context, arrays, explicit major units and protects textual formulas without corrupting numeric negatives',()=>{
 const summary={...report([],branch,'2026-11-18'),netSales:-12345,netRevenueExTax:null,products:[{productId:'p',name:'\t=BAD()',quantity:2,total:350000},{productId:'p',name:'\t=BAD()',quantity:1,total:175000}],paymentMethods:{cash:525000},orderStates:{counts:{completed:2}},staffActivity:{basis:'recorded_order_history_events_on_trading_day',entries:[{name:'-DANGEROUS',actorType:'staff',eventCount:1,actions:{collected:1}}]}};
 const csv=exportReportCSV(summary,branch,{from:at,to:'2026-11-19T03:00:00Z'});
 assert.ok(csv.includes('"v2"'));assert.ok(csv.includes("\"'=QA branch\""));assert.ok(csv.includes('"Africa/Lagos"'));assert.ok(csv.includes(at));assert.ok(csv.includes(',-123.45,"NGN"'));assert.ok(!csv.includes("'-123.45"));assert.ok(csv.includes('"Unavailable"'));assert.ok(csv.includes("\"'\t=BAD()\",3,5250"));assert.ok(csv.includes("\"'-DANGEROUS\""));assert.ok(csv.includes('"Cash",5250'));assert.ok(csv.includes('"Completed",2'));
});
test('bounded report query retains tenant and day predicates when including older staff-history orders',async()=>{
 const {loadBranchReportRecords}=await import('../server/mera/queries.js');const calls=[];
 const db={query:async(sql,args)=>{calls.push({sql,args});if(sql.includes('starts_at'))return{rows:[{starts_at:at,ends_at:'2026-11-19T05:00:00Z'}]};if(sql.includes('COUNT(*)'))return{rows:[{count:0,bytes:'0'}]};if(sql.includes('CROSS JOIN'))return{rows:[{amount:'0'}]};return{rows:[]};}};
 const result=await loadBranchReportRecords(db,{organizationId:'org',branchId:'branch'},branch,'2026-11-18');
 assert.equal(result.reservationLiabilityAsOf,0);const orderQuery=calls.find(c=>c.sql.startsWith('SELECT * FROM mera_records WHERE')&&c.sql.includes("kind='order'"));assert.ok(orderQuery);assert.deepEqual(orderQuery.args.slice(0,2),['org','branch']);assert.ok(orderQuery.sql.includes("h->>'at'>=$3 AND h->>'at'<$4"));assert.ok(orderQuery.sql.includes('organization_id=$1 AND branch_id=$2'));assert.equal(result.window.from,new Date(at).toISOString());
});
test('CSV does not invent missing fees or partial product/payment totals and distinguishes size snapshots',()=>{
 const summary={date:'2026-11-18',products:[{productId:'p',name:'Tea',size:'Large',quantity:2,total:50000},{productId:'p',name:'Tea',size:'Large',quantity:1,total:null},{productId:'p',name:'Tea',size:'Regular',quantity:0,total:0},{productId:'broken',name:'Unknown',quantity:undefined,total:'100'}],paymentMethods:{cash:null,external_pos:0,external_transfer:NaN},orderStates:{counts:{awaiting_payment:2}}};
 const csv=exportReportCSV(summary,branch);
 assert.ok(csv.includes('"Mera fees","Unavailable"'));
 assert.ok(csv.includes('"Tea — Large",3,"Unavailable"'));
 assert.ok(csv.includes('"Tea — Regular",0,0'));
 assert.ok(csv.includes('"Unknown","Unavailable","Unavailable"'));
 assert.ok(csv.includes('"Cash","Unavailable"'));
 assert.ok(csv.includes('"External POS",0'));
 assert.ok(csv.includes('"External transfer","Unavailable"'));
 assert.ok(csv.includes('"Awaiting payment",2'));
 assert.ok(!csv.includes('NaN'));
});
