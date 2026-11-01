// Private setup channel: input comes through stdin, never command-line arguments.
import pg from "pg";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
const inputText = await new Promise((done) => {
  let text = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (text += chunk));
  process.stdin.on("end", () => done(text));
});
let input;
try {
  // .NET Framework's redirected standard input can include a UTF-8 BOM.
  input = JSON.parse(inputText.replace(/^\uFEFF/, ""));
} catch {
  // JSON parser messages can quote the input, which contains setup passwords.
  console.error(
    JSON.stringify({
      ok: false,
      error:
        "The setup input could not be read. Reopen Store setup and try again.",
    }),
  );
  process.exit(1);
}

try {
  if (input.action === "database") {
    if (
      !Number.isInteger(input.port) ||
      input.port < 1024 ||
      input.port > 65535
    )
      throw new Error("Invalid database port.");
    const client = new pg.Client({
      host: "127.0.0.1",
      port: input.port,
      user: "postgres",
      password: input.password,
      database: "postgres",
    });
    await client.connect();
    try {
      let appCredentials;
      try {
        appCredentials = JSON.parse(
          await readFile(input.credentialsFile, "utf8"),
        );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const role = await client.query(
        "SELECT rolname FROM pg_roles WHERE rolname='bingchun_app'",
      );
      if (!role.rows.length) {
        // Generated hex passwords have no SQL quoting characters. Never interpolate user input.
        const password =
          appCredentials?.password || randomBytes(32).toString("hex");
        if (!/^[a-f0-9]{64}$/.test(password))
          throw new Error(
            "The saved database credential has an invalid format.",
          );
        if (!appCredentials)
          await writeFile(input.credentialsFile, JSON.stringify({ password }), {
            flag: "wx",
            mode: 0o600,
          });
        await client.query(
          `CREATE ROLE bingchun_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
        );
      } else if (!appCredentials) {
        throw new Error(
          "The database role exists but its saved credential is missing. Restore the original configuration before continuing.",
        );
      }
      const database = await client.query(
        "SELECT datname FROM pg_database WHERE datname='bingchun'",
      );
      if (!database.rows.length)
        await client.query("CREATE DATABASE bingchun OWNER bingchun_app");
    } finally {
      await client.end();
    }
  } else {
    Object.assign(process.env, parseEnv(await readFile(input.envFile, "utf8")));
    const { migrate, pool, query } = await import("../../server/db.js");
    try {
      if (input.action === "bootstrap") {
        const { seed, createAdmin } = await import("../../server/seed.js");
        await migrate();
        await seed();
        if (input.labelWidth !== undefined || input.labelHeight !== undefined) {
          if (!(
            input.labelWidth >= 20 &&
            input.labelWidth <= 60 &&
            input.labelHeight >= 15 &&
            input.labelHeight <= 150
          ))
            throw new Error("Invalid label dimensions.");
          const template = (
            await query("SELECT value FROM settings WHERE key='receipt'")
          ).rows[0].value;
          await query("UPDATE settings SET value=$1 WHERE key='receipt'", [
            JSON.stringify({
              ...template,
              labelWidth: input.labelWidth,
              labelHeight: input.labelHeight,
            }),
          ]);
        }
        if (!(await query("SELECT id FROM users LIMIT 1")).rows.length) {
          if (
            !input.name?.trim() ||
            !/^[a-zA-Z0-9_.-]{1,80}$/.test(input.username || "")
          )
            throw new Error(
              "Enter an administrator name and a valid username.",
            );
          await createAdmin(input.name.trim(), input.username, input.password);
        }
      } else if (input.action === "backup") {
        const { backup } = await import("../../server/backup.js");
        await backup();
        const latest = (
          await query(
            "SELECT status,error FROM backup_runs ORDER BY created_at DESC LIMIT 1",
          )
        ).rows[0];
        if (latest?.status !== "complete")
          throw new Error(latest?.error || "Backup did not complete.");
      } else if (input.action === "check") {
        await query("SELECT 1");
      } else throw new Error("Unknown setup action.");
    } finally {
      await pool.end();
    }
  }
  console.log(JSON.stringify({ ok: true }));
} catch (e) {
  // Do not echo database URLs, passwords, or SQL from failed drivers into logs.
  const messages = {
    "28P01":
      "Database authentication failed. Recheck the saved database credentials.",
    ECONNREFUSED: "The local database service is not reachable.",
    42501: "The database account does not have the required permissions.",
  };
  console.error(
    JSON.stringify({
      ok: false,
      error:
        messages[e.code] ||
        (e.code ? "Database setup failed (" + e.code + ")." : e.message),
    }),
  );
  process.exitCode = 1;
}
