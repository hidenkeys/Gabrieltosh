import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
import { providerAck } from "../ProviderSignup";

export default function OwnerVerification({
  actorId,
  demo,
  onVerified,
  refreshKey = 0,
  disabled = false,
}: {
  actorId: string;
  demo: boolean;
  onVerified: (verified: boolean) => void;
  refreshKey?: number;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const flight = useRef(false),
    generation = useRef(0);
  const recoveryKey = `mera:owner-resend:v1:${actorId}`;
  async function check() {
    if (flight.current || demo) return;
    const current = generation.current;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await workspaceApi(
        "/identity/owner-status",
        "GET",
        undefined,
        undefined,
        { expectedActorId: actorId },
      );
      if (current !== generation.current) return;
      if (
        ![
          "verified",
          "unverified",
          "no_owner_identity",
          "platform_operator",
        ].includes(result?.state)
      )
        throw Error("Your owner account status could not be confirmed.");
      setStatus(result);
      onVerified(result.state === "verified");
    } catch (e: any) {
      if (current === generation.current) {
        setError(e.message);
        onVerified(false);
      }
    } finally {
      if (current === generation.current) {
        flight.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    generation.current++;
    flight.current = false;
    setStatus(null);
    setError("");
    try {
      setPending(!!window.sessionStorage.getItem(recoveryKey));
      setStorageBlocked(false);
    } catch {
      setStorageBlocked(true);
    }
    onVerified(demo);
    if (!demo) void check();
    return () => {
      generation.current++;
    };
  }, [actorId, demo, refreshKey]);
  async function resend() {
    if (disabled || flight.current || status?.state !== "unverified") return;
    const current = generation.current;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      let resendKey = window.sessionStorage.getItem(recoveryKey);
      if (!resendKey) {
        resendKey = crypto.randomUUID();
        window.sessionStorage.setItem(recoveryKey, resendKey);
      }
      if (
        !/^[0-9a-f-]{36}$/i.test(resendKey) ||
        window.sessionStorage.getItem(recoveryKey) !== resendKey
      )
        throw Error(
          "Safe recovery is unavailable. No new email request was sent.",
        );
      setPending(true);
      const result = await workspaceApi(
        "/identity/owner-resend",
        "POST",
        { resendKey },
        undefined,
        { expectedActorId: actorId },
      );
      if (current !== generation.current) return;
      if (!providerAck(result, resendKey))
        throw Error(
          "Email acceptance could not be confirmed. Retry this same email request.",
        );
      if (result.emailDelivery === "accepted" || result.verified === true) {
        window.sessionStorage.removeItem(recoveryKey);
        setPending(false);
      }
      setStatus({
        ...status,
        delivery: result,
        canResend: result.canResend,
        resendAvailableAt: result.resendAvailableAt,
        reason: result.reason,
      });
    } catch (e: any) {
      if (current === generation.current)
        setError(
          e.message ||
            "Email acceptance could not be confirmed. Retry this same email request.",
        );
    } finally {
      if (current === generation.current) {
        flight.current = false;
        setBusy(false);
      }
    }
  }
  if (demo || status?.state === "verified") return null;
  const noOwner =
    status?.state === "platform_operator" ||
    status?.state === "no_owner_identity";
  const delivery = status?.delivery;
  return (
    <section
      className="mera-owner-note mera-owner-verification"
      aria-label="Owner email verification"
      aria-busy={busy}
    >
      <h3>
        {noOwner
          ? "Use an owner account to create a business"
          : status
            ? "Verify your owner email"
            : "Checking your owner account"}
      </h3>
      {error && <p role="alert">{error}</p>}
      {noOwner ? (
        <>
          <p>
            {status.state === "platform_operator"
              ? "You are signed in with a Mera platform administration account. It does not have a business owner email to verify."
              : "This signed-in account does not have a business owner identity to verify."}
          </p>
          {status.state === "platform_operator" && (
            <p>
              <a href="/mera/platform">Open platform administration</a>
            </p>
          )}
          <p>
            To create a business, sign out using the account menu, then{" "}
            <a href="/mera/signup">create an owner account</a>.
          </p>
          <p>
            Already have an owner account? After signing out,{" "}
            <a href="/mera/workspace?setup=1">sign in as the owner</a>.
          </p>
        </>
      ) : status ? (
        <>
          <p>
            Verify {status.email || "your owner email"} before creating your
            organization. Your business details stay here while you check.
          </p>
          {delivery?.emailDelivery === "accepted" && (
            <p role="status">
              The email provider accepted your verification email. Inbox
              delivery is not yet confirmed. Use the newest verification link.
            </p>
          )}
          {delivery?.expired && (
            <p>
              Your previous link has expired. Request a new verification email.
            </p>
          )}
          {status.reason === "daily_limit" ? (
            <p>The daily email limit has been reached. Try again later.</p>
          ) : status.reason === "provider_unavailable" ? (
            <p>Email delivery is currently unavailable.</p>
          ) : (
            status.resendAvailableAt &&
            !status.canResend && (
              <p>
                Another email can be requested after{" "}
                {new Date(status.resendAvailableAt).toLocaleTimeString()}. Check
                verification to refresh availability.
              </p>
            )
          )}
          {storageBlocked && (
            <p role="alert">
              Safe email recovery is unavailable in this browser. No email
              request will be sent.
            </p>
          )}
          <button
            className="primary"
            type="button"
            disabled={
              disabled ||
              busy ||
              storageBlocked ||
              (!status.canResend && !pending)
            }
            onClick={() => void resend()}
          >
            {busy
              ? "Please wait…"
              : pending
                ? "Retry same verification email request"
                : "Resend verification email"}
          </button>
        </>
      ) : (
        <p>
          Organization creation is paused until your account status is
          confirmed.
        </p>
      )}
      {!noOwner && (
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() => void check()}
        >
          {busy ? "Checking…" : "Check verification"}
        </button>
      )}
    </section>
  );
}
