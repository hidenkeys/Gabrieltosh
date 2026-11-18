// Separate durable-job worker. Production launch is explicitly opt-in.
import { validateMeraRuntime } from "../server/mera-security.js";
validateMeraRuntime();
if (process.env.MERA_ENABLED !== "true" || process.env.MERA_RUN_JOBS !== "true")
  throw new Error(
    "MERA_ENABLED=true and MERA_RUN_JOBS=true are required to start the job worker.",
  );
const db = await import("../server/db.js");
const { processMeraJobs } = await import("../server/mera/operations.js");
let stopped = false,
  timer;
async function tick() {
  try {
    await processMeraJobs(db);
  } catch (error) {
    console.error("Mera job cycle failed", error.code || error.name);
  }
  if (!stopped) timer = setTimeout(tick, 1000);
}
async function stop() {
  stopped = true;
  clearTimeout(timer);
  await db.pool.end();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
console.log("Mera durable-job worker started.");
await tick();
