import { z } from "zod";
import { basketLineSchema } from "./checkoutRecovery";
const savedBasket = z.object({
  version: z.literal(1),
  menuVersion: z.number().int().positive(),
  lines: z
    .array(basketLineSchema)
    .max(100)
    .refine(
      (lines) => new Set(lines.map((line) => line.key)).size === lines.length,
    ),
});
export const basketStorageKey = (scope: string) => "mera:basket:v1:" + scope;
export function readBasket(scope: string, menu: any) {
  try {
    const raw = window.localStorage.getItem(basketStorageKey(scope));
    if (!raw || raw.length > 512 * 1024) return null;
    const saved = savedBasket.parse(JSON.parse(raw));
    // Customizations and their prices need fresh review after publication.
    return saved.lines
      .filter((line) => {
        const p = menu.products.find((p: any) => p.id === line.productId);
        return (
          p?.available &&
          !(p.stockMode === "counted" && p.stock < line.quantity) &&
          (saved.menuVersion === menu.version ||
            (!line.variantId &&
              !line.modifiers.length &&
              !line.choices?.length)) &&
          (!line.variantId ||
            p.variants?.some(
              (v: any) =>
                v.id === line.variantId &&
                !(v.stockMode === "counted" && v.stock < line.quantity),
            )) &&
          (!p.variants?.length || !!line.variantId) &&
          (p.modifierGroups || []).every(
            (g: any) =>
              line.modifiers.filter((id) =>
                g.options.some((o: any) => o.id === id),
              ).length >= g.min &&
              line.modifiers.filter((id) =>
                g.options.some((o: any) => o.id === id),
              ).length <= g.max,
          ) &&
          (p.choiceGroups || []).every((group: any) => {
            const count = (line.choices || []).filter(
              (choice) => choice.groupId === group.id,
            ).length;
            return count >= group.min && count <= group.max;
          }) &&
          (line.choices || []).every(
            (choice) =>
              (p.choiceGroups || []).some(
                (group: any) =>
                  group.id === choice.groupId &&
                  group.options.some(
                    (option: any) =>
                      option.productId === choice.productId &&
                      (option.variantId || null) === (choice.variantId || null),
                  ),
              ) &&
              menu.products.some(
                (p: any) => p.id === choice.productId && p.available,
              ),
          ) &&
          line.modifiers.every((id) =>
            p.modifierGroups?.some((g: any) =>
              g.options.some((o: any) => o.id === id),
            ),
          )
        );
      })
      .map((line) => {
        const p = menu.products.find((p: any) => p.id === line.productId);
        return {
          ...line,
          name: p.name,
          unitPrice:
            (p.variants?.find((v: any) => v.id === line.variantId)?.price ??
              p.price) +
            (p.modifierGroups || [])
              .flatMap((g: any) => g.options)
              .filter((o: any) => line.modifiers.includes(o.id))
              .reduce((sum: number, o: any) => sum + o.price, 0) +
            (p.choiceGroups || [])
              .flatMap((g: any) =>
                g.options.filter((o: any) =>
                  (line.choices || []).some(
                    (choice) =>
                      choice.groupId === g.id &&
                      choice.productId === o.productId &&
                      (choice.variantId || null) === (o.variantId || null),
                  ),
                ),
              )
              .reduce((sum: number, o: any) => sum + (o.priceDelta || 0), 0),
        };
      });
  } catch {
    return null;
  }
}
export function saveBasket(
  scope: string,
  menuVersion: number,
  lines: unknown[],
) {
  try {
    window.localStorage.setItem(
      basketStorageKey(scope),
      JSON.stringify(savedBasket.parse({ version: 1, menuVersion, lines })),
    );
  } catch {
    /* Ordering remains usable when storage is unavailable. */
  }
}
