import ChoiceField from "../ui/ChoiceField";
import React, { useEffect, useRef, useState } from "react";
type Draft = { contact: string; phone: string; serviceMode: string };
const modes = {
  counter_takeaway: "Counter & takeaway",
  table_service: "Table service",
  reservations: "Reservations",
  lounge: "Lounge & club",
};
function details(value: any): Draft {
  const data = value?.data || {};
  return {
    contact: typeof data.contact === "string" ? data.contact : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    serviceMode: Object.hasOwn(modes, data.serviceMode)
      ? data.serviceMode
      : "counter_takeaway",
  };
}
type Props = {
  organizationId: string;
  onboarding: any;
  canEdit: boolean;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export default function BusinessDetails(props: Props) {
  return <ScopedBusinessDetails key={props.organizationId} {...props} />;
}
function ScopedBusinessDetails({
  organizationId,
  onboarding,
  canEdit,
  disabled,
  save,
}: Props) {
  const saved = details(onboarding),
    signature = JSON.stringify(saved);
  const [draft, setDraft] = useState<Draft>(saved),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [remoteChanged, setRemoteChanged] = useState(false),
    [pending, setPending] = useState<Draft | null>(null);
  const changed = useRef(false),
    last = useRef(signature),
    alive = useRef(true),
    inFlight = useRef(false),
    permission = useRef(canEdit),
    epoch = useRef(0);
  if (permission.current !== canEdit) epoch.current++;
  permission.current = canEdit;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (last.current === signature) return;
    last.current = signature;
    if (!changed.current) setDraft(saved);
    else if (JSON.stringify(draft) !== signature) setRemoteChanged(true);
  }, [signature]);
  const edit = (patch: Partial<Draft>) => {
    changed.current = true;
    setDraft((current) => ({ ...current, ...patch }));
    setStatus("");
  };
  const send = async () => {
    if (disabled || inFlight.current || !canEdit) return;
    const started = epoch.current;
    const original = pending || {
      contact: draft.contact.trim(),
      phone: draft.phone.trim(),
      serviceMode: draft.serviceMode,
    };
    if (
      !original.contact ||
      original.contact.length > 100 ||
      original.phone.length > 60 ||
      !Object.hasOwn(modes, original.serviceMode)
    ) {
      setError(
        "Enter a business contact and review the phone and service choice.",
      );
      return;
    }
    inFlight.current = true;
    setPending(original);
    setWorking(true);
    setError("");
    setStatus("");
    try {
      const result = await save(
        `/organizations/${organizationId}/onboarding`,
        "PATCH",
        { step: 1, data: original },
        "Business details saved.",
      );
      if (!alive.current || started !== epoch.current || !permission.current)
        return;
      if (result?.saved !== true)
        throw new Error("The save result could not be confirmed.");
      setDraft(original);
      changed.current = false;
      setPending(null);
      setRemoteChanged(false);
      setStatus("Business details saved.");
    } catch (e: any) {
      if (!alive.current || started !== epoch.current || !permission.current)
        return;
      if (
        pending ||
        !e.status ||
        e.status >= 500 ||
        [401, 403, 408, 429].includes(e.status)
      ) {
        setPending(original);
        setError(
          "We could not confirm the save. Retry the original details before making another change.",
        );
      } else {
        setPending(null);
        setError(
          e.message || "Business details could not be saved. Try again.",
        );
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setWorking(false);
    }
  };
  return (
    <section className="mw-card" aria-label="Business details">
      <h2>Business details</h2>
      <p>
        Keep organization contact details up to date. Branch hours and
        appearance are configured separately.
      </p>
      {!canEdit && (
        <p>
          Organization details are managed by an organization administrator.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {remoteChanged && !pending && (
        <div className="mw-note">
          <p>
            Saved details changed while you were editing. Review them before
            saving.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={working || disabled}
            onClick={() => {
              changed.current = false;
              setDraft(details(onboarding));
              setRemoteChanged(false);
              setStatus("");
            }}
          >
            Use saved details
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <fieldset
          className="mw-form"
          disabled={disabled || working || !canEdit || !!pending}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <label>
            Business contact
            <input
              required
              maxLength={100}
              value={draft.contact}
              onChange={(event) => edit({ contact: event.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={60}
              value={draft.phone}
              onChange={(event) => edit({ phone: event.target.value })}
            />
          </label>
          <ChoiceField
            label={<>Primary service</>}
            value={draft.serviceMode}
            onChange={(nextValue) => edit({ serviceMode: nextValue })}
          >
            {Object.entries(modes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </ChoiceField>
          {!pending && canEdit && (
            <div className="mw-wide mw-actions">
              <button className="primary" disabled={working || disabled}>
                {working ? "Saving…" : "Save business details"}
              </button>
            </div>
          )}
        </fieldset>
      </form>
      {pending && (
        <button
          type="button"
          className="secondary"
          disabled={working || disabled || !canEdit}
          onClick={() => void send()}
        >
          {working ? "Checking save…" : "Retry original business details"}
        </button>
      )}
    </section>
  );
}
