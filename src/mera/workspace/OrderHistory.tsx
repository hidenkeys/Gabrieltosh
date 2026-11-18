import React, { useEffect, useRef, useState } from "react";
import { formatMoney, workspaceApi } from "./api";
import OrderInstructions from "./OrderInstructions";
type Historical = "only" | "exclude" | "all";
type Filters = {
  q: string;
  status: string;
  source: string;
  paymentStatus: string;
  staffId: string;
  unassigned: boolean;
  historical: Historical;
  from: string;
  to: string;
  take: number;
};
const defaults: Filters = {
  q: "",
  status: "",
  source: "",
  paymentStatus: "",
  staffId: "",
  unassigned: false,
  historical: "exclude",
  from: "",
  to: "",
  take: 50,
};
const human = (value: any) =>
  String(value || "Not recorded").replaceAll("_", " ");
const date = (value: any) =>
  value ? new Date(value).toLocaleString() : "Not recorded";
function query(filters: Filters, cursor: string | null) {
  const params = new URLSearchParams();
  params.set("take", String(filters.take));
  params.set("historical", filters.historical);
  for (const field of [
    "q",
    "status",
    "source",
    "paymentStatus",
    "staffId",
  ] as const)
    if (filters[field].trim()) params.set(field, filters[field].trim());
  if (filters.unassigned) params.set("unassigned", "true");
  for (const field of ["from", "to"] as const)
    if (filters[field]) {
      const instant = new Date(filters[field]);
      if (!Number.isFinite(instant.getTime()))
        throw new Error("Choose a valid history date range.");
      params.set(field, instant.toISOString());
    }
  if (
    filters.from &&
    filters.to &&
    new Date(filters.from) > new Date(filters.to)
  )
    throw new Error("The history end must follow its start.");
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}
function ScopedOrderHistory({
  base,
  disabled = false,
  initialHistorical = "exclude",
  staffChoices = [],
}: {
  base: string;
  disabled?: boolean;
  initialHistorical?: Historical;
  staffChoices?: { userId: string; name: string }[];
}) {
  const [draft, setDraft] = useState<Filters>({
    ...defaults,
    historical: initialHistorical,
  });
  const [applied, setApplied] = useState<Filters>({
    ...defaults,
    historical: initialHistorical,
  });
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRevision, setDetailRevision] = useState(0);
  const params = query(applied, cursors[page] || null);
  const identity = base + "?" + params + "#" + revision;
  const active = useRef(identity);
  active.current = identity;
  const generation = useRef(0);
  const detailGeneration = useRef(0);
  const activeSelection = useRef(selected);
  activeSelection.current = selected;
  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();
    setRows([]);
    setNext(null);
    setHasMore(false);
    setError("");
    setLoading(true);
    setSelected("");
    setDetail(null);
    workspaceApi(
      base + "/orders?" + params,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (
          controller.signal.aborted ||
          id !== generation.current ||
          active.current !== identity
        )
          return;
        if (
          !Array.isArray(result.orders) ||
          !Number.isInteger(result.pageSize) ||
          result.pageSize < 1 ||
          result.pageSize > 100 ||
          result.orders.length > result.pageSize ||
          typeof result.hasMore !== "boolean" ||
          (result.hasMore &&
            (typeof result.nextCursor !== "string" || !result.nextCursor))
        )
          throw new Error(
            "The history response is invalid. Reload before continuing.",
          );
        setRows(result.orders);
        setHasMore(result.hasMore);
        setNext(result.nextCursor || null);
      })
      .catch((error) => {
        if (
          error.name !== "AbortError" &&
          id === generation.current &&
          active.current === identity
        )
          setError(error.message);
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          id === generation.current &&
          active.current === identity
        )
          setLoading(false);
      });
    return () => controller.abort();
  }, [base, params, identity]);
  useEffect(() => {
    setDetail(null);
    setDetailError("");
    if (!selected) {
      setDetailLoading(false);
      return;
    }
    const id = ++detailGeneration.current;
    const controller = new AbortController();
    const requested = identity;
    setDetailLoading(true);
    workspaceApi(
      base + "/orders/" + encodeURIComponent(selected),
      "GET",
      undefined,
      controller.signal,
    )
      .then((order) => {
        if (
          controller.signal.aborted ||
          id !== detailGeneration.current ||
          active.current !== requested ||
          activeSelection.current !== selected
        )
          return;
        if (order?.id !== selected)
          throw new Error("The canonical order response is invalid.");
        setDetail(order);
      })
      .catch((error) => {
        if (
          error.name !== "AbortError" &&
          id === detailGeneration.current &&
          active.current === requested &&
          activeSelection.current === selected
        )
          setDetailError(error.message);
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          id === detailGeneration.current &&
          active.current === requested &&
          activeSelection.current === selected
        )
          setDetailLoading(false);
      });
    return () => controller.abort();
  }, [base, selected, detailRevision, identity]);
  const update = (key: keyof Filters, value: any) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const restart = () => {
    setLoading(true);
    setRows([]);
    setSelected("");
    setDetail(null);
    setCursors([null]);
    setPage(0);
    setRevision((value) => value + 1);
  };
  return (
    <section className="mw-card" role="region" aria-label="Order history">
      <h2>Order history</h2>
      <p>
        The live workflow is an operational snapshot. This archive loads bounded
        pages separately, including older and imported records. History details
        are read only; current actions remain in the live workflow.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            query(draft, null);
            setError("");
            setApplied({ ...draft });
            restart();
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        <fieldset
          disabled={disabled || loading}
          style={{ border: 0, padding: 0 }}
        >
          <div className="mw-form">
            <label>
              Search order history
              <input
                type="search"
                maxLength={120}
                placeholder="Reference, customer or order note"
                value={draft.q}
                onChange={(event) => update("q", event.target.value)}
              />
            </label>
            <label>
              History records
              <select
                value={draft.historical}
                onChange={(event) => update("historical", event.target.value)}
              >
                <option value="exclude">Current system records</option>
                <option value="only">Imported source history only</option>
                <option value="all">Current and imported history</option>
              </select>
            </label>
            <label>
              History order status
              <select
                value={draft.status}
                onChange={(event) => update("status", event.target.value)}
              >
                <option value="">All statuses</option>
                {[
                  "submitted",
                  "accepted",
                  "preparing",
                  "ready",
                  "collected",
                  "completed",
                  "rejected",
                  "cancelled",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              History source
              <input
                list="mw-history-sources"
                pattern="[a-z_]{1,40}"
                maxLength={40}
                value={draft.source}
                onChange={(event) => update("source", event.target.value)}
              />
              <datalist id="mw-history-sources">
                {["staff", "customer_qr", "zidi", "legacy_import"].map(
                  (value) => (
                    <option key={value} value={value} />
                  ),
                )}
              </datalist>
            </label>
            <label>
              History payment status
              <select
                value={draft.paymentStatus}
                onChange={(event) =>
                  update("paymentStatus", event.target.value)
                }
              >
                <option value="">All payment states</option>
                {[
                  "unpaid",
                  "pending",
                  "partially_paid",
                  "paid",
                  "partially_refunded",
                  "refunded",
                  "failed",
                  "expired",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              History staff identity
              <input
                list="mw-history-staff"
                placeholder="Optional staff ID"
                pattern="[a-fA-F0-9-]{36}"
                maxLength={36}
                value={draft.staffId}
                onChange={(event) => update("staffId", event.target.value)}
              />
              <datalist id="mw-history-staff">
                {staffChoices.map((person) => (
                  <option key={person.userId} value={person.userId}>
                    {person.name}
                  </option>
                ))}
              </datalist>
            </label>
            <label>
              History from (device local time)
              <input
                type="datetime-local"
                value={draft.from}
                onChange={(event) => update("from", event.target.value)}
              />
            </label>
            <label>
              History until (exclusive, device local time)
              <input
                type="datetime-local"
                value={draft.to}
                onChange={(event) => update("to", event.target.value)}
              />
            </label>
            <label>
              Orders per page
              <select
                value={draft.take}
                onChange={(event) => update("take", Number(event.target.value))}
              >
                {[25, 50, 100].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="mw-row">
              <span>History unassigned orders only</span>
              <input
                type="checkbox"
                checked={draft.unassigned}
                onChange={(event) => update("unassigned", event.target.checked)}
              />
            </label>
          </div>
          <button className="secondary">Apply history filters</button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      <div className="mw-actions">
        <button disabled={disabled || loading} onClick={restart}>
          Reload history from first page
        </button>
        <span>
          Page {page + 1} · {rows.length} records
        </span>
      </div>
      {loading ? (
        <p role="status">Loading canonical order history…</p>
      ) : !error && !rows.length ? (
        <p>No orders match the applied history filters.</p>
      ) : (
        rows.map((order) => (
          <article className="mw-row" key={order.id}>
            <div>
              <b>
                {order.reference || String(order.id).slice(0, 8)} ·{" "}
                {order.displayName}
              </b>
              <small>
                {date(order.createdAt)} · {human(order.status)} ·{" "}
                {human(order.paymentStatus)} ·{" "}
                {Number.isSafeInteger(order.total)
                  ? formatMoney(order.total)
                  : "Amount not recorded"}
              </small>
              {order.historicalReadOnly && (
                <span className="mw-pill">
                  Imported source history · read only
                </span>
              )}
            </div>
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => {
                setSelected(order.id);
                setDetailRevision((value) => value + 1);
              }}
            >
              View {order.reference || String(order.id).slice(0, 8)}
            </button>
          </article>
        ))
      )}
      <div className="mw-actions">
        <button
          disabled={disabled || loading || page === 0}
          onClick={() => {
            setLoading(true);
            setRows([]);
            setSelected("");
            setDetail(null);
            setPage((value) => value - 1);
          }}
        >
          Previous history page
        </button>
        <button
          disabled={disabled || loading || !hasMore || !next}
          onClick={() => {
            setLoading(true);
            setRows([]);
            setSelected("");
            setDetail(null);
            setCursors((current) => [...current.slice(0, page + 1), next]);
            setPage((value) => value + 1);
          }}
        >
          Next history page
        </button>
      </div>
      {selected && (
        <section className="mw-card" aria-label="Canonical order detail">
          <div className="mw-actions">
            <h3>Canonical order detail</h3>
            <button
              disabled={disabled || detailLoading}
              onClick={() => setDetailRevision((value) => value + 1)}
            >
              Refresh order detail
            </button>
            <button
              onClick={() => {
                setSelected("");
                setDetail(null);
              }}
            >
              Close order detail
            </button>
          </div>
          {detailError && <p role="alert">{detailError}</p>}
          {detailLoading ? (
            <p role="status">Loading permitted order detail…</p>
          ) : (
            detail && (
              <>
                <h3>
                  {detail.reference || detail.id} · {detail.displayName}
                </h3>
                {detail.historicalReadOnly && (
                  <div className="mw-note">
                    <strong>Imported source history · read only</strong>
                    <p>
                      Source status:{" "}
                      {human(detail.legacyStatus || detail.status)} ·
                      Recognition: {human(detail.historicalRecognitionBasis)} ·
                      Tax: {human(detail.historicalTaxStatus)}
                    </p>
                  </div>
                )}
                <p>
                  {human(detail.status)} · {human(detail.paymentStatus)} ·{" "}
                  {human(detail.source)} · {date(detail.createdAt)}
                </p>
                <dl>
                  {[
                    ["Order total", detail.total],
                    ["Effective paid", detail.effectivePaid ?? detail.paid],
                    ["Written-off debt", detail.writtenOff ?? 0],
                    ["Outstanding", detail.outstandingBalance],
                  ].map(([name, amount]) => (
                    <div key={String(name)}>
                      <dt>{name}</dt>
                      <dd>
                        {Number.isSafeInteger(amount)
                          ? formatMoney(Number(amount))
                          : "Not recorded"}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p>
                  Created by{" "}
                  {detail.staffCreatorName ||
                    detail.actorName ||
                    detail.staffCreatorId ||
                    "Not recorded"}{" "}
                  · Current handler{" "}
                  {detail.handlerName || detail.handlerId || "Unassigned"}
                </p>
                <OrderInstructions order={detail} />
                {detail.pricing && (
                  <div className="mw-note">
                    <strong>Recorded pricing breakdown</strong>
                    {Number.isSafeInteger(detail.pricing.subtotal) && (
                      <p>Items: {formatMoney(detail.pricing.subtotal)}</p>
                    )}
                    {Array.isArray(detail.pricing.lines) &&
                      detail.pricing.lines.map((line: any, index: number) => (
                        <p key={index}>
                          {line.label}:{" "}
                          {Number.isSafeInteger(line.amount)
                            ? formatMoney(line.amount)
                            : "Not recorded"}
                        </p>
                      ))}
                  </div>
                )}
                {Array.isArray(detail.items) &&
                  detail.items.map((item: any, index: number) => (
                    <article key={item.orderLineId || index}>
                      <p>
                        {item.quantity} × {item.name}
                        {item.size ? " · " + item.size : ""} ·{" "}
                        {Number.isSafeInteger(item.total)
                          ? formatMoney(item.total)
                          : "Not recorded"}
                        {item.cancelledQuantity
                          ? " · " + item.cancelledQuantity + " cancelled"
                          : ""}
                      </p>
                      <OrderInstructions item={item} />
                    </article>
                  ))}
                <h3>Responsibility & transaction history</h3>
                {Array.isArray(detail.history) &&
                  detail.history.map((entry: any, index: number) => (
                    <p key={index}>
                      {human(entry.action)} ·{" "}
                      {entry.actorName || entry.actorId || "System"} ·{" "}
                      {date(entry.at)}
                      {Number.isSafeInteger(entry.amount)
                        ? " · " + formatMoney(entry.amount)
                        : ""}
                      {entry.reason ? " · " + entry.reason : ""}
                    </p>
                  ))}
              </>
            )
          )}
        </section>
      )}
    </section>
  );
}

export default function OrderHistory(
  props: React.ComponentProps<typeof ScopedOrderHistory>,
) {
  return (
    <ScopedOrderHistory
      key={props.base + "|" + (props.initialHistorical || "exclude")}
      {...props}
    />
  );
}
