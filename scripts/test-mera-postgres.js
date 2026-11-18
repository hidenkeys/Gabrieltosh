import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["--test", "tests/mera.integration.test.js"],
  { stdio: "inherit", env: { ...process.env, RUN_MERA_PG_TESTS: "true" } },
);
child.on("error", () => {
  console.error("Could not launch isolated Mera PostgreSQL tests.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
