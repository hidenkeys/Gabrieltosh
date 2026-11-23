import ChoiceField from "../ui/ChoiceField";
import React, { useEffect, useRef, useState } from "react";
import { formatMoney, workspaceApi } from "./api";
import OrderInstructions from "./OrderInstructions";
import { orderStatusLabel, paymentStatusLabel } from "./LiveOrderCard";
import { Disclosure, DataRegion } from "../ui/OperationalPrimitives";
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
const labels: Record<string, string> = {
  customer_qr: "Customer QR",
  staff: "Staff",
  integration: "Integration",
  zidi: "Zidi",
  counter_pickup: "Counter pickup",
  counter_takeaway: "Counter takeaway",
  takeaway: "Takeaway",
  table_service: "Table service",
  submitted: "Submitted",
  accepted: "Accepted",
  preparing: "Preparing",
  prepared: "Prepared",
  ready: "Ready for service",
  collected: "Collected",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  unpaid: "Unpaid",
  paid: "Paid",
  pending: "Awaiting confirmation",
  partially_paid: "Partly paid",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  failed: "Failed",
  expired: "Expired",
  assigned: "Assigned",
  joined: "Joined",
  payment_recorded: "Payment recorded",
  refund_recorded: "Refund recorded",
  items_handed_over: "Items handed over",
  item_cancelled: "Item cancelled",
  balance_written_off: "Balance written off",
  legacy_order_imported: "Previous order imported",
  legacy_source_audit: "Previous source history",
  legacy_paid_basis: "Legacy paid basis",
  fulfilled_only: "Fulfilled only",
  immutable_collected_at: "Recorded collection time",
  unresolved_source_tax_breakdown: "Source tax breakdown unresolved",
};
const human = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? labels[value] || "Unavailable"
    : "Not recorded";
const actorLabel = (entry: any) =>
  entry.actorName ||
  (
    {
      guest: "Guest",
      customer: "Customer",
      staff: "Staff name unavailable",
      system: "System",
      integration: "Integration",
    } as Record<string, string>
  )[entry.actorType] ||
  "Identity unavailable";
const historyDate = (value: unknown, timeZone?: string) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    !Number.isFinite(Date.parse(value))
  )
    return "Time unavailable";
  if (timeZone) {
    try {
      return (
        new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        }).format(new Date(value)) +
        " · " +
        timeZone
      );
    } catch {
      /* Explicit fallback. */
    }
  }
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " · UTC (branch timezone unavailable)"
  );
};
export function OrderTimeline({
  entries,
  timeZone,
}: {
  entries: unknown;
  timeZone?: string;
}) {
  if (!Array.isArray(entries)) return <p>History unavailable.</p>;
  if (!entries.length) return <p>No events recorded.</p>;
  const valid = entries.filter(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
  );
  const assignedName = (entry: any, field: "from" | "to") =>
    typeof entry[field + "Name"] === "string" && entry[field + "Name"].trim()
      ? entry[field + "Name"]
      : entry[field] === null || entry[field] === ""
        ? "Unassigned"
        : "Staff name unavailable";
  return (
    <>
      {valid.length !== entries.length && (
        <p>Some history events are unavailable.</p>
      )}
      {valid.map((entry: any, index: number) => (
        <p key={index}>
          {human(entry.action)} · {actorLabel(entry)} ·{" "}
          {historyDate(entry.at, timeZone)}
          {Number.isSafeInteger(entry.amount)
            ? " · " + formatMoney(entry.amount)
            : ""}
          {entry.action === "assigned" && (
            <span className="oh-assignment-change">
              {assignedName(entry, "from")} → {assignedName(entry, "to")}
            </span>
          )}
          {typeof entry.reason === "string" && entry.reason.trim()
            ? " · " + entry.reason
            : ""}
        </p>
      ))}
    </>
  );
}
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
  timeZone,
}: {
  base: string;
  disabled?: boolean;
  timeZone?: string;
  initialHistorical?: Historical;
  staffChoices?: { userId: string; name: string }[];
}) {
  const date = (value: unknown) => historyDate(value, timeZone);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const detailId = React.useId();
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
          throw new Error(
            "Order details could not be verified. Reload before continuing.",
          );
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
  useEffect(() => {
    if (detail?.id) detailHeading.current?.focus();
  }, [detail?.id]);
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
    <section
      className="mw-card oh-history"
      role="region"
      aria-label="Order history"
    >
      <div className="oh-heading">
        <div>
          <h2>Order history</h2>
          <p>Find previous orders and review their recorded details.</p>
        </div>
        <span className="oh-readonly">Read only</span>
      </div>
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
          <div className="oh-primary-filters">
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
            <ChoiceField
              label={<>History records</>}
              value={draft.historical}
              onChange={(nextValue) => update("historical", nextValue)}
            >
              <option value="exclude">Current system records</option>
              <option value="only">Imported source history only</option>
              <option value="all">Current and imported history</option>
            </ChoiceField>
          </div>
          <Disclosure
            className="oh-more-filters"
            summary={
              <>
                More filters <span>Status, staff and dates</span>
              </>
            }
          >
            <div className="oh-filter-grid">
              <ChoiceField
                label={<>History order status</>}
                value={draft.status}
                onChange={(nextValue) => update("status", nextValue)}
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
                  <option key={value} value={value}>
                    {human(value)}
                  </option>
                ))}
              </ChoiceField>
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
              <ChoiceField
                label={<>History payment status</>}
                value={draft.paymentStatus}
                onChange={(nextValue) => update("paymentStatus", nextValue)}
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
                  <option key={value} value={value}>
                    {human(value)}
                  </option>
                ))}
              </ChoiceField>
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
              <ChoiceField
                label={<>Orders per page</>}
                value={draft.take}
                onChange={(nextValue) => update("take", Number(nextValue))}
              >
                {[25, 50, 100].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </ChoiceField>
              <label className="mw-row">
                <span>History unassigned orders only</span>
                <input
                  type="checkbox"
                  checked={draft.unassigned}
                  onChange={(event) =>
                    update("unassigned", event.target.checked)
                  }
                />
              </label>
            </div>
          </Disclosure>
          <button className="secondary oh-apply">Apply history filters</button>
        </fieldset>
      </form>
      {error && (
        <p className="oh-error" role="alert">
          {error}
        </p>
      )}
      <div className="mw-actions oh-list-toolbar">
        <button disabled={disabled || loading} onClick={restart}>
          Reload history from first page
        </button>
        <span>
          Page {page + 1} · {rows.length} orders shown
        </span>
      </div>
      {loading ? (
        <p className="oh-state" role="status">
          Loading order history…
        </p>
      ) : !error && !rows.length ? (
        <div className="oh-state">
          <h3>No matching orders</h3>
          <p>
            No orders match the applied history filters. Change the search or
            filters to try again.
          </p>
        </div>
      ) : rows.length > 0 ? (
        <DataRegion className="oh-table-scroll" label="History results">
          <table className="oh-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Placed</th>
                <th scope="col">Order status</th>
                <th scope="col">Payment</th>
                <th scope="col">Total</th>
                <th scope="col">Handler</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr
                  key={order.id}
                  className={selected === order.id ? "is-selected" : ""}
                >
                  <td data-label="Order">
                    <b>
                      {order.reference || "Reference unavailable"} ·{" "}
                      {order.displayName}
                    </b>
                    <small>{human(order.source)}</small>
                    {order.historicalReadOnly && (
                      <span className="oh-imported">
                        Imported source history · read only
                      </span>
                    )}
                  </td>
                  <td data-label="Placed">{date(order.createdAt)}</td>
                  <td data-label="Order status">
                    <span className="oh-state-label">
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                  <td data-label="Payment">
                    {paymentStatusLabel(order.paymentStatus)}
                  </td>
                  <td data-label="Total" className="oh-money">
                    {Number.isSafeInteger(order.total)
                      ? formatMoney(order.total)
                      : "Amount not recorded"}
                  </td>
                  <td data-label="Handler">
                    {order.handlerName ||
                      (order.handlerId ? "Assigned staff" : "Unassigned")}
                  </td>
                  <td data-label="Details">
                    <button
                      className="secondary"
                      disabled={disabled}
                      aria-expanded={selected === order.id}
                      aria-controls={
                        selected === order.id ? detailId : undefined
                      }
                      onClick={(event) => {
                        detailTrigger.current = event.currentTarget;
                        setSelected(order.id);
                        setDetailRevision((value) => value + 1);
                      }}
                    >
                      {order.reference
                        ? "View " + order.reference
                        : "View order details"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataRegion>
      ) : null}
      <div className="mw-actions oh-pagination">
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
        <section
          className="oh-detail"
          id={detailId}
          aria-label="Order detail"
          aria-busy={detailLoading}
        >
          <div className="mw-actions oh-detail-toolbar">
            <h3 ref={detailHeading} tabIndex={-1}>
              Order detail
            </h3>
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
                detailTrigger.current?.focus();
              }}
            >
              Close order detail
            </button>
          </div>
          {detailError && (
            <p className="oh-error" role="alert">
              {detailError}
            </p>
          )}
          {detailLoading ? (
            <p role="status">Loading permitted order detail…</p>
          ) : (
            !detailError &&
            detail && (
              <>
                <h3>
                  {detail.reference || "Reference unavailable"} ·{" "}
                  {detail.displayName}
                </h3>
                {detail.historicalReadOnly && (
                  <div className="mw-note oh-history-warning">
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
                  {orderStatusLabel(detail.status)} ·{" "}
                  {paymentStatusLabel(detail.paymentStatus)} ·{" "}
                  {human(detail.source)} · {date(detail.createdAt)}
                </p>
                <p>
                  Service:{" "}
                  {typeof detail.tableName === "string" &&
                  detail.tableName.trim()
                    ? detail.tableName
                    : human(detail.fulfillment)}
                </p>
                <dl className="oh-detail-totals">
                  {[
                    ["Order total", detail.total],
                    ["Applied payments", detail.effectivePaid ?? detail.paid],
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
                    (detail.staffCreatorId
                      ? "Staff name unavailable"
                      : "Not recorded")}{" "}
                  · Current handler{" "}
                  {detail.handlerName ||
                    (detail.handlerId ? "Assigned staff" : "Unassigned")}
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
                    <article
                      className="oh-detail-item"
                      key={item.orderLineId || index}
                    >
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
                <OrderTimeline entries={detail.history} timeZone={timeZone} />
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
