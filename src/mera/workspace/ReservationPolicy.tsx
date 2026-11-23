import React, { useState } from "react";
import Stepper from "../ui/Stepper";
import Switch from "../ui/Switch";
export default function ReservationPolicy({
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
    minimumLeadMinutes: policy?.minimumLeadMinutes ?? 0,
    maximumAdvanceDays: policy?.maximumAdvanceDays ?? 30,
    bufferBeforeMinutes: policy?.bufferBeforeMinutes ?? 0,
    bufferAfterMinutes: policy?.bufferAfterMinutes ?? 0,
    cancellationCutoffMinutes: policy?.cancellationCutoffMinutes ?? null,
    lateAfterMinutes: policy?.lateAfterMinutes ?? null,
  });
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const numeric = (
    label: string,
    key: keyof typeof draft,
    max: number,
    min = 0,
    nullable = false,
  ) =>
    !nullable ? (
      <Stepper
        label={label}
        value={Number(draft[key])}
        min={min}
        max={max}
        required
        onChange={(value) => setDraft({ ...draft, [key]: value })}
      />
    ) : (
      <label key={key}>
        {label}
        <input
          type="number"
          min={min}
          max={max}
          required={!nullable}
          placeholder={nullable ? "Not set" : ""}
          value={draft[key] === null ? "" : String(draft[key])}
          onChange={(event) =>
            setDraft({
              ...draft,
              [key]:
                event.target.value === "" && nullable
                  ? null
                  : Number(event.target.value),
            })
          }
        />
      </label>
    );
  return (
    <section className="mw-card">
      <h2>Reservation timing policy</h2>
      <p>
        Define booking notice and capacity buffers separately from enabling
        reservations. Blank cancellation and late cutoffs stay undecided. Refund
        and no-show outcomes always require manual review.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await save(
              base + "/reservation-policy",
              "PATCH",
              {
                ...draft,
                approved: true,
                refundHandling: "manual_review",
                noShowHandling: "manual_review",
              },
              "Reviewed reservation policy saved.",
            );
            setApproved(false);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <fieldset disabled={disabled} style={{ border: 0, padding: 0 }}>
          <Switch
            label="Apply this reservation timing policy"
            checked={draft.enabled}
            onChange={(enabled) => setDraft({ ...draft, enabled })}
          />
          <div className="mw-form">
            {numeric(
              "Minimum advance notice (minutes)",
              "minimumLeadMinutes",
              10080,
            )}
            {numeric(
              "Maximum booking window (days)",
              "maximumAdvanceDays",
              365,
              1,
            )}
            {numeric(
              "Buffer before booking (minutes)",
              "bufferBeforeMinutes",
              180,
            )}
            {numeric(
              "Buffer after booking (minutes)",
              "bufferAfterMinutes",
              180,
            )}
            {numeric(
              "Cancellation cutoff (minutes, optional)",
              "cancellationCutoffMinutes",
              10080,
              0,
              true,
            )}
            {numeric(
              "Late after (minutes, optional)",
              "lateAfterMinutes",
              1440,
              0,
              true,
            )}
          </div>
          <label className="mw-row">
            <span>
              I reviewed this timing policy and any cutoffs not yet set.
            </span>
            <input
              type="checkbox"
              required
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
            />
          </label>
          <button className="secondary" disabled={!approved}>
            Save reviewed reservation policy
          </button>
        </fieldset>
      </form>
    </section>
  );
}
