import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { assertStagingTarget } from "./mera-staging-guard.js";
import { validateMeraRuntime } from "../server/mera-security.js";
import { permissions, proposedPolicy } from "../shared/mera-contracts.js";
assertStagingTarget();
validateMeraRuntime();
const db = await import("../server/db.js");
const ownerId = "f102b48c-e168-4cbd-b448-9b084076654c";
const orgId = "10000000-0000-4000-8000-000000000001";
const branchId = "20000000-0000-4000-8000-000000000001";
const marker = "mera_railway_synthetic_v1";
const password = process.env.MERA_STAGING_OWNER_PASSWORD;
if (!password || password.length < 24) throw new Error("A strong isolated staging owner password is required.");
const venuePortfolio = process.env.MERA_STAGING_VENUES === "portfolio-v1";
if (process.env.MERA_STAGING_VENUES && !venuePortfolio) throw new Error("Unknown staging venue portfolio.");
if (venuePortfolio && (!process.env.MERA_STAGING_VENUE_PASSWORD || process.env.MERA_STAGING_VENUE_PASSWORD.length < 16)) throw new Error("A private venue password of at least 16 characters is required.");
const client = await db.pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(631830201)");
  await client.query("SET statement_timeout='60s'");
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r => r.tablename);
  if (tables.length && !tables.includes(marker)) throw new Error("Refusing to seed a database without the isolated staging marker.");
  await client.query(`CREATE TABLE IF NOT EXISTS ${marker}(id INTEGER PRIMARY KEY CHECK(id=1), ready BOOLEAN NOT NULL DEFAULT false)`);
  await client.query(`INSERT INTO ${marker}(id) VALUES(1) ON CONFLICT DO NOTHING`);
  const { migrateMera } = await import("../server/mera/index.js");
  // The release is explicit; normal production startup never migrates or seeds.
  await db.migrate();
  await migrateMera(db);
  const completed = (await client.query(`SELECT ready FROM ${marker} WHERE id=1`)).rows[0].ready;
  if (!completed) {
    const { seed } = await import("../server/seed.js");
    await seed(); // Source-controlled menu definitions only. No copied customers or orders.
    await client.query("BEGIN");
    // Replace the public catalog seed's legacy venue contact defaults with synthetic details.
    await client.query("UPDATE settings SET value=$1 WHERE key='business'",[JSON.stringify({name:"Bing Chun · Staging",branch:"Surulere · Staging",address:"Synthetic staging venue — no real service",phone:"",timezone:"Africa/Lagos",currency:"NGN"})]);
    await client.query("UPDATE settings SET value=value || $1::jsonb WHERE key='receipt'",[JSON.stringify({businessName:"BING CHUN · STAGING",address:"Synthetic staging venue — no real service",phone:"",footer:"Synthetic test receipt. No real payment."})]);
    await client.query("INSERT INTO users(id,name,username,password_hash,role) VALUES($1,$2,$3,$4,'cashier')", [ownerId,"Staging business owner","staging.owner",await bcrypt.hash(password,12)]);
    await client.query("INSERT INTO mera_organizations(id,name,slug,branding,onboarding,policy,subscription) VALUES($1,$2,$3,$4,$5,$6,$7)", [orgId,"Bing Chun · Staging","bing-chun",JSON.stringify({primary:"#1558c9",accent:"#83ddf7",description:"Synthetic test venue. No real orders or payments.",logo:"/brand/brand-logo.png"}),JSON.stringify({status:"published",syntheticStaging:true}),JSON.stringify(proposedPolicy),JSON.stringify({status:"active",billingEnabled:false,includedBranchIds:[branchId],syntheticStaging:true})]);
    const { claimOrganizationSlug } = await import("../server/mera/organization-aliases.js");
    await claimOrganizationSlug(client,orgId,"bing-chun");
    await client.query("INSERT INTO mera_branches(id,organization_id,name,settings) VALUES($1,$2,$3,$4)", [branchId,orgId,"Surulere · Staging",JSON.stringify({address:"Synthetic staging venue — no real service",serviceModes:["counter_takeaway","table_service","reservations"],payLater:false,orderingPaused:false,showSoldOut:true,reservationsEnabled:true,capacity:30,holdMinutes:10,launchState:"published",syntheticStaging:true})]);
    await client.query("INSERT INTO mera_memberships(id,user_id,organization_id,role,permissions,organization_wide) VALUES($1,$2,$3,'owner',$4,true)",[randomUUID(),ownerId,orgId,JSON.stringify(permissions)]);
    const products = (await client.query("SELECT * FROM products ORDER BY category,code")).rows;
    const published=[];
    for(const p of products){
      const id=randomUUID(),data={id,code:p.code,name:p.name,category:p.category,parentCategory:null,description:"",price:p.price,size:p.size,available:p.available&&!p.needs_review,stockMode:"unlimited",stock:0,station:p.category==="Ice cream series"?"kitchen":"bar",variants:[],modifierGroups:[],allergens:[],dietary:[],imageCode:p.code};
      await client.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'product',$4)",[id,orgId,branchId,JSON.stringify(data)]);
      if(data.available)published.push(data);
    }
    await client.query("UPDATE mera_branches SET menu_version=1,published_menu=$1 WHERE id=$2",[JSON.stringify(published),branchId]);
    const draftOrg="10000000-0000-4000-8000-000000000002", draftBranch="20000000-0000-4000-8000-000000000002";
    await client.query("INSERT INTO mera_organizations(id,name,slug,branding,onboarding,policy,subscription) VALUES($1,$2,$3,$4,$5,$6,$7)",[draftOrg,"Staging setup practice","staging-setup",JSON.stringify({description:"Synthetic organization for guided setup testing."}),JSON.stringify({status:"draft",syntheticStaging:true}),JSON.stringify(proposedPolicy),JSON.stringify({status:"trialing",billingEnabled:false,includedBranchIds:[draftBranch],syntheticStaging:true})]);
    await claimOrganizationSlug(client,draftOrg,"staging-setup");
    await client.query("INSERT INTO mera_branches(id,organization_id,name,settings) VALUES($1,$2,$3,$4)",[draftBranch,draftOrg,"First branch · Staging",JSON.stringify({address:"",serviceModes:["counter_takeaway"],launchState:"draft",orderingPaused:true,syntheticStaging:true})]);
    await client.query("INSERT INTO mera_memberships(id,user_id,organization_id,role,permissions,organization_wide) VALUES($1,$2,$3,'owner',$4,true)",[randomUUID(),ownerId,draftOrg,JSON.stringify(permissions)]);
    await client.query(`UPDATE ${marker} SET ready=true WHERE id=1`);
    await client.query("COMMIT");
    console.log("Synthetic staging organization and menu initialized. No financial integration enabled.");
  } else console.log("Staging migration finished; existing synthetic records preserved.");
  if (venuePortfolio) {
    // Marker and portfolio commit together; a completed portfolio is never reseeded.
    await client.query("BEGIN");
    await client.query("CREATE TABLE IF NOT EXISTS mera_railway_venue_portfolio_v1(id INTEGER PRIMARY KEY CHECK(id=1), ready BOOLEAN NOT NULL)");
    const done = (await client.query("SELECT ready FROM mera_railway_venue_portfolio_v1 WHERE id=1")).rows[0]?.ready;
    if (!done) {
      const { seedVenuePortfolio } = await import("../server/mera/venue-portfolio.js");
      const counts = await seedVenuePortfolio({transaction: fn => fn(client)}, {passwordFor: () => process.env.MERA_STAGING_VENUE_PASSWORD});
      await client.query("INSERT INTO mera_railway_venue_portfolio_v1(id,ready) VALUES(1,true) ON CONFLICT(id) DO UPDATE SET ready=true");
      console.log(JSON.stringify(counts));
    }
    await client.query("COMMIT");
  }
} catch(error) {
  await client.query("ROLLBACK").catch(()=>{});
  console.error("Staging release failed",error.code || error.name);
  process.exitCode=1;
} finally {
  await client.query("SELECT pg_advisory_unlock(631830201)").catch(()=>{});
  client.release();
  await db.pool.end();
}
