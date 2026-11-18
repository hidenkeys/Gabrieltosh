import React, { useId, useRef, useState } from "react";
type Product = {
  [key: string]: any;
  id: string;
  name: string;
  code?: string;
  category?: string;
};
type Props = {
  products: Product[];
  header: React.ReactNode;
  renderProducts: (products: Product[]) => React.ReactNode;
  editor?: React.ReactNode;
  categories: React.ReactNode;
  stock: React.ReactNode;
  shared: React.ReactNode;
};
const views = [
  ["products", "Products"],
  ["categories", "Categories"],
  ["stock", "Stock & availability"],
  ["shared", "Shared menus"],
] as const;
export default function MenuManagement({
  products,
  header,
  renderProducts,
  editor,
  categories,
  stock,
  shared,
}: Props) {
  const [view, setView] = useState<string>("products");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(12);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const categoryNames = [
    ...new Set(
      products.map((p) => p.category).filter((name): name is string => !!name),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const filtered = products.filter(
    (p) =>
      (!category || p.category === category) &&
      `${p.name} ${p.code || ""} ${p.category || ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const shown = filtered.slice(0, limit);
  return (
    <div className="mw-menu-management">
      <div
        role="tablist"
        aria-label="Menu management"
        className="mw-menu-views"
      >
        {views.map(([key, label], index) => (
          <button
            key={key}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${id}-${key}-tab`}
            aria-controls={`${id}-${key}-panel`}
            aria-selected={view === key}
            tabIndex={view === key ? 0 : -1}
            onClick={() => setView(key)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % views.length;
              else if (event.key === "ArrowLeft")
                next = (index - 1 + views.length) % views.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = views.length - 1;
              else return;
              event.preventDefault();
              tabRefs.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-products-panel`}
        aria-labelledby={`${id}-products-tab`}
        hidden={view !== "products"}
      >
        <section className="mw-card mw-menu-products">
          {header}
          <div className="mw-menu-filters">
            <label>
              Find a product
              <input
                type="search"
                value={query}
                placeholder="Name, code or category"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setLimit(12);
                }}
              />
            </label>
            <label>
              Product category
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setLimit(12);
                }}
              >
                <option value="">All categories</option>
                {categoryNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <span role="status">
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
            </span>
          </div>
          {filtered.length ? (
            renderProducts(shown)
          ) : (
            <div className="mw-empty">
              <h3>
                {products.length
                  ? "No products match"
                  : "Your menu starts here"}
              </h3>
              <p>
                {products.length
                  ? "Try another name or category."
                  : "Add your first product, then review it before publishing."}
              </p>
              {products.length > 0 && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setCategory("");
                    setLimit(12);
                  }}
                >
                  Clear product filters
                </button>
              )}
            </div>
          )}
          {!!filtered.length && (
            <div className="mw-menu-pagination">
              <span>
                Showing {shown.length} of {filtered.length} products
              </span>
              {shown.length < filtered.length && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setLimit((value) => value + 12)}
                >
                  Show more products
                </button>
              )}
            </div>
          )}
        </section>
        {editor}
      </div>
      {[
        ["categories", categories],
        ["stock", stock],
        ["shared", shared],
      ].map(([key, content]) => (
        <div
          key={key as string}
          role="tabpanel"
          id={`${id}-${key}-panel`}
          aria-labelledby={`${id}-${key}-tab`}
          hidden={view !== key}
        >
          {content}
        </div>
      ))}
    </div>
  );
}
