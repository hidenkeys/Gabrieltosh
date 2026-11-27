import DateTimePicker from "../ui/DateTimePicker";
import DateRangePresets from "../ui/DateRangePresets";
import React, { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi, formatMoney } from "./api";
type Props = {
  billingEnabled?: boolean;
  organizationId: string;
  disabled: boolean;
  showServiceSummary?: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export default function Invoices(props: Props) {
  if (props.billingEnabled !== true) return null;
  return <ScopedInvoices key={props.organizationId} {...props} />;
}
function ScopedInvoices({
  organizationId,
  disabled,
  save,
  showServiceSummary = true,
}: Props) {
  const base = "/organizations/" + encodeURIComponent(organizationId);
  const [data, setData] = useState<any>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [periodPreset, setPeriodPreset] = useState("custom");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<any>(null);
  const active = useRef(true),
    generation = useRef(0);
  const read = async (signal?: AbortSignal) => {
    const version = ++generation.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await workspaceApi(
        base + "/billing",
        "GET",
        undefined,
        signal,
      );
      if (!active.current || signal?.aborted || version !== generation.current)
        return;
      if (
        !result ||
        !Array.isArray(result.invoices) ||
        result.invoices.some(
          (invoice: any) =>
            !invoice ||
            typeof invoice.id !== "string" ||
            typeof invoice.periodStart !== "string" ||
            typeof invoice.periodEnd !== "string",
        )
      )
        throw new Error("Invalid billing response");
      setData(result);
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === generation.current &&
        failure.name !== "AbortError"
      )
        setLoadError("Billing records could not be loaded. Try again.");
    } finally {
      if (active.current && !signal?.aborted && version === generation.current)
        setLoading(false);
    }
  };
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void read(controller.signal);
    return () => {
      active.current = false;
      generation.current++;
      controller.abort();
    };
  }, [base]);
  const submitInvoice = async (body: any) => {
    if (disabled || busy) return;
    setBusy(true);
    setError("");
    try {
      await save(
        base + "/invoices",
        "POST",
        body,
        "Draft invoice recorded; no charge was made.",
      );
      if (!active.current) return;
      setPending(null);
      await read();
    } catch (failure: any) {
      if (active.current) {
        setError(failure.message);
        if (pending || !failure.status || failure.status >= 500)
          setPending(body);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  };
  return (
    <section className="mw-card mw-billing-invoice-records">
      <h2>
        {showServiceSummary ? "Invoices & service availability" : "Invoices"}
      </h2>
      <div className="mw-note">
        Proposed billing only. Creating a draft invoice does not debit an
        account, activate recurring billing or approve an unresolved commercial
        policy.
      </div>
      {error && <p role="alert">{error}</p>}
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy || loading}
            onClick={() => void read()}
          >
            Retry loading billing records
          </button>
        </div>
      )}
      {loading && <p role="status">Loading billing records…</p>}
      {!data ? null : (
        <>
          {showServiceSummary && (
            <p>Subscription: {data.subscription?.status || "Unconfigured"}</p>
          )}
          {data.entitlements?.warning && (
            <p role="status" className="mw-note">
              {data.entitlements.warning}
            </p>
          )}
          {showServiceSummary && data.entitlements && (
            <dl>
              {[
                [
                  "Effective subscription state",
                  data.entitlements.effectiveState || "Unavailable",
                ],
                [
                  "New orders",
                  typeof data.entitlements.newOrdersAllowed !== "boolean"
                    ? "Unavailable"
                    : data.entitlements.newOrdersAllowed
                      ? "Allowed"
                      : "Restricted",
                ],
                [
                  "Existing paid orders",
                  typeof data.entitlements.existingPaidOrdersContinue !==
                  "boolean"
                    ? "Unavailable"
                    : data.entitlements.existingPaidOrdersContinue
                      ? "Continue service"
                      : "Review required",
                ],
                [
                  "Report exports",
                  typeof data.entitlements.exportsAllowed !== "boolean"
                    ? "Unavailable"
                    : data.entitlements.exportsAllowed
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
          {loadError ? (
            <p>
              Refresh records before relying on the previously loaded invoice
              list.
            </p>
          ) : !data.invoices.length ? (
            <p>No invoices recorded.</p>
          ) : (
            data.invoices.map((invoice: any) => (
              <article className="mw-card" key={invoice.id}>
                <h3>
                  {invoice.status} ·{" "}
                  {Number.isSafeInteger(invoice.amount)
                    ? formatMoney(invoice.amount, invoice.currency || "NGN")
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
          <details className="mw-invoice-create">
            <summary>
              {pending
                ? "Review unconfirmed invoice"
                : "Create a proposed invoice"}
            </summary>
            <p>
              A proposed invoice is a billing record only. It does not charge an
              account or activate recurring payments.
            </p>
            {pending && (
              <div className="mw-note" role="status">
                <strong>Invoice creation unconfirmed</strong>
                <p>
                  The original period and request are retained. Retry only that
                  original submission; refreshing an empty list does not prove
                  it failed.
                </p>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void submitInvoice(pending)}
                >
                  Retry original invoice creation
                </button>
              </div>
            )}
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (pending || disabled || busy || loadError || loading) return;
                if (
                  !Number.isFinite(Date.parse(start)) ||
                  !Number.isFinite(Date.parse(end)) ||
                  new Date(end) <= new Date(start)
                ) {
                  setError("The invoice end must follow its start.");
                  return;
                }
                void submitInvoice({
                  periodStart: new Date(start).toISOString(),
                  periodEnd: new Date(end).toISOString(),
                  requestKey: uuid(),
                });
              }}
            >
              <fieldset
                disabled={
                  disabled || busy || !!pending || loading || !!loadError
                }
                className="mw-invoice-create-fields"
              >
                <div className="mw-form">
                  <DateRangePresets
                    label="Invoice period"
                    value={periodPreset}
                    onPresetChange={setPeriodPreset}
                    disabled={
                      disabled || busy || !!pending || loading || !!loadError
                    }
                    onChange={(range) => {
                      setStart(range.from + "T00:00");
                      const last = new Date(range.to + "T00:00");
                      last.setDate(last.getDate() + 1);
                      setEnd(
                        `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}T00:00`,
                      );
                    }}
                  />
                  <p>
                    Periods use this device’s local dates. The end is exclusive;
                    no charge is made by choosing a period.
                  </p>
                  <DateTimePicker
                    label="Period starts"
                    availabilityHint={false}
                    value={start}
                    onChange={(value) => {
                      setStart(value);
                      setPeriodPreset("custom");
                    }}
                    required
                    disabled={disabled || busy || !!pending}
                  />
                  <DateTimePicker
                    label="Period ends"
                    availabilityHint={false}
                    value={end}
                    onChange={(value) => {
                      setEnd(value);
                      setPeriodPreset("custom");
                    }}
                    required
                    disabled={disabled || busy || !!pending}
                  />
                  <button className="secondary" disabled={disabled || busy}>
                    Create proposed invoice
                  </button>
                </div>
              </fieldset>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
