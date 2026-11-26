import { useCurrency } from "../ui/Currency";
import { useMoney } from "../ui/Currency";
import CustomizationDialog from "../customer/CustomizationDialog";
import {
  choiceKey,
  choiceComplete,
  selectedChoices,
} from "../customer/ItemContents";
import ChoiceField from "../ui/ChoiceField";
import { useState, type ReactNode } from "react";
import { Search, ShoppingBag, Plus } from "lucide-react";
import { ProductImage } from "../../ProductImage";
import StaffOrderItems from "./StaffOrderItems";

import { catalogPriceLabel } from "./catalogPresentation";
import { validateStaffSelection } from "./staffSelection";

export default function StaffPos({
  products,
  hasTable = false,
  lines,
  onChange,
  disabled,
  details,
  children,
  staffName,
  useBingChunAssets = false,
}: {
  products: any[];
  hasTable?: boolean;
  lines: any[];
  onChange: (lines: any[]) => void;
  disabled: boolean;
  details: ReactNode;
  children: ReactNode;
  staffName: string;
  useBingChunAssets?: boolean;
}) {
  const currency = useCurrency();
  const formatMoney = useMoney();
  const [sheetModifiers, setSheetModifiers] = useState<string[]>([]);
  const [choosing, setChoosing] = useState<any>(null),
    [choiceKeys, setChoiceKeys] = useState<string[]>([]);
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
  const validation = validateStaffSelection(products, lines);
  const estimateLabel =
    validation.estimate === null
      ? "Complete selections"
      : formatMoney(validation.estimate);
  function add(product: any) {
    if (product.requiresTable && !hasTable) return;

    const current = lines.find((l) => l.productId === product.id);
    if (current) {
      onChange(
        lines.map((l) =>
          l === current ? { ...l, quantity: Math.min(100, l.quantity + 1) } : l,
        ),
      );
    } else if (product.kind === "combo" || product.kind === "package") {
      setChoosing(product);
      setChoiceKeys([]);
      setSheetModifiers([]);
    } else
      onChange([
        ...lines,
        { productId: product.id, quantity: 1, modifiers: [] },
      ]);
  }
  return (
    <div className="mw-pos">
      {choosing && (
        <div className="mera-customer mw-pos-choice">
          <CustomizationDialog
            product={choosing}
            addLabel="Add to order"
            products={products}
            variantId=""
            modifierIds={sheetModifiers}
            choiceKeys={choiceKeys}
            onChoicesChange={setChoiceKeys}
            hasTable={hasTable}
            estimate={
              choosing.price +
              (choosing.choiceGroups || [])
                .flatMap((g: any) =>
                  g.options.filter((o: any) =>
                    choiceKeys.includes(choiceKey(g.id, o)),
                  ),
                )
                .reduce((sum: number, o: any) => sum + o.priceDelta, 0) +
              (choosing.modifierGroups || [])
                .flatMap((g: any) =>
                  g.options.filter((o: any) => sheetModifiers.includes(o.id)),
                )
                .reduce((sum: number, o: any) => sum + o.price, 0)
            }
            disabled={disabled}
            onVariantChange={() => {}}
            onModifierToggle={(id, checked) =>
              setSheetModifiers((old) =>
                checked ? [...old, id] : old.filter((k) => k !== id),
              )
            }
            onClose={() => setChoosing(null)}
            onAdd={() => {
              if (
                !choiceComplete(choosing.choiceGroups || [], choiceKeys) ||
                !validateStaffSelection(
                  [choosing],
                  [
                    {
                      productId: choosing.id,
                      quantity: 1,
                      modifiers: sheetModifiers,
                      choices: selectedChoices(
                        choosing.choiceGroups || [],
                        choiceKeys,
                      ),
                    },
                  ],
                ).complete
              )
                return;
              const old = lines.find((l) => l.productId === choosing.id);
              onChange([
                ...lines.filter((l) => l.productId !== choosing.id),
                {
                  productId: choosing.id,
                  quantity: Math.min(100, (old?.quantity || 0) + 1),
                  modifiers: sheetModifiers,
                  choices: selectedChoices(
                    choosing.choiceGroups || [],
                    choiceKeys,
                  ),
                },
              ]);
              setChoosing(null);
            }}
          />
        </div>
      )}
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
          Current order ({count}) · {estimateLabel}
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
        <ChoiceField
          label={<>Menu category</>}
          className="mw-pos-category"
          searchable
          value={category}
          onChange={(nextValue) => setCategory(nextValue)}
        >
          <option value="">All items</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </ChoiceField>
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
              disabled={disabled || (p.requiresTable && !hasTable)}
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
                {p.kind === "package" && (
                  <small>
                    Package{p.serves ? ` · Serves ${p.serves}` : ""}
                  </small>
                )}
                {p.kind === "combo" && <small>Combo</small>}
                {p.requiresTable && (
                  <small>Available for booked or seated tables</small>
                )}
                <div className="product-bottom">
                  <strong>{catalogPriceLabel(p, currency)}</strong>
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
            <>
              <StaffOrderItems
                products={selected}
                catalogProducts={products}
                lines={lines}
                disabled={disabled}
                onChange={onChange}
              />
              {validation.lines
                .filter(
                  (line) =>
                    !products.some((product) => product.id === line.productId),
                )
                .map((line) => (
                  <div key={line.index}>
                    <p>
                      This item is no longer available. Remove it before
                      reviewing the order.
                    </p>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onChange(
                          lines.filter((_line, index) => index !== line.index),
                        )
                      }
                    >
                      Remove unavailable item {line.index + 1}
                    </button>
                  </div>
                ))}
            </>
          )}
        </div>
        <div className="mw-pos-checkout">
          <div className="summary-total">
            <span>Items estimate</span>
            <strong>{estimateLabel}</strong>
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
