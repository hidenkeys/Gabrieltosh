import { useEffect, useRef, useState } from "react";
import MinorMoneyInput from "../ui/MinorMoneyInput";
import Segmented from "../ui/Segmented";
import Stepper from "../ui/Stepper";
import Switch from "../ui/Switch";
import MoneyInput from "../ui/MoneyInput";
import Combobox from "../ui/Combobox";

export const itemKindBody = (value: any) => {
  if (value.kind === "package" && !value.components?.length)
    throw new Error("Add at least one component item before saving.");
  if (
    value.kind === "combo" &&
    (!value.choiceGroups?.length ||
      value.choiceGroups.some(
        (g: any) =>
          !g.options.length || g.min > g.max || g.max > g.options.length,
      ))
  )
    throw new Error(
      "Add choice items and check each group's minimum and maximum before saving.",
    );
  return {
    kind: value.kind || "single",
    unitCost: value.unitCost ?? null,
    serves: value.kind === "package" ? (value.serves ?? null) : null,
    requiresTable: value.kind === "package" && !!value.requiresTable,
    components: value.kind === "package" ? value.components || [] : [],
    choiceGroups: value.kind === "combo" ? value.choiceGroups || [] : [],
    ...((value.kind || "single") !== "single"
      ? { stockMode: "unlimited", stock: 0, variants: [] }
      : {}),
  };
};
export function itemOptions(products: any[], exclude?: string) {
  return products
    .filter((p) => p.id !== exclude && (p.kind || "single") === "single")
    .flatMap((p) =>
      p.variants?.length
        ? p.variants.map((v: any) => ({
            value: JSON.stringify([p.id, v.id]),
            label: `${p.name} · ${v.name}`,
            description: p.code,
          }))
        : [
            {
              value: JSON.stringify([p.id, null]),
              label: p.name,
              description: p.code,
            },
          ],
    );
}
export function unavailableContents(value: any, products: any[]) {
  const unavailable = (ref: any) => {
    const p = products.find((p) => p.id === ref.productId),
      v = p?.variants?.find((v: any) => v.id === ref.variantId);
    return (
      !p ||
      !p.available ||
      (p.stockMode === "counted" && p.stock < (ref.quantity || 1)) ||
      (ref.variantId && !v) ||
      (v?.stockMode === "counted" && v.stock < (ref.quantity || 1))
    );
  };
  const counts = new Map<string, number>();
  for (const ref of value.components || [])
    counts.set(ref.productId, (counts.get(ref.productId) || 0) + ref.quantity);
  const packageRefs = (value.components || []).map((ref: any) => ({
    ...ref,
    quantity: (value.components || [])
      .filter(
        (r: any) =>
          r.productId === ref.productId &&
          (r.variantId || null) === (ref.variantId || null),
      )
      .reduce((n: number, r: any) => n + r.quantity, 0),
  }));
  const refs =
    value.kind === "combo"
      ? (value.choiceGroups || []).flatMap((g: any) =>
          g.options.filter(unavailable).length > g.options.length - g.min
            ? g.options.filter(unavailable)
            : [],
        )
      : packageRefs.filter(
          (r: any) =>
            unavailable(r) ||
            products.some(
              (p) =>
                p.id === r.productId &&
                p.stockMode === "counted" &&
                p.stock < (counts.get(p.id) || 0),
            ),
        );
  return [
    ...new Set(
      refs.map(
        (r: any) =>
          products.find((p) => p.id === r.productId)?.name || "Missing item",
      ),
    ),
  ];
}
export default function ItemKindEditor({
  value,
  products,
  onChange,
  disabled = false,
}: {
  value: any;
  products: any[];
  onChange: (value: any) => void;
  disabled?: boolean;
}) {
  const kind = value.kind || "single",
    patch = (p: any) => onChange({ ...value, ...p }),
    options = itemOptions(products, value.id);
  const pick = (label: string, ref: any, change: (r: any) => void) => (
    <Combobox
      label={label}
      required
      value={
        ref.productId
          ? JSON.stringify([ref.productId, ref.variantId || null])
          : ""
      }
      options={options}
      onChange={(key) => {
        const [productId, variantId] = key ? JSON.parse(key) : ["", null];
        change({ ...ref, productId, variantId });
      }}
    />
  );
  const missing = unavailableContents(value, products);
  return (
    <fieldset className="mw-wide mw-item-kind" disabled={disabled}>
      <legend>Item kind</legend>
      <Segmented
        label="Item kind"
        name="item-kind"
        value={kind}
        onChange={(kind) =>
          patch({
            kind,
            components: [],
            choiceGroups: [],
            requiresTable: false,
            serves: null,
            ...(kind !== "single"
              ? { stockMode: "unlimited", stock: 0, variants: [] }
              : {}),
          })
        }
        options={[
          { value: "single", label: "Single item" },
          { value: "package", label: "Package" },
          { value: "combo", label: "Meal or combo" },
        ]}
      />
      <p>
        {kind === "single"
          ? "One item, with its own stock and optional sizes."
          : kind === "package"
            ? "Fixed contents sold together at one price."
            : "A meal where guests choose items from each group."}
      </p>
      <OptionalCost
        key={value.id || "new"}
        value={value.unitCost ?? null}
        onChange={(unitCost) => patch({ unitCost })}
      />
      <p>Optional. Used for stock value.</p>
      {kind === "package" && (
        <>
          {(value.components || []).map((ref: any, i: number) => (
            <div className="mw-form" key={i}>
              {pick(`Component item ${i + 1}`, ref, (next) =>
                patch({
                  components: value.components.map((r: any, n: number) =>
                    n === i ? next : r,
                  ),
                }),
              )}
              <Stepper
                label={`Component quantity ${i + 1}`}
                min={1}
                max={50}
                value={ref.quantity}
                onChange={(quantity) =>
                  patch({
                    components: value.components.map((r: any, n: number) =>
                      n === i ? { ...r, quantity } : r,
                    ),
                  })
                }
              />
              <button
                type="button"
                onClick={() =>
                  patch({
                    components: value.components.filter(
                      (_: any, n: number) => n !== i,
                    ),
                  })
                }
              >
                Remove component {i + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={value.components?.length >= 20}
            onClick={() =>
              patch({
                components: [
                  ...(value.components || []),
                  { productId: "", variantId: null, quantity: 1 },
                ],
              })
            }
          >
            Add component item
          </button>
          {!value.components?.length && (
            <p role="status">Add at least one component item before saving.</p>
          )}
          <Switch
            label="Show how many this serves"
            checked={value.serves != null}
            onChange={(checked) => patch({ serves: checked ? 1 : null })}
          />
          {value.serves != null && (
            <Stepper
              label="Serves"
              min={1}
              max={50}
              value={value.serves}
              onChange={(serves) => patch({ serves })}
            />
          )}
          <Switch
            label="Only for booked or seated tables"
            checked={!!value.requiresTable}
            onChange={(requiresTable) => patch({ requiresTable })}
          />
        </>
      )}
      {kind === "combo" && (
        <>
          {(value.choiceGroups || []).map((g: any, i: number) => {
            const update = (p: any) =>
              patch({
                choiceGroups: value.choiceGroups.map((old: any, n: number) =>
                  n === i ? { ...g, ...p } : old,
                ),
              });
            return (
              <fieldset key={g.id}>
                <legend>Choice group {i + 1}</legend>
                <label>
                  Choice group name
                  <input
                    required
                    maxLength={100}
                    value={g.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </label>
                <Stepper
                  label={`Minimum choices ${i + 1}`}
                  value={g.min}
                  min={0}
                  max={Math.min(g.max, g.options.length)}
                  onChange={(min) => update({ min })}
                />
                <Stepper
                  label={`Maximum choices ${i + 1}`}
                  value={g.max}
                  min={Math.max(1, g.min)}
                  max={Math.max(1, g.options.length)}
                  onChange={(max) => update({ max })}
                />
                {g.options.map((ref: any, j: number) => (
                  <div className="mw-form" key={j}>
                    {pick(`Choice item ${i + 1}.${j + 1}`, ref, (next) =>
                      update({
                        options: g.options.map((r: any, n: number) =>
                          n === j ? next : r,
                        ),
                      }),
                    )}
                    <MinorMoneyInput
                      label={`Extra price ${i + 1}.${j + 1}`}
                      value={ref.priceDelta}
                      onChange={(priceDelta) =>
                        update({
                          options: g.options.map((r: any, n: number) =>
                            n === j ? { ...r, priceDelta } : r,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          options: g.options.filter(
                            (_: any, n: number) => n !== j,
                          ),
                          min: Math.min(
                            g.min,
                            Math.max(0, g.options.length - 1),
                          ),
                          max: Math.min(
                            g.max,
                            Math.max(1, g.options.length - 1),
                          ),
                        })
                      }
                    >
                      Remove choice {i + 1}.{j + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={g.options.length >= 30}
                  onClick={() =>
                    update({
                      options: [
                        ...g.options,
                        { productId: "", variantId: null, priceDelta: 0 },
                      ],
                    })
                  }
                >
                  Add choice item
                </button>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      choiceGroups: value.choiceGroups.filter(
                        (_: any, n: number) => n !== i,
                      ),
                    })
                  }
                >
                  Remove choice group {i + 1}
                </button>
              </fieldset>
            );
          })}
          <button
            type="button"
            disabled={value.choiceGroups?.length >= 8}
            onClick={() =>
              patch({
                choiceGroups: [
                  ...(value.choiceGroups || []),
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    min: 1,
                    max: 1,
                    options: [],
                  },
                ],
              })
            }
          >
            Add choice group
          </button>
        </>
      )}
      {kind !== "single" && (
        <p>
          Stock comes from component items. Adjust stock on the single items.
        </p>
      )}
      {!!missing.length && (
        <p role="status">Unavailable: {missing.join(", ")} out of stock</p>
      )}
    </fieldset>
  );
}

function OptionalCost({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [raw, setRaw] = useState(value == null ? "" : String(value / 100)),
    emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      setRaw(value == null ? "" : String(value / 100));
      emitted.current = value;
    }
  }, [value]);
  return (
    <MoneyInput
      label="Cost to you"
      value={raw}
      onChange={(next) => {
        setRaw(next);
        if (next === "" || Number.isFinite(Number(next))) {
          const amount = next === "" ? null : Math.round(Number(next) * 100);
          emitted.current = amount;
          onChange(amount);
        }
      }}
    />
  );
}
