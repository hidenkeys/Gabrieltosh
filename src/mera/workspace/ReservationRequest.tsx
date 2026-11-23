import Chips from "../ui/Chips";
import Combobox from "../ui/Combobox";
import ReasonInput from "../ui/ReasonInput";
import DateTimePicker from "../ui/DateTimePicker";
import Stepper from "../ui/Stepper";
import { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi, formatMoney } from "./api";
import { Action, Disclosure } from "../ui/OperationalPrimitives";
import { reservationDate } from "./reservationPresentation";
import {
  buildStaffReservationJournal,
  readStaffReservationJournal,
  saveStaffReservationJournal,
  clearStaffReservationJournal,
  parseStaffReservationAttempt,
  redactStaffReservationJournals,
  type StaffReservationRecord,
} from "./staffReservationJournal";
type Props = {
  userId: string;
  organizationId: string;
  branchId: string;
  branchName?: string;
  timeZone?: string;
  tables?: any[];
  minimumSpendPolicy?: any;
  depositPolicy?: any;
  reservationPolicy?: any;
  reservationsEnabled: boolean;
  newReservationsAllowed: boolean;
  disabled: boolean;
  canRequest: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
  onPendingChange?: (pending: boolean) => void;
  onRecorded?: (reservation: any) => void;
};
export default function ReservationRequest(props: Props) {
  return (
    <ScopedRequest
      key={[props.userId, props.organizationId, props.branchId].join("|")}
      {...props}
    />
  );
}
function ScopedRequest(props: Props) {
  const { userId, organizationId, branchId, disabled, canRequest, save } =
    props;
  const scope = { actorId: userId, organizationId, branchId },
    base = `/organizations/${organizationId}/branches/${branchId}`;
  const [record, setRecord] = useState<StaffReservationRecord | null>(null),
    [ready, setReady] = useState(false),
    [blocked, setBlocked] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false),
    [ack, setAck] = useState("");
  const [draft, setDraft] = useState({
    displayName: "",
    contact: "",
    partySize: "2",
    startsAt: "",
    endsAt: "",
    tableId: "",
    notes: "",
  });
  const active = useRef(true),
    flight = useRef(false),
    recordRef = useRef<StaffReservationRecord | null>(null),
    permission = useRef(canRequest),
    callbacks = useRef(props),
    denied = useRef(false);
  permission.current = canRequest;
  callbacks.current = props;
  const eligible = () =>
    active.current && permission.current && !denied.current;
  function pending(value: StaffReservationRecord | null) {
    recordRef.current = value;
    setRecord(value);
    callbacks.current.onPendingChange?.(!!value);
  }
  function failed(e: any) {
    if (!active.current) return;
    if ([401, 403, 404].includes(e.status)) {
      denied.current = true;
      const redacted = redactStaffReservationJournals();
      try {
        recordRef.current = redacted
          ? readStaffReservationJournal(scope)
          : null;
      } catch {
        recordRef.current = null;
      }
      setBlocked(true);
      setRecord(null);
      setDraft({
        displayName: "",
        contact: "",
        partySize: "2",
        startsAt: "",
        endsAt: "",
        tableId: "",
        notes: "",
      });
      setReason("");
      setAck("");
      setError(
        "Reservation access needs checking. Refresh the workspace or sign in again.",
      );
    } else
      setError(
        recordRef.current
          ? "The reservation result could not be confirmed. Keep the original request and check again."
          : e instanceof RangeError
            ? "No reservation request was sent. Choose valid start and end dates and times before trying again."
            : "No reservation request was sent. Check the guest name, contact, party size and booking terms, and ensure this tab can save recovery details before trying again.",
      );
  }
  function finish(result: any, current: StaffReservationRecord) {
    if (result.status === "not_found") return false;
    clearStaffReservationJournal(scope, current.requestKey);
    if (!eligible()) return true;
    pending(null);
    setReason("");
    setConfirm(false);
    setNotice(
      result.status === "recorded"
        ? "The original reservation is recorded. No second reservation was requested."
        : "The unconfirmed request was stopped. No accepted reservation was cancelled and no refund was made.",
    );
    if (result.status === "recorded") {
      setDraft({
        displayName: "",
        contact: "",
        partySize: "2",
        startsAt: "",
        endsAt: "",
        tableId: "",
        notes: "",
      });
      setAck("");
      callbacks.current.onRecorded?.(result.reservation);
    }
    return true;
  }
  async function check() {
    if (disabled || flight.current || !eligible()) return;
    flight.current = true;
    setWorking(true);
    setError("");
    try {
      const current = recordRef.current || readStaffReservationJournal(scope);
      if (!current) throw Error("Missing request");
      const result = parseStaffReservationAttempt(
        await workspaceApi(
          base + "/reservation-attempts/" + current.requestKey,
          "GET",
          undefined,
          undefined,
          { expectedActorId: userId },
        ),
        current,
      );
      if (!eligible()) return;
      if (!finish(result, current))
        setError(
          "The request has not been recorded yet. That does not prove failure. Retry the original details or explicitly stop this request.",
        );
    } catch (e) {
      failed(e);
    } finally {
      flight.current = false;
      if (active.current) setWorking(false);
    }
  }
  useEffect(() => {
    active.current = true;
    try {
      const saved = readStaffReservationJournal(scope);
      pending(saved);
      setReady(true);
      if (saved) void check();
    } catch {
      setBlocked(true);
      setError(
        "Saved reservation details could not be verified. Ask an administrator to recover this request before creating another.",
      );
      callbacks.current.onPendingChange?.(true);
    }
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!canRequest) {
      denied.current = true;
      const redacted = redactStaffReservationJournals();
      try {
        recordRef.current = redacted
          ? readStaffReservationJournal(scope)
          : null;
      } catch {
        recordRef.current = null;
      }
      setBlocked(true);
      setRecord(null);
      setReason("");
      setDraft({
        displayName: "",
        contact: "",
        partySize: "2",
        startsAt: "",
        endsAt: "",
        tableId: "",
        notes: "",
      });
    }
  }, [canRequest]);
  async function submit() {
    if (disabled || flight.current || !eligible() || !ready || blocked) return;
    flight.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      let current = recordRef.current;
      if (current?.referenceOnly)
        throw Error("Original private details are unavailable.");
      if (!current) {
        if (!props.reservationsEnabled || !props.newReservationsAllowed)
          throw Error("New reservations are unavailable.");
        const minimum = props.minimumSpendPolicy || null;
        const intent = {
          requestKey: uuid(),
          displayName: draft.displayName.trim(),
          contact: draft.contact.trim(),
          partySize: Number(draft.partySize),
          startsAt: new Date(draft.startsAt).toISOString(),
          endsAt: new Date(draft.endsAt).toISOString(),
          notes: draft.notes,
          ...(draft.tableId ? { tableId: draft.tableId } : {}),
          ...(minimum?.enabled
            ? {
                minimumSpendAcknowledged: ack === minimum.version,
                minimumSpendPolicyVersion: minimum.version,
              }
            : {}),
        };
        current = buildStaffReservationJournal(scope, intent, {
          branchName: props.branchName || null,
          timezone: props.timeZone || null,
          minimumSpendPolicy: minimum,
          depositPolicy: props.depositPolicy || null,
          reservationPolicy: props.reservationPolicy || null,
        });
        current = saveStaffReservationJournal(current);
        pending(current);
      } else {
        const result = parseStaffReservationAttempt(
          await workspaceApi(
            base + "/reservation-attempts/" + current.requestKey,
            "GET",
            undefined,
            undefined,
            { expectedActorId: userId },
          ),
          current,
        );
        if (!eligible()) return;
        if (finish(result, current)) return;
      }
      // Stored intent is the sole retry authority; dates and policies are never reconstructed here.
      const accepted = await save(
        base + "/reservations",
        "POST",
        current.intent,
        "Reservation requested.",
      );
      const result = parseStaffReservationAttempt(
        {
          ...scope,
          requestKey: current.requestKey,
          status: "recorded",
          reservation: accepted,
        },
        current,
      );
      finish(result, current);
    } catch (e) {
      failed(e);
    } finally {
      flight.current = false;
      if (active.current) setWorking(false);
    }
  }
  async function stop() {
    if (
      disabled ||
      flight.current ||
      !eligible() ||
      !confirm ||
      reason.trim().length < 3
    )
      return;
    const current = recordRef.current;
    if (!current) return;
    flight.current = true;
    setWorking(true);
    setError("");
    try {
      const result = parseStaffReservationAttempt(
        await workspaceApi(
          base + "/reservation-attempts/" + current.requestKey + "/abandon",
          "POST",
          { reason: reason.trim() },
          undefined,
          { expectedActorId: userId },
        ),
        current,
      );
      if (!eligible()) return;
      if (!finish(result, current)) throw Error("Stop not confirmed");
    } catch (e) {
      failed(e);
    } finally {
      flight.current = false;
      if (active.current) setWorking(false);
    }
  }
  const minimum = props.minimumSpendPolicy;
  if (!canRequest || denied.current)
    return (
      <section className="mw-reservation-request">
        <p role="alert">
          {error ||
            "Reservation access needs checking. Refresh the workspace or sign in again."}
        </p>
      </section>
    );
  return (
    <Disclosure
      className="mw-reservation-request"
      summary={
        record ? "Check an unconfirmed reservation" : "Request a reservation"
      }
    >
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!ready && <p role="status">Checking saved reservation requests…</p>}
      {record ? (
        <section>
          <h3>Original reservation request</h3>
          {record.referenceOnly ? (
            <p>
              Private guest details were cleared when the staff session ended.
              The original reference is retained so this request can be checked
              or stopped safely. Its details cannot be resent from this tab.
            </p>
          ) : (
            <>
              <p>
                {record.intent.displayName} · {record.intent.partySize} guests
              </p>
              <p>
                {reservationDate(
                  record.intent.startsAt,
                  record.review.timezone || undefined,
                )}{" "}
                —{" "}
                {reservationDate(
                  record.intent.endsAt,
                  record.review.timezone || undefined,
                )}
              </p>
              {record.review.minimumSpendPolicy?.enabled && (
                <p>
                  Originally accepted minimum-spend terms:{" "}
                  {Number.isSafeInteger(record.review.minimumSpendPolicy.amount)
                    ? formatMoney(record.review.minimumSpendPolicy.amount!)
                    : "Amount unavailable"}{" "}
                  · {record.review.minimumSpendPolicy.disclosure}
                </p>
              )}
              {record.review.depositPolicy && (
                <p>
                  Original deposit terms:{" "}
                  {formatMoney(record.review.depositPolicy.amount)} ·{" "}
                  {record.review.depositPolicy.refundRule === "non_refundable"
                    ? "Non-refundable under the recorded policy"
                    : `Refundable before the recorded ${record.review.depositPolicy.cancellationCutoffHours}-hour cutoff`}
                  . This request does not confirm collection or a refund.
                </p>
              )}
              {record.review.reservationPolicy?.enabled && (
                <p>
                  Original booking window: minimum notice{" "}
                  {record.review.reservationPolicy.minimumLeadMinutes ??
                    "unavailable"}{" "}
                  minutes; maximum advance{" "}
                  {record.review.reservationPolicy.maximumAdvanceDays ??
                    "unavailable"}{" "}
                  days. Cancellation and no-show outcomes require review.
                </p>
              )}
              <p>
                The original details stay unchanged even if current booking
                policies or times have changed.
              </p>
            </>
          )}
          <div className="mw-actions">
            <Action
              pending={working}
              disabled={disabled}
              onClick={() => void check()}
            >
              Check original reservation
            </Action>
            {!record.referenceOnly && (
              <Action
                disabled={disabled || working}
                onClick={() => void submit()}
              >
                Retry original reservation
              </Action>
            )}
          </div>
          <Disclosure summary="Stop the unconfirmed request">
            <p>
              This checks the original request and stops it only if it has not
              been recorded. It does not cancel an accepted reservation or
              initiate a refund.
            </p>
            <ReasonInput
              label="Reason for stopping"
              value={reason}
              onChange={setReason}
              minLength={3}
              maxLength={500}
              required
              disabled={disabled || working}
              presets={[
                "Plans changed",
                "Duplicate request",
                "Booking no longer needed",
              ]}
            />
            <label className="mw-row">
              <input
                type="checkbox"
                checked={confirm}
                disabled={disabled || working}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              I want to stop this unconfirmed request.
            </label>
            <Action
              disabled={
                disabled || working || !confirm || reason.trim().length < 3
              }
              onClick={() => void stop()}
            >
              Stop this unconfirmed request
            </Action>
          </Disclosure>
        </section>
      ) : (
        <>
          {(!props.reservationsEnabled || !props.newReservationsAllowed) && (
            <p>
              New reservations are currently unavailable. Existing requests can
              still be checked.
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <fieldset
              disabled={
                disabled ||
                blocked ||
                working ||
                !ready ||
                !props.reservationsEnabled ||
                !props.newReservationsAllowed
              }
            >
              {(
                [
                  ["displayName", "Guest name", "text"],
                  ["contact", "Contact", "text"],
                  ["partySize", "Party size", "number"],
                  [
                    "startsAt",
                    "Starts at (this device’s local time)",
                    "datetime-local",
                  ],
                  [
                    "endsAt",
                    "Ends at (this device’s local time)",
                    "datetime-local",
                  ],
                ] as const
              ).map(([key, label, type]) =>
                type === "datetime-local" ? (
                  <DateTimePicker
                    key={key}
                    label={label}
                    value={draft[key]}
                    onChange={(value) =>
                      setDraft((previous) => ({ ...previous, [key]: value }))
                    }
                    required
                  />
                ) : key === "partySize" ? (
                  <Stepper
                    key={key}
                    label={label}
                    value={Number(draft.partySize)}
                    onChange={(value) =>
                      setDraft((previous) => ({
                        ...previous,
                        partySize: String(value),
                      }))
                    }
                    min={1}
                    max={100}
                    required
                  />
                ) : (
                  <label key={key}>
                    {label}
                    <input
                      required
                      type={type}
                      maxLength={
                        key === "displayName"
                          ? 100
                          : key === "contact"
                            ? 160
                            : undefined
                      }
                      value={draft[key]}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: e.target.value })
                      }
                    />
                  </label>
                ),
              )}
              <Chips
                label="Quick party size"
                value={Number(draft.partySize) >= 9 ? "9+" : draft.partySize}
                onChange={(value) =>
                  setDraft((previous) => ({
                    ...previous,
                    partySize: value === "9+" ? "9" : value,
                  }))
                }
                options={[
                  ...Array.from({ length: 8 }, (_, index) => ({
                    value: String(index + 1),
                    label: String(index + 1),
                  })),
                  { value: "9+", label: "9+" },
                ]}
              />
              <Combobox
                label="Preferred table"
                value={draft.tableId}
                onChange={(tableId) =>
                  setDraft((previous) => ({ ...previous, tableId }))
                }
                options={[
                  { value: "", label: "No preference" },
                  ...(Array.isArray(props.tables) ? props.tables : [])
                    .filter(
                      (table) =>
                        table &&
                        typeof table.id === "string" &&
                        typeof table.name === "string",
                    )
                    .map((table) => ({
                      value: table.id,
                      label: table.name,
                      description: Number.isSafeInteger(table.capacity)
                        ? `${table.capacity} seats`
                        : undefined,
                    })),
                ]}
              />
              {!Array.isArray(props.tables) && (
                <p>
                  Table details are unavailable. You can request no preference.
                </p>
              )}
              <label>
                Notes (optional)
                <textarea
                  maxLength={500}
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                />
              </label>
              {minimum?.enabled && (
                <div className="mw-note">
                  <strong>
                    Minimum-spend terms:{" "}
                    {Number.isSafeInteger(minimum.amount)
                      ? formatMoney(minimum.amount)
                      : "Amount unavailable"}
                  </strong>
                  <p>
                    {typeof minimum.disclosure === "string"
                      ? minimum.disclosure
                      : "Disclosure unavailable"}
                  </p>
                  <label className="mw-row">
                    <input
                      type="checkbox"
                      required
                      checked={ack === minimum.version}
                      onChange={(e) =>
                        setAck(e.target.checked ? minimum.version : "")
                      }
                    />
                    The customer reviewed and accepted these disclosed
                    minimum-spend terms.
                  </label>
                </div>
              )}
              <Action type="submit" variant="primary">
                Request reservation
              </Action>
            </fieldset>
          </form>
          <p>
            Availability is checked by the branch before confirmation. No
            payment or refund is recorded by this request.
          </p>
        </>
      )}
    </Disclosure>
  );
}
