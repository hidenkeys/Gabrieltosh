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
const denominations = [1000, 500, 200, 100, 50, 20, 10, 5];
export function CashCounter({
  label,
  value,
  onChange,
  name,
  disabled,
  required,
}: CashCounterProps) {
  const [counts, setCounts] = useState<Record<number, number>>({}),
    [expanded, setExpanded] = useState(false);
  const total = denominations.reduce(
    (sum, note) => sum + note * (counts[note] || 0),
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
                label={`₦${note.toLocaleString("en-NG")} notes or coins`}
                value={counts[note] || 0}
                min={0}
                max={100000}
                onChange={(count) => setCounts({ ...counts, [note]: count })}
                disabled={disabled}
              />
            ))}
          </div>
          <p aria-live="polite">
            Count total: ₦{total.toLocaleString("en-NG")}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(total.toFixed(2))}
          >
            Use counted total
          </button>
        </div>
      )}
    </div>
  );
}
export default CashCounter;
