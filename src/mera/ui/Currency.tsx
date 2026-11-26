import { createContext, useContext } from "react";
import { formatMoney } from "../../../shared/mera-money.js";
export const CurrencyContext = createContext("NGN");
export const useCurrency = () => useContext(CurrencyContext);
export function useMoney() {
  const currency = useCurrency();
  return (minor: number) => formatMoney(minor, currency);
}
