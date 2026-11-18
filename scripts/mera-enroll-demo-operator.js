// Explicit local-demo provisioning, never a production operator bootstrap.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { base32, encryptFactor, platformKey } from "../server/mera/platform.js";
if (process.env.NODE_ENV === "production" || process.env.MERA_DEMO !== "true")
  throw new Error(
    "Operator demo provisioning requires isolated non-production MERA_DEMO=true.",
  );
const target = new URL(process.env.DATABASE_URL || "");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.port !== "55441"
)
  throw new Error(
    "Only the isolated Mera demo database on loopback55441 is permitted.",
  );
const userId = process.argv[2];
if (!/^[a-f\d-]{36}$/i.test(userId || ""))
  throw new Error("Pass the explicit existing demonstration user UUID.");
const key = platformKey(),
  secret = base32(randomBytes(20));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  const user = (
    await client.query(
      "SELECT id FROM users WHERE id=$1 AND active=true FOR UPDATE",
      [userId],
    )
  ).rows[0];
  if (!user) throw new Error("Active demonstration user not found.");
  const prior = (
    await client.query(
      "SELECT user_id FROM mera_platform_factors WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  if (prior)
    throw new Error(
      "An authenticator is already provisioned; refusing to replace it.",
    );
  await client.query(
    "INSERT INTO mera_platform_members(user_id,active,strong_auth_verified) VALUES($1,true,false) ON CONFLICT(user_id) DO UPDATE SET active=true",
    [userId],
  );
  await client.query(
    "INSERT INTO mera_platform_factors(user_id,secret_cipher) VALUES($1,$2)",
    [userId, encryptFactor(secret, key)],
  );
  await client.query("COMMIT");
  console.log(
    "DEMONSTRATION ONLY. Add this secret to an authenticator; do not commit or share it.",
  );
  console.log(
    "otpauth://totp/Mera:local-demo?secret=" +
      secret +
      "&issuer=Mera&algorithm=SHA1&digits=6&period=30",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
