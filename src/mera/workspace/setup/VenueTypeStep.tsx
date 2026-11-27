import React from "react";
import {
  TYPE_DEFAULTS,
  VENUE_TYPES,
  CAPABILITY_LABELS,
  CAPABILITIES,
} from "./venues";
import Switch from "../../ui/Switch";
export default function VenueTypeStep({
  value,
  capabilities,
  onChange,
  multiple,
  sameKind,
  onSameKind,
}: {
  value: string;
  capabilities: string[];
  onChange: (type: string, caps: string[]) => void;
  multiple: boolean;
  sameKind: boolean;
  onSameKind: (value: boolean) => void;
}) {
  return (
    <>
      <fieldset
        className="mera-venue-types"
        role="radiogroup"
        aria-label="Kind of venue"
        onKeyDown={(event) => {
          if (
            ![
              "ArrowRight",
              "ArrowDown",
              "ArrowLeft",
              "ArrowUp",
              "Home",
              "End",
            ].includes(event.key)
          )
            return;
          event.preventDefault();
          const i = VENUE_TYPES.indexOf(value),
            next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? VENUE_TYPES.length - 1
                  : (i +
                      (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) +
                      VENUE_TYPES.length) %
                    VENUE_TYPES.length;
          const type = VENUE_TYPES[next];
          onChange(type, [...TYPE_DEFAULTS[type].capabilities]);
          event.currentTarget
            .querySelectorAll<HTMLInputElement>("input")
            [next]?.focus();
        }}
      >
        <legend>What best describes this location?</legend>
        {VENUE_TYPES.map((type) => {
          const preset = TYPE_DEFAULTS[type];
          return (
            <label key={type} className="mera-venue-card">
              <input
                type="radio"
                name="venue-type"
                aria-label={preset.label}
                checked={value === type}
                tabIndex={value === type ? 0 : -1}
                onChange={() => onChange(type, [...preset.capabilities])}
              />
              <span>
                <strong>{preset.label}</strong>
              </span>
            </label>
          );
        })}
      </fieldset>
      <details>
        <summary>Customise</summary>
        <fieldset className="mera-setup-chips">
          <legend>Anything else you do here?</legend>
          {CAPABILITIES.map((cap) => (
            <button
              type="button"
              key={cap}
              aria-pressed={capabilities.includes(cap)}
              onClick={() =>
                onChange(
                  value,
                  capabilities.includes(cap)
                    ? capabilities.filter((c) => c !== cap)
                    : [...capabilities, cap],
                )
              }
            >
              {CAPABILITY_LABELS[cap]}
            </button>
          ))}
        </fieldset>
      </details>
      {multiple && (
        <Switch
          label="Are all your locations the same kind?"
          checked={sameKind}
          onChange={onSameKind}
        />
      )}
    </>
  );
}
