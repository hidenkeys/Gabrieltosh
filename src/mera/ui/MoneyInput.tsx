import { useCurrency } from "./Currency";
import { formatMoney } from "../../../shared/mera-money.js";
import { useEffect, useId, useRef } from "react";
function useCurrencyValue(explicit?: string) {
  const current = useCurrency();
  return explicit || current;
}
export type MoneyInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  id?: string;
  min?: number;
  max?: number;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  currency?: string;
  className?: string;
};
export function MoneyInput({
  label,
  value,
  onChange,
  name,
  id,
  min = 0,
  max,
  required,
  disabled,
  placeholder = "0.00",
  currency: explicitCurrency,
  className = "",
}: MoneyInputProps) {
  const currency = useCurrencyValue(explicitCurrency);
  const generated = useId(),
    input = useRef<HTMLInputElement>(null);
  const numeric = Number(value),
    valid =
      value === "" ||
      (/^-?\d*(\.\d{0,2})?$/.test(value) && Number.isFinite(numeric));
  useEffect(() => {
    input.current?.setCustomValidity(
      !valid
        ? "Enter a valid amount."
        : value !== "" && numeric < min
          ? `Enter at least ${min}.`
          : value !== "" && max !== undefined && numeric > max
            ? `Enter no more than ${max}.`
            : "",
    );
  }, [value, min, max, numeric, valid]);
  const [whole, fraction] = value.split("."),
    display =
      whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
      (fraction !== undefined ? "." + fraction : "");
  return (
    <div className={`mi-control mi-money ${className}`}>
      <label htmlFor={id || generated}>
        {currency === "NGN" ? label : label.replace(/naira|₦/gi, currency)}
      </label>
      <div className="mi-money-row">
        <span aria-hidden="true">{currency === "NGN" ? "₦" : currency}</span>
        <input
          ref={input}
          id={id || generated}
          type="text"
          inputMode="decimal"
          value={display}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-describedby={`${generated}-currency`}
          onChange={(event) => {
            const raw = event.target.value.replace(/,/g, "");
            if (/^-?\d*(\.\d{0,2})?$/.test(raw)) onChange(raw);
          }}
        />
      </div>
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
      <span id={`${generated}-currency`} className="mi-sr-only">
        {currency === "NGN" ? "Nigerian naira" : currency}
      </span>
      <output className="mi-sr-only" aria-live="polite">
        {value && valid ? formatMoney(Math.round(numeric * 100), currency) : ""}
      </output>
    </div>
  );
}
export default MoneyInput;
