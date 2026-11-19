import { useEffect, useLayoutEffect, useRef } from "react";
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
    prior = useRef<HTMLElement | null>(null),
    callbacks = useRef({ onClose, fallbackFocus });
  callbacks.current = { onClose, fallbackFocus };
  useLayoutEffect(() => {
    if (!prior.current) prior.current = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        callbacks.current.onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      // Enumerate source order before filtering. Some selector engines group
      // comma-separated matches by element type instead of document order.
      const controls = [
        ...dialog.current.querySelectorAll<HTMLElement>("*"),
      ].filter((element) =>
        element.matches(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      );
      const first = controls[0],
        last = controls.at(-1),
        active = document.activeElement;
      if (!first) {
        event.preventDefault();
        dialog.current.focus();
        return;
      }
      if (event.shiftKey && (active === first || active === dialog.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
    };
  }, []);
  // Passive cleanup follows the parent's inert/aria-hidden DOM update. Restore
  // the real initiating control, rather than a newly rendered variant control.
  useEffect(
    () => () => {
      const element = prior.current;
      if (element?.isConnected && element !== document.body) element.focus();
      else callbacks.current.fallbackFocus?.();
    },
    [],
  );
  const selectedVariant = product.variants?.find(
    (item) => item.id === variantId,
  );
  const unavailable =
    product.available === false ||
    soldOut(product) ||
    (!!product.variants?.length &&
      (!selectedVariant || soldOut(selectedVariant)));
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
          {!!product.variants?.length ? (
            <label>
              Choose a size
              <select
                value={variantId}
                disabled={disabled}
                onChange={(event) => onVariantChange(event.target.value)}
              >
                {product.variants.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={soldOut(item)}
                  >
                    {item.name} · {money(item.price)}
                    {soldOut(item) ? " · Sold out" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : product.size ? (
            <p className="mc-customization-size">Size: {product.size}</p>
          ) : null}
          {product.modifierGroups?.map((group, index) => {
            const hintId = `mc-option-hint-${index}`;
            const invalid = errorGroupId === group.id;
            return (
              <fieldset
                key={group.id}
                className="mc-option-group"
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
            disabled={disabled || unavailable || !validEstimate}
            onClick={() => {
              if (!disabled && !unavailable && validEstimate) onAdd();
            }}
          >
            Add to basket
          </button>
        </footer>
      </div>
    </div>
  );
}
