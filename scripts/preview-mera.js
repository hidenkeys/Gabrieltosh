// Isolated Mera demo. Never connects to the existing POS or production database.
import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (process.env.NODE_ENV === "production")
  throw new Error("Mera demo is not a production launcher.");
const databaseDir = "data/mera-demo-db";
const password = randomBytes(24).toString("hex");
// Persistent cluster uses a separately recorded development-only login.
const devPassword = "MeraIsolatedDevelopmentOnly2026";
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: "mera_demo",
  password: devPassword,
  port: 55441,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (m) => console.error(String(m)),
});
if (!existsSync(databaseDir + "/PG_VERSION")) await postgres.initialise();
await postgres.start();
Object.assign(process.env, {
  DATABASE_URL: `postgres://mera_demo:${devPassword}@127.0.0.1:55441/postgres`,
  MEMORY_DB: "false",
  MERA_ENABLED: "true",
  MERA_DEMO: "true",
  DISABLE_BACKUPS: "true",
  PRINT_MODE: "simulation",
  PORT: "3003",
  HOST: "127.0.0.1",
});
const db = await import("../server/db.js");
const { seed, createAdmin } = await import("../server/seed.js");
await db.migrate();
await seed();
if (!(await db.query("SELECT id FROM users LIMIT 1")).rows.length) {
  await createAdmin("Mera demonstration owner", "admin", password);
  console.log("ISOLATED MERA DEMO LOGIN: admin / " + password);
}
const { migrateMera, seedMeraDemo } = await import("../server/mera/index.js");
await migrateMera(db);
const userId = (await db.query("SELECT id FROM users WHERE username='admin'"))
  .rows[0].id;
await seedMeraDemo({ ...db, userId });
await db.pool.end();
const child = spawn(process.execPath, ["server/index.js"], {
  env: process.env,
  stdio: "inherit",
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  child.kill();
  await postgres.stop();
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.once("exit", stop);
console.log("Mera isolated development site: http://localhost:3003/mera");
