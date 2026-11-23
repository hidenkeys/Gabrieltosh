import ChoiceField from "../ui/ChoiceField";
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
  initialView?: "products" | "stock";
  allowedViews?: readonly ("products" | "categories" | "stock" | "shared")[];
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
  initialView = "products",
  allowedViews,
}: Props) {
  const [view, setView] = useState<string>(initialView);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(12);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const visibleViews = views.filter(
    ([key]) => !allowedViews || allowedViews.includes(key),
  );
  const isAllowed = (key: string) =>
    visibleViews.some(([value]) => value === key);
  const activeView = isAllowed(view) ? view : visibleViews[0]?.[0];
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
      {!visibleViews.length && (
        <p role="status">No menu tools are available for your access.</p>
      )}
      <div
        role="tablist"
        aria-label="Menu management"
        className="mw-menu-views"
      >
        {visibleViews.map(([key, label], index) => (
          <button
            key={key}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${id}-${key}-tab`}
            aria-controls={`${id}-${key}-panel`}
            aria-selected={activeView === key}
            tabIndex={activeView === key ? 0 : -1}
            onClick={() => setView(key)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight")
                next = (index + 1) % visibleViews.length;
              else if (event.key === "ArrowLeft")
                next = (index - 1 + visibleViews.length) % visibleViews.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = visibleViews.length - 1;
              else return;
              event.preventDefault();
              tabRefs.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {isAllowed("products") && (
        <div
          role="tabpanel"
          id={`${id}-products-panel`}
          aria-labelledby={`${id}-products-tab`}
          hidden={activeView !== "products"}
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
              <ChoiceField
                label={<>Product category</>}
                searchable
                value={category}
                onChange={(nextValue) => {
                  setCategory(nextValue);
                  setLimit(12);
                }}
              >
                <option value="">All categories</option>
                {categoryNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </ChoiceField>
              <span role="status">
                {filtered.length}{" "}
                {filtered.length === 1 ? "product" : "products"}
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
      )}
      {[
        ["categories", categories],
        ["stock", stock],
        ["shared", shared],
      ]
        .filter(([key]) => isAllowed(String(key)))
        .map(([key, content]) => (
          <div
            key={key as string}
            role="tabpanel"
            id={`${id}-${key}-panel`}
            aria-labelledby={`${id}-${key}-tab`}
            hidden={activeView !== key}
          >
            {content}
          </div>
        ))}
    </div>
  );
}
