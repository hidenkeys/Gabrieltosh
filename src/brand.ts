export const store = {
  name: "Bing Chun",
  branch: "Surulere",
  address: "75A Bode Thomas Street, Surulere, Lagos 101241",
  phone: "0901 758 2027",
  logo: "/brand/brand-logo.png",
};
// Match the photographed menu to the product assets supplied in the owner's website.
// Products without a matching photo retain category illustrations rather than another flavour's photo.
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
};
