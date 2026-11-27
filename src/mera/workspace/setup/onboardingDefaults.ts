export function inferTimezone(address: string, currency: string) {
  const countries: [RegExp, string][] = [
    [/ghana|accra/i, "Africa/Accra"],
    [/kenya|nairobi/i, "Africa/Nairobi"],
    [/south africa|johannesburg|cape town/i, "Africa/Johannesburg"],
    [/united kingdom|london|\buk\b/i, "Europe/London"],
    [/nigeria|lagos|abuja/i, "Africa/Lagos"],
    [/united states|new york|\busa\b/i, "America/New_York"],
  ];
  return (
    countries.find(([pattern]) => pattern.test(address))?.[1] ||
    (
      {
        NGN: "Africa/Lagos",
        GHS: "Africa/Accra",
        KES: "Africa/Nairobi",
        ZAR: "Africa/Johannesburg",
        GBP: "Europe/London",
        USD: "America/New_York",
        EUR: "Europe/Paris",
        CAD: "America/Toronto",
        AUD: "Australia/Sydney",
      } as Record<string, string>
    )[currency] ||
    "UTC"
  );
}
export const defaultStation = (category: string) =>
  /drink|beverage|bar|cocktail|wine|beer|juice|coffee|tea|soda|shake/i.test(
    category,
  )
    ? "bar"
    : "kitchen";
export function quickItem(name: string, price: string, category: string) {
  if (
    !name.trim() ||
    !price.trim() ||
    !Number.isFinite(Number(price)) ||
    Number(price) < 0
  )
    throw Error("Enter an item name and a valid price.");
  return {
    name: name.trim(),
    price: Math.round(Number(price) * 100),
    category: category.trim() || "Food",
    code: `ITEM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    station: defaultStation(category),
    stockMode: "unlimited",
    stock: 0,
    available: true,
  };
}
