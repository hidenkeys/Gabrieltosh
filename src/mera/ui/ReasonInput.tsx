import { useId, useState } from "react";
import Chips from "./Chips";
export type ReasonInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets: string[];
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  name?: string;
  disabled?: boolean;
};
export function ReasonInput({
  label,
  value,
  onChange,
  presets,
  minLength = 0,
  maxLength = 2000,
  required,
  name,
  disabled,
}: ReasonInputProps) {
  const id = useId(),
    [other, setOther] = useState(!!value && !presets.includes(value));
  const custom = other || (!!value && !presets.includes(value));
  // Short preset labels are not silently padded: only valid presets are offered for the existing API contract.
  const usable = presets.filter(
    (preset) =>
      preset !== "Other" &&
      preset.length >= minLength &&
      preset.length <= maxLength,
  );
  return (
    <div className="mi-control mi-reason">
      <Chips
        label={label}
        value={custom ? "__other" : value}
        onChange={(next) => {
          setOther(next === "__other");
          onChange(next === "__other" ? "" : next);
        }}
        options={[
          ...usable.map((preset) => ({ value: preset, label: preset })),
          { value: "__other", label: "Other" },
        ]}
        disabled={disabled}
        required={required}
      />
      {custom && (
        <label htmlFor={id}>
          Details
          <textarea
            id={id}
            aria-label={`${label} details`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            minLength={minLength}
            maxLength={maxLength}
            required={required}
            disabled={disabled}
          />
        </label>
      )}
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
    </div>
  );
}
export default ReasonInput;
