import { useState, type ReactNode } from "react";
import { Search, ShoppingBag, Plus } from "lucide-react";
import { ProductImage } from "../../ProductImage";
import StaffOrderItems from "./StaffOrderItems";
import { formatMoney } from "./api";

export default function StaffPos({
  products,
  lines,
  onChange,
  disabled,
  details,
  children,
  staffName,
  useBingChunAssets = false,
}: {
  products: any[];
  lines: any[];
  onChange: (lines: any[]) => void;
  disabled: boolean;
  details: ReactNode;
  children: ReactNode;
  staffName: string;
  useBingChunAssets?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [mobileView, setMobileView] = useState("menu");
  const available = products.filter((p) => p.available),
    categories = [
      ...new Set<string>(available.map((p) => p.category || "Menu")),
    ].sort();
  const shown = available.filter(
    (p) =>
      (!category || p.category === category) &&
      [p.name, p.code, p.category]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selected = products.filter((p) =>
    lines.some((l) => l.productId === p.id),
  );
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const estimate = lines.reduce((sum, l) => {
    const p = products.find((p) => p.id === l.productId);
    if (!p) return sum;
    const price =
      p.variants?.find((v: any) => v.id === l.variantId)?.price ?? p.price;
    const extras = (p.modifierGroups || [])
      .flatMap((g: any) => g.options)
      .filter((o: any) => (l.modifiers || []).includes(o.id))
      .reduce((n: number, o: any) => n + o.price, 0);
    return sum + (price + extras) * l.quantity;
  }, 0);
  function add(product: any) {
    const current = lines.find((l) => l.productId === product.id);
    if (current) {
      onChange(
        lines.map((l) =>
          l === current ? { ...l, quantity: Math.min(100, l.quantity + 1) } : l,
        ),
      );
    } else
      onChange([
        ...lines,
        { productId: product.id, quantity: 1, modifiers: [] },
      ]);
  }
  return (
    <div className="mw-pos">
      <div className="mw-pos-mobile-switch" aria-label="Counter view">
        <button
          type="button"
          aria-pressed={mobileView === "menu"}
          onClick={() => setMobileView("menu")}
        >
          Menu
        </button>
        <button
          type="button"
          aria-pressed={mobileView === "basket"}
          onClick={() => setMobileView("basket")}
        >
          Current order ({count}) · {formatMoney(estimate)}
        </button>
      </div>
      <section
        className={
          "mw-pos-catalog " + (mobileView === "menu" ? "mobile-active" : "")
        }
        aria-label="Menu catalog"
      >
        <div className="counter-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Search counter menu"
              type="search"
              placeholder="Search by item name or code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <span className="item-count">{available.length} items</span>
        </div>
        <div
          className="categories mw-pos-categories"
          aria-label="Menu categories"
        >
          {["", ...categories].map((value) => (
            <button
              key={value}
              type="button"
              className={category === value ? "selected" : ""}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {value || "All items"}
            </button>
          ))}
        </div>
        <label className="mw-pos-category">
          Menu category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All items</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="section-title">
          <div>
            <h2>{category || "The whole collection"}</h2>
            <span>{shown.length} items · select to add</span>
          </div>
        </div>
        <div className="product-grid">
          {shown.map((p) => (
            <button
              type="button"
              key={p.id}
              className="product-card"
              disabled={disabled}
              aria-label={"Add " + p.name + " to order"}
              onClick={() => add(p)}
            >
              <div className="product-art">
                {p.image || useBingChunAssets ? (
                  <ProductImage
                    product={{
                      ...p,
                      code: p.code || "",
                      category: p.category || "",
                    }}
                    className="product-photo"
                    decorative
                  />
                ) : (
                  <ShoppingBag size={32} aria-hidden="true" />
                )}
                <span className="product-code">{p.code}</span>
              </div>
              <div className="product-info">
                <p>{p.category}</p>
                <h3>{p.name}</h3>
                <div className="product-bottom">
                  <strong>{formatMoney(p.price)}</strong>
                  <span>{p.size}</span>
                  <i aria-hidden="true">
                    <Plus size={16} />
                  </i>
                </div>
                {p.variants?.length > 0 && <small>Choose size in order</small>}
              </div>
            </button>
          ))}
        </div>
        {!shown.length && (
          <p className="mw-empty">
            No items match. Try another name or category.
          </p>
        )}
      </section>
      <aside
        className={
          "basket mw-pos-basket " +
          (mobileView === "basket" ? "mobile-active" : "")
        }
        aria-label="Current order"
      >
        <header>
          <h2>
            Current order <span>{count}</span>
          </h2>
        </header>
        <div className="basket-staff">Served by {staffName}</div>
        <div className="mw-pos-basket-body">
          {details}
          {!lines.length ? (
            <div className="empty">
              <ShoppingBag size={28} />
              <h3>Your order starts here</h3>
              <p>Select an item from the menu.</p>
            </div>
          ) : (
            <StaffOrderItems
              products={selected}
              lines={lines}
              disabled={disabled}
              onChange={onChange}
            />
          )}
        </div>
        <div className="mw-pos-checkout">
          <div className="summary-total">
            <span>Items estimate</span>
            <strong>{formatMoney(estimate)}</strong>
          </div>
          <p className="mw-muted">
            Review the total for final prices and any charges.
          </p>
          {children}
        </div>
      </aside>
    </div>
  );
}
