import UnitInput from "../ui/UnitInput";
import { useState } from "react";
import MoneyInput from "../ui/MoneyInput";
import Segmented from "../ui/Segmented";
import Switch from "../ui/Switch";
export default function DepositPolicy({
  policy,
  base,
  disabled,
  save,
}: {
  policy: any;
  base: string;
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
    amount: policy?.amount == null ? "" : String(policy.amount / 100),
    cancellationCutoffHours:
      policy?.cancellationCutoffHours == null
        ? ""
        : String(policy.cancellationCutoffHours),
    refundRule: policy?.refundRule || "",
  });
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="mw-card">
      <h2>Reservation deposit policy</h2>
      <p>
        No deposit policy is approved by default. Define the amount and
        cancellation terms before recording any manually verified deposits. This
        does not enable online debits or move money.
      </p>
      <form
        className="mw-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!acknowledged) return;
          setError("");
          void save(
            base + "/deposit-policy",
            "PUT",
            {
              enabled: draft.enabled,
              amount: Math.round(Number(draft.amount) * 100),
              cancellationCutoffHours: Number(draft.cancellationCutoffHours),
              refundRule: draft.refundRule,
              approved: true,
            },
            "Explicit deposit policy approval recorded.",
          )
            .then(() => setAcknowledged(false))
            .catch((e) => setError(e.message));
        }}
      >
        <Switch
          label="Require manual deposit"
          checked={draft.enabled}
          onChange={(enabled) => setDraft({ ...draft, enabled })}
          disabled={disabled}
        />
        <MoneyInput
          label="Deposit amount (naira)"
          required
          min={0}
          value={draft.amount}
          onChange={(amount) => setDraft({ ...draft, amount })}
          disabled={disabled}
        />
        <UnitInput
          label="Cancellation cutoff (hours)"
          unit="hours"
          required
          min={0}
          max={720}
          value={draft.cancellationCutoffHours}
          onChange={(value) =>
            setDraft({ ...draft, cancellationCutoffHours: value })
          }
          disabled={disabled}
          presets={[{ value: 0 }, { value: 6 }, { value: 24 }, { value: 48 }]}
        />
        <Segmented
          label="Refund rule"
          required
          value={draft.refundRule}
          onChange={(refundRule) => setDraft({ ...draft, refundRule })}
          disabled={disabled}
          options={[
            {
              value: "refundable_before_cutoff",
              label: "Refundable before cutoff",
            },
            { value: "non_refundable", label: "Non-refundable" },
          ]}
        />
        <label
          className="mw-wide"
          style={{ display: "flex", alignItems: "center", gap: 9 }}
        >
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />{" "}
          I am authorized to approve these specific deposit and cancellation
          terms.
        </label>
        {error && (
          <p role="alert" className="mw-note mw-error mw-wide">
            {error}
          </p>
        )}
        <div className="mw-wide">
          <button className="primary" disabled={disabled || !acknowledged}>
            Save explicitly approved policy
          </button>
        </div>
      </form>
    </section>
  );
}
