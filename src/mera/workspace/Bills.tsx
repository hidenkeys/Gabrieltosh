import { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { formatMoney } from "./api";
import {
  Action,
  DataRegion,
  Disclosure,
  ReadState,
} from "../ui/OperationalPrimitives";
type Props = {
  bills: unknown;
  visits?: unknown;
  tables?: unknown;
  base: string;
  disabled: boolean;
  canPay: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
const amount = (value: unknown) =>
  Number.isSafeInteger(value) ? formatMoney(value as number) : "Unavailable";
const name = (bill: any) =>
  (typeof bill.name === "string" && bill.name) ||
  (typeof bill.reference === "string" && bill.reference) ||
  "Unnamed bill";
const status = (value: string) =>
  (
    ({ open: "Open", closed: "Closed", merged: "Merged" }) as Record<
      string,
      string
    >
  )[value] || "Status unavailable";
type Pending = {
  path: string;
  body: any;
  message: string;
  kind: "payment" | "change";
};
export default function Bills(props: Props) {
  return <ScopedBills key={props.base} {...props} />;
}
function ScopedBills({
  bills,
  visits = [],
  tables = [],
  base,
  disabled,
  canPay,
  save,
}: Props) {
  const available =
    Array.isArray(bills) && bills.every((b) => b && typeof b.id === "string");
  const rows: any[] = available ? (bills as any[]) : [];
  const [form, setForm] = useState<any>({}),
    [items, setItems] = useState<Record<string, number>>({}),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [pending, setPending] = useState<Pending | null>(null),
    [denied, setDenied] = useState(false);
  const active = useRef(true),
    inFlight = useRef(false),
    pendingRef = useRef<Pending | null>(null),
    permission = useRef(canPay),
    previousPermission = useRef(canPay);
  permission.current = canPay;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (previousPermission.current && !canPay) {
      setForm({});
      setItems({});
      if (inFlight.current || pendingRef.current) setDenied(true);
    }
    previousPermission.current = canPay;
  }, [canPay]);
  const current = rows.find((b) => b.id === form.billId && b.status === "open");
  const update = (key: string, value: any) => {
    if (!inFlight.current && !pendingRef.current && !denied)
      setForm((old: any) => ({ ...old, [key]: value }));
  };
  const locked = disabled || working || !!pending || !canPay;
  function remember(value: Pending | null) {
    pendingRef.current = value;
    setPending(value);
  }
  const perform = async (
    path: string,
    body: any,
    message: string,
    retry = false,
  ) => {
    if (
      disabled ||
      !permission.current ||
      denied ||
      inFlight.current ||
      (!retry && pendingRef.current)
    )
      return;
    const attempt = retry
      ? pendingRef.current
      : {
          path,
          body: JSON.parse(JSON.stringify(body)),
          message,
          kind: body.requestKey ? ("payment" as const) : ("change" as const),
        };
    if (!attempt || (retry && attempt.kind !== "payment")) return;
    const wasUnknown = !!pendingRef.current;
    inFlight.current = true;
    setWorking(true);
    setError("");
    try {
      await save(base + attempt.path, "POST", attempt.body, attempt.message);
      if (!active.current || !permission.current) return;
      remember(null);
      setItems({});
      setForm({ billId: form.billId });
    } catch (failure: any) {
      if (!active.current) return;
      if (
        wasUnknown ||
        !failure.status ||
        failure.status >= 500 ||
        failure.name === "AbortError"
      )
        remember(attempt);
      if ([401, 403, 404].includes(failure.status)) {
        setDenied(true);
        setForm({});
        setItems({});
      }
      setError(failure.message || "The bill update could not be confirmed.");
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  };
  const party = (bill: any) => {
    if (!bill.visitId) return "Visit not recorded";
    const visit = (Array.isArray(visits) ? visits : []).find(
      (v) => v && v.id === bill.visitId,
    );
    const label =
      (typeof bill.visitName === "string" && bill.visitName) ||
      visit?.displayName;
    const tableName =
      visit?.tableName ||
      (Array.isArray(tables) ? tables : []).find(
        (t) => t && t.id === visit?.tableId,
      )?.name;
    return [label || "Party details unavailable", tableName]
      .filter(Boolean)
      .join(" · ");
  };
  if (denied)
    return (
      <section className="mw-card mw-bills">
        <h2>Shared bills</h2>
        <ReadState
          kind="unavailable"
          title="Access to these bills needs checking. Refresh the workspace or sign in again before continuing."
        />
      </section>
    );
  return (
    <section className="mw-card mw-bills">
      <h2>Shared bills</h2>
      <p>
        Split outstanding amounts or whole item units. Recorded payments stay
        attached; merging is limited to the same open visit.
      </p>
      {!available ? (
        <ReadState
          kind="unavailable"
          title="Bill records are unavailable. Refresh the workspace before continuing."
        />
      ) : !rows.length ? (
        <ReadState
          kind="empty"
          title="Bills appear when visits receive orders."
        />
      ) : (
        <DataRegion label="Visit bills" className="mw-bill-records">
          {rows.map((bill) => (
            <article className="mw-bill-record" key={bill.id}>
              <header>
                <div>
                  <h3>{name(bill)}</h3>
                  <p>{party(bill)}</p>
                </div>
                <span className="mw-pill">{status(bill.status)}</span>
              </header>
              <dl>
                <div>
                  <dt>Total</dt>
                  <dd>{amount(bill.total)}</dd>
                </div>
                <div>
                  <dt>Paid</dt>
                  <dd>{amount(bill.paid)}</dd>
                </div>
                <div>
                  <dt>
                    {Number.isSafeInteger(bill.balance) && bill.balance < 0
                      ? "Credit held"
                      : "Due"}
                  </dt>
                  <dd>
                    {amount(
                      Number.isSafeInteger(bill.balance) && bill.balance < 0
                        ? -bill.balance
                        : bill.balance,
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </DataRegion>
      )}
      {error && (
        <p role="alert" className="mw-note mw-error">
          {error}
        </p>
      )}
      {pending && canPay && (
        <div role="status" className="mw-bill-pending">
          <strong>
            {pending.kind === "payment"
              ? "Collection not confirmed"
              : "Bill change not confirmed"}
          </strong>
          <p>
            {pending.kind === "payment"
              ? "The original amount and reference are locked. Check the original financial record in this workspace or retry only this same collection."
              : "This split or merge may already have been saved. Other bill changes are paused. Ask an administrator to review the latest bills before making another change; this screen cannot safely retry or discard it."}
          </p>
          <p>
            Refreshing or leaving this view does not cancel the original
            request. Keep this view open until its outcome is checked.
          </p>
          {pending.kind === "payment" && (
            <>
              <dl>
                <div>
                  <dt>Original amount</dt>
                  <dd>{amount(pending.body.amount)}</dd>
                </div>
                <div>
                  <dt>Original reference</dt>
                  <dd>{pending.body.reference || "Not recorded"}</dd>
                </div>
              </dl>
              <Action
                disabled={disabled}
                pending={working}
                onClick={() => void perform("", {}, "", true)}
              >
                Retry original bill collection
              </Action>
            </>
          )}
        </div>
      )}
      <label className="mw-form">
        Bill to manage
        <select
          disabled={!available || working || !!pending}
          value={form.billId || ""}
          onChange={(e) => {
            if (inFlight.current || pendingRef.current) return;
            setForm({ billId: e.target.value });
            setItems({});
          }}
        >
          <option value="">Select an open bill</option>
          {rows
            .filter((b) => b.status === "open")
            .map((b) => (
              <option key={b.id} value={b.id}>
                {name(b)} ·{" "}
                {Number.isSafeInteger(b.balance) && b.balance < 0
                  ? "Credit held " + amount(-b.balance)
                  : amount(b.balance)}
              </option>
            ))}
        </select>
      </label>
      {current && (
        <Disclosure
          summary="Bill items and payments"
          className="mw-bill-detail"
        >
          <p>{party(current)}</p>
          {Array.isArray(current.charges) ? (
            current.charges.map((charge: any) => (
              <div className="mw-bill-charge" key={charge.id}>
                <span>
                  {Number.isSafeInteger(charge.quantity)
                    ? `${charge.quantity} × `
                    : ""}
                  {charge.name || "Recorded charge"}
                </span>
                <strong>{amount(charge.amount)}</strong>
              </div>
            ))
          ) : (
            <p>Item detail unavailable.</p>
          )}
          <p>
            {Array.isArray(current.allocations)
              ? `${current.allocations.length} payment entries applied`
              : "Payment detail unavailable."}
          </p>
        </Disclosure>
      )}
      {current && canPay && (
        <>
          <fieldset className="mw-bill-tools" disabled={locked}>
            <Disclosure summary="Split this bill" className="mw-bill-tool">
              <form
                className="mw-form"
                style={{ marginTop: 20 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const body =
                    form.splitMode === "items"
                      ? {
                          items: Object.entries(items)
                            .filter(([, quantity]) => quantity > 0)
                            .map(([chargeId, quantity]) => ({
                              chargeId,
                              quantity,
                            })),
                          name: form.name,
                        }
                      : {
                          amount: Math.round(Number(form.amount) * 100),
                          name: form.name,
                        };
                  perform(
                    `/bills/${current.id}/split`,
                    body,
                    "Bill split. Original payment allocations preserved.",
                  );
                }}
              >
                <label>
                  New bill name
                  <input
                    required
                    maxLength={80}
                    value={form.name || ""}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </label>
                <label>
                  Split by
                  <select
                    value={form.splitMode || "amount"}
                    onChange={(e) => update("splitMode", e.target.value)}
                  >
                    <option value="amount">Outstanding amount</option>
                    <option value="items">Whole item units</option>
                  </select>
                </label>
                {form.splitMode === "items" ? (
                  <fieldset className="mw-wide">
                    <legend>Items to move</legend>
                    {(Array.isArray(current.charges)
                      ? current.charges
                      : []
                    ).map((charge: any) => (
                      <label className="mw-row" key={charge.id}>
                        <span>
                          {charge.name} · {amount(charge.amount)}
                        </span>
                        <input
                          aria-label={"Move quantity of " + charge.name}
                          type="number"
                          min="0"
                          max={charge.quantity || 0}
                          disabled={
                            locked ||
                            !Number.isSafeInteger(charge.quantity) ||
                            charge.quantity <= 0
                          }
                          value={items[charge.id] || 0}
                          onChange={(e) => {
                            if (inFlight.current || pendingRef.current) return;
                            setItems({
                              ...items,
                              [charge.id]: Number(e.target.value),
                            });
                          }}
                        />
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <label>
                    Amount to move (naira)
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={
                        Number.isSafeInteger(current.balance)
                          ? Math.max(0, current.balance) / 100
                          : undefined
                      }
                      required
                      value={form.amount || ""}
                      onChange={(e) => update("amount", e.target.value)}
                    />
                  </label>
                )}
                <div className="mw-wide">
                  <button
                    className="secondary"
                    disabled={
                      locked ||
                      !Number.isSafeInteger(current.balance) ||
                      current.balance <= 0
                    }
                  >
                    Split bill
                  </button>
                </div>
              </form>
            </Disclosure>
            <Disclosure summary="Merge another bill" className="mw-bill-tool">
              <form
                className="mw-form"
                style={{ marginTop: 20 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  perform(
                    `/bills/${current.id}/merge`,
                    { sourceBillIds: [form.sourceBill] },
                    "Bills merged with allocations retained.",
                  );
                }}
              >
                <label>
                  Merge another bill into this one
                  <select
                    required
                    value={form.sourceBill || ""}
                    onChange={(e) => update("sourceBill", e.target.value)}
                  >
                    <option value="">Choose another bill in this visit</option>
                    {rows
                      .filter(
                        (b) =>
                          b.id !== current.id &&
                          b.status === "open" &&
                          b.visitId === current.visitId,
                      )
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {name(b)}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="mw-wide">
                  <button className="secondary" disabled={disabled}>
                    Merge into selected bill
                  </button>
                </div>
              </form>
            </Disclosure>
            {canPay && (
              <Disclosure
                summary="Record money received"
                className="mw-bill-tool"
              >
                <form
                  className="mw-form"
                  style={{ marginTop: 20 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    perform(
                      `/bills/${current.id}/payments`,
                      {
                        requestKey: uuid(),
                        amount: Math.round(Number(form.paymentAmount) * 100),
                        method: form.method || "cash",
                        reference: form.reference || "",
                      },
                      "Bill collection recorded.",
                    );
                  }}
                >
                  <label>
                    Amount received (naira)
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={
                        Number.isSafeInteger(current.balance)
                          ? Math.max(0, current.balance) / 100
                          : undefined
                      }
                      value={form.paymentAmount || ""}
                      onChange={(e) => update("paymentAmount", e.target.value)}
                    />
                  </label>
                  <label>
                    Method
                    <select
                      value={form.method || "cash"}
                      onChange={(e) => update("method", e.target.value)}
                    >
                      <option value="cash">Cash</option>
                      <option value="external_pos">External POS</option>
                      <option value="external_transfer">
                        Verified external transfer
                      </option>
                    </select>
                  </label>
                  <label>
                    Verified reference
                    <input
                      required={form.method === "external_transfer"}
                      value={form.reference || ""}
                      onChange={(e) => update("reference", e.target.value)}
                    />
                  </label>
                  <div className="mw-wide">
                    <button
                      className="primary"
                      disabled={
                        locked ||
                        !Number.isSafeInteger(current.balance) ||
                        current.balance <= 0
                      }
                    >
                      Record bill collection
                    </button>
                  </div>
                </form>
              </Disclosure>
            )}
          </fieldset>
        </>
      )}
      {!canPay && (
        <p className="mw-note">
          Bill details are read-only for this role. Splitting, merging and
          recording payments require payment authority.
        </p>
      )}
    </section>
  );
}
