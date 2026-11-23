import { useId } from "react";
export type SwitchProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  description?: string;
};
export function Switch({
  label,
  checked,
  onChange,
  name,
  id,
  disabled,
  required,
  description,
}: SwitchProps) {
  const generated = useId();
  return (
    <div className="mi-control mi-switch">
      <label htmlFor={id || generated}>
        <input
          type="checkbox"
          role="switch"
          id={id || generated}
          name={name}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          required={required}
          aria-describedby={
            description ? `${generated}-description` : undefined
          }
        />
        <span className="mi-switch-track" aria-hidden="true" />
        <span>{label}</span>
      </label>
      {description && (
        <small id={`${generated}-description`}>{description}</small>
      )}
    </div>
  );
}
export default Switch;
