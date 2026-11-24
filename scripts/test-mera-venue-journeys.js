// Every journey owns a disposable PostgreSQL cluster on port 55446. No preview
// credentials, persistent data directories or remote databases are accepted.
import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["--test", "tests/mera-venue-journeys.test.js"],
  {
    stdio: "inherit",
    env: { ...process.env, RUN_MERA_VENUE_PG_TESTS: "true" },
  },
);
child.on("error", () => {
  console.error("Could not launch isolated venue journeys.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
