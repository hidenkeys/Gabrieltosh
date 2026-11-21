import { useRef, useState } from "react";
import { workspaceApi } from "./workspace/api";
const storageKey = "mera:owner-provider-registration:v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function providerAck(value: any, key: string) {
  return (
    value?.requestKey === key &&
    value?.status === "verification_required" &&
    value?.simulation === false &&
    ["pending", "sending", "unknown", "not_sent", "accepted"].includes(
      value.emailDelivery,
    ) &&
    typeof value.retryAllowed === "boolean" &&
    typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    !("verificationToken" in value)
  );
}
function recovery() {
  try {
    const key = sessionStorage.getItem(storageKey);
    if (key && !uuid.test(key)) throw Error();
    return { key, blocked: false };
  } catch {
    return { key: null, blocked: true };
  }
}
export default function ProviderSignup({
  verificationToken,
  recipientPolicy = "allowlist",
}: {
  verificationToken?: string;
  recipientPolicy?: "public" | "allowlist";
}) {
  const [initial] = useState(recovery),
    [key, setKey] = useState(initial.key),
    [blocked, setBlocked] = useState(initial.blocked);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ack, setAck] = useState<any>(null),
    [verified, setVerified] = useState(false),
    [verifyUnknown, setVerifyUnknown] = useState(false);
  const flight = useRef(false);
  async function action(kind: "register" | "recover" | "retry" | "verify") {
    if (flight.current || (blocked && kind !== "verify")) return;
    flight.current = true;
    setBusy(true);
    setError("");
    let requestKey = key;
    try {
      let body: any;
      if (kind === "register") {
        if (key) return;
        requestKey = crypto.randomUUID();
        sessionStorage.setItem(storageKey, requestKey);
        if (sessionStorage.getItem(storageKey) !== requestKey) {
          setBlocked(true);
          throw Error(
            "This browser cannot safely preserve your request. No account request was sent.",
          );
        }
        setKey(requestKey);
        body = { requestKey, name, email, password };
        setPassword("");
      } else if (kind === "verify") {
        body = { token: verificationToken };
      } else {
        body = { requestKey };
      }
      const result = await workspaceApi(
        `/identity/provider/${kind}`,
        "POST",
        body,
      );
      if (kind === "verify") {
        if (
          result?.verified !== true ||
          result.realEmailVerified !== true ||
          result.simulation !== false
        )
          throw Error(
            "Verification could not be confirmed. Try signing in before attempting the link again.",
          );
        setVerified(true);
        // Keep an unrelated original registration recovery reference intact.
        // The email token may have been opened in a tab used for another request.
      } else {
        if (!providerAck(result, requestKey!))
          throw Error(
            "The response could not be confirmed. Check the original request below before doing anything else.",
          );
        setAck(result);
      }
    } catch (e: any) {
      if (
        kind === "register" &&
        (e.status === 400 || e.code === "RECIPIENT_NOT_ALLOWED")
      ) {
        try {
          if (sessionStorage.getItem(storageKey) === requestKey) {
            sessionStorage.removeItem(storageKey);
            if (sessionStorage.getItem(storageKey) === null) setKey(null);
          }
        } catch {
          setBlocked(true);
        }
      }
      setError(e.message || "This action could not be confirmed.");
      if (kind === "verify") setVerifyUnknown(true);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  if (verificationToken)
    return (
      <div className="mera-provider-signup">
        <p className="mera-signup-badge">Mera QR owner account</p>
        <h2>{verified ? "Your email is verified." : "Confirm your email"}</h2>
        {verified ? (
          <>
            <p>
              You can now sign in with your owner email and password to set up
              your organization.
            </p>
            <a href="/mera/workspace?setup=1">Sign in and continue setup</a>
          </>
        ) : (
          <>
            <p>
              Choose Verify email to activate the account linked to this email.
              Opening this page alone does not activate it.
            </p>
            {error && <p role="alert">{error}</p>}
            {verifyUnknown && (
              <p>
                The link may already have been used.{" "}
                <a href="/mera/workspace?setup=1">Try signing in</a> before
                another attempt.
              </p>
            )}
            <button
              type="button"
              className="primary"
              disabled={busy || !/^[a-f0-9]{64}$/i.test(verificationToken)}
              onClick={() => void action("verify")}
            >
              {busy ? "Checking verification…" : "Verify email"}
            </button>
          </>
        )}
      </div>
    );
  if (blocked)
    return (
      <div>
        <h2>Check this browser before continuing</h2>
        <p role="alert">
          The original registration could not be read safely. No new account
          request will be sent. Preserve this tab and ask for account review.
        </p>
      </div>
    );
  if (key)
    return (
      <div className="mera-provider-signup">
        <p className="mera-signup-badge">Mera QR owner account</p>
        <h2>
          {ack?.emailDelivery === "accepted"
            ? "Check your email"
            : "Check your original request"}
        </h2>
        {ack?.emailDelivery === "accepted" ? (
          <p>
            The email provider accepted your verification email. Inbox delivery
            is not yet confirmed. Open its link and choose Verify email within
            one hour of registration.
          </p>
        ) : (
          <p>
            {ack?.emailDelivery === "not_sent"
              ? "The verification email was not sent. Your inactive account request is preserved."
              : ack?.emailDelivery === "sending"
                ? "The original send is still being checked. Wait a moment, then check it again."
                : "We have not confirmed email acceptance. Your original request is preserved; do not create another account."}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void action("recover")}
        >
          {busy ? "Checking…" : "Check original request"}
        </button>
        {ack?.retryAllowed && (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void action("retry")}
          >
            Retry original verification email
          </button>
        )}
        {ack &&
          !ack.retryAllowed &&
          ack.emailDelivery !== "accepted" &&
          ack.emailDelivery !== "sending" && (
            <p>
              This request needs account review before another email can be
              sent.
            </p>
          )}
        <p>Your password is not stored in this browser’s recovery record.</p>
        <a href="/mera/workspace?setup=1">Already verified? Sign in</a>
      </div>
    );
  return (
    <div className="mera-provider-signup">
      <p className="mera-signup-badge">Mera QR owner account</p>
      <h2>Create your owner account</h2>
      <p>
        We’ll send a verification link before your account can sign in.
        {recipientPolicy !== "public" &&
          " Registration is restricted to approved recipients."}
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action("register");
        }}
      >
        <label>
          Your name
          <input
            required
            maxLength={100}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Email address
          <input
            required
            type="email"
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            required
            type={visible ? "text" : "password"}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Hide password" : "Show password"}
        </button>
        <p>
          Use at least 12 characters. This tab keeps only a recovery reference
          if the connection fails.
        </p>
        <button type="submit" className="primary" disabled={busy}>
          Create owner account
        </button>
      </form>
    </div>
  );
}
