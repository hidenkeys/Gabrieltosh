import { useId, useState } from "react";
// @ts-expect-error Shared venue contract is plain JavaScript.
import * as venues from "../../../shared/mera-venues.js";
const { deriveVenueType, TYPE_DEFAULTS, LOCATION_COLORS } = venues;
export function LocationTag({ location }: { location: any }) {
  const settings = location.settings || location;
  const color = LOCATION_COLORS.includes(settings.colorTag)
    ? settings.colorTag
    : "forest";
  return (
    <span className="mw-location-tag">
      <span
        aria-hidden="true"
        className={`mw-location-dot mw-location-${color}`}
      />
      {settings.code || location.name?.slice(0, 3).toUpperCase()}
    </span>
  );
}
export default function LocationSwitcher({
  branches,
  value,
  allLocations,
  disabled,
  onChange,
  onAllLocations,
}: {
  branches: any[];
  value: string;
  allLocations: boolean;
  disabled?: boolean;
  onChange: (id: string) => void;
  onAllLocations: () => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const id = useId(),
    current = branches.find((b) => b.id === value);
  const options = [
    ...(allLocations && branches.filter((b) => b.settings?.role !== "stock_room").length >= 2 ? [{ id: "all-locations", name: "All locations" }] : []),
    ...branches,
  ].filter((b) =>
    `${b.name} ${b.settings?.code || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  function choose(b: any) {
    if (b.id === "all-locations") onAllLocations();
    else onChange(b.id);
    setOpen(false);
    setQuery("");
  }
  return (
    <div className="mw-location-switcher mi-control">
      <label htmlFor={id}>Location</label>
      <div className="mw-location-current">
        {current && <LocationTag location={current} />}
        <input
          id={id}
          role="combobox"
          aria-label="Location"
          aria-expanded={open}
          aria-controls={id + "-options"}
          aria-autocomplete="list"
          aria-activedescendant={
            open && options[active] ? id + "-" + options[active].id : undefined
          }
          value={open ? query : current?.name || ""}
          disabled={disabled}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              setOpen(true);
              setActive(
                (active + (e.key === "ArrowDown" ? 1 : -1) + options.length) %
                  Math.max(1, options.length),
              );
            }
            if (e.key === "Enter" && open && options[active]) {
              e.preventDefault();
              choose(options[active]);
            }
          }}
        />
      </div>
      {open && (
        <div
          className="mw-location-options"
          role="listbox"
          aria-label="Location options"
          id={id + "-options"}
        >
          {options.map((b, index) => (
            <div
              role="option"
              tabIndex={-1}
              id={id + "-" + b.id}
              data-value={b.id}
              key={b.id}
              aria-selected={b.id === value}
              data-active={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(b)}
            >
              {b.id !== "all-locations" && <LocationTag location={b} />}{" "}
              {b.name}
              <small>
                {b.id === "all-locations"
                  ? "Organization overview"
                  : b.settings?.role === "stock_room"
                    ? "Central store"
                    : TYPE_DEFAULTS[deriveVenueType(b.settings)]?.label}
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
