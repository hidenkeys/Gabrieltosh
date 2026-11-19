import { useEffect, useState } from "react";
const valid = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
export default function BrandColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="mw-brand-color">
      <label>
        {label}
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <label>
        {label} hex
        <input
          type="text"
          value={text}
          required
          pattern="#[0-9a-fA-F]{6}"
          maxLength={7}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!valid(text)}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (valid(next)) onChange(next);
          }}
        />
      </label>
    </div>
  );
}
