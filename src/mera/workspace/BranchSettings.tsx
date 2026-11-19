import { useState } from "react";
import TimeWindows from "./TimeWindows";
import MediaUpload from "../MediaUpload";
import { brandingTokens } from "../branding";
import BrandColorField from "./BrandColorField";
type Props = {
  branch: any;
  organization: any;
  base: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export default function BranchSettings({
  branch,
  organization,
  base,
  disabled,
  save,
}: Props) {
  const [settings, setSettings] = useState({
    orderingPaused: branch.settings?.orderingPaused ?? true,
    payLater: branch.settings?.payLater ?? false,
    reservationsEnabled: branch.settings?.reservationsEnabled ?? false,
    capacity: branch.settings?.capacity || 30,
    holdMinutes: branch.settings?.holdMinutes || 10,
    showSoldOut: branch.settings?.showSoldOut ?? false,
    address: branch.settings?.address || "",
    serviceHours: branch.settings?.serviceHours || [],
    timezone: branch.timezone || "Africa/Lagos",
    cutoff: branch.cutoff ?? 0,
    serviceModes: (branch.settings?.serviceModes || []) as string[],
  });
  const [branding, setBranding] = useState({
    primary: organization.branding?.primary || "#1558c9",
    accent: organization.branding?.accent || "#83ddf7",
    description: organization.branding?.description || "",
    font: organization.branding?.font || "system",
    logo: organization.branding?.logo || "",
    coverImage: organization.branding?.coverImage || "",
  });
  const tokens = brandingTokens(branding);
  const [section, setSection] = useState("operations");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const saveSettings = async (path: string, body: any, message: string) => {
    setError("");
    setSaved("");
    try {
      await save(path, "PATCH", body, message);
      setSaved(message);
    } catch (failure) {
      setError((failure as Error).message);
    }
  };
  return (
    <div className="mw-management">
      <header className="mw-management-heading">
        <div>
          <span className="mw-management-eyebrow">Branch setup</span>
          <h2>Settings & appearance</h2>
          <p>
            Set service preferences and keep your customer-facing brand
            consistent.
          </p>
        </div>
      </header>
      <div className="mw-management-switch" aria-label="Settings section">
        <button
          type="button"
          aria-pressed={section === "operations"}
          onClick={() => {
            setSection("operations");
            setError("");
            setSaved("");
          }}
        >
          Operating settings
        </button>
        <button
          type="button"
          aria-pressed={section === "branding"}
          onClick={() => {
            setSection("branding");
            setError("");
            setSaved("");
          }}
        >
          Brand appearance
        </button>
      </div>
      {error && (
        <p className="mw-management-feedback mw-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="mw-management-feedback" role="status">
          {saved}
        </p>
      )}
      <section
        className="mw-card mw-management-panel"
        hidden={section !== "operations"}
        aria-label="Operating settings"
      >
        <h2>Branch operating policies</h2>
        <p>
          Ordering pauses, pay-later permission and reservation capacity are
          separate settings. Save deliberately before enabling customer
          ordering.
        </p>
        <form
          className="mw-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveSettings(
              base + "/settings",
              settings,
              "Branch settings saved.",
            );
          }}
        >
          <fieldset className="mw-wide" disabled={disabled}>
            <legend>Available service modes</legend>
            <p>
              These are the branch’s published service choices. Reservation and
              pay-later policies remain separate.
            </p>
            {Object.entries({
              counter_takeaway: "Counter & takeaway",
              table_service: "Table service",
              reservations: "Reservations",
              lounge_club: "Lounge & club",
            }).map(([mode, label]) => (
              <label key={mode}>
                <input
                  type="checkbox"
                  checked={settings.serviceModes.includes(mode)}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      serviceModes: event.target.checked
                        ? [...current.serviceModes, mode]
                        : current.serviceModes.filter(
                            (value) => value !== mode,
                          ),
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          {(
            [
              "orderingPaused",
              "payLater",
              "reservationsEnabled",
              "showSoldOut",
            ] as const
          ).map((key) => (
            <label key={key}>
              {
                {
                  orderingPaused: "Pause new orders",
                  payLater: "Allow preparation before full payment",
                  reservationsEnabled: "Accept reservations",
                  showSoldOut: "Show sold-out items",
                }[key]
              }
              <select
                value={String(settings[key])}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    [key]: event.target.value === "true",
                  })
                }
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          ))}
          <label>
            Reservation capacity
            <input
              type="number"
              min="1"
              max="1000"
              required
              value={settings.capacity}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  capacity: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Stock hold (minutes)
            <input
              type="number"
              min="1"
              max="60"
              required
              value={settings.holdMinutes}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  holdMinutes: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="mw-wide">
            Branch address
            <input
              maxLength={300}
              value={settings.address}
              onChange={(event) =>
                setSettings({ ...settings, address: event.target.value })
              }
            />
          </label>
          <label>
            Branch timezone
            <input
              required
              value={settings.timezone}
              placeholder="Africa/Lagos"
              onChange={(event) =>
                setSettings({ ...settings, timezone: event.target.value })
              }
            />
          </label>
          <label>
            Trading day starts
            <input
              required
              type="time"
              value={
                String(Math.floor(settings.cutoff / 60)).padStart(2, "0") +
                ":" +
                String(settings.cutoff % 60).padStart(2, "0")
              }
              onChange={(event) => {
                const [hours, minutes] = event.target.value
                  .split(":")
                  .map(Number);
                setSettings({ ...settings, cutoff: hours * 60 + minutes });
              }}
            />
          </label>
          <TimeWindows
            label="Branch service hours"
            value={settings.serviceHours}
            disabled={disabled}
            onChange={(serviceHours) =>
              setSettings({ ...settings, serviceHours })
            }
          />
          <div className="mw-wide">
            <button className="primary" disabled={disabled}>
              Save branch policies
            </button>
          </div>
        </form>
      </section>
      <section
        className="mw-card mw-management-panel"
        hidden={section !== "branding"}
        aria-label="Brand appearance"
      >
        <h2>Brand studio</h2>
        <form
          className="mw-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveSettings(
              `/organizations/${organization.id}/branding`,
              branding,
              "Brand settings saved.",
            );
          }}
        >
          <div className="mw-wide">
            <h3>Organization logo</h3>
            {branding.logo && (
              <img
                alt="Current organization logo"
                style={{ maxWidth: 180, maxHeight: 120, objectFit: "contain" }}
                src={branding.logo.replace(
                  "/api/mera/v1/public/assets/",
                  `/api/mera/v1/organizations/${organization.id}/assets/`,
                )}
              />
            )}
            <MediaUpload
              endpoint={`/api/mera/v1/organizations/${organization.id}/assets`}
              disabled={disabled}
              onUploaded={(asset) =>
                setBranding((current) => ({ ...current, logo: asset.url }))
              }
            />
          </div>
          <div className="mw-wide">
            <h3>Storefront cover photo</h3>
            {branding.coverImage && (
              <img
                alt="Current storefront cover"
                style={{ maxWidth: "100%", maxHeight: 200, objectFit: "cover" }}
                src={branding.coverImage.replace(
                  "/api/mera/v1/public/assets/",
                  `/api/mera/v1/organizations/${organization.id}/assets/`,
                )}
              />
            )}
            <MediaUpload
              endpoint={`/api/mera/v1/organizations/${organization.id}/assets`}
              disabled={disabled}
              onUploaded={(asset) =>
                setBranding((current) => ({
                  ...current,
                  coverImage: asset.url,
                }))
              }
            />
          </div>
          <BrandColorField
            label="Primary color"
            value={branding.primary}
            onChange={(primary) => setBranding({ ...branding, primary })}
          />
          <BrandColorField
            label="Accent color"
            value={branding.accent}
            onChange={(accent) => setBranding({ ...branding, accent })}
          />
          <label>
            Approved font
            <select
              value={branding.font}
              onChange={(event) =>
                setBranding({ ...branding, font: event.target.value })
              }
            >
              <option value="system">System</option>
              <option value="sans">Sans serif</option>
              <option value="serif">Serif</option>
            </select>
          </label>
          <label className="mw-wide">
            Brand description
            <textarea
              maxLength={500}
              value={branding.description}
              onChange={(event) =>
                setBranding({ ...branding, description: event.target.value })
              }
            />
          </label>
          <div
            className="mw-wide mw-preview"
            style={{
              background: tokens.accent,
              color: tokens.accentForeground,
              fontFamily: tokens.font,
            }}
          >
            <span
              className="mw-eyebrow"
              style={{ color: tokens.accentForeground }}
            >
              LIVE STYLE PREVIEW
            </span>
            <h2 style={{ color: tokens.accentForeground }}>
              {organization.name}
            </h2>
            <p style={{ color: tokens.accentForeground }}>
              {branding.description}
            </p>
            <span
              style={{
                display: "inline-block",
                borderBottom: `3px solid ${branding.primary}`,
                paddingTop: 8,
              }}
            >
              Menu & service
            </span>
          </div>
          <div className="mw-wide">
            <button className="primary" disabled={disabled}>
              Save branding
            </button>
          </div>
        </form>
        <p>
          Preview text uses an accessible contrasting foreground. Branding does
          not permit custom scripts or unrestricted HTML.
        </p>
      </section>
    </div>
  );
}
