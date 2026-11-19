import { Disclosure } from "./ui/OperationalPrimitives";
import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./workspace/api";
import { usePublicNavigation } from "./marketing/publicNavigation";
import {
  readSignupRecovery,
  saveSignupRecovery,
  clearSignupRecovery,
  validRegistrationAck,
  validVerificationAck,
  type SignupMarker,
} from "./signupRecovery";
const sections = ["mera-signup-main"];
const registrationPending: SignupMarker = {
  version: 1,
  phase: "registration",
  status: "pending",
};
const registrationReady: SignupMarker = {
  version: 1,
  phase: "registration",
  status: "verification_ready",
};
const verificationPending: SignupMarker = {
  version: 1,
  phase: "verification",
  status: "pending",
};
export default function Signup() {
  const navigate = usePublicNavigation(sections);
  const mounted = useRef(false),
    inFlight = useRef(false);
  const [locked, setLocked] = useState(
    () => readSignupRecovery().state !== "clear",
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const card = useRef<HTMLElement>(null);
  const [readinessAttempt, setReadinessAttempt] = useState(0);
  const [checking, setChecking] = useState(true);
  const [capabilities, setCapabilities] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [registration, setRegistration] = useState<any>(null),
    [verified, setVerified] = useState(false);
  useEffect(() => {
    let active = true;
    setChecking(true);
    setError("");
    workspaceApi("/identity/capabilities")
      .then((value) => {
        if (!active) return;
        if (!["blocked", "simulator"].includes(value.registration)) {
          setError(
            "Registration readiness could not be confirmed. Please try again.",
          );
          return;
        }
        setCapabilities(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [readinessAttempt]);
  useEffect(() => {
    if (!checking)
      card.current
        ?.querySelector<HTMLElement>(error ? '[role="alert"]' : "h2")
        ?.focus();
  }, [checking, error, registration, verified]);
  const pause = (message: string) => {
    if (mounted.current) {
      setLocked(true);
      setError(message);
    }
  };
  async function register(event: React.FormEvent) {
    event.preventDefault();
    if (
      inFlight.current ||
      busy ||
      checking ||
      capabilities?.registration !== "simulator" ||
      registration ||
      verified ||
      locked
    )
      return;
    inFlight.current = true;
    if (!saveSignupRecovery(registrationPending, null)) {
      inFlight.current = false;
      pause(
        "A previous registration needs checking, or safe recovery storage is unavailable. No new request was sent.",
      );
      return;
    }
    const body = { name, email, password };
    setBusy(true);
    setError("");
    setPassword("");
    try {
      const result = await workspaceApi("/identity/register", "POST", body);
      if (!validRegistrationAck(result)) {
        pause(
          "The registration response could not be confirmed. An account may have been created. Do not submit another registration.",
        );
        return;
      }
      if (!saveSignupRecovery(registrationReady, registrationPending)) {
        pause(
          "Registration returned, but safe recovery could not be saved. Account review is required before continuing.",
        );
        return;
      }
      if (mounted.current) setRegistration(result);
    } catch (e: any) {
      // These registration responses occur before mutation or after a rolled-back unique conflict.
      if (
        [400, 409, 429].includes(e.status) &&
        clearSignupRecovery(registrationPending)
      ) {
        if (mounted.current) setError(e.message);
      } else
        pause(
          "The registration outcome could not be confirmed. An account may have been created. Do not submit another registration.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function verify() {
    if (
      inFlight.current ||
      busy ||
      checking ||
      locked ||
      capabilities?.registration !== "simulator" ||
      !validRegistrationAck(registration) ||
      verified
    )
      return;
    inFlight.current = true;
    if (!saveSignupRecovery(verificationPending, registrationReady)) {
      inFlight.current = false;
      pause(
        "The original registration needs account review before verification can continue. No request was sent.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await workspaceApi("/identity/verify", "POST", {
        token: registration.verificationToken,
      });
      if (!validVerificationAck(result)) {
        pause(
          "The verification result could not be confirmed. Do not repeat verification; the account may already be enabled.",
        );
        return;
      }
      if (!clearSignupRecovery(verificationPending)) {
        pause(
          "Verification returned, but recovery storage could not be cleared. Review the existing account before continuing.",
        );
        return;
      }
      if (mounted.current) {
        setRegistration(null);
        setVerified(true);
      }
    } catch {
      // Even a rejected token can belong to an already created account; never unlock fresh registration.
      pause(
        "Verification could not be confirmed. The token may be expired or already used, or the account may already be enabled. Review the existing account before continuing.",
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="mera-signup">
      <a
        className="mera-marketing-skip"
        href="#mera-signup-main"
        onClick={navigate}
      >
        Skip to owner setup
      </a>
      <header className="mera-signup-header">
        <a className="mera-wordmark" href="/mera">
          mera<span>.</span>
        </a>
        <a href="/mera/workspace">Staff sign-in →</a>
      </header>
      <main id="mera-signup-main">
        <section className="mera-signup-introduction">
          <p className="eyebrow">OWNER SETUP</p>
          <h1>Set up your organization.</h1>
          <p>
            Start with an owner account. Then add your branches, menu and team.
          </p>
          <Disclosure
            className="mera-signup-explanation"
            summary="Setup and pricing details"
          >
            <p>
              Your branches, service policies and brand stay in your control.
            </p>
            <ol>
              <li>Create an owner account.</li>
              <li>Configure your organization and branches.</li>
              <li>Preview your menu and review readiness.</li>
            </ol>
            <p className="mera-signup-note">
              Pricing and payment settings remain proposals until agreed. No
              subscription charge or online collection happens during this
              preview.
            </p>
          </Disclosure>
          <a className="mera-signup-price-link" href="/mera#pricing">
            Review proposed pricing
          </a>
        </section>
        <section
          className="mera-signup-card"
          aria-label="Owner onboarding"
          ref={card}
          aria-busy={checking || busy}
        >
          {error && (
            <p role="alert" tabIndex={-1} className="info-box">
              {error}
            </p>
          )}
          {!capabilities && error && !checking && (
            <button
              className="secondary"
              onClick={() => setReadinessAttempt((n) => n + 1)}
            >
              Retry registration check
            </button>
          )}
          {checking && <p role="status">Checking registration readiness…</p>}
          {locked && (
            <section aria-label="Account reconciliation required">
              <h2 tabIndex={-1}>Signup status needs checking</h2>
              <p>
                A previous account request may still need review. No new signup
                is sent while this tab cannot confirm its saved status.
                Reloading does not resolve an existing paused request.
                Verification details are kept only in memory and cannot be
                recovered after leaving this page.
              </p>
              <p>
                No automatic resend or account lookup is available here. Review
                the existing account with an authorized administrator. Email,
                SMS and support delivery are unavailable in this demonstration.
              </p>
              <a className="secondary" href="/mera/workspace">
                Review existing workspace access
              </a>
              <a href="/mera/legal">Review policy information</a>
            </section>
          )}
          {capabilities?.registration === "blocked" && (
            <>
              <h2 tabIndex={-1}>Registration is awaiting verification setup</h2>
              <p>
                Owner email delivery and sender authorization must be configured
                before public registration opens.{" "}
                {locked
                  ? "No new registration has been sent from this page; the earlier request still needs review."
                  : "No account has been created."}
              </p>
              <a className="secondary" href="/mera/workspace">
                Open existing workspace
              </a>
            </>
          )}
          {capabilities?.registration === "simulator" &&
            !registration &&
            !verified &&
            !locked && (
              <>
                <p className="mera-signup-badge">Development environment</p>
                <h2 tabIndex={-1}>Explore owner onboarding</h2>
                <p>
                  Use demonstration details. Verification is simulated here; no
                  email is sent and no real email ownership is established.
                </p>
                <form onSubmit={register}>
                  <fieldset disabled={busy} className="mera-signup-fields">
                    <label>
                      Your name
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        required
                        maxLength={100}
                      />
                    </label>
                    <label>
                      Demonstration email
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                        maxLength={254}
                      />
                    </label>
                    <label>
                      Password
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        aria-describedby="password-help"
                      />
                    </label>
                    <p id="password-help">
                      Use at least 12 characters and a password unique to this
                      demonstration.
                    </p>
                    <button className="primary" disabled={busy}>
                      {busy
                        ? "Creating demonstration account…"
                        : "Create demonstration account"}
                    </button>
                  </fieldset>
                </form>
              </>
            )}
          {registration && !locked && (
            <>
              <p className="mera-signup-badge">Simulated verification</p>
              <h2 tabIndex={-1}>Try the verification step</h2>
              <p>
                No email has been sent. This development action consumes a
                single-use verification token and enables this demonstration
                account. Production verification stays blocked.
              </p>
              <button className="primary" onClick={verify} disabled={busy}>
                {busy
                  ? "Verifying demonstration…"
                  : "Verify in this demonstration"}
              </button>
            </>
          )}
          {verified && (
            <>
              <h2 tabIndex={-1}>Your demonstration account is ready</h2>
              <p>
                Sign in using your demonstration email and password to create an
                organization. This does not verify a real email address or
                activate billing.
              </p>
              <a className="primary" href="/mera/workspace">
                Continue to organization setup →
              </a>
            </>
          )}
        </section>
      </main>
      <footer>
        <a href="/mera/legal">Privacy & terms preparation</a>
        <span>No production registration or payment activation.</span>
      </footer>
    </div>
  );
}
