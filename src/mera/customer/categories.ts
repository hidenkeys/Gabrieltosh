type Category = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder?: number;
  active?: boolean;
};
type Product = { categoryId?: string | null; category: string };
export function categoryAncestors(
  categoryId: string | undefined | null,
  categories: Category[],
): string[] {
  const map = new Map(
    categories
      .filter((node) => node.active !== false)
      .map((node) => [node.id, node]),
  );
  const result: string[] = [];
  let id = categoryId;
  while (id) {
    if (result.includes(id) || result.length >= 6) return [];
    const node = map.get(id);
    if (!node) return [];
    result.unshift(id);
    id = node.parentId;
  }
  return result;
}
export function categoryNavigation(
  categories: Category[],
  products: Product[],
) {
  const visible = new Set(
    products.flatMap((product) =>
      categoryAncestors(product.categoryId, categories),
    ),
  );
  const nodes = categories.filter((node) => visible.has(node.id));
  const sorted = nodes.sort((a, b) => {
    const ap = categoryAncestors(a.id, categories),
      bp = categoryAncestors(b.id, categories);
    for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
      if (ap[i] !== bp[i]) {
        const ac = categories.find((node) => node.id === ap[i])!,
          bc = categories.find((node) => node.id === bp[i])!;
        return (
          (ac.sortOrder || 0) - (bc.sortOrder || 0) ||
          ac.name.localeCompare(bc.name)
        );
      }
    }
    return ap.length - bp.length;
  });
  return sorted
    .map((node) => ({
      key: "id:" + node.id,
      label: categoryAncestors(node.id, categories)
        .map((id) => categories.find((category) => category.id === id)!.name)
        .join(" / "),
      name: node.name,
      depth: categoryAncestors(node.id, categories).length - 1,
    }))
    .concat(
      [
        ...new Set(
          products
            .filter((product) => !product.categoryId)
            .map((product) => product.category),
        ),
      ].map((name) => ({ key: "legacy:" + name, label: name, name, depth: 0 })),
    );
}
export function matchesCategory(
  product: Product,
  key: string,
  categories: Category[],
) {
  return (
    key === "All" ||
    (key.startsWith("id:")
      ? categoryAncestors(product.categoryId, categories).includes(key.slice(3))
      : !product.categoryId && product.category === key.slice(7))
  );
}
