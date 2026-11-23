import UnitInput from "../ui/UnitInput";
import React, { useState } from "react";
import MoneyInput from "../ui/MoneyInput";
import Segmented from "../ui/Segmented";
import Switch from "../ui/Switch";
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
  const [discountAmount, setDiscountAmount] = useState(
    String((policy?.discount?.value || 0) / 100),
  );
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="mw-card">
      <h2>Order prices, discounts & charges</h2>
      <p>
        Configure only the charges this branch has approved. The server issues
        an itemized quote before an order uses this policy. These are store
        charges, separate from Mera’s commercial fees, which still need
        approval.
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
          <Switch
            label="Enable this branch order pricing policy"
            checked={draft.enabled}
            onChange={(enabled) => setDraft({ ...draft, enabled })}
          />
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
                <Switch
                  label={`Include ${key === "serviceCharge" ? "service charge" : key}`}
                  checked={!!row}
                  onChange={(checked) => {
                    if (key === "discount") setDiscountAmount("0");
                    setDraft({
                      ...draft,
                      [key]: checked
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
                    });
                  }}
                />
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
                        <Segmented
                          label="Discount type"
                          value={row.type}
                          onChange={(type) => {
                            setDiscountAmount("0");
                            setDraft({
                              ...draft,
                              discount: { ...row, type, value: 0 },
                            });
                          }}
                          options={[
                            { value: "fixed", label: "Fixed amount in naira" },
                            { value: "basis_points", label: "Percentage" },
                          ]}
                        />
                        {row.type === "fixed" ? (
                          <MoneyInput
                            label="Discount amount (naira)"
                            value={discountAmount}
                            onChange={(value) => {
                              setDiscountAmount(value);
                              setDraft({
                                ...draft,
                                discount: {
                                  ...row,
                                  value: Math.round(Number(value) * 100),
                                },
                              });
                            }}
                            required
                          />
                        ) : (
                          <UnitInput
                            label="Discount (%)"
                            unit="%"
                            required
                            min={0}
                            max={100}
                            step="0.01"
                            value={row.value / 100}
                            onChange={(value) =>
                              setDraft({
                                ...draft,
                                discount: {
                                  ...row,
                                  value: Math.round(Number(value) * 100),
                                },
                              })
                            }
                          />
                        )}
                      </>
                    ) : (
                      <UnitInput
                        label={`${key === "tax" ? "Tax" : "Service charge"} (%)`}
                        unit="%"
                        required
                        min={0}
                        max={100}
                        step="0.01"
                        value={row.basisPoints / 100}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            [key]: {
                              ...row,
                              basisPoints: Math.round(Number(value) * 100),
                            },
                          })
                        }
                      />
                    )}
                    {key === "tax" && (
                      <Segmented
                        label="Tax calculation basis"
                        value={row.basis}
                        onChange={(basis) =>
                          setDraft({ ...draft, tax: { ...row, basis } })
                        }
                        options={[
                          { value: "net_items", label: "Items after discount" },
                          {
                            value: "net_items_and_service",
                            label: "Items after discount plus service",
                          },
                        ]}
                      />
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
