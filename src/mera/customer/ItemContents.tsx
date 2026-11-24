export const choiceKey = (groupId: string, option: any) =>
  JSON.stringify([groupId, option.productId, option.variantId || null]);
export function selectedChoices(groups: any[], keys: string[]) {
  return groups.flatMap((g) =>
    g.options
      .filter((o: any) => keys.includes(choiceKey(g.id, o)))
      .map((o: any) => ({
        groupId: g.id,
        productId: o.productId,
        variantId: o.variantId || null,
      })),
  );
}
export function choiceComplete(groups: any[], keys: string[]) {
  return groups.every((g) => {
    const n = g.options.filter((o: any) =>
      keys.includes(choiceKey(g.id, o)),
    ).length;
    return n >= g.min && n <= g.max;
  });
}
export function contentName(ref: any, products: any[] = []) {
  const p = products.find((p) => p.id === ref.productId),
    v = p?.variants?.find((v: any) => v.id === ref.variantId);
  return [ref.name || p?.name || "Item unavailable", ref.size || v?.name]
    .filter(Boolean)
    .join(" · ");
}
export default function ItemContents({
  item,
  products = [],
  summary = false,
}: {
  item: any;
  products?: any[];
  summary?: boolean;
}) {
  return (
    <>
      {item.kind === "package" && (
        <span className="mc-kind-badge">Package</span>
      )}
      {item.kind === "combo" && <span className="mc-kind-badge">Meal</span>}
      {item.serves && (
        <span className="mc-kind-badge">Serves {item.serves}</span>
      )}
      {!!item.components?.length && (
        <ul className="mc-item-contents">
          {(summary ? item.components.slice(0, 3) : item.components).map(
            (r: any, i: number) => (
              <li key={i}>
                {r.quantity || 1} × {contentName(r, products)}
              </li>
            ),
          )}
        </ul>
      )}
      {summary && !!item.choiceGroups?.length && (
        <p className="mc-item-contents">
          {item.choiceGroups
            .slice(0, 3)
            .map(
              (group: any) =>
                `${group.name}: ${(group.options || [])
                  .slice(0, 2)
                  .map((option: any) => contentName(option, products))
                  .join(" or ")}`,
            )
            .join(" · ")}
        </p>
      )}
      {item.requiresTable && <p>Available for booked or seated tables</p>}
    </>
  );
}
export function ComboChoices({
  groups,
  keys,
  products = [],
  onChange,
  disabled = false,
}: {
  groups: any[];
  keys: string[];
  products?: any[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {groups.map((g) => {
        const count = g.options.filter((o: any) =>
          keys.includes(choiceKey(g.id, o)),
        ).length;
        return (
          <fieldset
            className="mc-option-group mc-option-chips"
            key={g.id}
            disabled={disabled}
          >
            <legend>
              {g.name} · choose {g.min}–{g.max}
            </legend>
            <p aria-live="polite">{count} selected</p>
            {g.options.map((o: any) => {
              const key = choiceKey(g.id, o),
                checked = keys.includes(key),
                p = products.find((p) => p.id === o.productId),
                v = p?.variants?.find((v: any) => v.id === o.variantId);
              const unavailable =
                o.available === false ||
                p?.available === false ||
                (p?.stockMode === "counted" && p.stock <= 0) ||
                (v?.stockMode === "counted" && v.stock <= 0);
              return (
                <label className="mc-modifier" key={key}>
                  <input
                    type="checkbox"
                    aria-label={contentName(o, products)}
                    checked={checked}
                    disabled={!checked && (count >= g.max || unavailable)}
                    onChange={() =>
                      onChange(
                        checked
                          ? keys.filter((k) => k !== key)
                          : [...keys, key],
                      )
                    }
                  />
                  <span>
                    {contentName(o, products)}
                    <small>
                      {o.priceDelta
                        ? `+₦${(o.priceDelta / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                        : "No extra charge"}
                      {unavailable ? " · Unavailable" : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </fieldset>
        );
      })}
    </>
  );
}
