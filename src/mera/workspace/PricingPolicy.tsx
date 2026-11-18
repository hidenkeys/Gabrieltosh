import React, { useState } from "react";
export default function PricingPolicy({
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
    discount: policy?.discount ?? null,
    serviceCharge: policy?.serviceCharge ?? null,
    tax: policy?.tax ?? null,
  });
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="mw-card">
      <h2>Order prices, discounts & charges</h2>
      <p>
        Configure only the charges this branch has approved. The server issues
        an itemized quote before an order uses this policy. These are store
        charges, separate from Mera’s unresolved commercial fees.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await save(
              base + "/pricing-policy",
              "PATCH",
              { ...draft, approved: true },
              "Reviewed order pricing policy saved.",
            );
            setApproved(false);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <fieldset disabled={disabled} style={{ border: 0, padding: 0 }}>
          <label className="mw-row">
            <span>Enable this branch order pricing policy</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
          </label>
          {(["discount", "serviceCharge", "tax"] as const).map((key) => {
            const row = draft[key];
            return (
              <fieldset key={key}>
                <legend>
                  {key === "discount"
                    ? "Discount"
                    : key === "tax"
                      ? "Tax"
                      : "Service charge"}
                </legend>
                <label className="mw-row">
                  <span>
                    Include {key === "serviceCharge" ? "service charge" : key}
                  </span>
                  <input
                    type="checkbox"
                    checked={!!row}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [key]: event.target.checked
                          ? key === "discount"
                            ? { label: "Discount", type: "fixed", value: 0 }
                            : key === "tax"
                              ? {
                                  label: "Tax",
                                  basisPoints: 0,
                                  basis: "net_items",
                                }
                              : { label: "Service charge", basisPoints: 0 }
                          : null,
                      })
                    }
                  />
                </label>
                {row && (
                  <div className="mw-form">
                    <label>
                      Customer-facing {key} label
                      <input
                        required
                        maxLength={80}
                        value={row.label}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            [key]: { ...row, label: event.target.value },
                          })
                        }
                      />
                    </label>
                    {key === "discount" ? (
                      <>
                        <label>
                          Discount type
                          <select
                            value={row.type}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                discount: {
                                  ...row,
                                  type: event.target.value,
                                  value: 0,
                                },
                              })
                            }
                          >
                            <option value="fixed">Fixed amount in naira</option>
                            <option value="basis_points">Percentage</option>
                          </select>
                        </label>
                        <label>
                          {row.type === "fixed"
                            ? "Discount amount (naira)"
                            : "Discount (%)"}
                          <input
                            required
                            type="number"
                            min={0}
                            max={row.type === "basis_points" ? 100 : undefined}
                            step="0.01"
                            value={row.value / 100}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                discount: {
                                  ...row,
                                  value: Math.round(
                                    Number(event.target.value) * 100,
                                  ),
                                },
                              })
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <label>
                        {key === "tax" ? "Tax" : "Service charge"} (%)
                        <input
                          required
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={row.basisPoints / 100}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              [key]: {
                                ...row,
                                basisPoints: Math.round(
                                  Number(event.target.value) * 100,
                                ),
                              },
                            })
                          }
                        />
                      </label>
                    )}
                    {key === "tax" && (
                      <label>
                        Tax calculation basis
                        <select
                          value={row.basis}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              tax: { ...row, basis: event.target.value },
                            })
                          }
                        >
                          <option value="net_items">
                            Items after discount
                          </option>
                          <option value="net_items_and_service">
                            Items after discount plus service
                          </option>
                        </select>
                      </label>
                    )}
                  </div>
                )}
              </fieldset>
            );
          })}
          <label className="mw-row">
            <span>I reviewed these customer-visible prices and charges.</span>
            <input
              type="checkbox"
              required
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
            />
          </label>
          <button className="secondary" disabled={!approved}>
            Save reviewed pricing policy
          </button>
        </fieldset>
      </form>
    </section>
  );
}
