import React, { useState } from "react";
import Segmented from "../../ui/Segmented";
import Combobox from "../../ui/Combobox";
import TimeWindows from "../TimeWindows";
import {
  LOCATION_COLORS,
  defaultLocationCode,
  TYPE_DEFAULTS,
  VENUE_TYPES,
} from "./venues";
export type LocationDraft = {
  id?: string;
  name: string;
  code: string;
  colorTag: string;
  address: string;
  timezone: string;
  venueType: string;
  capabilities: string[];
  serviceHours: any[];
  cutoff: number;
  version: number;
};
export default function LocationsStep({
  locations,
  onChange,
  multiple,
  sameKind,
}: {
  locations: LocationDraft[];
  onChange: (value: LocationDraft[]) => void;
  multiple: boolean;
  sameKind: boolean;
}) {
  const [changeZone, setChangeZone] = useState<number | null>(null);
  const edit = (index: number, patch: Partial<LocationDraft>) =>
    onChange(locations.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  return (
    <>
      {locations.map((location, index) => (
        <section
          className="mera-setup-location"
          key={index}
          aria-label={`Location ${index + 1}`}
        >
          <h3>{location.name || `Location ${index + 1}`}</h3>
          <label>
            Location name
            <input
              required
              maxLength={100}
              value={location.name}
              readOnly={!!location.id}
              onChange={(e) =>
                edit(index, {
                  name: e.target.value,
                  code: defaultLocationCode(
                    e.target.value,
                    locations.filter((_, i) => i !== index).map((l) => l.code),
                  ),
                })
              }
            />
          </label>
          {!sameKind && (
            <Segmented
              label="Kind of venue"
              value={location.venueType}
              options={VENUE_TYPES.map((value) => ({
                value,
                label: TYPE_DEFAULTS[value].label,
              }))}
              onChange={(venueType) =>
                edit(index, {
                  venueType,
                  capabilities: [...TYPE_DEFAULTS[venueType].capabilities],
                  serviceHours: TYPE_DEFAULTS[venueType].hours,
                  cutoff: TYPE_DEFAULTS[venueType].cutoff,
                })
              }
            />
          )}
          <label>
            Location code
            <input
              required
              pattern="[A-Z0-9]{2,5}"
              maxLength={5}
              value={location.code}
              onChange={(e) =>
                edit(index, { code: e.target.value.toUpperCase() })
              }
            />
          </label>
          <Segmented
            label="Color tag"
            value={location.colorTag}
            options={LOCATION_COLORS.map((value) => ({ value, label: value }))}
            onChange={(colorTag) => edit(index, { colorTag })}
          />
          <label>
            Address
            <input
              maxLength={300}
              value={location.address}
              onChange={(e) => edit(index, { address: e.target.value })}
            />
          </label>
          <p>
            Timezone: {location.timezone}{" "}
            <button
              type="button"
              className="secondary"
              onClick={() => setChangeZone(changeZone === index ? null : index)}
            >
              Change
              <span className="sr-only"> timezone for {location.name}</span>
            </button>
          </p>
          {changeZone === index && (
            <Combobox
              label="Location timezone"
              value={location.timezone}
              onChange={(timezone) => edit(index, { timezone })}
              options={Array.from(
                new Set([
                  location.timezone,
                  ...((Intl as any).supportedValuesOf?.("timeZone") || [
                    "Africa/Lagos",
                    "UTC",
                  ]),
                ]),
              ).map((value) => ({
                value: String(value),
                label: String(value),
              }))}
            />
          )}
          <TimeWindows
            label="Trading hours"
            value={location.serviceHours}
            disabled={false}
            onChange={(serviceHours) => edit(index, { serviceHours })}
          />
        </section>
      ))}
      {multiple && (
        <>
          <button
            className="secondary"
            type="button"
            onClick={() =>
              onChange([
                ...locations,
                {
                  ...locations[0],
                  id: undefined,
                  name: "",
                  code: defaultLocationCode(
                    "Location",
                    locations.map((l) => l.code),
                  ),
                  version: 1,
                },
              ])
            }
          >
            Add another location
          </button>
          <p>You can add more locations later in settings.</p>
        </>
      )}
    </>
  );
}
