// API persistence check only; browser chooser/preview acceptance is separate.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const origin="https://mera-web-staging.up.railway.app",org="10000000-0000-4000-8000-000000000001";
const {ownerPassword}=JSON.parse(await readFile(process.env.MERA_STAGING_SECRETS_FILE,"utf8"));
const proofPath=process.env.MERA_STAGING_ASSET_PROOF_FILE;
assert.ok(proofPath,"An explicit local evidence file is required.");
const headers={"content-type":"application/json","x-pos-request":"1",origin};
const login=await fetch(origin+"/api/login",{method:"POST",headers,body:JSON.stringify({username:"staging.owner",password:ownerPassword})});
assert.equal(login.status,200);headers.cookie=login.headers.get("set-cookie").split(";")[0];
try {
 let proof;
 if(process.argv[2]==="upload"){
  const bytes=await readFile(new URL("../public/brand/brand-logo.png",import.meta.url));
  const r=await fetch(origin+"/api/mera/v1/organizations/"+org+"/assets",{method:"POST",headers,body:JSON.stringify({filename:"staging-persistence-check.png",mime:"image/png",data:bytes.toString("base64")})});
  assert.ok([200,201].includes(r.status),"asset upload status "+r.status);
  const asset=await r.json();proof={at:new Date().toISOString(),assetId:asset.id,previewUrl:asset.previewUrl,sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length};
  await writeFile(proofPath,JSON.stringify(proof,null,2),{mode:0o600});
 } else {assert.equal(process.argv[2],"verify");proof=JSON.parse(await readFile(proofPath,"utf8"));}
 assert.ok(proof.previewUrl.startsWith("/api/mera/v1/organizations/"+org+"/assets/"));
 const r=await fetch(origin+proof.previewUrl,{headers});assert.equal(r.status,200);
 const downloaded=Buffer.from(await r.arrayBuffer());assert.equal(downloaded.length,proof.bytes);assert.equal(createHash("sha256").update(downloaded).digest("hex"),proof.sha256);
 console.log(JSON.stringify({mode:process.argv[2],assetId:proof.assetId,byteLength:proof.bytes,sha256:proof.sha256,readBack:"matched",at:new Date().toISOString()}));
} finally {await fetch(origin+"/api/logout",{method:"POST",headers});}
