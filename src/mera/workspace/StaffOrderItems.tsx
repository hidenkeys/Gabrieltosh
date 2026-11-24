import ItemContents, {
  ComboChoices,
  choiceKey,
  selectedChoices,
} from "../customer/ItemContents";
import Stepper from "../ui/Stepper";
import Segmented from "../ui/Segmented";
import Chips from "../ui/Chips";
import Combobox from "../ui/Combobox";
import { formatMoney } from "./api";
import { catalogPriceLabel } from "./catalogPresentation";
import { validateStaffSelection } from "./staffSelection";
export default function StaffOrderItems({
  products,
  catalogProducts = products,
  lines,
  onChange,
  disabled,
}: {
  products: any[];
  catalogProducts?: any[];
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
          const selection = line
            ? validateStaffSelection([product], [line]).lines[0]
            : null;
          const priceLabel = selection
            ? selection.needsVariant
              ? "Choose size"
              : selection.complete
                ? `${formatMoney(selection.baseEstimate!)}${selection.extrasEstimate ? " + " + formatMoney(selection.extrasEstimate) + " add-ons" : ""} per item`
                : "Complete selections"
            : catalogPriceLabel(product);
          return (
            <div
              key={product.id}
              style={{ borderBottom: "1px solid #eeebe6", paddingBottom: 10 }}
            >
              <div className="mw-row">
                <span>
                  {product.name} · {priceLabel}
                </span>
                <Stepper
                  label={"Quantity of " + product.name}
                  min={0}
                  max={100}
                  value={line?.quantity || 0}
                  onChange={(value) => update(product.id, { quantity: value })}
                />
              </div>
              {selection && !selection.complete && (
                <p className="mw-pos-selection-help" role="status">
                  {selection.messages.join(" ")}
                </p>
              )}
              {line && (
                <div className="mw-form">
                  <ItemContents item={product} products={catalogProducts} />
                  <ComboChoices
                    groups={product.choiceGroups || []}
                    products={catalogProducts}
                    keys={(line.choices || []).map((c: any) =>
                      choiceKey(c.groupId, c),
                    )}
                    onChange={(keys) =>
                      update(product.id, {
                        choices: selectedChoices(
                          product.choiceGroups || [],
                          keys,
                        ),
                      })
                    }
                    disabled={disabled}
                  />
                  {product.variants?.length > 0 &&
                    (() => {
                      const Choice =
                        product.variants.length <= 4
                          ? Segmented
                          : product.variants.length <= 12
                            ? Chips
                            : Combobox;
                      return (
                        <Choice
                          label={"Size for " + product.name}
                          required
                          value={line.variantId || ""}
                          onChange={(value) =>
                            update(product.id, { variantId: value })
                          }
                          options={product.variants.map((variant: any) => ({
                            value: variant.id,
                            label:
                              variant.name + " · " + formatMoney(variant.price),
                          }))}
                        />
                      );
                    })()}
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
                            checked={(Array.isArray(line.modifiers)
                              ? line.modifiers
                              : []
                            ).includes(option.id)}
                            onChange={(event) => {
                              const modifiers = (
                                Array.isArray(line.modifiers)
                                  ? line.modifiers
                                  : []
                              ).filter((id: string) => id !== option.id);
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
