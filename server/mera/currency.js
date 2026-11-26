import { z } from "zod";
import { allowedCurrencies } from "../../shared/mera-money.js";
export const currencySchema = z.enum(allowedCurrencies);
export async function validateCurrencyChange(c, branch, currency) {
  currencySchema.parse(currency);
  if (currency === branch.currency) return;
  const existing = await c.query(
    "SELECT id FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='order' LIMIT 1",
    [branch.organization_id, branch.id],
  );
  if (existing.rows.length)
    throw Object.assign(
      new Error(
        "Currency cannot be changed because this location has orders. Create a new location to use a different currency.",
      ),
      { status: 409 },
    );
}

export function providersForCurrency(providers, currency) {
  if (currency === "NGN") return providers;
  return {
    ...providers,
    rubies: {
      ...providers.rubies,
      state: "blocked",
      reason:
        "Online collection is unavailable for this location’s currency. Use cash, card or external POS.",
    },
  };
}
