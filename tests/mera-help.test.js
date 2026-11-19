import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mountMeraHelp } from "../server/mera/help.js";
const P = "/public/:slug/:branchId/help-requests",
  B = "/organizations/:organizationId/branches/:branchId/help-requests";
function fixture() {
  const handlers = new Map(),
    rows = [];
  const router = {};
  for (const method of ["get", "post", "patch"])
    router[method] = (path, ...middleware) =>
      handlers.set(method + path, middleware.at(-1));
  const scope = (req) => ({
    organizationId: req.params.organizationId || "org",
    branchId: req.params.branchId,
  });
  const notFound = () => Object.assign(Error("Not found"), { status: 404 });
  const deps = {
    db: {},
    scope,
    guard: () => () => {},
    locked: async (s, fn) => fn({query:async(sql,args)=>({rows:rows.filter(r=>r.organizationId===args[0]&&r.branchId===args[1]&&r.kind===args[2]&&r.data.requestKey===args[3]&&r.data.actorId===args[4]).map(r=>({data:r.data}))})}),
    publicContext: async (req) => ({
      organization: { id: "org" },
      s: scope(req),
    }),
    guest: async (req) => {
      if (!req.guestId)
        throw Object.assign(Error("Guest required"), { status: 401 });
      return { id: req.guestId };
    },
    readRecords: async (c, o, b, k) =>
      rows.filter(
        (row) =>
          row.organizationId === o && row.branchId === b && row.kind === k,
      ),
    find: async (c, s, k, id) => {
      const row = rows.find(
        (row) =>
          row.organizationId === s.organizationId &&
          row.branchId === s.branchId &&
          row.kind === k &&
          row.data.id === id,
      );
      if (!row) throw notFound();
      return row.data;
    },
    record: async (c, s, kind, data) => {
      const value = { ...data, id: randomUUID() };
      rows.push({ ...s, kind, data: value });
      return value;
    },
    update: async (c, s, k, id, data) => {
      const row = rows.find(
        (row) =>
          row.organizationId === s.organizationId &&
          row.branchId === s.branchId &&
          row.kind === k &&
          row.data.id === id,
      );
      row.data = data;
    },
    event: async () => {},
  };
  mountMeraHelp(router, deps);
  return {
    rows,
    add: async (kind, data) =>
      deps.record(
        {},
        { organizationId: "org", branchId: "branch" },
        kind,
        data,
      ),
    async call(
      method,
      path,
      body,
      {
        guestId = "guestA",
        branch = "branch",
        permissions = ["orders.fulfill"],
        id,
        requestKey,
        actorName="Actual staff name",
      } = {},
    ) {
      let status = 200,
        value;
      const res = {
        status(n) {
          status = n;
          return this;
        },
        set() {
          return this;
        },
        json(v) {
          value = v;
          return this;
        },
      };
      await handlers.get(method + path)(
        {
          get:()=>undefined,
          body,
          guestId,
          params: { organizationId: "org", branchId: branch, id,requestKey },
          user: { id: "staff",name:actorName },
          meraMembership: { permissions },
        },
        res,
      );
      return { status, value };
    },
  };
}
const help = (overrides = {}) => ({
  requestKey: randomUUID(),
  category: "service",
  message: "Please assist us",
  ...overrides,
});
test("secure guest scope, exact replay, changed intent and open-request limit", async () => {
  const f = fixture(),
    input = help();
  await assert.rejects(
    f.call("post", P, input, { guestId: null }),
    (e) => e.status === 401,
  );
  const first = await f.call("post", P, input);
  assert.equal(first.value.externalDelivery, false);
  const persisted = f.rows.find(
    (row) => row.kind === "help_request" && row.data.id === first.value.id,
  );
  persisted.data.intent = Object.fromEntries(
    Object.entries(persisted.data.intent).reverse(),
  );
  assert.equal((await f.call("post", P, input)).value.id, first.value.id);
  await assert.rejects(
    f.call("post", P, { ...input, message: "Changed" }),
    (e) => e.status === 409,
  );
  assert.equal(
    (await f.call("get", P, undefined, { guestId: "guestB" })).value.requests
      .length,
    0,
  );
  assert.equal(
    (await f.call("get", P, undefined, { branch: "other" })).value.requests
      .length,
    0,
  );
  await f.call("post", P, help());
  await f.call("post", P, help());
  await assert.rejects(f.call("post", P, help()), (e) => e.status === 429);
});
test("private context requires own order or open joined visit, never QR/table alone", async () => {
  const f = fixture(),
    foreign = await f.add("order", { guestId: "guestB" }),
    visit = await f.add("visit", { status: "open", guestIds: [] });
  await assert.rejects(
    f.call("post", P, help({ orderId: foreign.id })),
    (e) => e.status === 404,
  );
  await assert.rejects(
    f.call("post", P, help({ visitId: visit.id })),
    (e) => e.status === 404,
  );
  await assert.rejects(f.call("post", P, help({ tableId: randomUUID() })));
  const own = await f.add("order", { guestId: "guestA" });
  assert.equal(
    (await f.call("post", P, help({ orderId: own.id }))).status,
    201,
  );
  visit.guestIds.push("guestA");
  assert.equal(
    (await f.call("post", P, help({ visitId: visit.id }))).status,
    201,
  );
  visit.status = "closed";
  await assert.rejects(
    f.call("post", P, help({ visitId: visit.id })),
    (e) => e.status === 404,
  );
});
test("staff category permissions filter requests and private notes never reach guests", async () => {
  const f = fixture();
  const service = (await f.call("post", P, help())).value;
  const payment = (await f.call("post", P, help({ category: "payment" })))
    .value;
  assert.equal((await f.call("get", B)).value.requests.length, 1);
  await assert.rejects(
    f.call("patch", B + "/:id", { status: "resolved" }, { id: payment.id }),
    (e) => e.status === 404,
  );
  await f.call(
    "patch",
    B + "/:id",
    {
      status: "acknowledged",
      customerReply: "Staff are coming",
      internalNote: "Internal staff note",
    },
    { id: service.id },
  );
  const own = (await f.call("get", P)).value.requests.find(
    (r) => r.id === service.id,
  );
  assert.equal(own.customerReply, "Staff are coming");
  assert.equal(own.status, "acknowledged");
  assert.equal("internalNotes" in own, false);
  assert.equal("guestId" in own, false);
  assert.equal("actorId" in own, false);
  assert.equal(own.externalDelivery, false);
});
test('staff keyed help updates append note once and replay original ack after later changes',async()=>{
 const f=fixture(),created=await f.call('post',P,help()),id=created.value.id,key=randomUUID(),body={requestKey:key,status:'acknowledged',internalNote:'Original private note'};
 const first=await f.call('patch',B+'/:id',body,{id});assert.equal(first.value.internalNotes.length,1);assert.equal(first.value.internalNotes[0].actorName,'Actual staff name');
 await f.call('patch',B+'/:id',{status:'resolved',internalNote:'Later note'},{id});
 const repeat=await f.call('patch',B+'/:id',body,{id});assert.deepEqual(repeat.value,first.value);assert.equal(f.rows.find(r=>r.kind==='help_request').data.internalNotes.length,2);
 await assert.rejects(f.call('patch',B+'/:id',{...body,internalNote:'Different'},{id}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 const proof=await f.call('get',B+'/:id/update-attempts/:requestKey',undefined,{id,requestKey:key});assert.equal(proof.value.status,'recorded');assert.equal(proof.value.requestKey,key);assert.deepEqual(proof.value.request,first.value);
 const stopKey=randomUUID(),stop=await f.call('post',B+'/:id/update-attempts/:requestKey/abandon',{reason:'Stop original unknown update'},{id,requestKey:stopKey});assert.equal(stop.value.status,'abandoned');
 await assert.rejects(f.call('patch',B+'/:id',{requestKey:stopKey,status:'resolved',internalNote:'Late note'},{id}),e=>e.code==='HELP_UPDATE_ABANDONED');assert.equal(f.rows.find(r=>r.kind==='help_request').data.internalNotes.length,2);
});
test('new note identity is a real name snapshot while unavailable identities stay unavailable',async()=>{
 const f=fixture(),created=await f.call('post',P,help()),id=created.value.id;
 const first=await f.call('patch',B+'/:id',{status:'acknowledged',internalNote:'Named note'},{id,actorName:'  Real Person  '});assert.equal(first.value.internalNotes[0].actorName,'Real Person');
 const second=await f.call('patch',B+'/:id',{status:'resolved',internalNote:'Unavailable name note'},{id,actorName:'  '});assert.equal(second.value.internalNotes[1].actorName,null);assert.equal(second.value.internalNotes[0].actorName,'Real Person');
 const own=await f.call('get',P);assert.equal(own.value.requests[0].internalNotes,undefined);
});
