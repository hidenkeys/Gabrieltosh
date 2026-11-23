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
  const usable = presets.filter(
    (preset) =>
      preset !== "Other" &&
      preset.length >= minLength &&
      preset.length <= maxLength,
  );
  const matched = [...usable]
    .sort((a, b) => b.length - a.length)
    .find((preset) => value === preset || value.startsWith(preset + ": "));
  const id = useId(),
    [other, setOther] = useState(!!value && !matched),
    [noteOpen, setNoteOpen] = useState(!!matched && value !== matched);
  const custom = other || (!!value && !matched);
  const note =
    matched && value.startsWith(matched + ": ")
      ? value.slice(matched.length + 2)
      : "";
  return (
    <div className="mi-control mi-reason">
      <Chips
        label={label}
        value={custom ? "__other" : matched || value}
        onChange={(next) => {
          setOther(next === "__other");
          setNoteOpen(false);
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
      {!custom && matched && maxLength > matched.length + 2 && (
        <div className="mi-reason-note">
          {noteOpen || note ? (
            <>
              <label htmlFor={`${id}-note`}>
                Additional note (optional)
                <textarea
                  id={`${id}-note`}
                  aria-label={`${label} additional note`}
                  value={note}
                  disabled={disabled}
                  maxLength={maxLength - matched.length - 2}
                  onChange={(event) =>
                    onChange(
                      event.target.value
                        ? `${matched}: ${event.target.value}`
                        : matched,
                    )
                  }
                />
              </label>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setNoteOpen(false);
                  onChange(matched);
                }}
              >
                Remove note
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setNoteOpen(true)}
            >
              Add a note
            </button>
          )}
        </div>
      )}
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
    </div>
  );
}
export default ReasonInput;
