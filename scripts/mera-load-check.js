// Bounded, read-only local development measurement, never a production load test.
import { performance } from "node:perf_hooks";
if (process.env.NODE_ENV === "production")
  throw new Error("Development load check refuses production mode.");
const target =
  "http://127.0.0.1:3003/api/mera/v1/public/bing-chun/20000000-0000-4000-8000-000000000001/menu";
const response = await fetch("http://127.0.0.1:3003/api/health", {
  signal: AbortSignal.timeout(5000),
});
if (!response.ok) throw new Error("The isolated preview is not available.");
const durations = [];
let failures = 0,
  next = 0;
const start = performance.now();
await Promise.all(
  Array.from({ length: 10 }, async () => {
    while (next++ < 50) {
      const begin = performance.now();
      try {
        const result = await fetch(target, {
          signal: AbortSignal.timeout(10000),
        });
        if (!result.ok) throw new Error("HTTP " + result.status);
        const body = await result.json();
        if (!Array.isArray(body.products)) throw new Error("Invalid menu");
      } catch {
        failures++;
      }
      durations.push(performance.now() - begin);
    }
  }),
);
durations.sort((a, b) => a - b);
const percentile = (p) =>
  Math.round(
    durations[
      Math.min(durations.length - 1, Math.ceil(p * durations.length) - 1)
    ],
  );
console.log(
  JSON.stringify(
    {
      environment: "isolated_local_preview",
      profile: {
        requests: 50,
        concurrentReaders: 10,
        route: "published_menu",
        writes: 0,
      },
      result: {
        failures,
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        maximumMs: Math.round(durations.at(-1)),
        elapsedMs: Math.round(performance.now() - start),
      },
      limitations: [
        "Local server and loopback only",
        "Small demonstration dataset",
        "No representative mobile device, WAN latency or production capacity claim",
      ],
    },
    null,
    2,
  ),
);
if (failures) process.exitCode = 1;
