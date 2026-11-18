import test from "node:test";
import assert from "node:assert/strict";
import { stockOutcome } from "../server/mera/stock-history.js";
test("restock adds units while waste and loss cannot consume held or unavailable stock", () => {
  assert.equal(stockOutcome(3, "restock", 2), 5);
  assert.equal(stockOutcome(3, "waste", 2), 1);
  assert.equal(stockOutcome(3, "loss", 3), 0);
  for (const [current, type, quantity] of [
    [0, "waste", 1],
    [3, "loss", 4],
    [1000000, "restock", 1],
    [1, "restock", 0],
    [1, "restock", 1.5],
  ])
    assert.throws(
      () => stockOutcome(current, type, quantity),
      (e) => e.status === 409,
    );
});
