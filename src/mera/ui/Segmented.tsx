import { useId, type KeyboardEvent } from "react";
export type ChoiceOption = {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
};
export type ChoiceProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};
export function Segmented({
  label,
  value,
  onChange,
  options,
  name,
  disabled,
  required,
  className = "",
}: ChoiceProps) {
  const id = useId();
  function arrows(event: KeyboardEvent<HTMLFieldSetElement>) {
    if (
      ![
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    const available = options.filter((option) => !option.disabled);
    if (disabled || !available.length) return;
    event.preventDefault();
    const current = available.findIndex((option) => option.value === value);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? available.length - 1
          : (current +
              (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) +
              available.length) %
            available.length;
    onChange(available[index].value);
    const inputs = Array.from(
      event.currentTarget.querySelectorAll<HTMLInputElement>(
        "input:not(:disabled)",
      ),
    );
    inputs[index]?.focus();
  }
  return (
    <fieldset
      className={`mi-control mi-choice ${className}`}
      disabled={disabled}
      onKeyDown={arrows}
    >
      <legend>{label}</legend>
      <div className="mi-choice-options">
        {options.map((option) => (
          <label className="mi-choice-option" key={option.value}>
            <input
              type="radio"
              aria-label={option.label}
              name={name || id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={option.disabled}
              required={required}
            />
            <span>
              {option.label}
              {option.count !== undefined && <small>{option.count}</small>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export default Segmented;
