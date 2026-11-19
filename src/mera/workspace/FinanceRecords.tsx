import type { ReactNode } from "react";
import { formatMoney } from "./api";
import { DataRegion, ReadState } from "../ui/OperationalPrimitives";

const money = (value: unknown) =>
  Number.isSafeInteger(value) ? formatMoney(value as number) : "Unavailable";
const method = (value: string) =>
  (
    ({
      cash: "Cash",
      external_pos: "Card / POS",
      external_transfer: "External transfer",
    }) as Record<string, string>
  )[value] || "Method unavailable";
function time(value: unknown, timeZone?: string) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  try {
    return (
      date.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        ...(timeZone ? { timeZone } : {}),
      }) + (timeZone ? ` · ${timeZone}` : " · device time")
    );
  } catch {
    return date.toISOString() + " · UTC";
  }
}
export function PaymentRecords({
  payments,
  refunds,
  orders,
  timeZone,
  canViewRefunds,
}: {
  payments: unknown;
  refunds: unknown;
  orders: any[];
  timeZone?: string;
  canViewRefunds: boolean;
}) {
  const groups = [
    { title: "Recorded collections", records: payments, kind: "collection" },
    ...(canViewRefunds
      ? [{ title: "Recorded returns", records: refunds, kind: "return" }]
      : []),
  ];
  return (
    <div className="mw-financial-records">
      {groups.map((group) => (
        <section key={group.kind} aria-label={group.title}>
          <h3>{group.title}</h3>
          {!Array.isArray(group.records) ? (
            <ReadState
              kind="unavailable"
              title="Records are unavailable. Refresh the workspace before reviewing this list."
            />
          ) : !group.records.length ? (
            <ReadState
              kind="empty"
              title={
                group.kind === "collection"
                  ? "No collections recorded for this branch."
                  : "No returns recorded for this branch."
              }
            />
          ) : (
            <DataRegion label={group.title}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Amount</th>
                    <th scope="col">Order</th>
                    <th scope="col">Method</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Status</th>
                    <th scope="col">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {group.records.map((record: any) => (
                    <tr key={record.id}>
                      <td data-label="Amount">{money(record.amount)}</td>
                      <td data-label="Order">
                        {orders.find((order) => order.id === record.orderId)
                          ?.reference ||
                          record.orderReference ||
                          "Order reference unavailable"}
                      </td>
                      <td data-label="Method">{method(record.method)}</td>
                      <td data-label="Reference">
                        {record.reference || "Not recorded"}
                      </td>
                      <td data-label="Status">
                        {record.status
                          ? String(record.status).replaceAll("_", " ")
                          : "Recorded"}
                      </td>
                      <td data-label="Recorded">
                        {time(record.createdAt, timeZone)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataRegion>
          )}
        </section>
      ))}
    </div>
  );
}
export function ShiftRecord({
  shift,
  timeZone,
  children,
}: {
  shift: any;
  timeZone?: string;
  children: ReactNode;
}) {
  const status =
    (
      {
        open: "Open",
        closed: "Closed",
        approved: "Approved",
        pending_approval: "Awaiting approval",
      } as Record<string, string>
    )[shift.status] || "Status unavailable";
  return (
    <article className="mw-shift-record">
      <header>
        <div>
          <h3>{status} shift</h3>
          <p>{time(shift.openedAt || shift.createdAt, timeZone)}</p>
        </div>
        <span className="mw-pill">{status}</span>
      </header>
      <dl className="mw-shift-facts">
        <div>
          <dt>Opening float</dt>
          <dd>{money(shift.openingFloat)}</dd>
        </div>
        <div>
          <dt>Expected cash</dt>
          <dd>
            {Number.isSafeInteger(shift.expectedCash)
              ? money(shift.expectedCash)
              : shift.status === "open"
                ? "Calculated at close"
                : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Counted cash</dt>
          <dd>
            {Number.isSafeInteger(shift.countedCash)
              ? money(shift.countedCash)
              : "Not counted"}
          </dd>
        </div>
      </dl>
      {children}
    </article>
  );
}
