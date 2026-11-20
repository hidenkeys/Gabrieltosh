// Explicit one-off QA provisioning, never a startup or release hook.
import { assertStagingTarget } from "./mera-staging-guard.js";
import { validateMeraRuntime } from "../server/mera-security.js";
import bcrypt from "bcryptjs";
import { encryptFactor, decryptFactor, platformKey } from "../server/mera/platform.js";
import { randomUUID } from "node:crypto";
assertStagingTarget();validateMeraRuntime();
let input="";
for await(const chunk of process.stdin){input+=chunk;if(input.length>8192)throw new Error("QA provisioning input exceeds limit.");}
const {operatorPassword,operatorTotp}=JSON.parse(input);
if(typeof operatorPassword!=="string"||operatorPassword.length<24||typeof operatorTotp!=="string"||!/^[A-Z2-7]{32}$/.test(operatorTotp))throw new Error("Valid isolated credentials are required.");
const key=platformKey();
const db=await import("../server/db.js");
const id="857cba1e-4a65-4cfb-92df-6fd13fdc519c";
try {
 await db.transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(631830202)");
  const initialized=(await c.query("SELECT ready FROM mera_railway_synthetic_v1 WHERE id=1")).rows[0]?.ready;
  if(!initialized)throw new Error("Synthetic staging initialization is required.");
  const existing=(await c.query("SELECT u.password_hash,f.secret_cipher FROM users u LEFT JOIN mera_platform_factors f ON f.user_id=u.id WHERE u.id=$1",[id])).rows[0];
  if(existing){
   if(!await bcrypt.compare(operatorPassword,existing.password_hash)||decryptFactor(existing.secret_cipher,key)!==operatorTotp)throw new Error("Existing operator credentials differ; refusing to rotate them.");
   return;
  }
  await c.query("INSERT INTO users(id,name,username,password_hash,role,active) VALUES($1,$2,$3,$4,'cashier',true)",[id,"Synthetic staging platform QA","staging.operator",await bcrypt.hash(operatorPassword,12)]);
  await c.query("INSERT INTO mera_platform_members(user_id,active,strong_auth_verified) VALUES($1,true,false)",[id]);
  await c.query("INSERT INTO mera_platform_factors(user_id,secret_cipher) VALUES($1,$2)",[id,encryptFactor(operatorTotp,key)]);
  await c.query("INSERT INTO mera_platform_audit(id,actor_id,action,details) VALUES($1,$2,'staging_operator_provisioned',$3)",[randomUUID(),id,JSON.stringify({reason:"Explicit isolated staging QA authorization; synthetic operator, normal password and MFA required."})]);
 });
 console.log(JSON.stringify({operatorId:id,username:"staging.operator",synthetic:true,mfaRequired:true,merchantMemberships:0}));
} catch(error){console.error("Staging operator provisioning failed",error.code||error.name);process.exitCode=1;}finally{await db.pool.end();}
