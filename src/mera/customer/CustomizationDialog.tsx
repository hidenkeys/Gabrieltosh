import ItemContents, { ComboChoices, choiceComplete } from "./ItemContents";
import { Chips } from "../ui/Chips";
import { useRef } from "react";
import { useDialogFocus } from "../ui/useDialogFocus";
type Choice = { id: string; name: string; price: number };
type Variant = Choice & { stockMode?: string; stock?: number };
type Group = {
  id: string;
  name: string;
  min: number;
  max: number;
  options: Choice[];
};
export type CustomizationProduct = {
  id: string;
  name: string;
  kind?: string;
  components?: any[];
  choiceGroups?: any[];
  serves?: number | null;
  requiresTable?: boolean;
  description?: string;
  size?: string;
  available?: boolean;
  stockMode?: string;
  stock?: number;
  variants?: Variant[];
  modifierGroups?: Group[];
  dietary?: string[];
  allergens?: string[];
};
export type CustomizationDialogProps = {
  product: CustomizationProduct;
  addLabel?: string;
  products?: any[];
  choiceKeys?: string[];
  onChoicesChange?: (keys: string[]) => void;
  hasTable?: boolean;
  variantId: string;
  modifierIds: string[];
  estimate: number;
  disabled: boolean;
  error?: string;
  errorGroupId?: string | null;
  onVariantChange: (id: string) => void;
  onModifierToggle: (id: string, checked: boolean) => void;
  onClose: () => void;
  onAdd: () => void;
  registerGroup?: (id: string, node: HTMLFieldSetElement | null) => void;
  fallbackFocus?: () => void;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    value / 100,
  );
const soldOut = (value: { stockMode?: string; stock?: number }) =>
  value.stockMode === "counted" &&
  typeof value.stock === "number" &&
  value.stock <= 0;
export default function CustomizationDialog(props: CustomizationDialogProps) {
  return <SelectedCustomization key={props.product.id} {...props} />;
}
function SelectedCustomization({
  product,
  addLabel = "Add to basket",
  products = [],
  choiceKeys = [],
  onChoicesChange = () => {},
  hasTable = false,
  variantId,
  modifierIds,
  estimate,
  disabled,
  error = "",
  errorGroupId = null,
  onVariantChange,
  onModifierToggle,
  onClose,
  onAdd,
  registerGroup,
  fallbackFocus,
}: CustomizationDialogProps) {
  const dialog = useRef<HTMLDivElement>(null),
    callbacks = useRef({ onClose, fallbackFocus });
  callbacks.current = { onClose, fallbackFocus };
  useDialogFocus({
    dialogRef: dialog,
    open: true,
    onClose,
    initialFocus: "dialog",
    fallbackFocus,
  });
  const selectedVariant = product.variants?.find(
    (item) => item.id === variantId,
  );
  const unavailable =
    product.available === false ||
    soldOut(product) ||
    (!!product.variants?.length &&
      (!selectedVariant || soldOut(selectedVariant)));
  const incomplete =
    !choiceComplete(product.choiceGroups || [], choiceKeys) ||
    !!(product.requiresTable && !hasTable);
  const validEstimate = Number.isSafeInteger(estimate) && estimate >= 0;
  return (
    <div className="mc-modal-backdrop">
      <div
        className="mc-panel mc-modal mc-customization-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mc-customize-title"
        aria-describedby="mc-customize-description"
        tabIndex={-1}
        ref={dialog}
      >
        <header className="mc-modal-header">
          <div>
            <p className="mc-customization-eyebrow">Make it yours</p>
            <h2 id="mc-customize-title">{product.name}</h2>
          </div>
          <button
            type="button"
            className="mc-close"
            aria-label="Close customization"
            onClick={() => callbacks.current.onClose()}
          >
            ×
          </button>
        </header>
        <div className="mc-modal-content">
          <p id="mc-customize-description">
            {product.description ||
              "Choose your options before adding this item to your basket."}
          </p>
          <ItemContents item={product} products={products} />
          <ComboChoices
            groups={product.choiceGroups || []}
            keys={choiceKeys}
            products={products}
            onChange={onChoicesChange}
            disabled={disabled}
          />
          {!!product.variants?.length ? (
            <Chips
              label="Choose a size"
              value={variantId}
              onChange={onVariantChange}
              disabled={disabled}
              options={product.variants.map((item) => ({
                value: item.id,
                label: `${item.name} · ${money(item.price)}${soldOut(item) ? " · Sold out" : ""}`,
                disabled: soldOut(item),
              }))}
            />
          ) : product.size ? (
            <p className="mc-customization-size">Size: {product.size}</p>
          ) : null}
          {product.modifierGroups?.map((group, index) => {
            const hintId = `mc-option-hint-${index}`;
            const invalid = errorGroupId === group.id;
            return (
              <fieldset
                key={group.id}
                className="mc-option-group mc-option-chips"
                tabIndex={-1}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                aria-describedby={`${hintId}${invalid ? " mc-modifier-error" : ""}`}
                ref={(node) => registerGroup?.(group.id, node)}
              >
                <legend>
                  {group.name} ·{" "}
                  {group.min === group.max
                    ? `choose ${group.min}`
                    : group.min === 0
                      ? `choose up to ${group.max}`
                      : `choose ${group.min}–${group.max}`}
                </legend>
                <p className="mc-option-hint" id={hintId}>
                  {group.min > 0 ? "Required" : "Optional"} ·{" "}
                  {
                    group.options.filter((option) =>
                      modifierIds.includes(option.id),
                    ).length
                  }{" "}
                  selected
                </p>
                {invalid && error && (
                  <p
                    className="mc-option-error"
                    role="alert"
                    id="mc-modifier-error"
                  >
                    {error}
                  </p>
                )}
                {group.options.map((option, optionIndex) => (
                  <label className="mc-modifier" key={option.id}>
                    <input
                      type="checkbox"
                      aria-label={option.name}
                      aria-describedby={`mc-option-price-${index}-${optionIndex}`}
                      checked={modifierIds.includes(option.id)}
                      onChange={(event) =>
                        onModifierToggle(option.id, event.target.checked)
                      }
                    />
                    <span>
                      {option.name}
                      <small id={`mc-option-price-${index}-${optionIndex}`}>
                        {option.price > 0
                          ? `+${money(option.price)}`
                          : "No extra charge"}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
            );
          })}
          {!!product.dietary?.length && (
            <p>Dietary: {product.dietary.join(", ")}</p>
          )}
          {!!product.allergens?.length && (
            <div className="mc-customization-allergens">
              <p>
                <strong>Allergens:</strong> {product.allergens.join(", ")}.
              </p>
              <p>
                Please ask staff about dietary requirements before ordering.
              </p>
            </div>
          )}
          {error && !errorGroupId && (
            <p className="mc-alert" role="alert" id="mc-modifier-error">
              {error}
            </p>
          )}
          {unavailable && (
            <p className="mc-alert" role="status">
              This selection is unavailable. Choose an available size or close
              this item and ask staff for help.
            </p>
          )}
        </div>
        <footer className="mc-modal-actions">
          <div>
            <p>
              Item estimate{" "}
              <strong>{validEstimate ? money(estimate) : "Unavailable"}</strong>
            </p>
            <p className="mc-customization-price-note">
              Final availability and any order-level charges are checked at
              checkout.
            </p>
          </div>
          <button
            type="button"
            className="mc-primary"
            aria-label={addLabel}
            disabled={disabled || unavailable || incomplete || !validEstimate}
            onClick={() => {
              if (!disabled && !unavailable && !incomplete && validEstimate)
                onAdd();
            }}
          >
            {addLabel} · {validEstimate ? money(estimate) : "Unavailable"}
          </button>
        </footer>
      </div>
    </div>
  );
}
