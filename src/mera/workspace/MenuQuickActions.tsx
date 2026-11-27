import { useEffect, useRef, useState, type ReactNode } from "react";
import ChoiceField from "../ui/ChoiceField";
type Product = {
  id: string;
  name: string;
  available?: boolean;
  category?: string;
  station?: string;
  [key: string]: any;
};
export default function MenuQuickActions({
  products,
  update,
  bulkAvailability,
  disabled = false,
  categoryOptions,
  availabilityOnly = false,
  renderProducts,
}: {
  renderProducts?: (controls: (product: Product) => ReactNode) => ReactNode;
  availabilityOnly?: boolean;
  categoryOptions?: { id: string; name: string }[];
  products: Product[];
  update: (product: Product, patch: Record<string, any>) => Promise<any>;
  bulkAvailability?: (ids: string[], available: boolean) => Promise<any>;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [category, setCategory] = useState(""),
    [station, setStation] = useState("");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<{
    product: Product;
    available: boolean;
  } | null>(null);
  const flight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const productIds = products.map((p) => p.id).join("|");
  useEffect(() => {
    setSelected((ids) => ids.filter((id) => products.some((p) => p.id === id)));
  }, [productIds]);
  useEffect(() => {
    setOverrides({});
  }, [products.map((p) => `${p.id}:${p.available}`).join("|")]);
  const categories = categoryOptions?.length
    ? categoryOptions
    : [...new Set(products.map((p) => p.category).filter(Boolean))].map(
        (name) => ({ id: name!, name: name! }),
      );
  async function toggle(product: Product, available: boolean, isUndo = false) {
    if (flight.current || disabled) return;
    flight.current = true;
    setBusy(true);
    setMessage("");
    setUndo(null);
    const previous = overrides[product.id] ?? product.available !== false;
    setOverrides((v) => ({ ...v, [product.id]: available }));
    try {
      await update(product, { available });
      setUndo(isUndo ? null : { product, available: previous });
      setMessage(`${product.name} ${available ? "available" : "sold out"}.`);
    } catch (e) {
      setOverrides((v) => ({ ...v, [product.id]: previous }));
      setMessage((e as Error).message);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  async function bulk(patch: Record<string, any>) {
    if (flight.current || disabled || !selected.length) return;
    flight.current = true;
    setBusy(true);
    setUndo(null);
    const rows = products.filter((p) => selected.includes(p.id)),
      failed: string[] = [],
      failedIds: string[] = [];
    let done = 0;
    try {
      if (typeof patch.available === "boolean" && bulkAvailability) {
        for (let i = 0; i < rows.length && mounted.current; i += 200) {
          const batch = rows.slice(i, i + 200);
          try {
            await bulkAvailability(
              batch.map((p) => p.id),
              patch.available,
            );
            done += batch.length;
            setOverrides((v) => ({
              ...v,
              ...Object.fromEntries(batch.map((p) => [p.id, patch.available])),
            }));
          } catch {
            failed.push(...batch.map((p) => p.name));
            failedIds.push(...batch.map((p) => p.id));
          }
          setMessage(
            `${Math.min(i + 200, rows.length)} / ${rows.length} processed`,
          );
        }
      } else
        for (const product of rows) {
          if (!mounted.current) break;
          try {
            await update(product, patch);
            done++;
            if (typeof patch.available === "boolean")
              setOverrides((v) => ({ ...v, [product.id]: patch.available }));
          } catch {
            failed.push(product.name);
            failedIds.push(product.id);
          }
          setMessage(`${done + failed.length} / ${rows.length} processed`);
        }
      setMessage(
        `${done} updated.${failed.length ? ` ${failed.length} failed: ${failed.join(", ")}. Select these items to retry.` : ""}`,
      );
      setSelected(
        rows.filter((p) => failedIds.includes(p.id)).map((p) => p.id),
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  const renderControls = (product: Product) => {
    const available = overrides[product.id] ?? product.available !== false;
    return (
      <div className="mw-row" key={product.id}>
        {!availabilityOnly && (
          <label>
            <input
              type="checkbox"
              checked={selected.includes(product.id)}
              disabled={busy || disabled}
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked
                    ? [...ids, product.id]
                    : ids.filter((id) => id !== product.id),
                )
              }
            />{" "}
            Select {product.name}
          </label>
        )}
        {availabilityOnly && <strong>{product.name}</strong>}
        <button
          type="button"
          className="secondary"
          disabled={busy || disabled}
          aria-label={`${available ? "Mark sold out" : "Mark available"}: ${product.name}`}
          onClick={() => void toggle(product, !available)}
        >
          {available ? "Mark sold out" : "Mark available"}
        </button>
      </div>
    );
  };

  return (
    <section
      className="mw-menu-quick"
      aria-label="Menu availability and bulk edit"
    >
      {!availabilityOnly && (
        <div className="mw-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy || disabled}
            onClick={() => setSelected(products.map((p) => p.id))}
          >
            Select shown items
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || disabled}
            onClick={() => setSelected([])}
          >
            Clear selection
          </button>
          <span>{selected.length} selected</span>
        </div>
      )}
      {!products.length && (
        <p role="status">No products match. Try another name or category.</p>
      )}
      {renderProducts
        ? renderProducts(renderControls)
        : products.map(renderControls)}
      {!!selected.length && (
        <fieldset disabled={busy || disabled} className="mw-bulk-tools">
          <legend>Bulk actions</legend>
          <div className="mw-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => void bulk({ available: true })}
            >
              Mark selected available
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void bulk({ available: false })}
            >
              Mark selected sold out
            </button>
          </div>
          <ChoiceField
            label="Move selected to category"
            searchable
            value={category}
            onChange={setCategory}
          >
            <option value="">Choose category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </ChoiceField>
          <button
            type="button"
            className="secondary"
            disabled={!category}
            onClick={() =>
              void bulk({
                category:
                  categories.find((c) => c.id === category)?.name || category,
                categoryId: categoryOptions?.some((c) => c.id === category)
                  ? category
                  : null,
              })
            }
          >
            Move selected items
          </button>
          <ChoiceField
            label="Change selected station"
            value={station}
            onChange={setStation}
          >
            <option value="">Choose station</option>
            {[
              ...new Set([
                "kitchen",
                "bar",
                ...products.map((p) => p.station).filter(Boolean),
              ]),
            ].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </ChoiceField>
          <button
            type="button"
            className="secondary"
            disabled={!station}
            onClick={() => void bulk({ station })}
          >
            Change station
          </button>
        </fieldset>
      )}
      {message && (
        <div role="status" className="mw-note mw-menu-feedback">
          {message}{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMessage("");
              setUndo(null);
            }}
          >
            Dismiss
          </button>
          {undo && (
            <button
              type="button"
              className="secondary"
              disabled={busy || disabled}
              onClick={() => void toggle(undo.product, undo.available, true)}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </section>
  );
}
