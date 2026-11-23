import Combobox from "../ui/Combobox";
import Segmented from "../ui/Segmented";
import Stepper from "../ui/Stepper";
import MoneyInput from "../ui/MoneyInput";
import React, { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { formatMoney, workspaceApi, WorkspaceError } from "./api";
import {
  Action,
  Disclosure,
  DataRegion,
  ReadState,
} from "../ui/OperationalPrimitives";
type Props = {
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
};
const human = (value: any) =>
  String(value || "Not recorded").replaceAll("_", " ");
const money = (value: any) =>
  Number.isSafeInteger(value) ? formatMoney(value) : "Unresolved";
export default function Reconciliation(props: Props) {
  return <ScopedReconciliation key={props.base} {...props} />;
}
function ScopedReconciliation({ base, orders, demo, disabled, save }: Props) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [readError, setReadError] = useState(""),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [pending, setPending] = useState<any>(null),
    [denied, setDenied] = useState(false);
  const [draft, setDraft] = useState({
    transactionId: "",
    orderId: "",
    sequence: 1,
    type: "collection_reported",
    amount: "",
  });
  const active = useRef(true),
    readId = useRef(0),
    inFlight = useRef(false),
    pendingRef = useRef<any>(null);
  async function load(signal?: AbortSignal) {
    const id = ++readId.current;
    setLoading(true);
    try {
      const result = await workspaceApi(
        base + "/reconciliation",
        "GET",
        undefined,
        signal,
      );
      if (!active.current || signal?.aborted || id !== readId.current) return;
      if (!Array.isArray(result?.transactions))
        throw Error(
          "Reconciliation records could not be confirmed. Refresh before continuing.",
        );
      setData(result);
      setReadError("");
    } catch (e) {
      if (
        active.current &&
        id === readId.current &&
        (e as Error).name !== "AbortError"
      ) {
        setReadError((e as Error).message);
        if ([401, 403, 404].includes((e as any).status)) {
          setDenied(true);
          setData(null);
        }
      }
    } finally {
      if (active.current && !signal?.aborted && id === readId.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      active.current = false;
      readId.current++;
      controller.abort();
    };
  }, [base]);
  async function record() {
    if (disabled || inFlight.current || denied || !demo) return;
    const wasUnconfirmed = !!pendingRef.current,
      body = pendingRef.current || {
        ...draft,
        eventId: uuid(),
        amount: Math.round(Number(draft.amount) * 100),
        occurredAt: new Date().toISOString(),
      };
    inFlight.current = true;
    setWorking(true);
    setError("");
    try {
      await save(
        base + "/provider-simulator/events",
        "POST",
        body,
        "Simulator observation recorded. No funds moved and no order payment was confirmed.",
      );
      if (!active.current) return;
      pendingRef.current = null;
      setPending(null);
      await load();
    } catch (e) {
      if (!active.current) return;
      if (
        wasUnconfirmed ||
        !(e instanceof WorkspaceError) ||
        !e.status ||
        e.status >= 500
      ) {
        pendingRef.current = body;
        setPending(body);
      }
      if ([401, 403, 404].includes((e as any).status)) {
        setDenied(true);
        setData(null);
      }
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }
  return (
    <section className="mw-card fo-reconciliation">
      <header className="fo-heading">
        <div>
          <h2>Payment reconciliation</h2>
          <p>
            Compare reported observations with recorded collections and refunds.
          </p>
        </div>
        <Action
          disabled={disabled || working}
          pending={loading}
          onClick={() => void load()}
        >
          Refresh reconciliation
        </Action>
      </header>
      <div className="fo-pending">
        <strong>Test observations · no money movement</strong>
        <p>
          These records do not confirm an order payment or prove settlement.
          Live provider access remains unverified.
        </p>
      </div>
      {error && (
        <p className="fo-error" role="alert">
          {error}
        </p>
      )}
      {denied ? (
        <ReadState
          kind="unavailable"
          title="Reconciliation access needs checking. Refresh your workspace or sign in again before continuing."
        />
      ) : (
        <>
          {loading && (
            <ReadState kind="loading" title="Loading reconciliation records…" />
          )}
          {readError && (
            <ReadState
              kind="error"
              title={readError}
              retry={() => void load()}
              retryLabel="Retry reconciliation"
              pending={loading}
            />
          )}
          {!loading && !readError && data && !data.transactions.length && (
            <ReadState
              kind="empty"
              title="No provider observations recorded for this branch."
            />
          )}
          {readError && data?.transactions?.length > 0 && (
            <p className="fo-muted">
              Showing previously loaded records. Refresh before relying on the
              matching state.
            </p>
          )}
          {data && data.transactions.length > 0 && (
            <DataRegion
              label="Reconciliation observations"
              className="fo-table-scroll"
            >
              <table className="fo-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Transaction</th>
                    <th>Matching</th>
                    <th>Reported collection</th>
                    <th>Recorded collection</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((row: any) => (
                    <tr key={row.transactionId}>
                      <td>{row.reference || "Order reference unavailable"}</td>
                      <td>{row.transactionId}</td>
                      <td>{human(row.status)}</td>
                      <td>{money(row.reportedCollection)}</td>
                      <td>{money(row.internalCollection)}</td>
                      <td>
                        <Disclosure summary="Observation details">
                          <dl className="fo-facts">
                            <div>
                              <dt>Order identity</dt>
                              <dd>{row.reference || "Not recorded"}</dd>
                            </div>
                            <div>
                              <dt>Settlement state</dt>
                              <dd>
                                {human(row.settlementStatus)} · unverified
                              </dd>
                            </div>
                            {[
                              ["Reported refund", row.reportedRefund],
                              ["Recorded refund", row.internalRefund],
                              [
                                "Reported settlement (unverified)",
                                row.reportedSettlement,
                              ],
                            ].map(([label, value]) => (
                              <div key={String(label)}>
                                <dt>{label}</dt>
                                <dd>{money(value)}</dd>
                              </div>
                            ))}
                          </dl>
                          {Array.isArray(row.missingSequences) &&
                            row.missingSequences.length > 0 && (
                              <p className="fo-error">
                                Missing event sequences:{" "}
                                {row.missingSequences.join(", ")}
                              </p>
                            )}
                          <h4>Fee assessment</h4>
                          <p>
                            {human(row.fee?.status)}. Assessed and proposed
                            values do not prove a collection.
                          </p>
                          <dl className="fo-facts">
                            {[
                              ["Assessed", row.fee?.assessed],
                              ["Refunded", row.fee?.refunded],
                              ["Collected", row.fee?.collected],
                              ["Settled", row.fee?.settled],
                              [
                                "Proposed merchant entitlement",
                                row.merchantEntitlement,
                              ],
                            ].map(([label, value]) => (
                              <div key={String(label)}>
                                <dt>{label}</dt>
                                <dd>{money(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        </Disclosure>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataRegion>
          )}
          {demo && (
            <Disclosure
              summary="Record a simulator observation"
              className="fo-simulator"
            >
              <p className="fo-muted">
                For internal testing only. This does not record a payment or
                move funds.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void record();
                }}
              >
                <fieldset
                  disabled={disabled || working || !!pending}
                  className="fo-fieldset"
                >
                  <div className="fo-form-grid">
                    <label>
                      Simulator transaction ID
                      <input
                        required
                        minLength={3}
                        maxLength={120}
                        value={draft.transactionId}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            transactionId: event.target.value,
                          })
                        }
                      />
                    </label>
                    <Combobox
                      label="Simulator order"
                      required
                      value={draft.orderId}
                      onChange={(value) =>
                        setDraft({ ...draft, orderId: value })
                      }
                      placeholder="Choose an order"
                      options={orders.map((order) => ({
                        value: order.id,
                        label: order.reference || "Reference unavailable",
                        description: [
                          order.displayName,
                          Number.isSafeInteger(order.total)
                            ? money(order.total)
                            : null,
                          typeof order.status === "string"
                            ? human(order.status)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · "),
                      }))}
                    />
                    <Stepper
                      label="Event sequence"
                      required
                      min={1}
                      value={draft.sequence}
                      onChange={(value) =>
                        setDraft({ ...draft, sequence: value })
                      }
                    />
                    <Segmented
                      label="Observation type"
                      value={draft.type}
                      onChange={(value) => setDraft({ ...draft, type: value })}
                      options={[
                        "collection_reported",
                        "refund_reported",
                        "settlement_reported",
                      ].map((value) => ({ value, label: human(value) }))}
                    />
                    <MoneyInput
                      label="Observed amount (naira)"
                      min={0.01}
                      required
                      value={String(draft.amount)}
                      onChange={(value) =>
                        setDraft({ ...draft, amount: value })
                      }
                    />
                  </div>
                  <Action type="submit" pending={working}>
                    Record test observation
                  </Action>
                </fieldset>
              </form>
              {pending && (
                <div className="fo-pending">
                  <p role="status">
                    Observation not confirmed. Retry the original event; keep
                    this page open until checked. Refreshing loses this direct
                    retry, so check existing observations before starting again.
                  </p>
                  <Action
                    disabled={disabled}
                    pending={working}
                    onClick={() => void record()}
                  >
                    Retry original observation
                  </Action>
                </div>
              )}
            </Disclosure>
          )}
        </>
      )}
    </section>
  );
}
