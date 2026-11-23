import { useId } from "react";
type Props = {
  label: string;
  unit: string;
  value: string | number;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number | string;
  required?: boolean;
  disabled?: boolean;
  allowUnset?: boolean;
  presets?: { value: number; label?: string }[];
};
/** Numeric policy/dimension entry. Keep the caller's wire conversion, native bounds and empty draft intact. */
export default function UnitInput({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step = 1,
  required,
  disabled,
  allowUnset = false,
  presets = [],
}: Props) {
  const id = useId();
  return (
    <div className="mi-control mi-unit">
      <label htmlFor={id}>{label}</label>
      <div className="mi-unit-row">
        <input
          id={id}
          type="number"
          inputMode={step === 1 || step === "1" ? "numeric" : "decimal"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          min={min}
          max={max}
          step={step}
          required={required}
          disabled={disabled}
          placeholder={allowUnset ? "Not set" : undefined}
        />
        <span aria-hidden="true">{unit}</span>
      </div>
      {!!presets.length && (
        <div
          className="mi-unit-presets"
          role="group"
          aria-label={`${label} quick values`}
        >
          {presets
            .filter(
              (preset) =>
                (min === undefined || preset.value >= min) &&
                (max === undefined || preset.value <= max),
            )
            .map((preset) => (
              <button
                key={preset.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange(String(preset.value))}
              >
                {preset.label || `${preset.value} ${unit}`}
              </button>
            ))}
        </div>
      )}
      {allowUnset && (
        <button type="button" disabled={disabled} onClick={() => onChange("")}>
          Leave {label.toLowerCase().replace(/\s*\([^)]*\)/g, "")} not set
        </button>
      )}
    </div>
  );
}
