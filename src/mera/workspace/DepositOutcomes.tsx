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
          {deposits.map((row) => (
            <div className="mw-row" key={row.id}>
              <span>
                {row.reference || row.id.slice(0, 8)} ·{" "}
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
                  <label>
                    Deposit under review
                    <select
                      required
                      value={depositId}
                      onChange={(event) => {
                        setDepositId(event.target.value);
                        setReviewed(false);
                      }}
                    >
                      <option value="">Choose unused deposit</option>
                      {deposits
                        .filter((row) => row.unallocatedBalance > 0)
                        .map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.reference || row.id.slice(0, 8)} ·{" "}
                            {formatMoney(row.unallocatedBalance)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Reviewed deposit outcome
                    <select
                      required
                      value={outcome}
                      onChange={(event) => {
                        setOutcome(event.target.value);
                        setReviewed(false);
                        setReturned(false);
                      }}
                    >
                      <option value="">Choose an outcome</option>
                      <option value="held">Keep held pending review</option>
                      <option value="manual_return">
                        Record completed manual return
                      </option>
                      {["cancelled", "no_show"].includes(reservation.status) &&
                        !reservation.visitId && (
                          <option value="forfeit">
                            Eligible booked-policy forfeiture
                          </option>
                        )}
                    </select>
                  </label>
                  {outcome && outcome !== "held" && (
                    <label>
                      Deposit outcome amount (naira)
                      <input
                        required
                        type="number"
                        min="0.01"
                        max={remaining / 100}
                        step="0.01"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                      />
                    </label>
                  )}
                  {outcome === "manual_return" && (
                    <>
                      <label>
                        Actual deposit return method
                        <select
                          required
                          value={method}
                          onChange={(event) => setMethod(event.target.value)}
                        >
                          <option value="">
                            Choose actual completed return
                          </option>
                          <option value="cash">Cash returned</option>
                          <option value="external_pos">
                            External POS refund
                          </option>
                          <option value="external_transfer">
                            External transfer returned
                          </option>
                        </select>
                      </label>
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
                      <label>
                        Forfeiture tax review
                        <select
                          required
                          value={taxChoice}
                          onChange={(event) => setTaxChoice(event.target.value)}
                        >
                          <option value="">
                            Choose reviewed tax treatment
                          </option>
                          <option value="unknown">
                            Tax amount remains unknown
                          </option>
                          <option value="known">
                            Record reviewed tax amount
                          </option>
                        </select>
                      </label>
                      {taxChoice === "known" && (
                        <label>
                          Forfeiture tax amount (naira)
                          <input
                            required
                            type="number"
                            min={0}
                            max={Number(amount) || 0}
                            step="0.01"
                            value={tax}
                            onChange={(event) => setTax(event.target.value)}
                          />
                        </label>
                      )}
                    </>
                  )}
                </div>
                {deposit?.policySnapshot && (
                  <p className="mw-note">
                    Booked refund rule:{" "}
                    {String(
                      deposit.policySnapshot.refundRule || "unresolved",
                    ).replaceAll("_", " ")}
                    . The server checks eligibility and unused funds again
                    before recording this outcome.
                  </p>
                )}
                <label>
                  Deposit outcome reason
                  <textarea
                    required
                    minLength={10}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
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
