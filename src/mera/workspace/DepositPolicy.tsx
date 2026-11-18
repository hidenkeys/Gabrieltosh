import { useState } from "react";
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
        <label>
          Require manual deposit
          <select
            value={String(draft.enabled)}
            onChange={(e) =>
              setDraft({ ...draft, enabled: e.target.value === "true" })
            }
          >
            <option value="false">No</option>
            <option value="true">Yes, after explicit policy approval</option>
          </select>
        </label>
        <label>
          Deposit amount (naira)
          <input
            required
            min="0"
            step="0.01"
            type="number"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          />
        </label>
        <label>
          Cancellation cutoff (hours)
          <input
            required
            min="0"
            max="720"
            type="number"
            value={draft.cancellationCutoffHours}
            onChange={(e) =>
              setDraft({ ...draft, cancellationCutoffHours: e.target.value })
            }
          />
        </label>
        <label>
          Refund rule
          <select
            required
            value={draft.refundRule}
            onChange={(e) => setDraft({ ...draft, refundRule: e.target.value })}
          >
            <option value="">Choose an approved rule</option>
            <option value="refundable_before_cutoff">
              Refundable before cutoff
            </option>
            <option value="non_refundable">Non-refundable</option>
          </select>
        </label>
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
