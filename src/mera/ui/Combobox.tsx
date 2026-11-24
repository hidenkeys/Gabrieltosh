import { useEffect, useId, useRef, useState } from "react";
export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
  disabled?: boolean;
};
export type ComboboxProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
};
export function Combobox({
  label,
  value,
  onChange,
  options,
  name,
  id,
  required,
  disabled,
  placeholder = "Search and choose",
}: ComboboxProps) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.setCustomValidity(
      required &&
        (!value ||
          !options.some((option) => option.value === value && !option.disabled))
        ? "Choose a permitted option from the list."
        : "",
    );
  }, [required, value, options]);
  const generated = useId(),
    [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const selected = options.find((option) => option.value === value),
    filtered = options.filter((option) =>
      `${option.label} ${option.description || ""} ${option.searchText || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    enabled = filtered.filter((option) => !option.disabled);
  const choose = (option: ComboboxOption) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };
  return (
    <div className="mi-control mi-combobox">
      <label htmlFor={id || generated}>{label}</label>
      <input
        ref={input}
        id={id || generated}
        role="combobox"
        aria-label={label}
        autoComplete="off"
        aria-expanded={open}
        aria-controls={`${generated}-options`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && enabled[active]
            ? `${generated}-option-${options.indexOf(enabled[active])}`
            : undefined
        }
        value={open ? query : selected?.label || ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onFocus={() => {
          setQuery("");
          setActive(
            options
              .filter((option) => !option.disabled)
              .findIndex((option) => option.value === value),
          );
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setQuery("");
              const available = options.filter((option) => !option.disabled);
              const index = available.findIndex(
                (option) => option.value === value,
              );
              setActive(
                index >= 0
                  ? index
                  : event.key === "ArrowDown"
                    ? 0
                    : available.length - 1,
              );
              setOpen(true);
            } else {
              setActive((index) =>
                enabled.length
                  ? (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      enabled.length) %
                    enabled.length
                  : -1,
              );
            }
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            if (enabled[active]) choose(enabled[active]);
          }
        }}
      />
      {open && (
        <ul
          id={`${generated}-options`}
          role="listbox"
          aria-label={`${label} options`}
        >
          {filtered.map((option) => (
            <li
              key={option.value}
              id={`${generated}-option-${options.indexOf(option)}`}
              role="option"
              data-value={option.value}
              aria-label={`${option.label}${option.description ? ` ${option.description}` : ""}`}
              aria-selected={value === option.value}
              data-active={enabled[active]?.value === option.value}
              aria-disabled={option.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (!option.disabled) choose(option);
              }}
            >
              <strong>{option.label}</strong>
              {option.description && <small>{option.description}</small>}
            </li>
          ))}
          {!filtered.length && (
            <li role="presentation">No matches. Try another search.</li>
          )}
        </ul>
      )}
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
    </div>
  );
}
export default Combobox;
