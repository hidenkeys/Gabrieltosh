import React, { useState } from "react";
export default function MinimumSpendPolicy({
  base,
  policy,
  disabled,
  save,
}: {
  base: string;
  policy: any;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [draft, setDraft] = useState({
    enabled: policy?.enabled ?? false,
    amount: policy?.amount ?? null,
    basis: policy?.basis ?? null,
    disclosure: policy?.disclosure || "",
  });
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="mw-card">
      <h2>Reviewed minimum-spend terms</h2>
      <p>
        A minimum spend is a disclosed commitment measured against the visit’s
        net paid bill. It creates no fee or unpaid charge. Customers may add
        ordinary orders, or a manager may waive a shortfall. Active visits keep
        their original terms.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await save(
              base + "/minimum-spend-policy",
              "PATCH",
              { ...draft, approved, shortfallTreatment: "manager_review" },
              "Minimum-spend policy saved.",
            );
            setApproved(false);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <fieldset disabled={disabled} style={{ border: 0, padding: 0 }}>
          <label className="mw-row">
            <span>Enable reviewed minimum spend for new visits</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
          </label>
          <div className="mw-form">
            <label>
              Minimum-spend amount (naira)
              <input
                required={draft.enabled}
                min={draft.enabled ? "0.01" : "0"}
                max={1000000000}
                type="number"
                step="0.01"
                placeholder="Unresolved"
                value={draft.amount === null ? "" : draft.amount / 100}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    amount:
                      event.target.value === ""
                        ? null
                        : Math.round(Number(event.target.value) * 100),
                  })
                }
              />
            </label>
            <label>
              Reviewed calculation basis
              <select
                required={draft.enabled}
                value={draft.basis || ""}
                onChange={(event) =>
                  setDraft({ ...draft, basis: event.target.value || null })
                }
              >
                <option value="">Unresolved</option>
                <option value="net_paid_bill">Visit net paid bill</option>
              </select>
            </label>
            <label className="mw-wide">
              Customer disclosure
              <textarea
                required={draft.enabled}
                minLength={draft.enabled ? 10 : undefined}
                maxLength={500}
                value={draft.disclosure}
                onChange={(event) =>
                  setDraft({ ...draft, disclosure: event.target.value })
                }
              />
            </label>
          </div>
          <label className="mw-row">
            <span>I reviewed the amount, basis and customer disclosure.</span>
            <input
              type="checkbox"
              required={draft.enabled}
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
            />
          </label>
          <button className="secondary" disabled={draft.enabled && !approved}>
            Save minimum-spend policy
          </button>
        </fieldset>
      </form>
    </section>
  );
}
