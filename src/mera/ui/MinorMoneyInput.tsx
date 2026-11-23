import { useEffect, useRef, useState } from "react";
import MoneyInput, { type MoneyInputProps } from "./MoneyInput";
export type MinorMoneyInputProps = Omit<
  MoneyInputProps,
  "value" | "onChange"
> & { value: number; onChange: (minorUnits: number) => void };
/** Controlled minor units at the boundary; preserve a person's decimal draft while typing. Bounds remain in major units, like MoneyInput. */
export function MinorMoneyInput({
  value,
  onChange,
  ...props
}: MinorMoneyInputProps) {
  const [raw, setRaw] = useState(() => String(value / 100)),
    emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      setRaw(String(value / 100));
      emitted.current = value;
    }
  }, [value]);
  return (
    <MoneyInput
      {...props}
      value={raw}
      onChange={(next) => {
        setRaw(next);
        const amount = Number(next);
        if (Number.isFinite(amount)) {
          const minor = Math.round(amount * 100);
          emitted.current = minor;
          onChange(minor);
        }
      }}
    />
  );
}
export default MinorMoneyInput;
