import PostLaunchSettings from "./PostLaunchSettings";
import OnboardingMenu from "./OnboardingMenu";
import OnboardingLaunch from "./OnboardingLaunch";
import { inferTimezone } from "./setup/onboardingDefaults";
import { workspaceApi } from "./api";
import TimeWindows from "./TimeWindows";
import BrandPaletteFields from "./BrandPaletteFields";
import GuestMenuPreview from "./GuestMenuPreview";
import { allowedCurrencies } from "../../../shared/mera-money.js";
import { validPublicContact } from "./publicContact";
import React, { useEffect, useRef, useState } from "react";
import { MeraBrand } from "../ui/MeraBrand";
import Segmented from "../ui/Segmented";
import MediaUpload from "../MediaUpload";
import SetupChecklist from "./SetupChecklist";
import LaunchReadiness from "./LaunchReadiness";
import VenueTypeStep from "./setup/VenueTypeStep";
import { type LocationDraft } from "./setup/LocationsStep";
import {
  TYPE_DEFAULTS,
  deriveVenueType,
  defaultLocationCode,
  effectiveCapabilities,
} from "./setup/venues";
type Props = React.ComponentProps<typeof SetupChecklist> & {
  onFinished?: () => void;
  products?: any[];
  organization: any;
  branches?: any[];
  branch: any;
  onboarding: any;
  actorName: string;
  canGuide: boolean;
  disabled: boolean;
  demo: boolean;
  permissions: string[];
  onOpen: (section: string) => void;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export const OWNER_SETUP_FULLSCREEN = true;
export default function OwnerSetup(props: Props) {
  const [guided, setGuided] = useState(
    () =>
      new URLSearchParams(window.location.search).get("setup") === "1" ||
      props.branch.settings?.launchState !== "published",
  );
  if (!props.canGuide) return <SetupChecklist {...props} />;
  if (!guided)
    return (
      <>
        <button className="secondary" onClick={() => setGuided(true)}>
          Resume guided setup
        </button>
        <PostLaunchSettings
          organization={props.organization}
          branches={props.branches || [props.branch]}
          save={props.save}
          disabled={props.disabled}
        />
        <SetupChecklist {...props} />
      </>
    );
  return (
    <GuidedSetup
      key={`${props.organization.id}:${props.branch.id}`}
      {...props}
      onClose={() => setGuided(false)}
    />
  );
}
type Snapshot = {
  locations: LocationDraft[];
  contact: string;
  currency?: string;
  operating: any;
  venueType: string;
  capabilities: string[];
  sameKind: boolean;
  payments?: Record<string, string[]>;
  branding?: any;
};
type Attempt = { writes: Write[]; target: number; snapshot?: Snapshot };
type Write = {
  path: string;
  method: string;
  body: any;
  kind?: string;
  index?: number;
};
function GuidedSetup({
  organization,
  branches = [],
  branch,
  onboarding,
  disabled,
  save,
  onClose,
  onFinished,
  products,
}: Props & { onClose: () => void }) {
  const [logo, setLogo] = useState<string>(organization.branding?.logo || "");
  const [logoBusy, setLogoBusy] = useState(false);
  const orgBase = `/organizations/${organization.id}`,
    base = `${orgBase}/branches/${branch.id}`;
  const progressKey = `ownerGuideV3Step_${branch.id}`,
    recoveryKey = `mera:owner-setup:v3:${organization.id}:${branch.id}`;
  const data = onboarding?.data || {};
  let recovery: Attempt | null = null;
  try {
    recovery = JSON.parse(window.sessionStorage.getItem(recoveryKey) || "null");
  } catch {
    recovery = { writes: [], target: -1 };
  }
  const snapshot = recovery?.snapshot;
  const [branding, setBranding] = useState<any>(() => {
    const b = organization.branding || {};
    return (
      snapshot?.branding || {
        primary: b.primary || "#1558c9",
        accent: b.accent || "#83ddf7",
        description: b.description || "",
        font: b.font || "system",
        logo: b.logo,
        coverImage: b.coverImage,
        background: b.background,
        surface: b.surface,
        text: b.text,
        palettePreset: b.palettePreset,
      }
    );
  });
  const [currency, setCurrency] = useState(
    snapshot?.currency || branch.currency || "NGN",
  );
  const initialType = snapshot?.venueType || deriveVenueType(branch.settings);
  const [venueType, setVenueType] = useState(initialType);
  const [capabilities, setCapabilities] = useState<string[]>(
    snapshot?.capabilities ||
      (branch.settings?.capabilities
        ? effectiveCapabilities(branch.settings)
        : [...TYPE_DEFAULTS[initialType].capabilities]),
  );
  const [operating, setOperating] = useState({
    locationCount:
      branches.filter((b) => b.settings?.role !== "stock_room").length > 1
        ? "few"
        : "one",
    menuMode: "per_location",
    inventoryMode: "per_location",
    version: 1,
    ...organization.operating,
    ...snapshot?.operating,
  });
  const [sameKind, setSameKind] = useState(
    snapshot?.sameKind ?? data.sameKind !== false,
  );
  const [contact, setContact] = useState(
    snapshot?.contact ||
      data.contact ||
      branch.settings?.publicContact ||
      data.phone ||
      "",
  );
  const [locations, setLocations] = useState<LocationDraft[]>(
    snapshot?.locations ||
      data[`ownerSetupLocations_${branch.id}`] ||
      [
        branch,
        ...branches.filter(
          (b) => b.id !== branch.id && b.settings?.role !== "stock_room",
        ),
      ].map((b) => {
        const type = deriveVenueType(b.settings);
        return {
          id: b.id,
          name: b.name,
          code:
            b.settings?.code ||
            defaultLocationCode(
              b.name,
              branches
                .filter((other) => other.id !== b.id)
                .map((other) => other.settings?.code)
                .filter(Boolean),
            ),
          colorTag: b.settings?.colorTag || "forest",
          address: b.settings?.address || "",
          timezone:
            b.timezone ||
            inferTimezone(b.settings?.address || "", b.currency || "NGN"),
          venueType: type,
          capabilities: b.settings?.capabilities || [
            ...TYPE_DEFAULTS[type].capabilities,
          ],
          serviceHours: b.settings?.serviceHours || TYPE_DEFAULTS[type].hours,
          cutoff: b.cutoff ?? TYPE_DEFAULTS[type].cutoff,
          payLater: b.settings?.payLater ?? TYPE_DEFAULTS[type].payLater,
          version: b.settings?.version || 1,
        };
      }),
  );
  const multiple = operating.locationCount !== "one";
  const steps = ["Business", "Menu", "Payments", "Look & feel", "Go live"];
  const legacyV2 = [0, 1, 2, 5, 6],
    legacyV1 = [0, 1, 2, 2, 2, 2, 2, 5, 6];
  const old =
    data[`ownerGuideV4Step_${branch.id}`] ??
    data[progressKey] ??
    legacyV2[data[`ownerGuideV2Step_${branch.id}`]] ??
    legacyV1[data[`ownerGuideStep_${branch.id}`]] ??
    1;
  const [canonical, setCanonical] = useState(
    old === 0 || old === 2 || old === 3 || old === 4 ? 1 : old,
  );
  const canonicalSteps = [1, 8, 5, 7, 6];
  const step = Math.max(0, canonicalSteps.indexOf(canonical));
  const [items, setItems] = useState<any[]>(products || []);
  useEffect(() => {
    if (products) return;
    const controller = new AbortController();
    workspaceApi(base + "/workspace", "GET", undefined, controller.signal)
      .then((result) => {
        if (Array.isArray(result.products)) setItems(result.products);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [base]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(
      recovery
        ? "A previous save needs confirmation. Retry saving this step before moving elsewhere."
        : "",
    ),
    [status, setStatus] = useState("");
  const [pending, setPending] = useState<Attempt | null>(() => {
    try {
      return JSON.parse(window.sessionStorage.getItem(recoveryKey) || "null");
    } catch {
      return { writes: [], target: -1 };
    }
  });
  // An unconfirmed save (snapshot) wins; otherwise what the server saved beats an older setup draft.
  const savedPayments = Object.fromEntries(
    [branch, ...branches]
      .filter((b) => (b.settings?.manualPaymentMethods || []).length)
      .map((b) => [b.id, b.settings.manualPaymentMethods]),
  );
  const paymentDrafts = useRef<Record<string, string[]>>(
    snapshot?.payments || {
      ...Object.fromEntries(
        [branch, ...branches].map((b) => [b.id, ["cash"] as string[]]),
      ),
      ...(data[`ownerSetupPayments_${branch.id}`] || {}),
      ...savedPayments,
    },
  );
  const shell = useRef<HTMLElement>(null);
  const flight = useRef(false),
    alive = useRef(true),
    heading = useRef<HTMLHeadingElement>(null),
    form = useRef<HTMLFormElement>(null);
  const operatingVersion = useRef(operating.version),
    locationVersions = useRef<Record<string, number>>(
      Object.fromEntries(
        locations.filter((l) => l.id).map((l) => [l.id!, l.version]),
      ),
    );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const changed: { element: HTMLElement; inert: boolean }[] = [];
    let current: HTMLElement | null = shell.current;
    while (current?.parentElement) {
      for (const sibling of Array.from(current.parentElement.children)) {
        if (sibling !== current && sibling instanceof HTMLElement) {
          changed.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      current = current.parentElement;
      if (current === document.body) break;
    }
    return () =>
      changed.forEach(({ element, inert }) => {
        element.inert = inert;
      });
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  function selectType(type: string, caps: string[]) {
    setVenueType(type);
    setCapabilities(caps);
    setLocations((current) =>
      current.map((l, i) =>
        sameKind || i === 0
          ? {
              ...l,
              venueType: type,
              capabilities: caps,
              ...(type !== venueType
                ? {
                    serviceHours: TYPE_DEFAULTS[type].hours,
                    cutoff: TYPE_DEFAULTS[type].cutoff,
                    payLater: TYPE_DEFAULTS[type].payLater,
                  }
                : {}),
            }
          : l,
      ),
    );
  }
  function write(
    path: string,
    body: any,
    kind?: string,
    index?: number,
    method = "PATCH",
  ): Write {
    return { path, body, kind, index, method };
  }
  async function move(target: number, forward = true) {
    if (disabled || flight.current) return;
    if (
      !pending &&
      forward &&
      canonical === 1 &&
      !validPublicContact(contact)
    ) {
      setError(
        "Enter a phone number with at least 7 digits or a valid email address.",
      );
      return;
    }
    if (!pending && forward && canonical === 8 && !items.length) {
      setError("Add at least one menu item.");
      return;
    }
    if (
      !pending &&
      forward &&
      canonical === 5 &&
      locations.some(
        (l) => l.id && !(paymentDrafts.current[l.id] || ["cash"]).length,
      )
    ) {
      setError("Choose at least one payment method.");
      return;
    }
    if (!pending && forward && !form.current?.reportValidity()) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setStatus("Saving…");
    let attempt = pending;
    try {
      if (!attempt) {
        const writes: Write[] = [];
        if (forward && canonical === 1) {
          writes.push(
            write(`${orgBase}/onboarding`, {
              step: canonical + 1,
              data: { contact, sameKind },
            }),
          );
          writes.push(
            write(
              `${orgBase}/operating`,
              {
                requestKey: crypto.randomUUID(),
                version: operatingVersion.current,
                locationCount: operating.locationCount,
                defaultVenueType: venueType,
                ...(!multiple ? { inventoryMode: "per_location" } : {}),
              },
              "operating",
            ),
          );
        }
        if (forward && canonical === 1) {
          locations.forEach((l, index) => {
            const { id, name, version, ...settings } = l;
            if (!id)
              writes.push(
                write(
                  `${orgBase}/branches`,
                  {
                    requestKey: crypto.randomUUID(),
                    name,
                    timezone: l.timezone,
                    currency,
                    cutoff: l.cutoff,
                    venueType: l.venueType,
                    capabilities: l.capabilities,
                    code: l.code,
                    colorTag: l.colorTag,
                  },
                  "create",
                  index,
                  "POST",
                ),
              );
            writes.push(
              write(
                id ? `${orgBase}/branches/${id}/settings` : "",
                {
                  ...settings,
                  currency,
                  reservationsEnabled:
                    settings.capabilities.includes("reservations"),
                  payLater:
                    settings.payLater ?? TYPE_DEFAULTS[l.venueType].payLater,
                  requestKey: crypto.randomUUID(),
                  version: id ? locationVersions.current[id] || version : 1,
                },
                "settings",
                index,
              ),
            );
          });
        }
        if (forward && canonical === 7)
          writes.push(write(`${orgBase}/branding`, { ...branding, logo }));
        if (forward && canonical === 5)
          locations.forEach((l) => {
            if (l.id)
              writes.push(
                write(`${orgBase}/branches/${l.id}/launch-policy`, {
                  manualPaymentMethods: paymentDrafts.current[l.id] || ["cash"],
                  publicContact: contact,
                }),
              );
          });
        writes.push(
          write(
            `${orgBase}/onboarding`,
            {
              step: canonicalSteps.indexOf(target) + 1,
              data: {
                [progressKey]: target,
                [`ownerGuideV4Step_${branch.id}`]: target,
              },
            },
            "progress",
          ),
        );
        attempt = structuredClone({
          writes,
          target,
          snapshot: {
            locations,
            contact,
            currency,
            operating,
            venueType,
            capabilities,
            sameKind,
            payments: paymentDrafts.current,
            branding: { ...branding, logo },
          },
        });
        window.sessionStorage.setItem(recoveryKey, JSON.stringify(attempt));
        setPending(attempt);
      }
      if (attempt.target < 0)
        throw Error(
          "Saved recovery is unavailable. Refresh workspace access before continuing.",
        );
      while (attempt.writes.length) {
        const current: Write = attempt.writes[0];
        if (current.kind === "progress" && attempt.snapshot) {
          current.body.data[`ownerSetupLocations_${branch.id}`] =
            attempt.snapshot.locations;
          current.body.data[`ownerSetupPayments_${branch.id}`] =
            attempt.snapshot.payments;
          window.sessionStorage.setItem(recoveryKey, JSON.stringify(attempt));
        }
        const result = await save(
          current.path,
          current.method,
          current.body,
          "Setup saved.",
        );
        if (!alive.current) return;
        if (
          current.kind === "progress" &&
          (result?.saved !== true ||
            result?.onboarding?.data?.[progressKey] !== attempt.target)
        )
          throw Error("Your saved place could not be confirmed.");
        if (
          !current.kind &&
          current.path.endsWith("/onboarding") &&
          result?.saved !== true
        )
          throw Error("Business details could not be confirmed.");
        if (
          !current.kind &&
          current.path.endsWith("/launch-policy") &&
          (!Array.isArray(result?.checks) ||
            typeof result?.canPublish !== "boolean")
        )
          throw Error("Payment choices could not be confirmed.");
        if (current.kind === "operating") {
          if (!Number.isInteger(result?.version))
            throw Error("Operating settings could not be confirmed.");
          operatingVersion.current = result.version;
          setOperating((o: any) => ({ ...o, version: result.version }));
          if (attempt.snapshot)
            attempt.snapshot.operating.version = result.version;
        }
        if (current.kind === "settings") {
          if (!Number.isInteger(result?.version))
            throw Error("Location settings could not be confirmed.");
          const id = current.path.split("/").at(-2)!;
          locationVersions.current[id] = result.version;
          setLocations((ls) =>
            ls.map((l) =>
              l.id === id ? { ...l, version: result.version } : l,
            ),
          );
          if (attempt.snapshot)
            attempt.snapshot.locations = attempt.snapshot.locations.map((l) =>
              l.id === id ? { ...l, version: result.version } : l,
            );
        }
        if (current.kind === "create") {
          const id = result?.branch?.id || result?.branchId || result?.id;
          if (!id) throw Error("Location creation could not be confirmed.");
          setLocations((ls) =>
            ls.map((l, i) => (i === current.index ? { ...l, id } : l)),
          );
          attempt.writes[1].path = `${orgBase}/branches/${id}/settings`;
          locationVersions.current[id] = 1;
          if (attempt.snapshot)
            attempt.snapshot.locations = attempt.snapshot.locations.map(
              (l, i) => (i === current.index ? { ...l, id } : l),
            );
        }
        attempt = { ...attempt, writes: attempt.writes.slice(1) };
        window.sessionStorage.setItem(recoveryKey, JSON.stringify(attempt));
        setPending(attempt);
      }
      window.sessionStorage.removeItem(recoveryKey);
      setPending(null);
      setCanonical([0, 2, 3, 4].includes(attempt.target) ? 1 : attempt.target);
      setStatus("Saved");
    } catch (e) {
      if ([400, 409, 422].includes((e as any).status)) {
        try {
          window.sessionStorage.removeItem(recoveryKey);
          setPending(null);
        } catch {}
      }
      setError(
        `${(e as Error).message || "We could not save this step."} Retry saving this step before moving elsewhere.`,
      );
      setStatus("Save failed");
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section
      ref={shell}
      className="mera-owner-setup mera-identity mera-setup-fullscreen"
      aria-label="Guided owner setup"
      data-owner-setup-fullscreen="true"
    >
      <header className="mera-owner-header">
        <MeraBrand />
        <span>{organization.name} · Owner setup</span>
        <button
          type="button"
          className="secondary"
          disabled={busy || !!pending}
          onClick={onClose}
        >
          All settings
        </button>
      </header>
      <nav aria-label="Owner setup steps">
        <ol className="mera-setup-progress">
          {steps.map((title, i) => (
            <li key={title}>
              <button
                type="button"
                aria-current={step === i ? "step" : undefined}
                disabled={disabled || busy || !!pending || i > step}
                onClick={() => void move(canonicalSteps[i], false)}
              >
                {title}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <main className="mera-setup-main">
        <p>
          Step {step + 1} of {steps.length}
        </p>
        <h2 ref={heading} tabIndex={-1}>
          {steps[step]}
        </h2>
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button
              className="secondary"
              type="button"
              disabled={busy || disabled}
              onClick={() => void move(pending?.target ?? canonical)}
            >
              Retry saving this step
            </button>
          </div>
        )}
        <p role="status">{status}</p>
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            void move(canonicalSteps[step + 1]);
          }}
        >
          <fieldset
            disabled={disabled || busy || !!pending}
            className="mera-setup-fields"
          >
            {canonical === 1 && (
              <>
                <label>
                  Organization name
                  <input value={organization.name} readOnly />
                </label>
                <label>
                  Your Mera web address
                  <input
                    value={organization.publicAddress || organization.slug}
                    readOnly
                  />
                </label>
                <p>
                  {organization.publicAddress
                    ? "Customers can open your menu here once a location goes live. "
                    : "This is your claimed Mera address. "}
                  Changing it requires Mera support.
                </p>
                <label>
                  Public customer contact
                  <input
                    required
                    placeholder="e.g. 0803 123 4567 or hello@yourbusiness.com"
                    maxLength={160}
                    value={contact}
                    onChange={(e) => {
                      setContact(e.target.value);
                      setError("");
                    }}
                  />
                </label>
                <label>
                  Currency
                  <select
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value);
                      setLocations((ls) =>
                        ls.map((l) => ({
                          ...l,
                          timezone: inferTimezone(l.address, e.target.value),
                        })),
                      );
                    }}
                  >
                    {allowedCurrencies.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <p>The phone number or email customers use to reach you</p>
                <div className="mera-setup-logo">
                  <span className="mera-setup-logo-label">
                    Business logo <small>(optional)</small>
                  </span>
                  <div className="mera-setup-logo-row">
                    {logo ? (
                      <img
                        alt={`${organization.name} logo`}
                        src={logo.replace(
                          "/api/mera/v1/public/assets/",
                          `/api/mera/v1${orgBase}/assets/`,
                        )}
                      />
                    ) : (
                      <span
                        className="mera-setup-logo-empty"
                        aria-hidden="true"
                      >
                        {organization.name?.slice(0, 2)}
                      </span>
                    )}
                    <MediaUpload
                      compact
                      label={logo ? "Change logo" : "Upload logo"}
                      endpoint={`/api/mera/v1${orgBase}/assets`}
                      disabled={disabled || logoBusy}
                      onUploaded={async (asset) => {
                        const b = organization.branding || {};
                        setLogoBusy(true);
                        setError("");
                        try {
                          // The branding endpoint takes the full brand record.
                          await save(
                            `${orgBase}/branding`,
                            "PATCH",
                            {
                              primary: b.primary || "#1558c9",
                              accent: b.accent || "#83ddf7",
                              description: b.description || "",
                              font: b.font || "system",
                              logo: asset.url,
                              ...(b.coverImage
                                ? { coverImage: b.coverImage }
                                : {}),
                            },
                            "Logo saved.",
                          );
                          setLogo(asset.url);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setLogoBusy(false);
                        }
                      }}
                    />
                  </div>
                  <p>
                    {logoBusy
                      ? "Saving logo…"
                      : logo
                        ? "Saved. Shown on your customer menu and receipts."
                        : "Shown on your customer menu and receipts. PNG, JPEG or WebP."}
                  </p>
                </div>
                <Segmented
                  label="How many locations do you run?"
                  value={operating.locationCount}
                  onChange={(locationCount) =>
                    setOperating({ ...operating, locationCount })
                  }
                  options={[
                    { value: "one", label: "One" },
                    { value: "few", label: "2–5" },
                    { value: "many", label: "6 or more" },
                  ]}
                />
              </>
            )}
            {canonical === 1 && (
              <VenueTypeStep
                value={venueType}
                capabilities={capabilities}
                onChange={selectType}
                multiple={multiple}
                sameKind={sameKind}
                onSameKind={(value) => {
                  setSameKind(value);
                  if (value)
                    setLocations((current) =>
                      current.map((l) => ({
                        ...l,
                        venueType,
                        capabilities,
                        serviceHours:
                          l.venueType === venueType
                            ? l.serviceHours
                            : TYPE_DEFAULTS[venueType].hours,
                        payLater:
                          l.venueType === venueType
                            ? (l.payLater ?? TYPE_DEFAULTS[venueType].payLater)
                            : TYPE_DEFAULTS[venueType].payLater,
                        cutoff:
                          l.venueType === venueType
                            ? l.cutoff
                            : TYPE_DEFAULTS[venueType].cutoff,
                      })),
                    );
                }}
              />
            )}
            {canonical === 1 && (
              <>
                <label>
                  Address
                  <input
                    value={locations[0].address}
                    onChange={(e) =>
                      setLocations((ls) =>
                        ls.map((l, i) =>
                          i
                            ? l
                            : {
                                ...l,
                                address: e.target.value,
                                timezone: inferTimezone(
                                  e.target.value,
                                  currency,
                                ),
                              },
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Timezone
                  <input
                    required
                    value={locations[0].timezone}
                    onChange={(e) =>
                      setLocations((ls) =>
                        ls.map((l, i) =>
                          i ? l : { ...l, timezone: e.target.value },
                        ),
                      )
                    }
                  />
                </label>
                {multiple && (
                  <ul>
                    {locations.map((l) => (
                      <li key={l.id || l.name}>{l.name}</li>
                    ))}
                  </ul>
                )}
                <details>
                  <summary>Edit opening hours (optional)</summary>
                  <TimeWindows
                    label="Opening hours"
                    value={locations[0].serviceHours}
                    onChange={(serviceHours) =>
                      setLocations((ls) =>
                        ls.map((l, i) => (i ? l : { ...l, serviceHours })),
                      )
                    }
                  />
                </details>
              </>
            )}
            {canonical === 7 && (
              <section
                aria-label="Look & feel"
                className="mera-onboarding-brand"
              >
                <div>
                  <BrandPaletteFields
                    branding={branding}
                    onChange={setBranding}
                  />
                </div>
                <GuestMenuPreview
                  organization={{ ...organization, currency }}
                  branding={{ ...branding, logo }}
                />
              </section>
            )}
          </fieldset>
        </form>
        {canonical === 8 && (
          <OnboardingMenu
            base={base}
            currency={currency}
            save={save}
            items={items}
            onItems={setItems}
            disabled={disabled || busy || !!pending}
          />
        )}
        {canonical === 5 && (
          <div>
            {locations
              .filter((l) => l.id)
              .map((l) => (
                <section key={l.id} aria-label={`${l.name} launch review`}>
                  <h3>{l.name}</h3>
                  <LaunchReadiness
                    base={`${orgBase}/branches/${l.id}`}
                    settings={{
                      ...(l.id === branch.id ? branch.settings : {}),
                      manualPaymentMethods: paymentDrafts.current[l.id!] || [
                        "cash",
                      ],
                    }}
                    disabled={disabled || busy || !!pending}
                    save={save}
                    guidedStage="payments"
                    publicContact={contact}
                    onPaymentDraft={(methods) => {
                      paymentDrafts.current[l.id!] = methods;
                    }}
                  />
                </section>
              ))}
          </div>
        )}
        {canonical === 6 && (
          <OnboardingLaunch
            base={base}
            organization={organization}
            branding={{ ...branding, logo }}
            items={items}
            capabilities={capabilities}
            contact={contact}
            methods={paymentDrafts.current[branch.id] || ["cash"]}
            save={save}
            disabled={disabled || busy || !!pending}
            onFix={(index) => void move(index, false)}
            onFinished={() => {
              onFinished?.();
              onClose();
            }}
          />
        )}
        <footer className="mera-owner-step-footer">
          <button
            type="button"
            className="secondary"
            disabled={step === 0 || busy || !!pending || disabled}
            onClick={() => void move(canonicalSteps[step - 1], false)}
          >
            Back
          </button>
          {step < steps.length - 1 && (
            <button
              type="button"
              className="primary"
              disabled={busy || !!pending || disabled}
              onClick={() => void move(canonicalSteps[step + 1])}
            >
              {busy ? "Saving…" : "Continue"}
            </button>
          )}
        </footer>
        <p className="mera-owner-note">
          Visiting a step does not mark it complete.
        </p>
      </main>
    </section>
  );
}
