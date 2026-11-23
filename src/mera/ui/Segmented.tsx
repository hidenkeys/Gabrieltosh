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
  const unavailableId = useId();
  const selected = options.find(
    (option) => option.value === value && !option.disabled,
  );
  const firstEnabled = options.find((option) => !option.disabled);
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
      {required && !firstEnabled && (
        <div className="mi-choice-unavailable">
          <label htmlFor={unavailableId}>{label} selection required</label>
          <input
            id={unavailableId}
            required
            disabled={disabled}
            value=""
            onChange={() => {}}
            aria-describedby={`${unavailableId}-help`}
            placeholder="No permitted choices available"
          />
          <small id={`${unavailableId}-help`}>
            No permitted choices are available. Refresh the records or ask an
            administrator before continuing.
          </small>
        </div>
      )}
      <div className="mi-choice-options">
        {options.map((option) => (
          <label className="mi-choice-option" key={option.value}>
            <input
              type="radio"
              aria-label={option.label}
              name={name}
              tabIndex={
                option.disabled
                  ? -1
                  : (
                        selected
                          ? option.value === selected.value
                          : option === firstEnabled
                      )
                    ? 0
                    : -1
              }
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={option.disabled}
              required={
                required && (name ? true : !selected && option === firstEnabled)
              }
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
