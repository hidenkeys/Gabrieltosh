import { randomUUID, randomBytes, createCipheriv } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  stat,
  unlink,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "./db.js";
const run = promisify(execFile);
export async function backup() {
  if (
    process.env.MEMORY_DB === "true" ||
    process.env.DISABLE_BACKUPS === "true"
  )
    return;
  const id = randomUUID();
  await mkdir("backups", { recursive: true });
  await query("INSERT INTO backup_runs(id,status) VALUES($1,$2)", [
    id,
    "running",
  ]);
  const temp = `backups/${id}.dump`;
  try {
    const url = new URL(process.env.DATABASE_URL);
    const env = {
      ...process.env,
      PGPASSWORD: decodeURIComponent(url.password),
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username),
      PGDATABASE: url.pathname.slice(1),
    };
    await run("pg_dump", ["--format=custom", "--file", temp], { env });
    let path = temp;
    if (process.env.BACKUP_ENCRYPTION_KEY) {
      if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY))
        throw new Error("BACKUP_ENCRYPTION_KEY must contain 64 hex characters");
      const iv = randomBytes(12),
        cipher = createCipheriv(
          "aes-256-gcm",
          Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex"),
          iv,
        );
      const encrypted = Buffer.concat([
        cipher.update(await readFile(temp)),
        cipher.final(),
      ]);
      path = temp + ".enc";
      await writeFile(
        path,
        Buffer.concat([
          Buffer.from("BC01"),
          iv,
          cipher.getAuthTag(),
          encrypted,
        ]),
      );
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
    for (const f of await readdir("backups")) {
      const p = "backups/" + f;
      if (
        Date.now() - (await stat(p)).mtimeMs > retention &&
        f.endsWith(".enc")
      ) {
        const r = (
          await query("SELECT cloud_status FROM backup_runs WHERE path=$1", [p])
        ).rows[0];
        if (r?.cloud_status === "uploaded") await unlink(p);
      }
    }
  } catch (e) {
    await query("UPDATE backup_runs SET status='failed',error=$1 WHERE id=$2", [
      e.message,
      id,
    ]);
  }
}
export async function uploadPending() {
  if (!process.env.S3_BUCKET) return;
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
  });
  for (const b of (
    await query(
      "SELECT * FROM backup_runs WHERE status='complete' AND cloud_status='pending' ORDER BY created_at LIMIT 5",
    )
  ).rows) {
    try {
      if (!b.path.endsWith(".enc"))
        throw new Error("Refusing to upload an unencrypted backup.");
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: "gabrieltosh/" + b.path.split("/").pop(),
          Body: await readFile(b.path),
        }),
      );
      await query(
        "UPDATE backup_runs SET cloud_status='uploaded',error=NULL WHERE id=$1",
        [b.id],
      );
    } catch (e) {
      await query("UPDATE backup_runs SET error=$1 WHERE id=$2", [
        e.message,
        b.id,
      ]);
    }
  }
}
