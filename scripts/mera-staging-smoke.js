// Hosted API acceptance only: this does not replace browser visual verification.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const origin="https://mera-web-staging.up.railway.app";
const evidence={at:new Date().toISOString(),origin,checks:[]};
async function check(path,status,options={}) {
 const r=await fetch(origin+path,{...options,redirect:"manual",signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,status,path);
 assert.match(r.headers.get("x-robots-tag")||"",/noindex/,path+" noindex");
 evidence.checks.push({path,status});return r;
}
assert.equal((await (await check("/api/health",200)).json()).ok,true);
await check("/",302); await check("/mera",301); await check("/mera/",200);
assert.match(await (await check("/robots.txt",200)).text(),/Disallow: \//);
await check("/api/mera/v1/context",401);await check("/api/mera/v1/platform",401);
await check("/api/products",404);
const capabilities=await (await check("/api/mera/v1/identity/capabilities",200)).json();
assert.equal(capabilities.registration,"blocked");assert.equal(capabilities.emailDelivery,"blocked");
const menu=await (await check("/api/mera/v1/public/bing-chun/20000000-0000-4000-8000-000000000001/menu",200)).json();
assert.ok(menu.products.length>0);assert.equal(menu.orderingAvailable,true);assert.equal(menu.providers.rubies.state,"blocked");
await check("/api/mera/v1/public/staging-setup/20000000-0000-4000-8000-000000000002/menu",404);
await check("/api/mera/v1/public/bing-chun/20000000-0000-4000-8000-000000000002/menu",404);
if(process.env.MERA_STAGING_SECRETS_FILE){
 const {ownerPassword}=JSON.parse(await readFile(process.env.MERA_STAGING_SECRETS_FILE,"utf8"));
 const headers={"content-type":"application/json","x-pos-request":"1",origin};
 const login=await check("/api/login",200,{method:"POST",headers,body:JSON.stringify({username:"staging.owner",password:ownerPassword})});
 const cookie=login.headers.get("set-cookie");assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=Strict/i);
 const authenticated={...headers,cookie:cookie.split(";")[0]};
 const context=await (await check("/api/mera/v1/context",200,{headers:authenticated})).json();
 assert.equal(context.demo,false);assert.equal(context.organizations.length,2);
 await check("/api/mera/v1/platform",403,{headers:authenticated});
 await check("/api/logout",200,{method:"POST",headers:authenticated});
 await check("/api/mera/v1/context",401,{headers:authenticated});
 evidence.secureCookie={httpOnly:true,secure:true,sameSite:"strict"};
}
console.log(JSON.stringify(evidence,null,2));
