export const allowedCurrencies = Object.freeze([
  "NGN",
  "USD",
  "GBP",
  "EUR",
  "GHS",
  "KES",
  "ZAR",
]);
const locales = {
  NGN: "en-NG",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  GHS: "en-GH",
  KES: "en-KE",
  ZAR: "en-ZA",
};
/** All supported currencies use 100 integer minor units per major unit. */
export function formatMoney(minorUnits, currency = "NGN") {
  return new Intl.NumberFormat(locales[currency] || "en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}
export function importCurrencyNotice(detected, location) {
  return detected !== location
    ? `This menu is priced in ${detected}. Your location uses ${location}.`
    : "";
}
