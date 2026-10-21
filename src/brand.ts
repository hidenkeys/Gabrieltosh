export const store = {
  name: "Bing Chun",
  branch: "Surulere",
  address: "75A Bode Thomas Street, Surulere, Lagos 101241",
  phone: "0901 758 2027",
  logo: "/brand/brand-logo.png",
};
// Match the photographed menu to the product assets supplied in the owner's website.
// Every seeded product has a photo. Generated assets and adapted promotional photos are documented in docs/product-images.md.
export const productPhotos: Record<
  string,
  { src: string; fit?: "cover" | "contain" }
> = {
  C11: { src: "official-original-milk-tea.avif" },
  C2: { src: "official-brown-sugar-boba.avif" },
  C9: { src: "official-lychee-jasmine.avif" },
  C3: { src: "official-bobo-milk-tea.avif" },
  C6: { src: "official-strawberry-milkshake.avif" },
  B2: { src: "official-strawberry-lemon.avif" },
  B6: { src: "official-blueberry-bobo.avif" },
  B7: { src: "official-lychee-jasmine.avif" },
  B8: { src: "official-grape-bobo.avif" },
  A4: { src: "official-brown-sugar-sundae.avif" },
  A5: { src: "official-strawberry-sundae.avif" },
  A6: { src: "official-blueberry-sundae.avif" },
  A9: { src: "official-chocolate-biscuit-sundae.avif" },
  A10: { src: "official-chocolate-oreo-sundae.avif" },
  A15: { src: "mulberry-sundae.webp", fit: "cover" },
  A34: { src: "boba-soft-serve.webp", fit: "cover" },
  B1: { src: "bingchun-fresh-lemonade.avif" },
  B3: { src: "bingchun-jasmine-honey.jpg", fit: "cover" },
  B4: { src: "bingchun-lemon-green-tea.avif" },
  B5: { src: "bingchun-lemon-black-tea.avif" },
  B9: { src: "bingchun-strawberry-mulberry.jpg", fit: "cover" },
  B16: { src: "bingchun-mulberry-popping-pearls.png", fit: "cover" },
  A1: { src: "bingchun-vanilla-ice-cream.avif" },
  A32: { src: "bingchun-chocolate-ice-cream.avif" },
  A33: { src: "bingchun-mixed-ice-cream.avif" },
  G17: { src: "bingchun-chocolate-milkshake.jpg", fit: "cover" },
  H1: { src: "generated-strawberry-smoothie.webp" },
  H6: { src: "generated-blueberry-smoothie.webp" },
  H8: { src: "generated-grape-smoothie.webp" },
  H7: { src: "generated-cocoa-smoothie.webp" },
  X1: { src: "generated-boba.webp" },
  X2: { src: "generated-coconut-jelly.webp" },
  X3: { src: "generated-jelly.webp" },
  X4: { src: "generated-crystals.webp" },
};

const categoryPhotos: Record<string, string> = {
  "Fruit milk tea": "official-original-milk-tea.avif",
  "Fresh fruit tea": "bingchun-fresh-lemonade.avif",
  "Ice cream series": "bingchun-vanilla-ice-cream.avif",
  "Smoothie series": "generated-strawberry-smoothie.webp",
  Toppings: "generated-boba.webp",
};
export function getProductPhoto(product: { code: string; category: string }): {
  src: string;
  fit?: "cover" | "contain";
} {
  return (
    productPhotos[product.code] || {
      src:
        categoryPhotos[product.category] || "official-original-milk-tea.avif",
    }
  );
}
