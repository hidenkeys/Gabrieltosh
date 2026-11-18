import { formatMoney } from "./api";
export default function StaffOrderItems({
  products,
  lines,
  onChange,
  disabled,
}: {
  products: any[];
  lines: any[];
  onChange: (lines: any[]) => void;
  disabled: boolean;
}) {
  const update = (id: string, patch: any) => {
    const existing = lines.find((line) => line.productId === id) || {
      productId: id,
      quantity: 1,
      modifiers: [],
    };
    const next = { ...existing, ...patch };
    onChange([
      ...lines.filter((line) => line.productId !== id),
      ...(next.quantity > 0 ? [next] : []),
    ]);
  };
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
      {products
        .filter(
          (product) =>
            product.available ||
            lines.some((line) => line.productId === product.id),
        )
        .map((product) => {
          const line = lines.find((line) => line.productId === product.id);
          return (
            <div
              key={product.id}
              style={{ borderBottom: "1px solid #eeebe6", paddingBottom: 10 }}
            >
              <label className="mw-row">
                <span>
                  {product.name} · {formatMoney(product.price)}
                </span>
                <input
                  aria-label={"Quantity of " + product.name}
                  type="number"
                  min="0"
                  max="100"
                  value={line?.quantity || 0}
                  style={{ width: 85 }}
                  onChange={(event) =>
                    update(product.id, { quantity: Number(event.target.value) })
                  }
                />
              </label>
              {line && (
                <div className="mw-form">
                  {product.variants?.length > 0 && (
                    <label>
                      Size for {product.name}
                      <select
                        required
                        value={line.variantId || ""}
                        onChange={(event) =>
                          update(product.id, { variantId: event.target.value })
                        }
                      >
                        <option value="">Choose size</option>
                        {product.variants.map((variant: any) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.name} · {formatMoney(variant.price)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {product.modifierGroups?.map((group: any) => (
                    <fieldset
                      key={group.id}
                      style={{
                        border: "1px solid #e9e6e2",
                        borderRadius: 8,
                        padding: 10,
                      }}
                    >
                      <legend>
                        {group.name} · choose {group.min}–{group.max}
                      </legend>
                      {group.options.map((option: any) => (
                        <label className="mw-row" key={option.id}>
                          <span>
                            {option.name} +{formatMoney(option.price)}
                          </span>
                          <input
                            type="checkbox"
                            checked={line.modifiers.includes(option.id)}
                            onChange={(event) => {
                              const modifiers = line.modifiers.filter(
                                (id: string) => id !== option.id,
                              );
                              if (event.target.checked)
                                modifiers.push(option.id);
                              update(product.id, { modifiers });
                            }}
                          />
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </fieldset>
  );
}
