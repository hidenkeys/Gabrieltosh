import React, { useEffect, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi, formatMoney } from "./api";
export default function Invoices({
  organizationId,
  disabled,
  save,
}: {
  organizationId: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const base = "/organizations/" + encodeURIComponent(organizationId);
  const [data, setData] = useState<any>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    workspaceApi(base + "/billing", "GET", undefined, controller.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [base]);
  return (
    <section className="mw-card">
      <h2>Invoices & entitlement history</h2>
      <div className="mw-note">
        Proposed billing only. Creating a draft invoice does not debit an
        account, activate recurring billing or approve an unresolved commercial
        policy.
      </div>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p role="status">Loading billing records…</p>
      ) : (
        <>
          <p>Subscription: {data.subscription?.status || "Unconfigured"}</p>
          {data.entitlements?.warning && (
            <p role="status" className="mw-note">
              {data.entitlements.warning}
            </p>
          )}
          {data.entitlements && (
            <dl>
              {[
                [
                  "Effective subscription state",
                  data.entitlements.effectiveState,
                ],
                [
                  "New orders",
                  data.entitlements.newOrdersAllowed ? "Allowed" : "Restricted",
                ],
                [
                  "Existing paid orders",
                  data.entitlements.existingPaidOrdersContinue
                    ? "Continue service"
                    : "Review required",
                ],
                [
                  "Report exports",
                  data.entitlements.exportsAllowed
                    ? "Available with permission"
                    : "Restricted",
                ],
                [
                  "Configured restriction time",
                  data.entitlements.restrictionAt
                    ? new Date(data.entitlements.restrictionAt).toLocaleString()
                    : "Not configured",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (new Date(end) <= new Date(start)) {
                setError("The invoice end must follow its start.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await save(
                  base + "/invoices",
                  "POST",
                  {
                    periodStart: new Date(start).toISOString(),
                    periodEnd: new Date(end).toISOString(),
                    requestKey: uuid(),
                  },
                  "Draft invoice recorded; no charge was made.",
                );
                setData(await workspaceApi(base + "/billing"));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="mw-form">
              <label>
                Period starts
                <input
                  required
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                Period ends
                <input
                  required
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
              <button className="secondary" disabled={disabled || busy}>
                Create proposed invoice
              </button>
            </div>
          </form>
          {!data.invoices?.length ? (
            <p>No invoices recorded.</p>
          ) : (
            data.invoices.map((invoice: any) => (
              <article className="mw-card" key={invoice.id}>
                <h3>
                  {invoice.status} ·{" "}
                  {Number.isSafeInteger(invoice.amount)
                    ? formatMoney(invoice.amount)
                    : "Amount unresolved"}
                </h3>
                <p>
                  {new Date(invoice.periodStart).toLocaleDateString()} –{" "}
                  {new Date(invoice.periodEnd).toLocaleDateString()}
                </p>
                <details>
                  <summary>Policy applied to this invoice</summary>
                  <pre style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(invoice.policySnapshot, null, 2)}
                  </pre>
                </details>
              </article>
            ))
          )}
        </>
      )}
    </section>
  );
}
