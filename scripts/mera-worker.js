// Separate durable-job worker. Production launch is explicitly opt-in.
import { validateMeraRuntime } from "../server/mera-security.js";
validateMeraRuntime();
if (process.env.MERA_ENABLED !== "true" || process.env.MERA_RUN_JOBS !== "true")
  throw new Error(
    "MERA_ENABLED=true and MERA_RUN_JOBS=true are required to start the job worker.",
  );
const db = await import("../server/db.js");
const { processMeraJobs } = await import("../server/mera/operations.js");
const { hostedBackupPolicy, scheduledHostedBackup } =
  await import("../server/mera/backup-policy.js");
const backupPolicy = hostedBackupPolicy();
let stopped = false,
  timer;
let backupTimer,
  backupRunning = false;
async function backupCycle() {
  if (stopped || !backupPolicy.enabled) return;
  if (!backupRunning) {
    backupRunning = true;
    try {
      const { backup, uploadPending } = await import("../server/backup.js");
      await scheduledHostedBackup(db, backup);
      await uploadPending();
    } catch (error) {
      console.error("Mera backup cycle failed", error.code || error.name);
    } finally {
      backupRunning = false;
    }
  }
  if (!stopped) backupTimer = setTimeout(backupCycle, 60000);
}
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
  clearTimeout(backupTimer);
  await db.pool.end();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
console.log("Mera durable-job worker started.");
await tick();
if (backupPolicy.enabled) void backupCycle();
