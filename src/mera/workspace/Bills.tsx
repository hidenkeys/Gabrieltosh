import { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { formatMoney, workspaceApi } from "./api";
import {
  readBillChangeMarker,
  saveBillChangeMarker,
  clearBillChangeMarker,
  type BillChangeMarker,
} from "./billChangeJournal";
import {
  Action,
  DataRegion,
  Disclosure,
  ReadState,
} from "../ui/OperationalPrimitives";
type Props = {
  bills: unknown;
  actorId: string;
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
  return <ScopedBills key={props.base + "|" + props.actorId} {...props} />;
}
function ScopedBills({
  bills,
  actorId,
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
    [denied, setDenied] = useState(false),
    [changeMarker, setChangeMarker] = useState<BillChangeMarker | null>(null),
    [changeReady, setChangeReady] = useState(false),
    [notice, setNotice] = useState("");
  const markerRef = useRef<BillChangeMarker | null>(null);
  const active = useRef(true),
    inFlight = useRef(false),
    pendingRef = useRef<Pending | null>(null),
    permission = useRef(canPay),
    previousPermission = useRef(canPay);
  permission.current = canPay;
  useEffect(() => {
    active.current = true;
    try {
      const marker = readBillChangeMarker(actorId, base);
      markerRef.current = marker;
      setChangeMarker(marker);
      setChangeReady(true);
    } catch {
      setError(
        "Saved bill-change references could not be read. Keep this tab open and ask a supervisor to review them.",
      );
    }
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (previousPermission.current && !canPay) {
      setForm({});
      setItems({});
      if (inFlight.current || pendingRef.current || markerRef.current)
        setDenied(true);
      if (pendingRef.current?.kind === "change") remember(null);
    }
    previousPermission.current = canPay;
  }, [canPay]);
  const current = rows.find((b) => b.id === form.billId && b.status === "open");
  const selectedUnits = Object.entries(items).filter(
    ([, quantity]) => quantity > 0,
  );
  const itemSplitValid =
    selectedUnits.length > 0 &&
    selectedUnits.every(([id, quantity]) => {
      const charge = Array.isArray(current?.charges)
        ? current.charges.find((value: any) => value.id === id)
        : null;
      return (
        Number.isSafeInteger(quantity) &&
        quantity > 0 &&
        charge &&
        Number.isSafeInteger(charge.quantity) &&
        quantity <= charge.quantity
      );
    });
  const update = (key: string, value: any) => {
    if (
      !inFlight.current &&
      !pendingRef.current &&
      !markerRef.current &&
      !denied
    )
      setForm((old: any) => ({ ...old, [key]: value }));
  };
  const locked =
    disabled ||
    working ||
    !!pending ||
    !!changeMarker ||
    !changeReady ||
    !canPay;
  function remember(value: Pending | null) {
    pendingRef.current = value;
    setPending(value);
  }
  const attemptPath = (marker: BillChangeMarker) =>
    base +
    `/bills/${encodeURIComponent(marker.billId)}/change-attempts/${marker.operation}/${marker.requestKey}`;
  const validBill = (value: any) =>
    value &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    Array.isArray(value.charges) &&
    Array.isArray(value.allocations) &&
    Number.isSafeInteger(value.total) &&
    Number.isSafeInteger(value.paid) &&
    Number.isSafeInteger(value.balance);
  const normalizedIntent = (operation: string, body: any) =>
    operation === "split"
      ? {
          name: typeof body?.name === "string" ? body.name.trim() : body?.name,
          amount: body?.amount ?? null,
          items: body?.items ?? null,
        }
      : { sourceBillIds: body?.sourceBillIds };
  function validateProof(result: any, marker: BillChangeMarker) {
    const parts = base.split("/");
    if (
      !result ||
      result.requestKey !== marker.requestKey ||
      result.actorId !== actorId ||
      result.organizationId !== parts[2] ||
      result.branchId !== parts[4] ||
      result.billId !== marker.billId ||
      result.operation !== marker.operation ||
      !["recorded", "not_found", "abandoned"].includes(result.status)
    )
      throw Error(
        "The bill-change outcome could not be verified. Keep the saved reference and check again.",
      );
    if (result.status === "recorded") {
      const op = result.operationRecord,
        value = result.result;
      if (
        result.resultBasis !== "recorded_operation_snapshot" ||
        !op ||
        typeof op.id !== "string" ||
        !op.id.trim() ||
        op.requestKey !== marker.requestKey ||
        op.actorId !== actorId ||
        op.billId !== marker.billId ||
        op.operation !== marker.operation ||
        (marker.operation === "split"
          ? !validBill(value?.source) ||
            value.source.id !== marker.billId ||
            !validBill(value?.bill) ||
            value.bill.id === marker.billId
          : !validBill(value) || value.id !== marker.billId)
      )
        throw Error("The recorded bill change could not be verified.");
      const original = pendingRef.current;
      if (
        original?.kind === "change" &&
        JSON.stringify(normalizedIntent(marker.operation, original.body)) !==
          JSON.stringify(normalizedIntent(marker.operation, op.intent))
      )
        throw Error(
          "The recorded bill change differs from the original request. Ask a supervisor to review it.",
        );
    }
    if (
      result.status === "abandoned" &&
      (typeof result.resolutionId !== "string" || !result.resolutionId)
    )
      throw Error("The stopped bill change could not be verified.");
    return result;
  }
  async function inspectChange(marker: BillChangeMarker) {
    const proof = validateProof(
      await workspaceApi(attemptPath(marker), "GET", undefined, undefined, {
        expectedActorId: actorId,
      }),
      marker,
    );
    if (!active.current || !permission.current) return;
    if (proof.status === "not_found") {
      setNotice(
        "No completed bill change was found. This does not confirm that an in-flight request has stopped. Retry the original change or stop it before making a new one.",
      );
      return;
    }
    clearBillChangeMarker(marker);
    markerRef.current = null;
    setChangeMarker(null);
    remember(null);
    setItems({});
    setForm({ billId: marker.billId });
    setNotice(
      proof.status === "recorded"
        ? "The original bill change was recorded. Refresh the workspace to review the latest bills."
        : "The original bill change is stopped. It cannot be applied later. Review the latest bills before making a new change.",
    );
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
      !changeReady ||
      (!retry && (pendingRef.current || markerRef.current))
    )
      return;
    const attempt: Pending | null = retry
      ? pendingRef.current
      : {
          path,
          body: JSON.parse(JSON.stringify(body)),
          message,
          kind: path.endsWith("/payments") ? "payment" : "change",
        };
    if (!attempt) return;
    const wasUnknown = !!pendingRef.current;
    inFlight.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      if (attempt.kind === "change" && !retry) {
        const match = attempt.path.match(/^\/bills\/([^/]+)\/(split|merge)$/);
        if (!match) throw Error("This bill action is unavailable.");
        attempt.body.requestKey = uuid();
        let marker: BillChangeMarker;
        try {
          marker = saveBillChangeMarker({
            version: 1,
            actorId,
            base,
            billId: match[1],
            operation: match[2] as "split" | "merge",
            requestKey: attempt.body.requestKey,
          });
        } catch {
          setChangeReady(false);
          throw Error(
            "This tab could not save a recovery reference. No bill change was sent. Reload and review saved references before continuing.",
          );
        }
        markerRef.current = marker;
        setChangeMarker(marker);
        remember(attempt);
      }
      await save(
        base + attempt.path,
        "POST",
        attempt.body,
        attempt.kind === "change"
          ? "Bill change received; checking its recorded outcome."
          : attempt.message,
      );
      if (!active.current || !permission.current) return;
      if (attempt.kind === "change") {
        if (markerRef.current) await inspectChange(markerRef.current);
        return;
      }
      remember(null);
      setItems({});
      setForm({ billId: form.billId });
    } catch (failure: any) {
      if (!active.current) return;
      if (
        attempt.kind === "payment" &&
        (wasUnknown ||
          !failure.status ||
          failure.status >= 500 ||
          failure.name === "AbortError")
      )
        remember(attempt);
      if ([401, 403, 404].includes(failure.status)) {
        setDenied(true);
        setForm({});
        setItems({});
        if (attempt.kind === "change") remember(null);
      }
      setError(failure.message || "The bill update could not be confirmed.");
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  };
  async function recoverChange(stop = false) {
    const marker = markerRef.current;
    if (
      !marker ||
      disabled ||
      !permission.current ||
      denied ||
      inFlight.current ||
      !changeReady
    )
      return;
    inFlight.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      if (stop) {
        validateProof(
          await workspaceApi(
            attemptPath(marker) + "/abandon",
            "POST",
            { reason: "Staff explicitly stopped the unresolved bill change." },
            undefined,
            { expectedActorId: actorId },
          ),
          marker,
        );
      }
      if (active.current && permission.current) await inspectChange(marker);
    } catch (failure: any) {
      if (!active.current) return;
      if ([401, 403, 404].includes(failure.status)) {
        setDenied(true);
        setForm({});
        setItems({});
        remember(null);
      }
      setError(failure.message || "The bill change could not be checked.");
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }
  const party = (bill: any) => {
    if (bill.visitId === null) return "Counter bill";
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
      {notice && (
        <p role="status" className="mw-note">
          {notice}
        </p>
      )}
      {changeMarker && canPay && (
        <section className="mw-bill-pending" aria-label="Bill change recovery">
          <h3>Bill change not confirmed</h3>
          <p>
            A split or merge is waiting for a verified outcome. Refreshing bill
            records does not resolve it. This tab keeps only a recovery
            reference, without the bill name or change details.
          </p>
          <p>
            After leaving this screen, check the outcome or stop the original
            change. No request is sent automatically.
          </p>
          <Action
            disabled={disabled}
            pending={working}
            onClick={() => void recoverChange()}
          >
            Check bill change outcome
          </Action>
          {pending?.kind === "change" && (
            <Action
              disabled={disabled}
              pending={working}
              onClick={() => void perform("", {}, "", true)}
            >
              Retry original bill change
            </Action>
          )}
          <Action
            disabled={disabled}
            pending={working}
            onClick={() => void recoverChange(true)}
          >
            Stop original bill change
          </Action>
        </section>
      )}
      {pending?.kind === "payment" && canPay && (
        <div role="status" className="mw-bill-pending">
          <strong>Collection not confirmed</strong>
          <p>
            The original amount and reference are locked. Check the original
            financial record in this workspace or retry only this same
            collection.
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
          disabled={!available || working || !!pending || !!changeMarker}
          value={form.billId || ""}
          onChange={(e) => {
            if (inFlight.current || pendingRef.current || markerRef.current)
              return;
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
                    <p className="mw-note">
                      {(Array.isArray(current.charges)
                        ? current.charges
                        : []
                      ).some(
                        (charge: any) =>
                          Number.isSafeInteger(charge.quantity) &&
                          charge.quantity > 0,
                      )
                        ? "Choose at least one whole item unit to move."
                        : "Item quantities are unavailable for this bill. Split by outstanding amount instead."}
                    </p>
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
                            if (
                              inFlight.current ||
                              pendingRef.current ||
                              markerRef.current
                            )
                              return;
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
                      current.balance <= 0 ||
                      (form.splitMode === "items" && !itemSplitValid)
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
