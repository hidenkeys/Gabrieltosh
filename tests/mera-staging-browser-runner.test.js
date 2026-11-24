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
for (const slug of ["velvet-lounge", "pulse"]) {
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
