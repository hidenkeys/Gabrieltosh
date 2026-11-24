import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { MeraBrand } from "./ui/MeraBrand";

type Preview = {
  organizationName: string;
  role: string;
  email: string;
  expiresAt: string;
  accountExists: boolean;
  signedInAsInvitee: boolean;
};
const storageKey = "mera-invitation-token";
export default function InviteAccept() {
  const [token] = useState(() => {
    const incoming = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (window.location.hash)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    if (incoming) window.sessionStorage.setItem(storageKey, incoming);
    return incoming || window.sessionStorage.getItem(storageKey) || "";
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!token)
          throw new Error(
            "This invitation link is missing. Open the link in your invitation email.",
          );
        const [invite, me] = await Promise.all([
          api<Preview>("/mera/v1/invitations/preview", "POST", { token }),
          fetch("/api/me", { credentials: "same-origin" })
            .then((r) => r.ok)
            .catch(() => false),
        ]);
        if (active) {
          setPreview(invite);
          setSignedIn(me);
        }
      } catch (cause) {
        if (active) {
          setInvalid(true);
          setError(
            cause instanceof Error
              ? cause.message
              : "This invitation is unavailable. Ask your administrator for a new invitation.",
          );
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [token]);
  async function accept(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!preview?.accountExists && password !== confirm) {
      setError("Passwords must match.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/mera/v1/invitations/accept", "POST", {
        token,
        ...(!preview?.accountExists ? { name, password } : {}),
      });
      window.sessionStorage.removeItem(storageKey);
      window.location.assign("/mera/workspace");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to accept the invitation. Try again.",
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
      </header>
      <main className="mera-signin-layout">
        <section className="mera-signin-intro">
          <p className="eyebrow">Team invitation</p>
          <h1>
            {preview
              ? `Join ${preview.organizationName} as ${preview.role}`
              : "Your Mera invitation"}
          </h1>
          {preview && (
            <p>
              This invitation is for {preview.email}. It expires{" "}
              {new Date(preview.expiresAt).toLocaleString()}.
            </p>
          )}
        </section>
        <section
          className="mera-signin-panel"
          aria-label="Accept team invitation"
        >
          {!preview && !invalid && <p role="status">Loading invitation…</p>}
          {error && (
            <p className="mera-signin-error" role="alert">
              {error}
            </p>
          )}
          {invalid ? (
            <a href="/mera">Return to Mera</a>
          ) : (
            preview &&
            (signedIn && !preview.signedInAsInvitee ? (
              <>
                <p>
                  Sign out and sign in with {preview.email} to accept this
                  invitation.
                </p>
                <button
                  className="mera-signin-submit"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api("/logout", "POST");
                      window.location.assign("/mera/sign-in?next=/mera/invite");
                    } catch {
                      setError("Unable to sign out. Try again.");
                      setBusy(false);
                    }
                  }}
                >
                  Sign out
                </button>
              </>
            ) : preview.accountExists && !preview.signedInAsInvitee ? (
              <>
                <p>Sign in with {preview.email} to join your team.</p>
                <a
                  className="mera-signin-submit"
                  href="/mera/sign-in?next=/mera/invite"
                >
                  Sign in to accept invitation
                </a>
              </>
            ) : (
              <form onSubmit={accept} aria-busy={busy}>
                {!preview.accountExists && (
                  <>
                    <label>
                      Your name
                      <input
                        autoComplete="name"
                        required
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      Password
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={12}
                        maxLength={200}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <p>Use at least 12 characters.</p>
                    <label>
                      Confirm password
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={12}
                        maxLength={200}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                  </>
                )}
                <button
                  className="mera-signin-submit"
                  type="submit"
                  disabled={busy}
                >
                  {busy
                    ? "Joining…"
                    : preview.signedInAsInvitee
                      ? "Accept invitation"
                      : "Create account and join"}
                </button>
              </form>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
