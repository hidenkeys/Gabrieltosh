export const allowedCurrencies: readonly [
  "NGN",
  "USD",
  "GBP",
  "EUR",
  "GHS",
  "KES",
  "ZAR",
];
export function formatMoney(minorUnits: number, currency?: string): string;
export function importCurrencyNotice(
  detected: string,
  location: string,
): string;
