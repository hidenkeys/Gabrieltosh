import Stepper from "../ui/Stepper";
import MinorMoneyInput from "../ui/MinorMoneyInput";
import { uuid } from "../../api";
export default function VariantsEditor({
  value,
  onChange,
}: {
  value: any[];
  onChange: (value: any[]) => void;
}) {
  const update = (id: string, patch: any) =>
    onChange(
      value.map((variant) =>
        variant.id === id ? { ...variant, ...patch } : variant,
      ),
    );
  return (
    <fieldset className="mw-wide">
      <legend>Sizes & sellable stock</legend>
      <p className="mw-note">
        Set each size’s full price in naira. Stock balances are adjusted
        separately with a reason and stock permission. New sizes begin with
        unlimited stock; a stock adjustment initializes counted stock.
      </p>
      {value.map((variant) => (
        <div className="mw-form mw-card" key={variant.id}>
          <label>
            Size name
            <input
              required
              maxLength={100}
              value={variant.name}
              onChange={(event) =>
                update(variant.id, { name: event.target.value })
              }
            />
          </label>
          <MinorMoneyInput
            label="Size price (naira)"
            min={0}
            required
            value={variant.price}
            onChange={(value) =>
              update(variant.id, {
                price: value,
              })
            }
          />
          <Stepper
            label="Size low-stock alert threshold"
            required
            min={0}
            max={1000000}
            value={variant.lowStockThreshold ?? 5}
            onChange={(value) =>
              update(variant.id, { lowStockThreshold: value })
            }
          />
          <div>
            <p>
              {variant.stockMode === "counted"
                ? `${variant.stock || 0} in stock`
                : "Unlimited stock"}
            </p>
            <button
              type="button"
              onClick={() =>
                onChange(value.filter((row) => row.id !== variant.id))
              }
            >
              Remove size {variant.name}
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() =>
          onChange([
            ...value,
            {
              id: uuid(),
              name: "",
              price: 0,
              stockMode: "unlimited",
              stock: 0,
              lowStockThreshold: 5,
            },
          ])
        }
      >
        Add size
      </button>
    </fieldset>
  );
}
