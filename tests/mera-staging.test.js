import test from "node:test";
import assert from "node:assert/strict";
import { assertStagingTarget, stagingScope } from "../scripts/mera-staging-guard.js";
import { hostingOptions, stagingHeaders } from "../server/mera-hosting.js";
const valid={RAILWAY_PROJECT_ID:stagingScope.projectId,RAILWAY_ENVIRONMENT_ID:stagingScope.environmentId,MERA_RAILWAY_STAGING:"true",MERA_ENABLED:"true",NODE_ENV:"production",MERA_STAGING_SEED:"synthetic-v1",DATABASE_URL:"postgresql://synthetic:placeholder@postgres.railway.internal:5432/railway"};
test("staging releases reject wrong environment, public/other database and demo identity mode",()=>{
 assert.doesNotThrow(()=>assertStagingTarget(valid));
 for(const change of [{RAILWAY_PROJECT_ID:"other"},{RAILWAY_ENVIRONMENT_ID:"production"},{MERA_RAILWAY_STAGING:"false"},{MERA_ENABLED:"false"},{NODE_ENV:"development"},{MERA_STAGING_SEED:""},{MERA_DEMO:"true"},{MEMORY_DB:"true"},{DATABASE_URL:"postgres://synthetic:placeholder@localhost/railway"},{DATABASE_URL:"postgres://synthetic:placeholder@postgres.railway.internal/live"},{DATABASE_URL:"postgres://synthetic:placeholder@postgres.railway.internal:5433/railway"}]) assert.throws(()=>assertStagingTarget({...valid,...change}));
});
test("Railway proxy mode is bounded and scoped; local server remains loopback-only",()=>{
 assert.deepEqual(hostingOptions({}),{railway:false,trustProxy:"loopback"});
 assert.deepEqual(hostingOptions(valid),{railway:true,trustProxy:1});
 assert.throws(()=>hostingOptions({...valid,RAILWAY_ENVIRONMENT_ID:"other"}));
});
test("staging blocks indexing and ignores spoofed forwarding chains",()=>{
 const headers={};const res={set(k,v){headers[k]=v;return this;},type(){return this;},send(v){this.body=v;return this;}};
 let continued=0;const req={path:"/mera",headers:{"x-forwarded-for":"spoof, proxy"},get(){return "203.0.113.4";}};
 stagingHeaders(req,res,()=>continued++);assert.equal(req.headers["x-forwarded-for"],"203.0.113.4");assert.equal(continued,1);assert.match(headers["X-Robots-Tag"],/noindex/);
 req.get=()=>"invalid, supplied";stagingHeaders(req,res,()=>continued++);assert.equal(req.headers["x-forwarded-for"],undefined);
 req.path="/robots.txt";stagingHeaders(req,res,()=>continued++);assert.match(res.body,/Disallow: \//);assert.equal(continued,2);
});
