import UnitInput from "../ui/UnitInput";
import { useState } from "react";
import Stepper from "../ui/Stepper";
import MoneyInput from "../ui/MoneyInput";
import Segmented from "../ui/Segmented";
type Props = {
  organizationId: string;
  policy: any;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export default function PolicyEditor({
  organizationId,
  policy,
  disabled,
  save,
}: Props) {
  const [draft, setDraft] = useState({
    monthlyPrice: String((policy.monthlyPrice ?? 1350000) / 100),
    includedBranches: String(policy.includedBranches ?? 1),
    additionalBranchPrice:
      policy.additionalBranchPrice == null
        ? ""
        : String(policy.additionalBranchPrice / 100),
    integratedFeeBps: String(policy.integratedFeeBps ?? 10),
    feePayer: policy.feePayer || "",
    feeBasis: policy.feeBasis || "",
    refundTreatment: policy.refundTreatment || "",
    trialDays: policy.trialDays == null ? "" : String(policy.trialDays),
    graceDays: policy.graceDays == null ? "" : String(policy.graceDays),
  });
  const [error, setError] = useState("");
  const numberField = (
    label: string,
    key: keyof typeof draft,
    optional = false,
    step = "1",
  ) =>
    key === "includedBranches" ? (
      <Stepper
        label={label}
        value={Number(draft.includedBranches)}
        onChange={(value) =>
          setDraft({ ...draft, includedBranches: String(value) })
        }
        min={1}
        required
        disabled={disabled}
      />
    ) : ["monthlyPrice", "additionalBranchPrice"].includes(key) ? (
      <MoneyInput
        currency={policy.currency || "NGN"}
        label={label}
        value={draft[key]}
        onChange={(value) => setDraft({ ...draft, [key]: value })}
        required={!optional}
        disabled={disabled}
      />
    ) : (
      <UnitInput
        label={label}
        unit={key === "integratedFeeBps" ? "basis points" : "days"}
        required={!optional}
        min={0}
        max={
          key === "integratedFeeBps" ? 10000 : key === "trialDays" ? 3650 : 365
        }
        step={step}
        value={draft[key]}
        onChange={(value) => setDraft({ ...draft, [key]: value })}
        disabled={disabled}
        allowUnset={optional}
        presets={
          key === "integratedFeeBps"
            ? []
            : [{ value: 0 }, { value: 7 }, { value: 14 }, { value: 30 }]
        }
      />
    );
  const select = (
    label: string,
    key: keyof typeof draft,
    options: [string, string][],
  ) => (
    <Segmented
      label={label}
      value={draft[key]}
      onChange={(value) => setDraft({ ...draft, [key]: value })}
      disabled={disabled}
      options={[
        { value: "", label: "Not set" },
        ...options.map(([value, label]) => ({ value, label })),
      ]}
    />
  );
  return (
    <section className="mw-card">
      <h2>Configure a pricing proposal</h2>
      <p>
        Save a pricing proposal for review. This never activates subscriptions,
        collects money or enables recurring debit.
      </p>
      <form
        className="mw-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          const nullableNumber = (value: string) =>
            value === "" ? null : Number(value);
          const body = {
            monthlyPrice: Math.round(Number(draft.monthlyPrice) * 100),
            includedBranches: Number(draft.includedBranches),
            additionalBranchPrice:
              draft.additionalBranchPrice === ""
                ? null
                : Math.round(Number(draft.additionalBranchPrice) * 100),
            integratedFeeBps: Number(draft.integratedFeeBps),
            feePayer: draft.feePayer || null,
            feeBasis: draft.feeBasis || null,
            refundTreatment: draft.refundTreatment || null,
            trialDays: nullableNumber(draft.trialDays),
            graceDays: nullableNumber(draft.graceDays),
          };
          void save(
            `/organizations/${organizationId}/policy`,
            "PATCH",
            body,
            "Pricing proposal saved. Live billing remains disabled.",
          ).catch((e) => setError(e.message));
        }}
      >
        {numberField("Monthly price (naira)", "monthlyPrice", false, "0.01")}
        {numberField("Included branches", "includedBranches")}
        {numberField(
          "Additional branch price (naira, optional)",
          "additionalBranchPrice",
          true,
          "0.01",
        )}
        {numberField(
          "Integrated collection fee (basis points; 10 = 0.1%)",
          "integratedFeeBps",
        )}
        {select("Fee payer", "feePayer", [
          ["merchant", "Merchant"],
          ["customer", "Customer"],
        ])}
        {select("Fee calculation basis", "feeBasis", [
          ["collection", "Confirmed integrated collection"],
          ["sales", "Sales amount"],
        ])}
        {select("Refund fee treatment", "refundTreatment", [
          ["return_fee", "Return the platform fee"],
          ["retain_fee", "Retain the platform fee"],
        ])}
        {numberField("Trial days (optional)", "trialDays", true)}
        {numberField("Grace days (optional)", "graceDays", true)}
        <div className="mw-note mw-wide">
          Not-set policies stay undecided. Choose how each works before going
          live. External cash/POS and manually verified transfers are excluded
          from the proposed integrated fee. Provider costs, tax, commercial
          approval and live-provider verification remain separate launch gates.
        </div>
        {error && (
          <p role="alert" className="mw-note mw-error mw-wide">
            {error}
          </p>
        )}
        <div className="mw-wide">
          <button className="primary" disabled={disabled}>
            Save pricing proposal
          </button>
        </div>
      </form>
    </section>
  );
}
