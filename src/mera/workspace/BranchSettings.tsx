import { allowedCurrencies } from "../../../shared/mera-money.js";
import { type ReactNode, useRef, useState } from "react";
import { TYPE_DEFAULTS, deriveVenueType } from "./setup/venues";
import Switch from "../ui/Switch";
import Stepper from "../ui/Stepper";
import Combobox from "../ui/Combobox";
import Segmented from "../ui/Segmented";
import TimeWindows from "./TimeWindows";
import MediaUpload from "../MediaUpload";
import { brandingTokens } from "../branding";
import BrandColorField from "./BrandColorField";
function OptionalSettings({
  guided,
  title,
  children,
}: {
  guided: boolean;
  title: string;
  children: ReactNode;
}) {
  return guided ? (
    <details className="mw-wide mera-owner-optional">
      <summary>{title}</summary>
      {children}
    </details>
  ) : (
    <>{children}</>
  );
}
type Props = {
  guided?: boolean;
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
  guided = false,
}: Props) {
  const [settings, setSettings] = useState({
    currency: branch.currency || "NGN",
    orderingPaused: branch.settings?.orderingPaused ?? true,
    payLater: branch.settings?.payLater ?? false,
    reservationsEnabled: branch.settings?.reservationsEnabled ?? false,
    capacity: branch.settings?.capacity || 30,
    holdMinutes: branch.settings?.holdMinutes || 10,
    showSoldOut: branch.settings?.showSoldOut ?? false,
    address: branch.settings?.address || "",
    serviceHours:
      branch.settings?.serviceHours ||
      TYPE_DEFAULTS[deriveVenueType(branch.settings)].hours,
    timezone: branch.timezone || "Africa/Lagos",
    cutoff:
      branch.cutoff ?? TYPE_DEFAULTS[deriveVenueType(branch.settings)].cutoff,
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
  const [setupStep, setSetupStep] = useState(0);
  const operationsForm = useRef<HTMLFormElement>(null);
  const setupSteps = [
    "Business",
    "Service modes",
    "Hours",
    "Payments",
    "Reservations",
    "Review",
  ];
  const goToStep = (next: number) => {
    if (next > setupStep) {
      const invalid = operationsForm.current?.querySelector<HTMLElement>(
        `[data-setup-step="${setupStep}"] :invalid`,
      );
      if (invalid) {
        (invalid as HTMLInputElement).reportValidity();
        return;
      }
    }
    setSetupStep(next);
  };
  const [section, setSection] = useState("operations");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const inFlight = useRef(false);
  const saveSettings = async (path: string, body: any, message: string) => {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setError("");
    setSaved("");
    try {
      await save(path, "PATCH", body, message);
      setSaved(message);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      inFlight.current = false;
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
          ref={operationsForm}
          onInvalidCapture={(event) => {
            const panel = (event.target as HTMLElement).closest<HTMLElement>(
              "[data-setup-step]",
            );
            if (panel) {
              const disclosure = panel.closest("details");
              if (disclosure) disclosure.open = true;
              setSetupStep(Number(panel.dataset.setupStep));
              setTimeout(() => (event.target as HTMLElement).focus(), 0);
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!guided && setupStep !== 5) {
              goToStep(5);
              return;
            }
            if (
              settings.serviceHours.some(
                (window: any) =>
                  !window.days.length || window.end <= window.start,
              )
            ) {
              setSetupStep(2);
              const disclosure = operationsForm.current
                ?.querySelector('[data-setup-step="2"]')
                ?.closest("details");
              if (disclosure) disclosure.open = true;
              setError("Choose service days and an end time after the start.");
              return;
            }
            void saveSettings(
              base + "/settings",
              settings,
              "Branch settings saved.",
            );
          }}
        >
          <div className="mw-wide mi-setup-progress" hidden={guided}>
            <p>
              Step {setupStep + 1} of {setupSteps.length}:{" "}
              {setupSteps[setupStep]}
            </p>
            <progress
              aria-label="Branch settings progress"
              value={setupStep + 1}
              max={setupSteps.length}
            />
            <nav aria-label="Branch settings steps">
              {setupSteps.map((label, index) => (
                <button
                  type="button"
                  key={label}
                  aria-current={setupStep === index ? "step" : undefined}
                  onClick={() => goToStep(index)}
                >
                  {index + 1}. {label}
                </button>
              ))}
            </nav>
          </div>
          <fieldset
            className="mw-wide mi-setup-panel"
            data-setup-step="0"
            hidden={!guided && setupStep !== 0}
            disabled={disabled}
          >
            <legend>Business</legend>
            <label>
              Branch address
              <input
                maxLength={300}
                value={settings.address}
                onChange={(event) =>
                  setSettings({ ...settings, address: event.target.value })
                }
              />
            </label>
            <label>Currency
              <select value={settings.currency} onChange={e => setSettings({ ...settings, currency: e.target.value })}>
                {allowedCurrencies.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
            <Combobox
              label="Branch timezone"
              required
              value={settings.timezone}
              onChange={(timezone) => setSettings({ ...settings, timezone })}
              options={Array.from(
                new Set([
                  settings.timezone,
                  ...((Intl as any).supportedValuesOf?.("timeZone") || [
                    "Africa/Lagos",
                    "Africa/Accra",
                    "Europe/London",
                    "UTC",
                  ]),
                ]),
              ).map((zone) => ({ value: String(zone), label: String(zone) }))}
            />
          </fieldset>
          <fieldset
            className="mw-wide mi-setup-panel"
            data-setup-step="1"
            hidden={!guided && setupStep !== 1}
            disabled={disabled}
          >
            <legend>Service modes</legend>
            <p>
              Choose how this branch serves its guests. Booking and payment
              policies stay separate.
            </p>
            {Object.entries({
              counter_takeaway: "Counter & takeaway",
              table_service: "Table service",
              reservations: "Reservations",
              lounge_club: "Lounge & club",
            }).map(([mode, label]) => (
              <Switch
                key={mode}
                label={label}
                checked={settings.serviceModes.includes(mode)}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    serviceModes: checked
                      ? [...current.serviceModes, mode]
                      : current.serviceModes.filter((value) => value !== mode),
                  }))
                }
              />
            ))}
            <Switch
              label="Pause new orders"
              checked={settings.orderingPaused}
              onChange={(orderingPaused) =>
                setSettings({ ...settings, orderingPaused })
              }
            />
            <Switch
              label="Show sold-out items"
              checked={settings.showSoldOut}
              onChange={(showSoldOut) =>
                setSettings({ ...settings, showSoldOut })
              }
            />
            <Stepper
              label="Stock hold (minutes)"
              min={1}
              max={60}
              required
              value={settings.holdMinutes}
              onChange={(holdMinutes) =>
                setSettings({ ...settings, holdMinutes })
              }
            />
          </fieldset>
          <OptionalSettings guided={guided} title="Trading hours">
            <fieldset
              className="mw-wide mi-setup-panel"
              data-setup-step="2"
              hidden={!guided && setupStep !== 2}
              disabled={disabled}
            >
              <legend>Hours</legend>
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
            </fieldset>
          </OptionalSettings>
          <fieldset
            className="mw-wide mi-setup-panel"
            data-setup-step="3"
            hidden={!guided && setupStep !== 3}
            disabled={disabled}
          >
            <legend>Payments</legend>
            <Switch
              label="Allow preparation before full payment"
              checked={settings.payLater}
              onChange={(payLater) => setSettings({ ...settings, payLater })}
            />
            <p>
              Turning this on permits preparation before full payment. It does
              not confirm payment or enable a payment provider.
            </p>
          </fieldset>
          <OptionalSettings guided={guided} title="Reservations and capacity">
            <fieldset
              className="mw-wide mi-setup-panel"
              data-setup-step="4"
              hidden={!guided && setupStep !== 4}
              disabled={disabled}
            >
              <legend>Reservations</legend>
              <Switch
                label="Accept reservations"
                checked={settings.reservationsEnabled}
                onChange={(reservationsEnabled) =>
                  setSettings({ ...settings, reservationsEnabled })
                }
              />
              <Stepper
                label="Reservation capacity"
                value={settings.capacity}
                min={1}
                max={1000}
                required
                onChange={(capacity) => setSettings({ ...settings, capacity })}
              />
              <p>
                Timing, deposits and minimum-spend rules have their own reviewed
                settings.
              </p>
            </fieldset>
          </OptionalSettings>
          <OptionalSettings guided={guided} title="Review branch settings">
            <section
              className="mw-wide mi-setup-review"
              data-setup-step="5"
              hidden={!guided && setupStep !== 5}
              aria-label="Review branch settings"
            >
              <h3>Review before saving</h3>
              <dl>
                <div>
                  <dt>Branch</dt>
                  <dd>
                    {settings.address || "Address not set"} ·{" "}
                    {settings.timezone}
                  </dd>
                </div>
                <div>
                  <dt>Service modes</dt>
                  <dd>
                    {settings.serviceModes.length
                      ? settings.serviceModes
                          .map(
                            (mode) =>
                              ({
                                counter_takeaway: "Counter & takeaway",
                                table_service: "Table service",
                                reservations: "Reservations",
                                lounge_club: "Lounge & club",
                              })[mode] || mode,
                          )
                          .join(", ")
                      : "No service modes selected"}
                  </dd>
                </div>
                <div>
                  <dt>Ordering</dt>
                  <dd>
                    {settings.orderingPaused
                      ? "New orders paused"
                      : "New orders accepted"}
                  </dd>
                </div>
                <div>
                  <dt>Payments</dt>
                  <dd>
                    {settings.payLater
                      ? "Preparation before full payment allowed"
                      : "Full payment required before preparation"}
                  </dd>
                </div>
                <div>
                  <dt>Reservations</dt>
                  <dd>
                    {settings.reservationsEnabled
                      ? `Accepted · capacity ${settings.capacity}`
                      : "Not accepted"}
                  </dd>
                </div>
                <div>
                  <dt>Hours</dt>
                  <dd>
                    {settings.serviceHours.length
                      ? `${settings.serviceHours.length} service windows`
                      : "Always available"}
                  </dd>
                </div>
              </dl>
              <p>
                Saving applies these branch preferences. Other launch checks and
                payment approvals remain separate.
              </p>
            </section>
          </OptionalSettings>
          <div className="mw-wide mi-setup-actions">
            {!guided && setupStep > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={() => goToStep(setupStep - 1)}
              >
                Back
              </button>
            )}
            {!guided && setupStep < 5 ? (
              <button
                type="button"
                className="primary"
                onClick={() => goToStep(setupStep + 1)}
              >
                Continue to {setupSteps[setupStep + 1].toLowerCase()}
              </button>
            ) : (
              <button className="primary" disabled={disabled}>
                Save branch policies
              </button>
            )}
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
          <Segmented
            label="Approved font"
            value={branding.font}
            onChange={(font) => setBranding({ ...branding, font })}
            options={[
              { value: "system", label: "System" },
              { value: "sans", label: "Sans serif" },
              { value: "serif", label: "Serif" },
            ]}
          />
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
