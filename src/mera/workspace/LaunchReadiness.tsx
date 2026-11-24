import { validPublicContact } from "./publicContact";
import React, { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
export default function LaunchReadiness({
  base,
  settings,
  disabled,
  save,
  guidedStage,
  publicContact,
  accessBlocked,
  onPaymentDraft,
  checklist,
  onOpen,
}: {
  checklist?: (readiness: any, actions: any) => React.ReactNode;
  onOpen?: (section: string) => void;
  accessBlocked?: boolean;
  onPaymentDraft?: (methods: string[]) => void;
  guidedStage?: "payments" | "review";
  publicContact?: string;
  base: string;
  settings: any;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const attemptKey = `mera:launch-review:v1:${base}`;
  const [uncertain, setUncertain] = useState(() => {
    try {
      return !!window.sessionStorage.getItem(attemptKey);
    } catch {
      return true;
    }
  });
  const inFlight = useRef(false);
  const authority = useRef({
    alive: true,
    disabled: accessBlocked ?? disabled,
    base,
  });
  authority.current.disabled = accessBlocked ?? disabled;
  authority.current.base = base;
  useEffect(() => {
    authority.current.alive = true;
    return () => {
      authority.current.alive = false;
    };
  }, []);
  const [readiness, setReadiness] = useState<any>(null);
  const [methods, setMethods] = useState<string[]>(
    settings?.manualPaymentMethods || [],
  );
  useEffect(() => {
    onPaymentDraft?.(methods);
  }, [methods]);
  const [contact, setContact] = useState(settings?.publicContact || "");
  useEffect(() => {
    if (guidedStage && !inFlight.current && !uncertain)
      setContact(publicContact || "");
  }, [publicContact, guidedStage, uncertain]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (guidedStage && !checklist) {
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    setError("");
    workspaceApi(base + "/readiness", "GET", undefined, controller.signal)
      .then((result) => {
        if (!result || !Array.isArray(result.checks))
          throw new Error(
            "Publication checks are unavailable. Please try again.",
          );
        if (!controller.signal.aborted) setReadiness(result);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [base, revision]);
  async function goLive() {
    if (
      disabled ||
      inFlight.current ||
      uncertain ||
      !methods.length ||
      !validPublicContact(contact)
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    let dispatching = false;
    try {
      window.sessionStorage.setItem(attemptKey, "pending");
      if (window.sessionStorage.getItem(attemptKey) !== "pending")
        throw new Error(
          "Safe publication recovery is unavailable. No request was sent.",
        );
      setUncertain(true);
      dispatching = true;
      const reviewed = await save(
        base + "/launch-policy",
        "PATCH",
        {
          manualPaymentMethods: methods,
          launchAcknowledged: true,
          publicContact: contact,
        },
        "Branch launch policy recorded.",
      );
      if (
        !reviewed ||
        !Array.isArray(reviewed.checks) ||
        typeof reviewed.canPublish !== "boolean"
      )
        throw new Error("The reviewed policy response could not be confirmed.");
      if (
        !authority.current.alive ||
        authority.current.disabled ||
        authority.current.base !== base
      )
        return;
      setReadiness(reviewed);
      if (!reviewed.canPublish) {
        window.sessionStorage.removeItem(attemptKey);
        setUncertain(false);
        setError(
          "Your reviewed policy is saved. Complete the remaining checks before going live.",
        );
        return;
      }
      const published = await save(
        base + "/launch",
        "POST",
        { confirm: true },
        "Branch menu publication recorded; public hosting remains separately verified.",
      );
      if (
        !published ||
        !Array.isArray(published.checks) ||
        published.launchState !== "published"
      )
        throw new Error(
          "Publication could not be confirmed. Recheck readiness before taking another action.",
        );
      setReadiness(published);
      window.sessionStorage.removeItem(attemptKey);
      setUncertain(false);
    } catch (failure: any) {
      if (!dispatching || (failure.status >= 400 && failure.status < 500)) {
        try {
          window.sessionStorage.removeItem(attemptKey);
          setUncertain(false);
        } catch {}
      }
      setError(failure.message || "Publication could not be confirmed.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (checklist)
    return checklist(readiness, {
      goLive,
      busy,
      uncertain,
      error,
      checking,
      recheck: () => setRevision((v) => v + 1),
    });
  if (guidedStage === "review")
    return (
      <section>
        <h2>Review &amp; finish setup</h2>
        <p>Public customer contact: {contact}</p>
        <p>Payment methods: {methods.join(", ")}</p>
      </section>
    );
  if (guidedStage === "payments")
    return (
      <section>
        <h2>Manual payment handling</h2>
        {error && <p role="alert">{error}</p>}
        <fieldset disabled={disabled || busy}>
          <legend>Reviewed manual payment methods</legend>
          {["cash", "external_pos", "external_transfer"].map((method) => (
            <label className="mw-row" key={method}>
              <span>
                {
                  {
                    cash: "Cash",
                    external_pos: "External card / POS",
                    external_transfer: "Manually verified transfer",
                  }[method]
                }
              </span>
              <input
                type="checkbox"
                checked={methods.includes(method)}
                onChange={async (e) => {
                  const next = e.target.checked
                    ? [...methods, method]
                    : methods.filter((v) => v !== method);
                  setBusy(true);
                  setError("");
                  try {
                    await save(
                      base + "/launch-policy",
                      "PATCH",
                      {
                        manualPaymentMethods: next,
                        ...(validPublicContact(contact)
                          ? { publicContact: contact }
                          : {}),
                      },
                      "Payment choices saved.",
                    );
                    setMethods(next);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          ))}
        </fieldset>
        <p>Public customer contact: {contact}</p>
      </section>
    );
  return (
    <section className="mw-card mw-management mw-management-panel">
      <header className="mw-management-heading">
        <div>
          {!guidedStage && (
            <span className="mw-management-eyebrow">Publish your menu</span>
          )}
          <h2>
            {guidedStage === "payments"
              ? "Manual payment handling"
              : "Ready for customers?"}
          </h2>
          <p>
            {guidedStage === "payments"
              ? "Choose how staff will record payments at this branch."
              : "Review the essentials before making this branch’s menu available."}
          </p>
        </div>
      </header>
      {!guidedStage && (
        <p className="mw-note">
          This publishes the branch’s configured menu state within Mera. Public
          hosting, verified payment providers and physical printer output
          require separate validation. No website deployment or live payment
          activation happens here.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!readiness && checking ? (
        <p role="status">Checking branch readiness…</p>
      ) : !readiness ? (
        <div className="mw-management-empty">
          <p>
            We could not check this branch. Your saved setup has not changed.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={disabled || checking}
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry publication checks
          </button>
        </div>
      ) : (
        <>
          <p className="mw-management-summary">
            Branch state: {readiness.launchState} · Payment provider:{" "}
            {readiness.paymentProviderState} · Public hosting:{" "}
            {readiness.publicHostingVerified ? "verified" : "not verified"}
          </p>
          {readiness.simulation && (
            <p className="mw-note">
              Development simulation. Owner identity exceptions apply only in
              this preview.
            </p>
          )}
          <ul
            className="mw-steps mw-management-checklist"
            hidden={guidedStage === "payments"}
          >
            {readiness.checks.map((check: any) => (
              <li
                key={check.id}
                className={check.status === "ready" ? "done" : ""}
              >
                <div>
                  <b>
                    {check.label} · {check.status}
                  </b>
                  {check.detail && <p>{check.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
          {!readiness.checks.length && (
            <p className="mw-management-empty">
              No checklist details were returned. Recheck readiness before
              deciding to publish.
            </p>
          )}
          <div hidden={guidedStage === "review"}>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (guidedStage) return;
                if (!validPublicContact(contact)) {
                  setError(
                    "Enter a phone number with at least 7 digits or a valid email address.",
                  );
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  setReadiness(
                    await save(
                      base + "/launch-policy",
                      "PATCH",
                      {
                        manualPaymentMethods: methods,
                        launchAcknowledged: true,
                        publicContact: contact,
                      },
                      "Branch launch policy recorded.",
                    ),
                  );
                  setAcknowledged(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset
                disabled={
                  disabled || busy || (guidedStage !== undefined && uncertain)
                }
                style={{ border: 0, padding: 0 }}
              >
                <legend>Reviewed manual payment methods</legend>
                {(["cash", "external_pos", "external_transfer"] as const).map(
                  (method) => (
                    <label className="mw-row" key={method}>
                      <span>
                        {
                          {
                            cash: "Cash",
                            external_pos: "External card / POS",
                            external_transfer: "Manually verified transfer",
                          }[method]
                        }
                      </span>
                      <input
                        type="checkbox"
                        checked={methods.includes(method)}
                        onChange={(event) =>
                          setMethods((current) =>
                            event.target.checked
                              ? [...current, method]
                              : current.filter((value) => value !== method),
                          )
                        }
                      />
                    </label>
                  ),
                )}
                {!guidedStage && (
                  <label>
                    Public customer contact
                    <span>
                      The phone number or email customers use to reach you
                    </span>
                    <input
                      aria-label="Public customer contact"
                      required
                      placeholder="e.g. 0803 123 4567 or hello@yourbusiness.com"
                      maxLength={160}
                      value={contact}
                      onChange={(event) => {
                        setContact(event.target.value);
                        setError("");
                      }}
                    />
                  </label>
                )}
                {guidedStage && (
                  <p>
                    Public customer contact:{" "}
                    <strong>
                      {contact || "Return to Business to save a contact"}
                    </strong>
                  </p>
                )}
                {!guidedStage && (
                  <label className="mw-row">
                    <span>
                      I reviewed manual payment handling and the public contact
                      for this branch.
                    </span>
                    <input
                      type="checkbox"
                      required
                      checked={acknowledged}
                      onChange={(event) =>
                        setAcknowledged(event.target.checked)
                      }
                    />
                  </label>
                )}
                {!guidedStage && (
                  <button
                    className="secondary"
                    disabled={!acknowledged || !methods.length}
                  >
                    Save reviewed launch policy
                  </button>
                )}
              </fieldset>
            </form>
          </div>
          {!guidedStage && (
            <label className="mw-row">
              <span>I confirm publication for this branch only.</span>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
            </label>
          )}
          {guidedStage === "review" && (
            <div className="mw-note">
              <p>
                Public customer contact:{" "}
                <strong>{contact || "Not set — return to Business"}</strong>
              </p>
              <p>
                Manual methods:{" "}
                {methods
                  .map(
                    (method) =>
                      ({
                        cash: "Cash",
                        external_pos: "External card / POS",
                        external_transfer: "Manually verified transfer",
                      })[method],
                  )
                  .join(", ") || "Not set — return to Payments"}
              </p>
              <p>
                I reviewed manual payment handling and the public contact for
                this branch.
              </p>
              <p>I confirm publication for this branch only.</p>
            </div>
          )}
          {guidedStage && uncertain && (
            <p role="alert">
              A previous launch attempt is unconfirmed. Recheck readiness;
              publication will not be repeated automatically. If the branch
              remains unpublished, ask support to review the original attempt.
            </p>
          )}
          <div className="mw-actions">
            {guidedStage === "review" && (
              <button
                type="button"
                className="primary"
                disabled={
                  disabled ||
                  busy ||
                  uncertain ||
                  !methods.length ||
                  !validPublicContact(contact) ||
                  readiness.launchState === "published"
                }
                onClick={() => void goLive()}
              >
                Go live
              </button>
            )}
            {!guidedStage && (
              <button
                className="primary"
                disabled={
                  disabled || busy || !readiness.canPublish || !confirmed
                }
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    setReadiness(
                      await save(
                        base + "/launch",
                        "POST",
                        { confirm: true },
                        "Branch menu publication recorded; public hosting remains separately verified.",
                      ),
                    );
                    setConfirmed(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Publish branch menu
              </button>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setError("");
                try {
                  const next = await workspaceApi(base + "/readiness");
                  if (!next || !Array.isArray(next.checks))
                    throw new Error(
                      "Publication checks are unavailable. Please try again.",
                    );
                  setReadiness(next);
                  if (next.launchState === "published") {
                    window.sessionStorage.removeItem(attemptKey);
                    setUncertain(false);
                  }
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Recheck readiness
            </button>
          </div>
        </>
      )}
    </section>
  );
}
