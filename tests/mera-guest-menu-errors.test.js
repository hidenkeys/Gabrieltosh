import test from "node:test";
import assert from "node:assert/strict";
import { quote } from "../server/mera/domain.js";
const item = { productId: "tea", quantity: 2, modifiers: [] };
const product = {
  id: "tea",
  name: "Tea",
  available: true,
  price: 100,
  stockMode: "counted",
  stock: 1,
  variants: [],
  modifierGroups: [],
};
for (const [label, products, code] of [
  ["stock shortage", [product], "OUT_OF_STOCK"],
  ["removed product", [], "MENU_CHANGED"],
  ["unavailable product", [{ ...product, available: false }], "MENU_CHANGED"],
]) {
  test(`${label} identifies only the rejected product`, () => {
    assert.throws(
      () => quote([item], products),
      (error) => {
        assert.equal(error.code, code);
        assert.deepEqual(error.details, { productIds: ["tea"] });
        return true;
      },
    );
  });
}
test("component shortages identify the affected package instead of unrelated basket products", () => {
  const bundle = {
    ...product,
    id: "package",
    kind: "package",
    stockMode: "unlimited",
    components: [{ productId: "tea", quantity: 2 }],
  };
  assert.throws(
    () =>
      quote(
        [{ productId: "package", quantity: 1, modifiers: [] }],
        [product, bundle],
      ),
    (error) => {
      assert.equal(error.code, "OUT_OF_STOCK");
      assert.deepEqual(error.details, { productIds: ["package"] });
      return true;
    },
  );
});
test("a missing component also identifies the affected package", () => {
  const bundle = {
    ...product,
    id: "package",
    kind: "package",
    stockMode: "unlimited",
    components: [{ productId: "missing", quantity: 1 }],
  };
  assert.throws(
    () =>
      quote([{ productId: "package", quantity: 1, modifiers: [] }], [bundle]),
    (error) => {
      assert.deepEqual(error.details, { productIds: ["package"] });
      return true;
    },
  );
});
