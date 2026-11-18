// Coding-task evidence tracker. Never imported by the Mera product.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url),
  path = new URL("MERA_UI_PROGRESS.json", root);
const data = JSON.parse(await readFile(path, "utf8"));
const checkpoints = new Set([0, 40, 60, 80, 100]),
  statuses = new Set([
    "NOT_STARTED",
    "IN_PROGRESS",
    "BLOCKED",
    "READY_FOR_REVIEW",
    "VERIFIED",
  ]);
const ids = new Set(data.tasks.map((t) => t.id));
if (ids.size !== data.tasks.length) throw new Error("Duplicate task ID");
if (data.tasks.reduce((n, t) => n + t.weight, 0) !== 100)
  throw new Error("Task weights must total100");
for (const t of data.tasks) {
  if (
    !checkpoints.has(t.checkpoint) ||
    !statuses.has(t.status) ||
    !(t.weight > 0)
  )
    throw new Error("Invalid task " + t.id);
  if (t.checkpoint > 0 && !t.evidence.length)
    throw new Error("Missing evidence for " + t.id);
  if (t.status === "VERIFIED" && t.checkpoint !== 100)
    throw new Error("VERIFIED requires100: " + t.id);
  for (const dep of t.dependencies)
    if (!ids.has(dep)) throw new Error("Unknown dependency " + dep);
  for (const e of t.evidence) {
    if (e.startsWith("http")) continue;
    await readFile(new URL(e, root));
  }
}
for (const s of data.screens)
  for (const id of s.taskIds)
    if (!ids.has(id)) throw new Error("Unmapped screen " + s.id);
for (const g of data.workstreams)
  if (
    data.tasks
      .filter((t) => t.workstream === g.id)
      .reduce((n, t) => n + t.weight, 0) !== g.weight
  )
    throw new Error("Workstream allocation mismatch " + g.id);
const points = data.tasks.reduce(
    (n, t) => n + (t.weight * t.checkpoint) / 100,
    0,
  ),
  complete = Math.floor(points + 1e-9);
const lines = [
  "# Mera UI correction progress",
  "",
  `Goal: ${data.goal}`,
  "",
  `Scope **${data.scopeVersion}** · revision \`${data.revision}\` · updated ${data.lastUpdated}`,
  "",
  `**UI correction: ${complete}% complete | ${100 - complete}% remaining.** Weighted evidence: ${points.toFixed(1)}/100. This is checklist completion, not a time estimate.`,
  "",
  data.baselineNote,
  "",
  "## Current milestone",
  "",
  "Private visit and approved isolated platform MFA/read/review milestones verified at9533313; subscription surface corrected. Next complete remaining management/operational screens, customer help/checkout/recovery, shared primitives and broad state/accessibility acceptance. Live provider and hardware gates remain separate.",
  "",
  "## Measurement",
  "",
  "Weights are frozen in scope1.0. Checkpoints:0 planned/not implemented;40 real interfaces and required states implemented;60 integrated and exercised;80 reference/size/accessibility review corrected;100 acceptance/regressions/evidence/lead review passed. The highest fully supported checkpoint applies. Changes can reopen tasks and remove credit. Source/backend completeness alone earns no UI credit.",
  "",
  "## Workstreams",
  "",
  "| Workstream | Weight | Verified completion | Owner |",
  "| --- | ---: | ---: | --- |",
];
for (const g of data.workstreams) {
  const earned = data.tasks
    .filter((t) => t.workstream === g.id)
    .reduce((n, t) => n + (t.weight * t.checkpoint) / 100, 0);
  lines.push(
    `| ${g.title} | ${g.weight}% | ${Math.floor((earned / g.weight) * 100 + 1e-9)}% | ${g.owner} |`,
  );
}
lines.push(
  "",
  "## Task board",
  "",
  "| ID | Task | Weight | Checkpoint | Status / owner | Evidence |",
  "| --- | --- | ---: | ---: | --- | --- |",
);
for (const t of data.tasks)
  lines.push(
    `| ${t.id} | ${t.title} | ${t.weight}% | ${t.checkpoint}% | ${t.status} · ${t.owner} | ${t.evidence.map((e) => `[${e.split("/").at(-1)}](${e})`).join(", ") || "Pending"} |`,
  );
lines.push(
  "",
  "Task acceptance criteria, dependency IDs, change history and blockers are in [MERA_UI_PROGRESS.json](MERA_UI_PROGRESS.json). Every implemented surface/workflow is mapped below; section locators do not claim new browser routes.",
  "",
  "## Screen and workflow inventory",
  "",
  "| Screen | Route / section | Role | Tasks | Components / primary job | State / visual acceptance |",
  "| --- | --- | --- | --- | --- | --- |",
);
for (const s of data.screens)
  lines.push(
    `| ${s.id} | ${s.route.replaceAll("|", " / ")} | ${s.role} | ${s.taskIds.join(", ")} | ${s.task} | ${s.visualReview}; ${s.responsive} |`,
  );
lines.push(
  "",
  "## Separate PRD coverage",
  "",
  `Status: ${data.overallPrdCoverage.status}. ${data.overallPrdCoverage.note} Counts/percentage remain unestablished until the atomic PRD map is complete. Historical evidence remains in [ACCEPTANCE](docs/mera/ACCEPTANCE.md) and [BOARD](docs/mera/BOARD.md), including explicit incomplete implementation work.`,
  "",
  "## Production readiness",
  "",
  `**${data.productionReadiness.status}**. UI completion does not clear these gates:`,
  "",
  ...data.productionReadiness.gates.map((x) => "- " + x),
  "",
  "## Current dependencies and next actions",
  "",
  "- F2: owner selected option1, ivory and green. Exact reference saved and homepage comparison accepted; platform adapts the identity with task-appropriate layouts.",
  "- F4/F5: lead owns shared shell/primitives; workers request mounts rather than competing edits to OrganizationWorkspace/main/global styles.",
  "- C1: menu/cart and dialog pilot integrated and exercised. Source comparison passed; complete broader checkout, visit, reservation and theme state acceptance.",
  "- Stock-history, refund-requests and workspace-admin are now mounted with actual PostgreSQL integration checks. Dedicated print/alias/end-session assertions remain pending. Show real unavailability, never mock success or label an error as empty data.",
  "- Overview/POS comparisons and all-page shell review passed. Full role/state and operational workflow acceptance remain open; screenshots prove only their captured states.",
  "- Preserve current uncommitted work. No production deployment, real funds, external sending or production data changes authorized.",
  "",
  "## Scope history",
  "",
  ...data.history.map(
    (h) =>
      `- ${h.at}: ${h.event}; weight ${h.scopeWeight}; ${h.weightedPoints} points / ${h.roundedCompletion}% rounded.`,
  ),
  "",
  "Regenerate this report with `node scripts/mera-ui-progress.js`. The calculation validates weights, task IDs, mapped screens and local evidence paths; the lead still reviews whether evidence supports each checkpoint.",
  "",
);
await writeFile(new URL("MERA_UI_PROGRESS.md", root), lines.join("\n"));
console.log(
  JSON.stringify({
    scopeVersion: data.scopeVersion,
    completion: complete,
    remaining: 100 - complete,
    weightedPoints: Number(points.toFixed(2)),
    tasks: data.tasks.length,
    screens: data.screens.length,
    tracker: fileURLToPath(new URL("MERA_UI_PROGRESS.md", root)),
  }),
);
