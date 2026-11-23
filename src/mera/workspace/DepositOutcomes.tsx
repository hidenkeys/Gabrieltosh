import Combobox from "../ui/Combobox";
import Segmented from "../ui/Segmented";
import ReasonInput from "../ui/ReasonInput";
import MoneyInput from "../ui/MoneyInput";
import React, { useState } from "react";
import { uuid } from "../../api";
import { formatMoney, WorkspaceError } from "./api";
export default function DepositOutcomes({
  base,
  reservation,
  deposits,
  disabled,
  canManage,
  save,
}: {
  base: string;
  reservation: any;
  deposits: any[];
  disabled: boolean;
  canManage: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [depositId, setDepositId] = useState("");
  const [outcome, setOutcome] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [returned, setReturned] = useState(false);
  const [taxChoice, setTaxChoice] = useState("");
  const [tax, setTax] = useState("");
  const [pending, setPending] = useState<any>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const deposit = deposits.find((row) => row.id === depositId);
  const remaining = deposit?.unallocatedBalance || 0;
  const perform = async () => {
    const attempt = pending || {
      path:
        base +
        "/reservations/" +
        reservation.id +
        "/deposits/" +
        depositId +
        "/outcomes",
      body: {
        requestKey: uuid(),
        outcome,
        expectedRemaining: remaining,
        amount: outcome === "held" ? 0 : Math.round(Number(amount) * 100),
        reference,
        reason,
        policyReviewed: true,
        ...(outcome === "manual_return" ? { method } : {}),
        ...(outcome === "forfeit"
          ? {
              taxAmount:
                taxChoice === "unknown" ? null : Math.round(Number(tax) * 100),
            }
          : {}),
      },
    };
    setWorking(true);
    setError("");
    try {
      await save(
        attempt.path,
        "POST",
        attempt.body,
        "Reviewed deposit outcome recorded. No provider payout was initiated.",
      );
      setPending(null);
      setOutcome("");
      setAmount("");
      setMethod("");
      setReference("");
      setReason("");
      setReviewed(false);
      setReturned(false);
      setTaxChoice("");
      setTax("");
    } catch (e) {
      if (e instanceof WorkspaceError && (!e.status || e.status >= 500))
        setPending(attempt);
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <details>
      <summary>Unused deposit review</summary>
      <p>
        Review unused deposit funds against the booked policy. A manual return
        records money already returned outside Mera. Holding funds creates no
        financial posting. Eligible forfeiture is separate non-product income
        and requires an explicit tax review.
      </p>
      {error && <p role="alert">{error}</p>}
      {!deposits.length ? (
        <p>No deposits recorded for this booking.</p>
      ) : (
        <>
          {deposits.map((row, index) => (
            <div className="mw-row" key={row.id}>
              <span>
                {row.reference || `Deposit ${index + 1}`} ·{" "}
                {row.disposition?.replaceAll("_", " ") || "held unreviewed"}
              </span>
              <b>
                {formatMoney(row.unallocatedBalance)} unused ·{" "}
                {formatMoney(row.refunded || 0)} returned ·{" "}
                {formatMoney(row.forfeited || 0)} forfeited
              </b>
            </div>
          ))}
          {canManage && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform();
              }}
            >
              <fieldset
                disabled={disabled || working || !!pending}
                style={{ border: 0, padding: 0 }}
              >
                <div className="mw-form">
                  <Combobox
                    label="Deposit under review"
                    required
                    value={depositId}
                    onChange={(value) => {
                      setDepositId(value);
                      setReviewed(false);
                    }}
                    placeholder="Choose unused deposit"
                    options={deposits
                      .filter((row) => row.unallocatedBalance > 0)
                      .map((row, index) => ({
                        value: row.id,
                        label: row.reference || `Deposit ${index + 1}`,
                        description: formatMoney(row.unallocatedBalance),
                      }))}
                  />
                  <Segmented
                    label="Reviewed deposit outcome"
                    required
                    value={outcome}
                    onChange={(value) => {
                      setOutcome(value);
                      setReviewed(false);
                      setReturned(false);
                    }}
                    options={[
                      { value: "held", label: "Keep held pending review" },
                      {
                        value: "manual_return",
                        label: "Record completed manual return",
                      },
                      ...(["cancelled", "no_show"].includes(
                        reservation.status,
                      ) && !reservation.visitId
                        ? [
                            {
                              value: "forfeit",
                              label: "Eligible booked-policy forfeiture",
                            },
                          ]
                        : []),
                    ]}
                  />
                  {outcome && outcome !== "held" && (
                    <MoneyInput
                      label="Deposit outcome amount (naira)"
                      min={0.01}
                      max={remaining / 100}
                      required
                      value={String(amount)}
                      onChange={(value) => setAmount(value)}
                    />
                  )}
                  {outcome === "manual_return" && (
                    <>
                      <Segmented
                        label="Actual deposit return method"
                        required
                        value={method}
                        onChange={setMethod}
                        options={[
                          { value: "cash", label: "Cash returned" },
                          {
                            value: "external_pos",
                            label: "External POS refund",
                          },
                          {
                            value: "external_transfer",
                            label: "External transfer returned",
                          },
                        ]}
                      />
                      <label>
                        Deposit return reference
                        <input
                          required={method === "external_transfer"}
                          maxLength={200}
                          value={reference}
                          onChange={(event) => setReference(event.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {outcome === "forfeit" && (
                    <>
                      <Segmented
                        label="Forfeiture tax review"
                        required
                        value={taxChoice}
                        onChange={setTaxChoice}
                        options={[
                          {
                            value: "unknown",
                            label: "Tax amount remains unknown",
                          },
                          {
                            value: "known",
                            label: "Record reviewed tax amount",
                          },
                        ]}
                      />
                      {taxChoice === "known" && (
                        <MoneyInput
                          label="Forfeiture tax amount (naira)"
                          min={0}
                          max={Number(amount) || 0}
                          required
                          value={String(tax)}
                          onChange={(value) => setTax(value)}
                        />
                      )}
                    </>
                  )}
                </div>
                {deposit?.policySnapshot && (
                  <p className="mw-note">
                    Booked refund rule:{" "}
                    {String(
                      deposit.policySnapshot.refundRule || "not set",
                    ).replaceAll("_", " ")}
                    . The server checks eligibility and unused funds again
                    before recording this outcome.
                  </p>
                )}
                <ReasonInput
                  label="Deposit outcome reason"
                  required
                  minLength={10}
                  maxLength={500}
                  value={reason}
                  onChange={setReason}
                  presets={[
                    "Booked policy reviewed",
                    "Return verified manually",
                    "Keep held for policy review",
                    "Eligible forfeiture reviewed",
                  ]}
                />
                <label className="mw-row">
                  <span>
                    I reviewed the booked policy and verified this outcome.
                  </span>
                  <input
                    type="checkbox"
                    required
                    checked={reviewed}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                </label>
                {outcome === "manual_return" && (
                  <label className="mw-row">
                    <span>
                      I verified the deposit money was already returned
                      manually.
                    </span>
                    <input
                      type="checkbox"
                      required
                      checked={returned}
                      onChange={(event) => setReturned(event.target.checked)}
                    />
                  </label>
                )}
                <button
                  className="secondary"
                  disabled={
                    !deposit ||
                    !outcome ||
                    !reviewed ||
                    (outcome === "manual_return" && !returned) ||
                    (outcome === "forfeit" && !taxChoice)
                  }
                >
                  Record reviewed deposit outcome
                </button>
              </fieldset>
            </form>
          )}
        </>
      )}
      {pending && (
        <button disabled={disabled || working} onClick={() => void perform()}>
          Retry original deposit outcome
        </button>
      )}
    </details>
  );
}
