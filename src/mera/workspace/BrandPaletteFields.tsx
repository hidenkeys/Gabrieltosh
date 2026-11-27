import { brandPresets } from "../brandPresets";
import { paletteWarnings } from "../branding";
import BrandColorField from "./BrandColorField";
export default function BrandPaletteFields({
  branding,
  onChange,
}: {
  branding: any;
  onChange: (value: any) => void;
}) {
  return (
    <div className="mw-wide">
      <div
        className="mera-palette-presets"
        role="group"
        aria-label="Colour presets"
      >
        {brandPresets.map(({ id, name, ...colors }) => (
          <button
            type="button"
            key={id}
            aria-pressed={branding.palettePreset === id}
            onClick={() =>
              onChange({ ...branding, ...colors, palettePreset: id })
            }
          >
            <span aria-hidden="true">
              {[
                colors.primary,
                colors.accent,
                colors.background,
                colors.surface,
                colors.text,
              ].map((color, i) => (
                <i key={i} style={{ background: color }} />
              ))}
            </span>
            {name}
          </button>
        ))}
      </div>
      <div className="mera-palette-fields">
        {(["primary", "accent", "background", "surface", "text"] as const).map(
          (field) => (
            <BrandColorField
              key={field}
              label={`${field[0].toUpperCase()}${field.slice(1)} color`}
              value={
                branding[field] ||
                {
                  primary: "#1558c9",
                  accent: "#83ddf7",
                  background: "#f7f6f0",
                  surface: "#fcfbf6",
                  text: "#16211c",
                }[field]
              }
              onChange={(value) =>
                onChange({
                  ...branding,
                  [field]: value,
                  palettePreset: "custom",
                })
              }
            />
          ),
        )}
      </div>
      {paletteWarnings(branding).map((message) => (
        <p role="status" key={message}>
          {message}
        </p>
      ))}
    </div>
  );
}
