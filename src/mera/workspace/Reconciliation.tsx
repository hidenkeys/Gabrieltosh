import React, { useEffect, useState } from "react";
import { uuid } from "../../api";
import { formatMoney, workspaceApi, WorkspaceError } from "./api";
async function readReconciliation(base: string, signal?: AbortSignal) {
  const result = await workspaceApi(
    base + "/reconciliation",
    "GET",
    undefined,
    signal,
  );
  if (!Array.isArray(result?.transactions))
    throw new Error(
      "The reconciliation response is invalid. Refresh before continuing.",
    );
  return result;
}
export default function Reconciliation({
  base,
  orders,
  demo,
  disabled,
  save,
}: {
  base: string;
  orders: any[];
  demo: boolean;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [pending, setPending] = useState<any>(null);
  const [draft, setDraft] = useState({
    transactionId: "",
    orderId: "",
    sequence: 1,
    type: "collection_reported",
    amount: "",
  });
  useEffect(() => {
    const controller = new AbortController();
    readReconciliation(base, controller.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [base]);
  const record = async () => {
    const body = pending || {
      ...draft,
      eventId: uuid(),
      amount: Math.round(Number(draft.amount) * 100),
      occurredAt: new Date().toISOString(),
    };
    setWorking(true);
    setError("");
    try {
      await save(
        base + "/provider-simulator/events",
        "POST",
        body,
        "Simulator observation recorded. No funds moved and no order payment was confirmed.",
      );
      setPending(null);
      setData(await readReconciliation(base));
    } catch (e) {
      if (e instanceof WorkspaceError && (!e.status || e.status >= 500))
        setPending(body);
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="mw-card">
      <h2>Payment reconciliation</h2>
      <div className="mw-note">
        <strong>Internal test adapter · no money movement</strong>
        <p>
          Observed events never confirm an order or prove a settlement. Matching
          requires the exact transaction ID on the internal payment/refund
          reference. Live provider contracts remain unverified.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {demo && (
        <details>
          <summary>Record a simulator observation</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void record();
            }}
          >
            <fieldset
              disabled={disabled || working || !!pending}
              style={{ border: 0, padding: 0 }}
            >
              <div className="mw-form">
                <label>
                  Simulator transaction ID
                  <input
                    required
                    minLength={3}
                    maxLength={120}
                    value={draft.transactionId}
                    onChange={(event) =>
                      setDraft({ ...draft, transactionId: event.target.value })
                    }
                  />
                </label>
                <label>
                  Simulator order
                  <select
                    required
                    value={draft.orderId}
                    onChange={(event) =>
                      setDraft({ ...draft, orderId: event.target.value })
                    }
                  >
                    <option value="">Choose an order</option>
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.reference || order.id.slice(0, 8)} ·{" "}
                        {order.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Event sequence
                  <input
                    required
                    type="number"
                    min={1}
                    step={1}
                    value={draft.sequence}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        sequence: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Observation type
                  <select
                    value={draft.type}
                    onChange={(event) =>
                      setDraft({ ...draft, type: event.target.value })
                    }
                  >
                    {[
                      "collection_reported",
                      "refund_reported",
                      "settlement_reported",
                    ].map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Observed amount (naira)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={draft.amount}
                    onChange={(event) =>
                      setDraft({ ...draft, amount: event.target.value })
                    }
                  />
                </label>
              </div>
              <button className="secondary">Record test observation</button>
            </fieldset>
          </form>
          {pending && (
            <button
              disabled={working || disabled}
              onClick={() => void record()}
            >
              Retry original observation
            </button>
          )}
        </details>
      )}
      {!data ? (
        error ? null : (
          <p role="status">Loading reconciliation records…</p>
        )
      ) : !data.transactions.length ? (
        <p>No provider observations recorded for this branch.</p>
      ) : (
        data.transactions.map((row: any) => (
          <article className="mw-card" key={row.transactionId}>
            <h3>
              {row.reference || row.orderId} · {row.status}
            </h3>
            <p>
              Transaction {row.transactionId} · Settlement{" "}
              {row.settlementStatus}
            </p>
            {row.missingSequences.length > 0 && (
              <p>Missing event sequences: {row.missingSequences.join(", ")}</p>
            )}
            <div className="mw-grid">
              {[
                ["Reported collection", row.reportedCollection],
                ["Internal collection", row.internalCollection],
                ["Reported refund", row.reportedRefund],
                ["Internal refund", row.internalRefund],
                ["Reported settlement (unverified)", row.reportedSettlement],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <p>{formatMoney(Number(value))}</p>
                </div>
              ))}
            </div>
            <p>
              Fee policy: {row.fee.status} · Assessed{" "}
              {Number.isSafeInteger(row.fee.assessed)
                ? formatMoney(row.fee.assessed)
                : "unresolved"}{" "}
              · Refunded{" "}
              {Number.isSafeInteger(row.fee.refunded)
                ? formatMoney(row.fee.refunded)
                : "unresolved"}{" "}
              · Collected {formatMoney(row.fee.collected)} · Settled{" "}
              {formatMoney(row.fee.settled)}
            </p>
            <p>
              Proposed merchant entitlement:{" "}
              {Number.isSafeInteger(row.merchantEntitlement)
                ? formatMoney(row.merchantEntitlement)
                : "unresolved"}
            </p>
          </article>
        ))
      )}
    </section>
  );
}
