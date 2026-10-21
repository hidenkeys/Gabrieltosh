import { readFile, writeFile } from "node:fs/promises";
import { createDecipheriv } from "node:crypto";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: node --env-file=.env scripts/restore-backup.js <backup.dump.enc> <recovered.dump>",
  );
const bytes = await readFile(input);
if (bytes.subarray(0, 4).toString() !== "BC01")
  throw new Error("Unknown backup format");
if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY || ""))
  throw new Error("Provide the original BACKUP_ENCRYPTION_KEY.");
const decipher = createDecipheriv(
  "aes-256-gcm",
  Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex"),
  bytes.subarray(4, 16),
);
decipher.setAuthTag(bytes.subarray(16, 32));
await writeFile(
  output,
  Buffer.concat([decipher.update(bytes.subarray(32)), decipher.final()]),
  { flag: "wx" },
);
console.log(
  "Backup decrypted. Restore into a NEW PostgreSQL database and validate it before switching the application.",
);
