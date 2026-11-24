import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Load only the runner's control flow. No browser, credentials or staging
// bootstrap executes: these checks cover evidence ownership on failed writes.
const source = readFileSync(new URL("../scripts/mera-staging-browser-journeys.mjs", import.meta.url), "utf8");
const ast = ts.createSourceFile("runner.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const step = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "step");

test("every bare runner assertion describes its expected outcome", () => {
  let count = 0;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "assert") {
      count++;
      const line = ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      assert(node.arguments.length >= 2, `Runner assertion on line ${line} needs an expectation message`);
      assert(node.arguments[1].getText(ast).trim().length > 2, `Runner assertion on line ${line} has an empty message`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(count > 0, "The runner must retain its safety and state assertions");
});

for (const actor of ["central_stock", "branch_manager"]) {
  test(`a failed ${actor} transfer captures its acting page instead of the owner's Orders page`, async () => {
    const owner = {}, sender = {}, receiver = {};
    const pageActors = new WeakMap([[owner, "owner"], [sender, "central_stock"], [receiver, "branch_manager"]]);
    const images = [];
    const journal = { operations: [] }, results = { steps: [] };
    const sandbox = {
      activePage: owner, pageActors, journal, results, assert,
      persist: async () => {}, evidence: async () => {},
      workspace: async () => ({ branch: { id: "pool", settings: { syntheticPortfolio: "portfolio-v1" } } }),
      record: (_venue, name, pass, notes, error) => results.steps.push({ name, pass, notes, error: error?.message }),
      shot: async (_venue, page, name) => images.push({ page, name }),
    };
    const runStep = vm.runInNewContext(`(${step.getText(ast)})`, sandbox);
    await assert.rejects(() => runStep({ slug: "harbour-hotel", branch: { id: "pool" } }, "Stock transfer", async () => {
      sandbox.activePage = sender;
      if (actor === "branch_manager") sandbox.activePage = receiver;
      throw Error("Transfer UI action failed");
    }, owner), /Transfer UI action failed/);
    assert.equal(images.length, 1);
    assert.equal(images[0].page, actor === "central_stock" ? sender : receiver);
    assert.match(images[0].name, new RegExp(actor));
    assert.equal(journal.operations[0].state, "failed");
    assert.equal(journal.operations[0].actor, actor);
    assert.equal(results.steps[0].actor, actor);
  });
}
