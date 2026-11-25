import { validPublicContact } from "./publicContact";
import React, { useEffect, useRef, useState } from "react";
import { MeraBrand } from "../ui/MeraBrand";
import Segmented from "../ui/Segmented";
import SetupChecklist from "./SetupChecklist";
import LaunchReadiness from "./LaunchReadiness";
import VenueTypeStep from "./setup/VenueTypeStep";
import LocationsStep, { type LocationDraft } from "./setup/LocationsStep";
import MenuStockStep, { ItemKindsIntro } from "./setup/MenuStockStep";
import {
  TYPE_DEFAULTS,
  deriveVenueType,
  defaultLocationCode,
  effectiveCapabilities,
} from "./setup/venues";
type Props = React.ComponentProps<typeof SetupChecklist> & {
  onFinished?: () => void;
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
  operating: any;
  venueType: string;
  capabilities: string[];
  sameKind: boolean;
  payments?: Record<string, string[]>;
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
  actorName,
  disabled,
  demo,
  save,
  onClose,
  onFinished,
}: Props & { onClose: () => void }) {
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
          timezone: b.timezone || "Africa/Lagos",
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
  const steps = [
    "Account",
    "Your business",
    "Kind of venue",
    "Locations",
    ...(multiple ? ["Menu & stock"] : []),
    "Payments",
    "Review & finish setup",
  ];
  const legacyV2 = [0, 1, 2, 5, 6],
    legacyV1 = [0, 1, 2, 2, 2, 2, 2, 5, 6];
  const old =
    data[progressKey] ??
    legacyV2[data[`ownerGuideV2Step_${branch.id}`]] ??
    legacyV1[data[`ownerGuideStep_${branch.id}`]] ??
    0;
  // Store canonical seven-step indexes so single-location progress survives a later count change.
  const [canonical, setCanonical] = useState(old);
  // Menu & stock (4) is a setup step only for multi-location businesses.
  const canonicalSteps = multiple ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 5, 6];
  const step = Math.max(
    0,
    canonicalSteps.indexOf(!multiple && canonical === 4 ? 5 : canonical),
  );
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
  const paymentDrafts = useRef<Record<string, string[]>>(
    snapshot?.payments ||
      data[`ownerSetupPayments_${branch.id}`] || {
        ...Object.fromEntries(
          [branch, ...branches].map((b) => [
            b.id,
            b.settings?.manualPaymentMethods || [],
          ]),
        ),
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
                ...(!multiple ? { inventoryMode: "per_location" } : {}),
              },
              "operating",
            ),
          );
        }
        if (forward && canonical === 2) {
          writes.push(
            write(
              `${base}/settings`,
              {
                requestKey: crypto.randomUUID(),
                version: locationVersions.current[branch.id],
                venueType,
                capabilities,
                reservationsEnabled: capabilities.includes("reservations"),
                payLater:
                  locations[0]?.payLater ?? TYPE_DEFAULTS[venueType].payLater,
              },
              "settings",
              0,
            ),
          );
          writes.push(
            write(`${orgBase}/onboarding`, {
              step: canonical + 1,
              data: { sameKind },
            }),
          );
        }
        if (forward && canonical === 2) {
          writes.push(
            write(
              `${orgBase}/operating`,
              {
                requestKey: crypto.randomUUID(),
                version: operatingVersion.current,
                defaultVenueType: venueType,
              },
              "operating",
            ),
          );
        }
        if (forward && canonical === 3) {
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
                    currency: "NGN",
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
        if (forward && canonical === 4)
          writes.push(
            write(
              `${orgBase}/operating`,
              {
                requestKey: crypto.randomUUID(),
                version: operatingVersion.current,
                menuMode: operating.menuMode,
                inventoryMode: operating.inventoryMode,
              },
              "operating",
            ),
          );
        if (forward && canonical === 5)
          locations.forEach((l) => {
            if (l.id)
              writes.push(
                write(`${orgBase}/branches/${l.id}/launch-policy`, {
                  manualPaymentMethods: paymentDrafts.current[l.id] || [],
                  publicContact: contact,
                }),
              );
          });
        writes.push(
          write(
            `${orgBase}/onboarding`,
            { step: target + 1, data: { [progressKey]: target } },
            "progress",
          ),
        );
        attempt = structuredClone({
          writes,
          target,
          snapshot: {
            locations,
            contact,
            operating,
            venueType,
            capabilities,
            sameKind,
            payments: paymentDrafts.current,
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
      setCanonical(attempt.target);
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
            {canonical === 0 && (
              <>
                <h3>Signed in as {actorName}</h3>
                <p>
                  You have organization-wide management access for{" "}
                  {organization.name}.
                </p>
                <p>
                  {demo
                    ? "Demonstration access does not establish real email ownership. No subscription or online collection is activated."
                    : "Signed-in access is separate from email verification and payment-provider approval. The launch checklist checks the required readiness independently."}
                </p>
              </>
            )}
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
                <p>The phone number or email customers use to reach you</p>
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
            {canonical === 2 && (
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
            {canonical === 3 && (
              <>
                <LocationsStep
                  locations={locations}
                  onChange={setLocations}
                  multiple={multiple}
                  sameKind={sameKind}
                />
                {!multiple && <ItemKindsIntro />}
              </>
            )}
            {canonical === 4 && multiple && (
              <MenuStockStep
                {...operating}
                onChange={(patch) => setOperating({ ...operating, ...patch })}
              />
            )}
          </fieldset>
        </form>
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
                      manualPaymentMethods: paymentDrafts.current[l.id!] || [],
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
          <section aria-label="Setup summary">
            <p>Account: {actorName}</p>
            <p>Customer contact: {contact}</p>
            <p>
              Payments:{" "}
              {locations
                .map(
                  (l) =>
                    `${l.name}: ${(paymentDrafts.current[l.id!] || []).join(", ") || "None selected"}`,
                )
                .join("; ")}
            </p>
            <p>
              {organization.name} · {TYPE_DEFAULTS[venueType].label} ·{" "}
              {locations.length} location{locations.length === 1 ? "" : "s"}
            </p>
            {[1, 2, 3, 5].map((index) => (
              <button
                type="button"
                className="secondary"
                key={index}
                disabled={busy || !!pending}
                onClick={() => void move(index, false)}
              >
                Edit {steps[canonicalSteps.indexOf(index)]}
              </button>
            ))}
          </section>
        )}
        <footer className="mera-owner-step-footer">
          {canonical === 6 && (
            <button
              type="button"
              className="primary"
              disabled={busy || disabled || !!pending}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await save(
                    `${orgBase}/onboarding`,
                    "PATCH",
                    { step: 6, data: {}, complete: true },
                    "Setup complete.",
                  );
                  if (!result?.onboarding?.completedAt)
                    throw Error("Setup completion could not be confirmed.");
                  onFinished?.();
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Finish setup
            </button>
          )}
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
