import { formatMoney } from "./api";
/** Display configured item/size prices; final selected options and charges are reviewed separately. */
export function catalogPriceLabel(product: any) {
  if (Array.isArray(product?.variants) && product.variants.length) {
    const prices = product.variants
      .map((variant: any) => variant.price)
      .filter(
        (price: unknown): price is number =>
          typeof price === "number" &&
          Number.isSafeInteger(price) &&
          price >= 0,
      );
    return prices.length
      ? "Sizes from " + formatMoney(Math.min(...prices))
      : "Size prices unavailable";
  }
  return typeof product?.price === "number" &&
    Number.isSafeInteger(product.price) &&
    product.price >= 0
    ? formatMoney(product.price)
    : "Price unavailable";
}
