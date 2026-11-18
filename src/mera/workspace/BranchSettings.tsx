import { useState } from "react";
import TimeWindows from "./TimeWindows";
import MediaUpload from "../MediaUpload";
import { brandingTokens } from "../branding";
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
  return (
    <>
      <section className="mw-card">
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
            void save(
              base + "/settings",
              "PATCH",
              settings,
              "Branch settings saved.",
            ).catch(() => {});
          }}
        >
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
      <section className="mw-card">
        <h2>Brand studio</h2>
        <form
          className="mw-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save(
              `/organizations/${organization.id}/branding`,
              "PATCH",
              branding,
              "Brand settings saved.",
            ).catch(() => {});
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
          <label>
            Primary color
            <input
              type="color"
              value={branding.primary}
              onChange={(event) =>
                setBranding({ ...branding, primary: event.target.value })
              }
            />
          </label>
          <label>
            Accent color
            <input
              type="color"
              value={branding.accent}
              onChange={(event) =>
                setBranding({ ...branding, accent: event.target.value })
              }
            />
          </label>
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
    </>
  );
}
