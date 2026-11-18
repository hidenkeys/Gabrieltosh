import test from "node:test";
import assert from "node:assert/strict";
import { catalogPriceLabel } from "../src/mera/workspace/catalogPresentation.ts";
test("a zero base price never replaces the configured prices of product sizes", () => {
  assert.equal(
    catalogPriceLabel({
      price: 0,
      variants: [{ price: 350000 }, { price: 420000 }],
    }),
    "Sizes from ₦3,500.00",
  );
  assert.equal(catalogPriceLabel({ price: 150000 }), "₦1,500.00");
});
test("missing or invalid price data remains unavailable rather than becoming zero", () => {
  assert.equal(catalogPriceLabel({}), "Price unavailable");
  assert.equal(
    catalogPriceLabel({ price: 0, variants: [{ price: NaN }, { price: -1 }] }),
    "Size prices unavailable",
  );
});
