import { createCipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, writeFile, rename, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
export function hostedBackupPolicy(env = process.env) {
  if (
    env.MERA_ENABLED !== "true" ||
    env.MERA_BACKUPS_ENABLED !== "true" ||
    env.DISABLE_BACKUPS === "true"
  )
    return { enabled: false };
  if (!/^[a-f\d]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY || ""))
    throw new Error(
      "Hosted backups require an explicit 32-byte encryption key.",
    );
  const hours = Number(env.BACKUP_INTERVAL_HOURS),
    days = Number(env.BACKUP_RETENTION_DAYS);
  if (
    !Number.isFinite(hours) ||
    hours < 1 ||
    hours > 168 ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 3650
  )
    throw new Error(
      "Configure backup interval (1–168 hours) and retention (1–3650 days).",
    );
  return { enabled: true, intervalMs: hours * 3600000, retentionDays: days };
}
export function dumpEnvironment(databaseUrl, source = process.env) {
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("A PostgreSQL backup source is required.");
  const env = Object.fromEntries(
    Object.entries(source).filter(
      ([key]) => !key.toUpperCase().startsWith("PG"),
    ),
  );
  Object.assign(env, {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  });
  for (const [param, key] of [
    ["sslmode", "PGSSLMODE"],
    ["sslrootcert", "PGSSLROOTCERT"],
    ["sslcert", "PGSSLCERT"],
    ["sslkey", "PGSSLKEY"],
  ])
    if (url.searchParams.has(param)) env[key] = url.searchParams.get(param);
  return env;
}
// Retains the existing BC01 envelope while streaming ciphertext to disk.
export async function encryptBackupFile(source, destination, keyHex) {
  if (!/^[a-f\d]{64}$/i.test(keyHex || ""))
    throw new Error("Backup encryption key is invalid.");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv),
    partial = destination + ".partial";
  try {
    await writeFile(
      partial,
      Buffer.concat([Buffer.from("BC01"), iv, Buffer.alloc(16)]),
      { mode: 0o600, flag: "wx" },
    );
    await pipeline(
      createReadStream(source),
      cipher,
      createWriteStream(partial, { flags: "r+", start: 32, mode: 0o600 }),
    );
    const file = await open(partial, "r+");
    try {
      await file.write(cipher.getAuthTag(), 0, 16, 16);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(partial, destination);
  } catch (error) {
    await unlink(partial).catch(() => {});
    throw error;
  }
}
export async function scheduledHostedBackup(
  db,
  run,
  env = process.env,
  now = Date.now(),
) {
  const policy = hostedBackupPolicy(env);
  if (!policy.enabled) return false;
  return db.transaction(async (c) => {
    const lease = (
      await c.query("SELECT pg_try_advisory_xact_lock(638221,1) AS acquired")
    ).rows[0];
    if (!lease?.acquired) return false;
    await c.query(
      "UPDATE backup_runs SET status='failed',error='Interrupted scheduled backup' WHERE status='running'",
    );
    const rows = (
      await c.query(
        "SELECT status,created_at FROM backup_runs WHERE created_at>$1 ORDER BY created_at DESC",
        [new Date(now - policy.intervalMs)],
      )
    ).rows;
    if (rows.some((r) => ["complete", "pruned"].includes(r.status)))
      return false;
    const failed = rows.filter((r) => r.status === "failed");
    if (failed.length >= 3) return false;
    if (
      failed.length &&
      now - new Date(failed[0].created_at).getTime() <
        60000 * 2 ** (failed.length - 1)
    )
      return false;
    await run();
    return true;
  });
}
