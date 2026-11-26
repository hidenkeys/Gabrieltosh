import { useCurrency, useMoney } from "./Currency";
import { useState } from "react";
import Stepper from "./Stepper";
import MoneyInput from "./MoneyInput";
export type CashCounterProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
};
export function CashCounter({
  label,
  value,
  onChange,
  name,
  disabled,
  required,
}: CashCounterProps) {
  const money = useMoney();
  const currency = useCurrency();
  const denominations = (
    {
      NGN: [1000, 500, 200, 100, 50, 20, 10, 5],
      USD: [100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01],
      GBP: [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01],
      EUR: [
        500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01,
      ],
      GHS: [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.01],
      KES: [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.5],
      ZAR: [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1],
    } as Record<string, number[]>
  )[currency] || [100, 50, 20, 10, 5, 1];
  const [counts, setCounts] = useState<Record<number, number>>({}),
    [expanded, setExpanded] = useState(false);
  const total = denominations.reduce(
    (sum, note) => sum + Math.round(note * 100) * (counts[note] || 0),
    0,
  );
  return (
    <div className="mi-control mi-cash">
      <MoneyInput
        label={label}
        value={value}
        onChange={onChange}
        name={name}
        disabled={disabled}
        required={required}
      />
      <button
        type="button"
        disabled={disabled}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        Count notes and coins
      </button>
      {expanded && (
        <div>
          <div className="mi-cash-grid">
            {denominations.map((note) => (
              <Stepper
                key={note}
                label={`${money(Math.round(note * 100))} notes or coins`}
                value={counts[note] || 0}
                min={0}
                max={100000}
                onChange={(count) => setCounts({ ...counts, [note]: count })}
                disabled={disabled}
              />
            ))}
          </div>
          <p aria-live="polite">Count total: {money(total)}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange((total / 100).toFixed(2))}
          >
            Use counted total
          </button>
        </div>
      )}
    </div>
  );
}
export default CashCounter;
