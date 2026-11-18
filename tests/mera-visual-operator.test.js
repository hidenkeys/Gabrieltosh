import test from "node:test";
import assert from "node:assert/strict";
import { stat, readFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import bcrypt from "bcryptjs";
import {
  visualOperatorConfig,
  inspectVisualTarget,
  runVisualOperator,
  writeVisualSecrets,
  loadVisualOperatorSecrets,
  visualOperatorProcessEnvironment,
} from "../scripts/mera-visual-operator.js";
const env = {
  MERA_DEMO: "true",
  DATABASE_URL:
    "postgres://mera_demo:fixture-placeholder@127.0.0.1:55443/postgres",
};

test("operator tool refuses production, other clusters and arbitrary target arguments", () => {
  for (const bad of [
    { ...env, NODE_ENV: "production" },
    { ...env, MERA_DEMO: "false" },
    { ...env, DATABASE_URL: env.DATABASE_URL.replace("55443", "55441") },
    {
      ...env,
      DATABASE_URL: env.DATABASE_URL.replace("127.0.0.1", "remote.example"),
    },
    { ...env, DATABASE_URL: env.DATABASE_URL + "?host=remote.example" },
  ])
    assert.throws(() => visualOperatorConfig(bad));
  assert.throws(() => visualOperatorConfig(env, ["--target=/tmp/database"]));
  assert.throws(() => visualOperatorConfig(env, ["--provision"]), /MFA key/);
  assert.equal(visualOperatorConfig(env).provision, false);
});
test("preflight verifies exact SQL data directory and live local simulation without writes", async () => {
  const config = visualOperatorConfig(env),
    calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      return {
        rows: sql.startsWith("SELECT current_setting")
          ? [
              {
                directory: config.databaseDir,
                address: "127.0.0.1",
                port: 55443,
              },
            ]
          : [],
      };
    },
  };
  const result = await inspectVisualTarget(client, config, {
    resolvePath: async (path) => path,
    fetcher: async (url) =>
      Response.json(
        url.endsWith("/health")
          ? { ok: true, local: true, mode: "simulation" }
          : { registration: "simulator" },
      ),
  });
  assert.equal(result.databaseVerified, true);
  assert.equal(result.appSimulationVerified, true);
  assert.equal(result.appDatabaseAttestation, false);
  assert.ok(calls.every((sql) => sql.startsWith("SELECT")));
  await assert.rejects(
    inspectVisualTarget(
      {
        query: async () => ({
          rows: [
            { directory: "/different/db", address: "127.0.0.1", port: 55443 },
          ],
        }),
      },
      config,
      { resolvePath: async (path) => path },
    ),
    /dedicated visual/,
  );
  await assert.rejects(
    inspectVisualTarget(client, config, {
      resolvePath: async (path) => path,
      fetcher: async () =>
        Response.json({ ok: true, local: true, mode: "actual" }),
    }),
    /simulation mode/,
  );
});
test("existing accounts or authenticators cannot be overwritten", async () => {
  const config = visualOperatorConfig(env);
  for (const conflict of ["users", "mera_platform_factors"]) {
    const client = {
      query: async (sql) => ({
        rows: sql.startsWith("SELECT current_setting")
          ? [
              {
                directory: config.databaseDir,
                address: "127.0.0.1",
                port: 55443,
              },
            ]
          : sql.includes("FROM " + conflict)
            ? [{ id: "exists" }]
            : [],
      }),
    };
    await assert.rejects(
      inspectVisualTarget(client, config, {
        resolvePath: async (path) => path,
        fetcher: async (url) =>
          Response.json(
            url.endsWith("/health")
              ? { ok: true, local: true, mode: "simulation" }
              : { registration: "simulator" },
          ),
      }),
      /already exists|already has/,
    );
  }
});
test("default invocation uses a read-only transaction and never allocates secrets", async () => {
  const queries = [];
  const result = await runVisualOperator({
    env,
    client: {
      query: async (sql) => {
        queries.push(sql);
        return { rows: [] };
      },
    },
    inspect: async () => ({ databaseVerified: true }),
    secretWriter: async () => {
      throw Error("must not allocate");
    },
  });
  assert.equal(result.mode, "read_only");
  assert.deepEqual(queries, ["BEGIN READ ONLY", "ROLLBACK"]);
});
test("explicit fixture writes only a bcrypt user, operator membership and encrypted factor", async () => {
  const writes = [];
  let privateValues;
  const result = await runVisualOperator({
    env: { ...env, MERA_PLATFORM_MFA_KEY: "ab".repeat(32) },
    args: ["--provision"],
    client: {
      query: async (sql, args) => {
        writes.push({ sql, args });
        return { rows: [] };
      },
    },
    inspect: async () => ({ databaseVerified: true }),
    secretWriter: async (values) => {
      privateValues = values;
      return {
        path: "/private/tmp/fixture/secrets.json",
        cleanup: async () => {},
      };
    },
  });
  const inserts = writes.filter((row) => row.sql.startsWith("INSERT"));
  assert.equal(inserts.length, 3);
  assert.ok(inserts[0].sql.includes("INTO users"));
  assert.ok(inserts[1].sql.includes("INTO mera_platform_members"));
  assert.ok(inserts[2].sql.includes("INTO mera_platform_factors"));
  assert.equal(
    await bcrypt.compare(privateValues.password, inserts[0].args[2]),
    true,
  );
  assert.notEqual(inserts[2].args[1], privateValues.totpSecret);
  assert.ok(
    !writes.some((row) =>
      /INTO (sessions|mera_platform_stepups|mera_memberships)|UPDATE|DELETE/.test(
        row.sql,
      ),
    ),
  );
  assert.equal(result.normalLoginRequired, true);
  assert.equal(result.mfaRequired, true);
  assert.equal(result.password, undefined);
  assert.equal(result.totpSecret, undefined);
  assert.equal(writes.at(-1).sql, "COMMIT");
});
test("failed inserts roll back and remove only the newly allocated private file", async () => {
  let removed = false;
  const queries = [];
  await assert.rejects(
    runVisualOperator({
      env: { ...env, MERA_PLATFORM_MFA_KEY: "ab".repeat(32) },
      args: ["--provision"],
      client: {
        query: async (sql) => {
          queries.push(sql);
          if (sql.startsWith("INSERT")) throw Error("fixture failure");
          return { rows: [] };
        },
      },
      inspect: async () => ({}),
      secretWriter: async () => ({
        path: "/private/tmp/fixture/secrets.json",
        cleanup: async () => {
          removed = true;
        },
      }),
    }),
    /fixture failure/,
  );
  assert.equal(removed, true);
  assert.equal(queries.at(-1), "ROLLBACK");
});
test("secret artifact is exclusive outside the repository with 0700 directory and 0600 file", async () => {
  const file = await writeVisualSecrets({
    purpose: "test-fixture-only",
    value: "not-a-live-secret",
  });
  try {
    assert.equal((await stat(dirname(file.path))).mode & 0o777, 0o700);
    assert.equal((await stat(file.path)).mode & 0o777, 0o600);
    assert.equal(
      JSON.parse(await readFile(file.path, "utf8")).purpose,
      "test-fixture-only",
    );
  } finally {
    await file.cleanup();
  }
});

test("private fixture loads to memory and supplies only a visual child process key without logging", async () => {
  const values = {
    purpose: "isolated_visual_qa_only",
    appUrl: "http://127.0.0.1:3006",
    username: "mera-visual-qa-operator",
    password: "testonly_".repeat(6),
    totpSecret: "A".repeat(32),
    mfaKey: "ab".repeat(32),
    createdAt: new Date().toISOString(),
  };
  const file = await writeVisualSecrets(values);
  try {
    assert.deepEqual(await loadVisualOperatorSecrets(file.path), values);
    const base = { NODE_ENV: "development", PATH: "fixture-path" };
    const child = await visualOperatorProcessEnvironment(file.path, base);
    assert.equal(child.MERA_PLATFORM_MFA_KEY, values.mfaKey);
    assert.equal(child.MERA_PREVIEW_INSTANCE, "visual");
    assert.equal(child.MERA_PREVIEW_PORT, "3006");
    assert.equal(child.MERA_PREVIEW_DB_PORT, "55443");
    assert.equal(child.password, undefined);
    assert.equal(child.totpSecret, undefined);
    assert.equal(base.MERA_PLATFORM_MFA_KEY, undefined);
    await assert.rejects(
      visualOperatorProcessEnvironment(file.path, { NODE_ENV: "production" }),
      /production/,
    );
    await chmod(file.path, 0o644);
    await assert.rejects(
      loadVisualOperatorSecrets(file.path),
      /private, owned/,
    );
  } finally {
    await file.cleanup();
  }
});
