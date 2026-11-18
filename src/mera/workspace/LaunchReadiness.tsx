import React, { useEffect, useState } from "react";
import { workspaceApi } from "./api";
export default function LaunchReadiness({
  base,
  settings,
  disabled,
  save,
}: {
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
  const [readiness, setReadiness] = useState<any>(null);
  const [methods, setMethods] = useState<string[]>(
    settings?.manualPaymentMethods || [],
  );
  const [contact, setContact] = useState(settings?.publicContact || "");
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    workspaceApi(base + "/readiness", "GET", undefined, controller.signal)
      .then(setReadiness)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [base]);
  return (
    <section className="mw-card">
      <h2>Branch publication checklist</h2>
      <div className="mw-note">
        This publishes the branch’s configured menu state within Mera. Public
        hosting, verified payment providers and physical printer output require
        separate validation. No website deployment or live payment activation
        happens here.
      </div>
      {error && <p role="alert">{error}</p>}
      {!readiness ? (
        <p role="status">Checking branch readiness…</p>
      ) : (
        <>
          <p>
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
          <ul className="mw-steps">
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
          <form
            onSubmit={async (event) => {
              event.preventDefault();
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
              disabled={disabled || busy}
              style={{ border: 0, padding: 0 }}
            >
              <legend>Reviewed manual payment methods</legend>
              {["cash", "external_pos", "external_transfer"].map((method) => (
                <label className="mw-row" key={method}>
                  <span>{method.replaceAll("_", " ")}</span>
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
              ))}
              <label>
                Public customer contact
                <input
                  required
                  minLength={3}
                  maxLength={160}
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                />
              </label>
              <label className="mw-row">
                <span>
                  I reviewed manual payment handling and the public contact for
                  this branch.
                </span>
                <input
                  type="checkbox"
                  required
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
              </label>
              <button
                className="secondary"
                disabled={!acknowledged || !methods.length}
              >
                Save reviewed launch policy
              </button>
            </fieldset>
          </form>
          <label className="mw-row">
            <span>I confirm publication for this branch only.</span>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
          </label>
          <div className="mw-actions">
            <button
              className="primary"
              disabled={disabled || busy || !readiness.canPublish || !confirmed}
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
            <button
              disabled={busy}
              onClick={async () => {
                setError("");
                try {
                  setReadiness(await workspaceApi(base + "/readiness"));
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
