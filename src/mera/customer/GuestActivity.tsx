import { useEffect, useRef, useState } from "react";
import { customerRequest, requestId } from "./client";
import {
  reservationStatusLabel,
  reservationDateLabel,
} from "./reservationPresentation";
const money = (amount: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    amount / 100,
  );
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
  const [activity, setActivity] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
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
      const next = await customerRequest(prefix + "/activity");
      if (!mounted.current || generation !== loadGeneration.current) return;
      setActivity(next);
      setError("");
    } catch (e) {
      if (!mounted.current || generation !== loadGeneration.current) return;
      if ([401, 403, 404].includes((e as any).status)) setActivity(null);
      setError((e as Error).message);
    } finally {
      if (mounted.current && generation === loadGeneration.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadGeneration.current++;
    };
  }, [prefix]);
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
      {activity && (
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
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const values = new FormData(event.currentTarget);
                        setBusy(true);
                        setError("");
                        try {
                          const reason = String(values.get("reason"));
                          let intent = cancellationIntents.current.get(
                            reservation.id,
                          );
                          if (intent && intent.reason !== reason)
                            throw new Error(
                              "Refresh your activity to check the previous cancellation request before changing its reason.",
                            );
                          if (!intent) {
                            intent = { requestKey: requestId(), reason };
                            cancellationIntents.current.set(
                              reservation.id,
                              intent,
                            );
                          }
                          await customerRequest(
                            prefix +
                              `/reservations/${reservation.id}/cancellation`,
                            "POST",
                            intent,
                          );
                          if (!mounted.current) return;
                          await load();
                        } catch (e) {
                          if (mounted.current) setError((e as Error).message);
                        } finally {
                          if (mounted.current) setBusy(false);
                        }
                      }}
                    >
                      <label>
                        Cancellation reason
                        <textarea
                          name="reason"
                          required
                          minLength={3}
                          maxLength={500}
                          defaultValue={
                            cancellationIntents.current.get(reservation.id)
                              ?.reason || ""
                          }
                          readOnly={cancellationIntents.current.has(
                            reservation.id,
                          )}
                        />
                      </label>
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
