import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream } from "node:fs";
import { query, transaction } from "./db.js";
import { backupPath } from "./paths.js";
import {
  hostedBackupPolicy,
  dumpEnvironment,
  encryptBackupFile,
} from "./mera/backup-policy.js";
const run = promisify(execFile);
export async function backup() {
  if (
    process.env.MEMORY_DB === "true" ||
    process.env.DISABLE_BACKUPS === "true"
  )
    return;
  const hosted = process.env.MERA_ENABLED === "true";
  const policy = hosted ? hostedBackupPolicy() : null;
  if (hosted && !policy.enabled) return;
  if (
    process.env.BACKUP_ENCRYPTION_KEY &&
    !/^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY)
  )
    throw new Error("BACKUP_ENCRYPTION_KEY must contain 64 hex characters");
  const id = randomUUID();
  await mkdir(backupPath(), { recursive: true });
  await query("INSERT INTO backup_runs(id,status) VALUES($1,$2)", [
    id,
    "running",
  ]);
  const temp = backupPath(`${id}.dump`);
  try {
    const env = dumpEnvironment(process.env.DATABASE_URL);
    await run(
      process.env.PG_DUMP_PATH || "pg_dump",
      ["--format=custom", "--file", temp],
      { env },
    );
    let path = temp;
    if (process.env.BACKUP_ENCRYPTION_KEY) {
      if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY))
        throw new Error("BACKUP_ENCRYPTION_KEY must contain 64 hex characters");
      path = temp + ".enc";
      await encryptBackupFile(temp, path, process.env.BACKUP_ENCRYPTION_KEY);
      await unlink(temp);
    }
    if (process.env.S3_BUCKET && !process.env.BACKUP_ENCRYPTION_KEY)
      throw new Error("Cloud backup requires an encryption key.");
    await query(
      "UPDATE backup_runs SET status='complete',path=$1 WHERE id=$2",
      [path, id],
    );
    const retention =
      Number(process.env.BACKUP_RETENTION_DAYS || 14) * 86400000;
    for (const f of await readdir(backupPath())) {
      const p = backupPath(f);
      if (
        Date.now() - (await stat(p)).mtimeMs > retention &&
        f.endsWith(".enc")
      ) {
        const r = (
          await query("SELECT cloud_status FROM backup_runs WHERE path=$1", [p])
        ).rows[0];
        if (
          r &&
          (r.cloud_status === "uploaded" || (hosted && !process.env.S3_BUCKET))
        ) {
          await unlink(p);
          if (hosted)
            await query(
              "UPDATE backup_runs SET status='pruned',path=NULL WHERE path=$1",
              [p],
            );
        }
      }
    }
  } catch (e) {
    if (hosted) await unlink(temp).catch(() => {});
    await query("UPDATE backup_runs SET status='failed',error=$1 WHERE id=$2", [
      e.message,
      id,
    ]);
  }
}
export async function uploadPending() {
  const hosted = process.env.MERA_ENABLED === "true";
  if (hosted && !hostedBackupPolicy().enabled) return;
  if (!process.env.S3_BUCKET) return;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    maxAttempts: hosted ? 3 : 1,
  });
  for (const b of (
    await query(
      "SELECT * FROM backup_runs WHERE status='complete' AND cloud_status='pending' ORDER BY created_at LIMIT 5",
    )
  ).rows) {
    const execute = hosted ? transaction : async (fn) => fn({ query });
    await execute(async (client) => {
      if (
        hosted &&
        !(
          await client.query(
            "SELECT id FROM backup_runs WHERE id=$1 AND cloud_status='pending' FOR UPDATE SKIP LOCKED",
            [b.id],
          )
        ).rows.length
      )
        return;
      try {
        if (!b.path.endsWith(".enc"))
          throw new Error("Refusing to upload an unencrypted backup.");
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key:
              (hosted ? "mera/" : "gabrieltosh/") +
              b.path.replaceAll("\\", "/").split("/").pop(),
            Body: createReadStream(b.path),
            ContentLength: (await stat(b.path)).size,
          }),
          { abortSignal: AbortSignal.timeout(10000) },
        );
        await client.query(
          "UPDATE backup_runs SET cloud_status='uploaded',error=NULL WHERE id=$1",
          [b.id],
        );
      } catch (e) {
        if (hosted)
          await client.query(
            "UPDATE backup_runs SET cloud_status='failed' WHERE id=$1",
            [b.id],
          );
        await client.query("UPDATE backup_runs SET error=$1 WHERE id=$2", [
          e.message,
          b.id,
        ]);
      }
    });
  }
}
