import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createDecipheriv } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hostedBackupPolicy,
  dumpEnvironment,
  encryptBackupFile,
  scheduledHostedBackup,
} from "../server/mera/backup-policy.js";
test("hosted backups fail closed and cannot inherit a libpq service redirection", () => {
  assert.equal(hostedBackupPolicy({ MERA_ENABLED: "true" }).enabled, false);
  const enabled = {
    MERA_ENABLED: "true",
    MERA_BACKUPS_ENABLED: "true",
    BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    BACKUP_INTERVAL_HOURS: "6",
    BACKUP_RETENTION_DAYS: "14",
  };
  assert.equal(hostedBackupPolicy(enabled).enabled, true);
  for (const patch of [
    { BACKUP_ENCRYPTION_KEY: "" },
    { BACKUP_RETENTION_DAYS: "" },
    { BACKUP_INTERVAL_HOURS: "0" },
  ])
    assert.throws(() => hostedBackupPolicy({ ...enabled, ...patch }));
  const env = dumpEnvironment(
    "postgresql://fixture:dummy@127.0.0.1:55441/demo?sslmode=require",
    {
      PATH: "/bin",
      PGSERVICE: "wrong-service",
      PGSERVICEFILE: "/wrong",
      PGOPTIONS: "-c wrong",
      PGHOST: "foreign",
      PGPASSWORD: "inherited",
    },
  );
  assert.equal(env.PGHOST, "127.0.0.1");
  assert.equal(env.PGDATABASE, "demo");
  assert.equal(env.PGSSLMODE, "require");
  assert.equal(env.PGSERVICE, undefined);
  assert.equal(env.PGOPTIONS, undefined);
  assert.equal(env.PGPASSWORD, "dummy");
});
test("streamed backup envelope decrypts exactly and rejects ciphertext tampering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mera-encryption-test-")),
    source = join(directory, "source.dump"),
    dest = join(directory, "backup.enc"),
    key = randomBytes(32),
    bytes = randomBytes(256000);
  try {
    await writeFile(source, bytes);
    await encryptBackupFile(source, dest, key.toString("hex"));
    const encrypted = await readFile(dest);
    assert.equal(encrypted.subarray(0, 4).toString(), "BC01");
    const decrypt = (value) => {
      const cipher = createDecipheriv(
        "aes-256-gcm",
        key,
        value.subarray(4, 16),
      );
      cipher.setAuthTag(value.subarray(16, 32));
      return Buffer.concat([cipher.update(value.subarray(32)), cipher.final()]);
    };
    assert.deepEqual(decrypt(encrypted), bytes);
    assert.equal((await stat(dest)).mode & 0o777, 0o600);
    encrypted[50] ^= 1;
    assert.throws(() => decrypt(encrypted));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("scheduled backup lease prevents duplicate workers and bounds failed retries", async () => {
  const now = Date.now(),
    env = {
      MERA_ENABLED: "true",
      MERA_BACKUPS_ENABLED: "true",
      BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      BACKUP_INTERVAL_HOURS: "6",
      BACKUP_RETENTION_DAYS: "14",
    };
  let acquired = true,
    rows = [],
    calls = 0;
  const db = {
    transaction: async (fn) =>
      fn({
        query: async (sql) => ({
          rows: sql.includes("pg_try_advisory")
            ? [{ acquired }]
            : sql.startsWith("SELECT")
              ? rows
              : [],
        }),
      }),
  };
  assert.equal(
    await scheduledHostedBackup(db, async () => calls++, env, now),
    true,
  );
  acquired = false;
  assert.equal(
    await scheduledHostedBackup(db, async () => calls++, env, now),
    false,
  );
  assert.equal(calls, 1);
  acquired = true;
  rows = [{ status: "complete", created_at: new Date(now - 1000) }];
  assert.equal(
    await scheduledHostedBackup(db, async () => calls++, env, now),
    false,
  );
  rows = Array.from({ length: 3 }, () => ({
    status: "failed",
    created_at: new Date(now - 3600000),
  }));
  assert.equal(
    await scheduledHostedBackup(db, async () => calls++, env, now),
    false,
  );
  assert.equal(calls, 1);
});
