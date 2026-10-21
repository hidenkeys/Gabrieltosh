import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "bing-chun-pg-test-"));
const pg = new EmbeddedPostgres({
  databaseDir: join(dir, "db"),
  user: "pos_test",
  password: "TemporaryTestOnly",
  port: 55439,
  persistent: false,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (m) => console.error(String(m)),
});
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("pos_test");
  const child = spawn(
    process.execPath,
    ["--test", "tests/api.test.js", "tests/domain.test.js"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_DATABASE_URL:
          "postgres://pos_test:TemporaryTestOnly@127.0.0.1:55439/pos_test",
      },
    },
  );
  process.exitCode = await new Promise((r) => child.once("exit", r));
} finally {
  await pg.stop();
  await rm(dir, { recursive: true, force: true });
}
