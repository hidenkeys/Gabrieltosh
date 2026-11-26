import { useMoney } from "../ui/Currency";
import { useEffect, useRef, useState } from "react";
import ReasonInput from "../ui/ReasonInput";
import { customerRequest, requestId } from "./client";
import {
  readCancellationJournal,
  saveCancellationJournal,
  clearCancellationJournal,
  proveCancellationSession,
  type CancellationJournal,
} from "./cancellationRecovery";
import {
  reservationStatusLabel,
  reservationDateLabel,
} from "./reservationPresentation";

export default function GuestActivity({
  prefix,
  timeZone,
}: {
  prefix: string;
  timeZone?: string;
}) {
  // A venue change must synchronously discard the previous venue's private view
  // and pending cancellation intents, before the next request completes.
  return (
    <ScopedGuestActivity key={prefix} prefix={prefix} timeZone={timeZone} />
  );
}
function ScopedGuestActivity({
  prefix,
  timeZone,
}: {
  prefix: string;
  timeZone?: string;
}) {
  const money = useMoney();
  const [activity, setActivity] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [privateBlocked, setPrivateBlocked] = useState(false);
  const pendingJournal = useRef<CancellationJournal | null>(null),
    blocked = useRef(false),
    inFlight = useRef(false);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  const cancellationIntents = useRef(
    new Map<string, { requestKey: string; reason: string }>(),
  );
  async function load() {
    const generation = ++loadGeneration.current;
    if (!mounted.current) return;
    setLoading(true);
    try {
      if (blocked.current) return;
      if (pendingJournal.current)
        await proveCancellationSession(prefix, pendingJournal.current);
      if (!mounted.current || generation !== loadGeneration.current) return;
      const next = await customerRequest(prefix + "/activity");
      if (!mounted.current || generation !== loadGeneration.current) return;
      setActivity(next);
      setPrivateBlocked(false);
      setError("");
    } catch (e) {
      if (!mounted.current || generation !== loadGeneration.current) return;
      if (
        pendingJournal.current ||
        [401, 403, 404].includes((e as any).status)
      ) {
        setActivity(null);
        setPrivateBlocked(true);
      }
      setError((e as Error).message);
    } finally {
      if (mounted.current && generation === loadGeneration.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = readCancellationJournal(prefix);
      if (saved) {
        if (!("body" in saved))
          throw Error(
            "Private cancellation details were cleared. Ask staff to check the original request before requesting another.",
          );
        pendingJournal.current = saved;
        cancellationIntents.current.set(saved.reservationId, saved.body);
        setPrivateBlocked(true);
      }
      void load();
    } catch {
      blocked.current = true;
      setPrivateBlocked(true);
      setLoading(false);
      setError(
        "Saved cancellation details could not be verified. No replacement request will be sent. Ask staff to check the original request.",
      );
    }
    return () => {
      mounted.current = false;
      loadGeneration.current++;
    };
  }, [prefix]);
  async function cancel(reservationId: string, reason: string) {
    if (inFlight.current || blocked.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      let intent = cancellationIntents.current.get(reservationId);
      if (
        pendingJournal.current &&
        pendingJournal.current.reservationId !== reservationId
      )
        throw Error(
          "Check the original cancellation before requesting another.",
        );
      if (intent && intent.reason !== reason)
        throw Error(
          "Refresh your activity to check the previous cancellation request before changing its reason.",
        );
      const sessionRef = await proveCancellationSession(
        prefix,
        pendingJournal.current,
      );
      if (!mounted.current) return;
      if (!intent) intent = { requestKey: requestId(), reason: reason.trim() };
      const saved = saveCancellationJournal({
        version: 1,
        prefix,
        sessionRef,
        reservationId,
        body: intent,
      });
      pendingJournal.current = saved;
      cancellationIntents.current.set(reservationId, saved.body);
      const result = await customerRequest(
        prefix + `/reservations/${reservationId}/cancellation`,
        "POST",
        saved.body,
      );
      if (!mounted.current) return;
      if (result?.id !== reservationId || result?.refundConfirmed !== false)
        throw Error(
          "The original cancellation result could not be verified. Retry the same request.",
        );
      clearCancellationJournal(prefix, saved.body.requestKey);
      pendingJournal.current = null;
      cancellationIntents.current.delete(reservationId);
      await load();
    } catch (e) {
      if (mounted.current) {
        if ([401, 403, 404].includes((e as any).status)) {
          loadGeneration.current++;
          setActivity(null);
          setPrivateBlocked(true);
        }
        setError((e as Error).message);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="mc-panel mc-activity">
      <h2>Your visits & feedback</h2>
      <p>
        Your reservations and feedback from this guest session. Opening another
        device will not show this history.
      </p>
      <button
        className="mc-secondary"
        disabled={busy || loading}
        onClick={() => void load()}
      >
        Refresh your activity
      </button>
      {loading && <p role="status">Loading your activity…</p>}
      {error && <p role="alert">{error}</p>}
      {pendingJournal.current && (
        <p role="status">
          An original cancellation still needs checking. It is saved in this tab
          and is never retried automatically.
        </p>
      )}
      {pendingJournal.current &&
        (privateBlocked ||
          !activity?.reservations?.some(
            (r: any) =>
              r.id === pendingJournal.current?.reservationId &&
              !r.cancellationRequestedAt &&
              ["requested", "confirmed"].includes(r.status),
          )) && (
          <section aria-label="Original cancellation request">
            {!privateBlocked && (
              <p>Original reason: {pendingJournal.current.body.reason}</p>
            )}
            <button
              type="button"
              className="mc-secondary"
              disabled={busy || loading}
              onClick={() =>
                void cancel(
                  pendingJournal.current!.reservationId,
                  pendingJournal.current!.body.reason,
                )
              }
            >
              Retry cancellation request
            </button>
          </section>
        )}
      {activity && !privateBlocked && (
        <>
          <h3>Reservations</h3>
          {!activity.reservations?.length && (
            <p>No reservations in this guest session.</p>
          )}
          {activity.reservations?.map((reservation: any) => (
            <article key={reservation.id}>
              <h4>
                {reservationDateLabel(reservation.startsAt, timeZone)} ·{" "}
                {reservation.partySize} guests
              </h4>
              <p className="mc-reservation-status">
                {reservationStatusLabel(reservation.status)}
              </p>
              {reservation.status === "requested" && (
                <p>
                  The venue has received your request. Your table is awaiting
                  confirmation.
                </p>
              )}
              {reservation.depositRequired > 0 && (
                <p>
                  Required deposit {money(reservation.depositRequired)} · staff
                  recorded {money(reservation.depositAmount || 0)}
                </p>
              )}
              {reservation.minimumSpendPolicy?.enabled && (
                <div className="mc-note">
                  <p>
                    Booked minimum spend:{" "}
                    {money(reservation.minimumSpendPolicy.amount)}.
                  </p>
                  <p>{reservation.minimumSpendPolicy.disclosure}</p>
                  <p>
                    Original booked terms apply. No automatic shortfall charge
                    is added.
                  </p>
                </div>
              )}
              {reservation.cancellationRequestedAt ? (
                <p role="status">
                  {reservation.status === "cancelled"
                    ? "Your reservation is cancelled; no refund is confirmed."
                    : "Cancellation requested. Staff must review this request and any deposit; no refund is confirmed."}
                </p>
              ) : (
                ["requested", "confirmed"].includes(reservation.status) && (
                  <details className="mc-reservation-cancellation">
                    <summary>Request cancellation</summary>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const values = new FormData(event.currentTarget);
                        void cancel(
                          reservation.id,
                          String(values.get("reason")),
                        );
                      }}
                    >
                      <CancellationReason
                        original={
                          cancellationIntents.current.get(reservation.id)
                            ?.reason
                        }
                        busy={busy}
                      />
                      {cancellationIntents.current.has(reservation.id) && (
                        <p role="status">
                          Keep the original reason while this request is
                          checked. A retry sends the same request.
                        </p>
                      )}
                      <p>
                        Staff must confirm the cancellation. If a deposit was
                        recorded, staff must review it separately; this request
                        does not confirm a refund.
                      </p>
                      <button className="mc-secondary" disabled={busy}>
                        {cancellationIntents.current.has(reservation.id)
                          ? "Retry cancellation request"
                          : "Send cancellation request"}
                      </button>
                    </form>
                  </details>
                )
              )}
            </article>
          ))}
          <h3>Private ratings & feedback</h3>
          {!activity.feedback?.length && (
            <p>No submitted feedback in this guest session.</p>
          )}
          {activity.feedback?.map((feedback: any) => (
            <article key={feedback.id}>
              <h4>
                {feedback.category} · {feedback.rating} / 5
              </h4>
              <p>{feedback.text}</p>
              <p>
                Status: {feedback.status} ·{" "}
                {new Date(feedback.createdAt).toLocaleString("en-GB")}
              </p>
            </article>
          ))}
        </>
      )}
    </section>
  );
}

// Keep each booking's draft local; an uncertain request always submits its
// immutable original reason, even while its visible choices are disabled.
function CancellationReason({
  original,
  busy,
}: {
  original?: string;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(original || "");
  const value = original ?? draft;
  return (
    <>
      <ReasonInput
        label="Cancellation reason"
        value={value}
        onChange={setDraft}
        presets={["Plans changed", "Booked another time", "Unable to attend"]}
        minLength={3}
        maxLength={500}
        required
        disabled={busy || original !== undefined}
      />
      <input type="hidden" name="reason" value={value} />
    </>
  );
}
