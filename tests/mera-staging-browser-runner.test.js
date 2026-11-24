import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Load only the runner's control flow. No browser, credentials or staging
// bootstrap executes: these checks cover evidence ownership on failed writes.
const source = readFileSync(
  new URL("../scripts/mera-staging-browser-journeys.mjs", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "runner.mjs",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
const step = ast.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "step",
);

test("every bare runner assertion describes its expected outcome", () => {
  let count = 0;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "assert"
    ) {
      count++;
      const line = ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      assert(
        node.arguments.length >= 2,
        `Runner assertion on line ${line} needs an expectation message`,
      );
      assert(
        node.arguments[1].getText(ast).trim().length > 2,
        `Runner assertion on line ${line} has an empty message`,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(count > 0, "The runner must retain its safety and state assertions");
});

for (const actor of ["central_stock", "branch_manager"]) {
  test(`a failed ${actor} transfer captures its acting page instead of the owner's Orders page`, async () => {
    const owner = {},
      sender = {},
      receiver = {};
    const pageActors = new WeakMap([
      [owner, "owner"],
      [sender, "central_stock"],
      [receiver, "branch_manager"],
    ]);
    const images = [];
    const journal = { operations: [] },
      results = { steps: [] };
    const sandbox = {
      activePage: owner,
      pageActors,
      journal,
      results,
      assert,
      persist: async () => {},
      evidence: async () => {},
      workspace: async () => ({
        branch: {
          id: "pool",
          settings: { syntheticPortfolio: "portfolio-v1" },
        },
      }),
      record: (_venue, name, pass, notes, error) =>
        results.steps.push({ name, pass, notes, error: error?.message }),
      shot: async (_venue, page, name) => images.push({ page, name }),
    };
    const runStep = vm.runInNewContext(`(${step.getText(ast)})`, sandbox);
    await assert.rejects(
      () =>
        runStep(
          { slug: "harbour-hotel", branch: { id: "pool" } },
          "Stock transfer",
          async () => {
            sandbox.activePage = sender;
            if (actor === "branch_manager") sandbox.activePage = receiver;
            throw Error("Transfer UI action failed");
          },
          owner,
        ),
      /Transfer UI action failed/,
    );
    assert.equal(images.length, 1);
    assert.equal(images[0].page, actor === "central_stock" ? sender : receiver);
    assert.match(images[0].name, new RegExp(actor));
    assert.equal(journal.operations[0].state, "failed");
    assert.equal(journal.operations[0].actor, actor);
    assert.equal(results.steps[0].actor, actor);
  });
}

const ensureTable = ast.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "ensureJourneyTable",
);
const freeTable = ast.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (declaration) => declaration.name.getText(ast) === "tableIsFree",
    ),
);
for (const slug of [
  "oak-ember",
  "daybreak-afterdark",
  "velvet-lounge",
  "pulse",
  "harbour-hotel",
  "saffron-room",
]) {
  test(`${slug} creates a marked six-seat fallback only through the owner's Floor layout`, async () => {
    const marker = "E2E table-fallback";
    const fields = {};
    const clicks = [];
    const created = {
      id: "new-table",
      name: marker,
      status: "available",
      capacity: 6,
      zone: slug === "pulse" ? "VIP" : "Main floor",
    };
    // The seeded table claims availability but is held: never reuse or close it.
    const before = {
      tables: [
        { id: "seed", name: "Seeded table", status: "available", capacity: 6 },
      ],
      visits: [{ id: "seed-party", tableId: "seed", status: "open" }],
    };
    const after = {
      tables: [...before.tables, created],
      visits: structuredClone(before.visits),
    };
    const form = {
      getByLabel: (name) => ({
        fill: async (value) => {
          fields[name] = value;
        },
      }),
      getByRole: (_role, { name }) => ({
        fill: async (value) => {
          fields[name] = value;
        },
        click: async () => {
          clicks.push(name);
        },
      }),
    };
    const owner = {
      getByRole: (role, { name }) =>
        role === "form"
          ? form
          : {
              click: async () => {
                clicks.push(name);
              },
            },
    };
    let reads = 0;
    const configurationSteps = [];
    const sandbox = {
      assert,
      marker,
      journal: {},
      results: {},
      workspace: async () => (++reads === 1 ? before : after),
      persist: async () => {},
      evidence: async () => {},
      go: async (page, name) => {
        assert.equal(page, owner);
        clicks.push(name);
      },
      step: async (_v, name, fn, page) => {
        assert.equal(page, owner);
        configurationSteps.push(name);
        return fn();
      },
      mutate: async (page, suffix, action) => {
        assert.equal(page, owner);
        assert.equal(suffix, "/tables");
        await action();
        return created;
      },
    };
    const run = vm.runInNewContext(
      `${freeTable.getText(ast)}; (${ensureTable.getText(ast)})`,
      sandbox,
    );
    const v = {
      slug,
      branch: { id: "branch" },
      owner,
      ...(slug === "pulse" ? { reservation: { partySize: 3 } } : {}),
    };
    assert.equal(await run(v), true);
    assert.deepEqual(fields, {
      "Table label": marker,
      Seats: "6",
      Zone: created.zone,
    });
    assert.deepEqual(clicks, [
      "Tables & visits",
      "Floor layout",
      "Create table",
    ]);
    assert.equal(configurationSteps.length, 1);
    assert.match(configurationSteps[0], /Owner configuration/);
    assert.equal(v.table.id, created.id);
    assert.equal(sandbox.journal.configurationChanges[0].tableId, created.id);
    assert.equal(
      sandbox.results.configurationChanges[0].kind,
      "configuration-change",
    );
    assert.equal(sandbox.results.configurationChanges[0].permanent, true);
    assert.equal(sandbox.results.configurationChanges[0].state, "verified");
    assert.equal(before.visits[0].status, "open");
  });
}

test("an available unheld table is reused without configuration writes", async () => {
  const table = { id: "free", status: "available", capacity: 6 };
  const sandbox = {
    assert,
    workspace: async () => ({ tables: [table], visits: [] }),
    step: async () => {
      throw Error("No configuration step should run for an available table");
    },
  };
  const run = vm.runInNewContext(
    `${freeTable.getText(ast)}; (${ensureTable.getText(ast)})`,
    sandbox,
  );
  const v = { slug: "pulse", reservation: { partySize: 3 } };
  assert.equal(await run(v), false);
  assert.equal(v.table, table);
});

const variable = (name) =>
  ast.statements
    .find(
      (node) =>
        ts.isVariableStatement(node) &&
        node.declarationList.declarations.some(
          (declaration) => declaration.name.getText(ast) === name,
        ),
    )
    .getText(ast);
const functionSource = (name) =>
  ast.statements
    .find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)
    .getText(ast);
test("reservation dates are deterministic, later than the old slot and spread across six days", () => {
  const source = `${variable("reservationSeed")}; (${functionSource("reservationCandidateDay")})`;
  const v = { slug: "saffron-room", branch: { settings: {} } };
  const now = new Date("2026-11-24T12:00:00Z");
  const run = vm.runInNewContext(source, { assert, runId: "e2e-next" });
  const dates = Array.from({ length: 6 }, (_, attempt) => run(v, attempt, now));
  assert.equal(new Set(dates).size, 6);
  assert.deepEqual(
    dates,
    Array.from({ length: 6 }, (_, attempt) => run(v, attempt, now)),
  );
  assert(dates.every((day) => day >= "2026-12-01" && day <= "2026-12-22"));
  const different = vm.runInNewContext(source, {
    assert,
    runId: "e2e-another",
  });
  assert.notEqual(dates[0], different(v, 0, now));
});

test("leftover inspection preserves other runs and refuses replay of this exact run's transactions", async () => {
  const state = {
    orders: [],
    tables: [{ id: "own-table", name: "E2E exact-run" }],
    visits: [
      { id: "other", displayName: "E2E exact-run-other", status: "open" },
    ],
    reservations: [],
  };
  const saved = structuredClone(state);
  const sandbox = {
    assert,
    runId: "exact-run",
    marker: "E2E exact-run",
    journal: {},
    results: {},
    workspace: async () => state,
    persist: async () => {},
    evidence: async () => {},
    step: async (_v, _name, fn) => fn(),
  };
  const inspect = vm.runInNewContext(
    `${variable("hasRunMarker")}; (${functionSource("inspectOwnLeftovers")})`,
    sandbox,
  );
  await inspect({ slug: "oak-ember" });
  assert.deepEqual(state, saved);
  assert.equal(sandbox.results.leftovers[0].visitIds.length, 0);
  assert.equal(sandbox.results.leftovers[0].tableIds[0], "own-table");
  state.visits.push({
    id: "own",
    displayName: "E2E exact-run",
    status: "open",
  });
  await assert.rejects(() => inspect({ slug: "oak-ember" }), /left untouched/);
  assert.equal(state.visits[1].status, "open");
  assert.equal(sandbox.results.leftovers[1].visitIds[0], "own");
});

for (const scenario of [
  "conflict-then-success",
  "six-conflicts",
  "unknown-outcome",
]) {
  test(`reservation retry safety: ${scenario}`, async () => {
    const events = [];
    const marker = "E2E retry-run";
    const values = ["12:00", "12:30", "13:00", "13:30"];
    const chips = {
      count: async () => values.length,
      evaluateAll: async () => values,
      nth: (index) => ({ inputValue: async () => values[index] }),
    };
    const node = (name) => ({
      getByRole: (_role, options) => node(options.name),
      locator: () => chips,
      click: async () => {},
      fill: async () => {},
      check: async () => {},
      isVisible: async () => name !== "More times",
      count: async () => 0,
      inputValue: async () => "3",
    });
    const page = {
      getByRole: (_role, options) => node(options.name),
      getByLabel: (name) => node(name),
      getByText: (name) => node(name),
    };
    let requests = 0;
    const sandbox = {
      assert,
      marker,
      runId: "retry-run",
      journal: {},
      results: {},
      clickChip: async () => {},
      persist: async () => {},
      evidence: async () => {},
      stopRejectedReservation: async () => {
        events.push("stop-own-rejected-intent");
      },
      workspace: async () => ({
        reservations: [
          {
            id: "booking",
            displayName: marker,
            status: "requested",
            partySize: 3,
            startsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
          },
        ],
      }),
      mutate: async (_p, suffix, action, options) => {
        assert.equal(suffix, "/reservations");
        assert.equal(options.allowedStatuses[0], 409);
        await action();
        requests++;
        if (scenario === "unknown-outcome") throw Error("lost acknowledgement");
        const status =
          scenario === "conflict-then-success" && requests === 2 ? 201 : 409;
        events.push(status);
        return {
          status,
          data: {},
          errorMessage:
            status === 409 ? "The requested table is already reserved." : null,
        };
      },
    };
    const run = vm.runInNewContext(
      `${variable("reservationSeed")}; ${functionSource("reservationCandidateDay")}; (${functionSource("reservation")})`,
      sandbox,
    );
    const action = () =>
      run({ slug: "saffron-room", branch: { settings: {} } }, page);
    if (scenario === "conflict-then-success") {
      const notes = await action();
      assert.match(notes, /HTTP 409 The requested table is already reserved/);
      assert.deepEqual(events, [409, "stop-own-rejected-intent", 201]);
      assert.equal(
        sandbox.results.reservationAttempts[0].state,
        "rejected-and-stopped",
      );
    } else if (scenario === "six-conflicts") {
      await assert.rejects(action, (error) => {
        assert.match(error.message, /at most six/);
        assert.match(
          error.journeyNotes,
          /HTTP 409 The requested table is already reserved/,
        );
        return true;
      });
      assert.equal(requests, 6);
      assert.equal(
        events.filter((event) => event === "stop-own-rejected-intent").length,
        6,
      );
    } else {
      await assert.rejects(action, /lost acknowledgement/);
      assert.equal(requests, 1);
      assert.equal(
        events.length,
        0,
        "An unknown outcome must not be stopped or retried",
      );
    }
  });
}

test("stock assertions reconcile only newly expired held orders, including package quantities", () => {
  const run = vm.runInNewContext(`(${functionSource("expiredStockReturns")})`);
  const before = { orders: [
    { id: "old-package", stockHeld: true, items: [{ quantity: 2, components: [{ productId: "main", quantity: 3 }] }] },
    { id: "already-expired", stockHeld: false, holdExpired: true, items: [{ productId: "main", quantity: 99 }] },
    { id: "unchanged", stockHeld: true, items: [{ productId: "main", quantity: 99 }] },
  ] };
  const after = { orders: [
    { id: "old-package", stockHeld: false, holdExpired: true },
    { id: "already-expired", stockHeld: false, holdExpired: true },
    { id: "unchanged", stockHeld: true },
  ] };
  const restored = run(before, after, "main");
  assert.equal(restored.quantity, 6);
  assert.deepEqual(Array.from(restored.orderIds), ["old-package"]);
  assert.equal(run(before, after, "other-product").quantity, 0);
});

for (const minimumSpend of [false, true]) {
  test(`guest join follows Menu success before opening the table summary (minimum spend ${minimumSpend})`, async () => {
    const events = [];
    const node = (name) => ({
      click: async () => events.push(`click:${name}`),
      fill: async () => {}, check: async () => events.push("acknowledged"),
      waitFor: async () => events.push(`visible:${name}`),
    });
    const page = {
      getByRole: (_role, options) => node(options.name),
      getByLabel: (name) => node(name), getByText: (name) => node(name),
    };
    const posts = [];
    const run = vm.runInNewContext(`(${functionSource("joinGuest")})`, {
      assert, marker: "E2E test", choose: async () => {},
      mutate: async (_page, suffix, action) => {
        posts.push(suffix); await action();
        return suffix === "/visits/terms"
          ? { visitId: "own-visit", minimumSpendPolicy: { enabled: minimumSpend } }
          : { id: "own-visit" };
      },
      workspace: async () => ({ visits: [{ id: "own-visit", status: "open" }] }),
    });
    await run({ joinCode: "123456", table: { name: "E2E table" }, visit: { id: "own-visit" } }, page);
    assert.deepEqual(posts, minimumSpend ? ["/visits/terms", "/visits/join"] : ["/visits/terms"]);
    assert.equal(events.includes("acknowledged"), minimumSpend);
    const summary = events.indexOf("visible:Your table & bill");
    assert(events.indexOf("click:Your table") < summary, "The summary must be opened before waiting for its heading");
    assert.equal(events.at(-1), "click:Menu");
  });
}
