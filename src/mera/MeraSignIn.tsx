import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { api, type User } from "../api";
import { MeraBrand } from "./ui/MeraBrand";

export default function MeraSignIn({
  mode = "organization",
  onSignedIn,
}: {
  mode?: "organization" | "operator";
  onSignedIn?: (user: User) => void;
}) {
  const operator = mode === "operator";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const user = await api<User>("/login", "POST", { username, password });
      setPassword("");
      if (onSignedIn) onSignedIn(user);
      else
        window.location.assign(
          operator ? "/mera/platform" : safeMeraNext(window.location.search),
        );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Sign-in could not be completed.";
      setError(
        message.startsWith("Cannot reach the store server.")
          ? "We couldn’t reach Mera. Check your connection and try again."
          : message,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="mera-signin mera-identity">
      <header className="mera-signin-header">
        <a href="/mera" aria-label="Mera home">
          <MeraBrand />
        </a>
        <a href={operator ? "/mera/workspace" : "/mera"}>
          {operator ? "Owner or staff sign-in" : "Back to Mera"}
        </a>
      </header>
      <main className="mera-signin-layout">
        <section
          className="mera-signin-intro"
          aria-labelledby="mera-signin-title"
        >
          <p className="eyebrow">
            {operator ? "MERA PLATFORM OPERATIONS" : "YOUR BUSINESS WORKSPACE"}
          </p>
          <h1 id="mera-signin-title">
            {operator ? (
              <>
                The right access.
                <br />
                Every action accountable.
              </>
            ) : (
              <>
                Ready for your
                <br />
                next service.
              </>
            )}
          </h1>
          <p>
            {operator
              ? "A restricted workspace for authorized Mera operators. Organization accounts do not grant platform access."
              : "Sign in to pick up where your team left off. Your organization, branch and role determine what you can access."}
          </p>
          <div className="mera-signin-context">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>
                {operator
                  ? "Two steps to operator access"
                  : "One account. Your assigned workspace."}
              </strong>
              <p>
                {operator
                  ? "Enter your platform credentials, then verify a fresh authenticator code. Sensitive actions remain permission-controlled and audited."
                  : "Owners and staff use their existing account. Creating a new business is a separate setup journey."}
              </p>
            </div>
          </div>
          <a href={operator ? "/mera/workspace" : "/mera/signup"}>
            {operator
              ? "Looking for your organization workspace?"
              : "New business? Create an owner account"}
            <ArrowRight aria-hidden="true" />
          </a>
        </section>
        <section
          className="mera-signin-panel"
          aria-labelledby="mera-signin-form-title"
        >
          <div className="mera-signin-form-label">
            <KeyRound aria-hidden="true" />
            <span>
              {operator
                ? "RESTRICTED OPERATOR SIGN-IN"
                : "OWNER & STAFF SIGN-IN"}
            </span>
          </div>
          <h2 id="mera-signin-form-title">
            {operator ? "Sign in as an operator" : "Sign in to your workspace"}
          </h2>
          <p>
            {operator
              ? "Use the account provisioned for your Mera operator role."
              : "Use the account you created or your administrator assigned."}
          </p>
          <form onSubmit={signIn} aria-busy={busy}>
            <label htmlFor="mera-signin-username">
              Username
              <input
                id="mera-signin-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                maxLength={200}
                disabled={busy}
              />
            </label>
            <label htmlFor="mera-signin-password">Password</label>
            <div className="mera-signin-password">
              <input
                id="mera-signin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={200}
                disabled={busy}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </button>
            </div>
            {error && (
              <div
                className="mera-signin-error"
                role="alert"
                tabIndex={-1}
                ref={errorRef}
              >
                {error}
              </div>
            )}
            <button
              className="mera-signin-submit"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Signing in…"
                : operator
                  ? "Continue to verification"
                  : "Open workspace"}
              <ArrowRight aria-hidden="true" />
            </button>
          </form>
          {!operator && (
            <p className="mera-signin-help">
              <a href="/mera/signup?resend=1">
                Resend owner verification email
              </a>
            </p>
          )}
          <p className="mera-signin-help">
            {operator
              ? "Need operator access or an authenticator reset? Contact your authorized platform administrator."
              : "Need access or help with your account? Contact your organization administrator."}
          </p>
          {!operator && (
            <a
              className="mera-signin-operator-link"
              href="/mera/platform/sign-in"
            >
              Mera platform operator sign-in
            </a>
          )}
        </section>
      </main>
      <footer>
        <span>
          {operator
            ? "Mera platform administration"
            : "Mera · Hospitality, connected"}
        </span>
        <a href="/mera/legal">Privacy & terms preparation</a>
      </footer>
    </div>
  );
}

export function safeMeraNext(search: string) {
  const next = new URLSearchParams(search).get("next");
  if (next?.startsWith("/mera/") && !/[\\\x00-\x20]/.test(next)) {
    const url = new URL(next, window.location.origin);
    if (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/mera/")
    )
      return url.pathname + url.search + url.hash;
  }
  return "/mera/workspace";
}
