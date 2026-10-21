// Development preview only. Uses a persistent, isolated local PostgreSQL instance.
import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
const password = "LocalPreviewOnly2026";
const pg = new EmbeddedPostgres({
  databaseDir: "data/preview-db",
  user: "preview",
  password,
  port: 55440,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (m) => console.error(String(m)),
});
const env = {
  ...process.env,
  MEMORY_DB: "false",
  DATABASE_URL: `postgres://preview:${password}@127.0.0.1:55440/postgres`,
  PORT: "3002",
  HOST: "127.0.0.1",
  PRINT_MODE: "simulation",
  DISABLE_BACKUPS: "true",
};
if (!existsSync("data/preview-db/PG_VERSION")) await pg.initialise();
await pg.start();
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.MEMORY_DB = "false";
const { migrate, query, pool } = await import("../server/db.js");
const { seed, createAdmin } = await import("../server/seed.js");
await migrate();
await seed();
if (!(await query("SELECT id FROM users LIMIT 1")).rows.length) {
  const pw = randomBytes(12).toString("base64url");
  await createAdmin("Preview administrator", "admin", pw);
  console.log("LOCAL PREVIEW ONLY — username: admin; password: " + pw);
}
await pool.end();
const app = spawn(process.execPath, ["server/index.js"], {
  stdio: "inherit",
  env,
});
const worker = spawn(process.execPath, ["server/worker.js"], {
  stdio: "inherit",
  env,
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  app.kill();
  worker.kill();
  await pg.stop();
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
app.once("exit", stop);
console.log(
  "Persistent development preview: http://localhost:3002 (not a production deployment).",
);
