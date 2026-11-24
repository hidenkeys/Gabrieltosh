export type StaffLineSelection = {
  index: number;
  productId: string;
  complete: boolean;
  needsVariant: boolean;
  messages: string[];
  baseEstimate: number | null;
  extrasEstimate: number | null;
  unitEstimate: number | null;
  estimate: number | null;
};
const money = (value: any): value is number =>
  Number.isSafeInteger(value) && value >= 0 && value <= 100000000000;
/** Local completeness and item estimate only; server quotes remain the final price authority. */
export function validateStaffSelection(
  products: any[],
  lines: any[],
): { complete: boolean; estimate: number | null; lines: StaffLineSelection[] } {
  const source = Array.isArray(products) ? products : [],
    draft = Array.isArray(lines) ? lines : [];
  const validated = draft.map((line, index) => {
    const product = source.find((product) => product?.id === line?.productId),
      messages: string[] = [];
    let baseEstimate: number | null = null;
    let unit: number | null = null,
      needsVariant = false;
    if (!product || product.available !== true)
      messages.push("This item is unavailable. Review your order.");
    if (
      !Number.isInteger(line?.quantity) ||
      line.quantity < 1 ||
      line.quantity > 100
    )
      messages.push("Choose a quantity from 1 to 100.");
    if (product) {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      if (variants.length) {
        const variant = variants.find(
          (variant: any) => variant.id === line?.variantId,
        );
        if (!variant) {
          needsVariant = true;
          messages.push("Choose size");
        } else unit = money(variant.price) ? variant.price : null;
      } else if (line?.variantId)
        messages.push("Choose an available size or remove this item.");
      else unit = money(product.price) ? product.price : null;
      baseEstimate = unit;
      const modifiers = line?.modifiers === undefined ? [] : line.modifiers;
      if (
        !Array.isArray(modifiers) ||
        modifiers.some((id: any) => typeof id !== "string") ||
        new Set(modifiers).size !== modifiers.length
      )
        messages.push("Review selected add-ons.");
      const selected = new Set<string>(
        Array.isArray(modifiers) ? modifiers : [],
      );
      for (const group of Array.isArray(product.modifierGroups)
        ? product.modifierGroups
        : []) {
        const options = Array.isArray(group.options) ? group.options : [],
          chosen = options.filter((option: any) => selected.has(option.id));
        const min = Number.isInteger(group.min) ? group.min : 0,
          max = Number.isInteger(group.max) ? group.max : options.length;
        if (chosen.length < min || chosen.length > max)
          messages.push(
            `Choose ${min}–${max} options for ${group.name || "add-ons"}.`,
          );
        for (const option of chosen) {
          selected.delete(option.id);
          if (!money(option.price) || unit === null) unit = null;
          else unit += option.price;
        }
      }
      const choices = Array.isArray(line.choices) ? line.choices : [];
      const used = new Set<string>();
      for (const group of product.choiceGroups || []) {
        const chosen = choices.filter((c: any) => c.groupId === group.id);
        if (chosen.length < group.min || chosen.length > group.max)
          messages.push(
            `Choose ${group.min}–${group.max} options for ${group.name}.`,
          );
        for (const c of chosen) {
          const key = JSON.stringify([
            c.groupId,
            c.productId,
            c.variantId || null,
          ]);
          const option = group.options.find(
            (o: any) =>
              o.productId === c.productId &&
              (o.variantId || null) === (c.variantId || null),
          );
          if (!option || used.has(key)) messages.push("Review combo choices.");
          else if (unit !== null && money(option.priceDelta))
            unit += option.priceDelta;
          else unit = null;
          used.add(key);
        }
      }
      if (
        choices.some(
          (c: any) =>
            !(product.choiceGroups || []).some((g: any) => g.id === c.groupId),
        )
      )
        messages.push("Review combo choices.");
      if (selected.size)
        messages.push("Remove add-ons that are no longer available.");
      if (unit === null && !needsVariant)
        messages.push("Price unavailable. Review this item.");
    }
    const complete = messages.length === 0 && unit !== null;
    const estimate =
      complete && money(unit! * line.quantity) ? unit! * line.quantity : null;
    if (complete && estimate === null)
      messages.push("Review this item’s quantity and price.");
    return {
      index,
      productId: line?.productId || "",
      complete: complete && estimate !== null,
      needsVariant,
      messages,
      baseEstimate: messages.length ? null : baseEstimate,
      extrasEstimate:
        messages.length || unit === null || baseEstimate === null
          ? null
          : unit - baseEstimate,
      unitEstimate: messages.length ? null : unit,
      estimate,
    };
  });
  const complete =
    validated.length > 0 && validated.every((line) => line.complete);
  const sum = validated.reduce(
    (total, line) => total + (line.estimate || 0),
    0,
  );
  return {
    complete: complete && money(sum),
    estimate: validated.length === 0 ? 0 : complete && money(sum) ? sum : null,
    lines: validated,
  };
}
