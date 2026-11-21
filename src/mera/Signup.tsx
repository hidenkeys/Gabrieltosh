import ProviderSignup from "./ProviderSignup";
import { MeraBrand } from "./ui/MeraBrand";
import {
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  Store,
  Utensils,
  Users,
} from "lucide-react";
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
  const [providerToken] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    return fragment.has("verify")
      ? fragment.get("verify") || "invalid"
      : undefined;
  });
  useEffect(() => {
    if (providerToken)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
  }, [providerToken]);
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  const [showPassword, setShowPassword] = useState(false);
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
        if (
          !["blocked", "simulator", "provider"].includes(value.registration)
        ) {
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
      !demo ||
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
      !demo ||
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
    <div className="mera-signup mera-identity">
      <a
        className="mera-marketing-skip"
        href="#mera-signup-main"
        onClick={navigate}
      >
        Skip to owner setup
      </a>
      <header className="mera-signup-header">
        <a className="mera-signup-home" href="/mera" aria-label="MeraTech home">
          <MeraBrand />
        </a>
        <div className="mera-signup-access">
          <span>Already part of a team?</span>
          <a href="/mera/workspace">
            Sign in <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </header>
      <main id="mera-signup-main">
        <section
          className="mera-signup-introduction"
          aria-labelledby="owner-start-title"
        >
          <p className="eyebrow">MERA QR · YOUR BUSINESS, CONNECTED</p>
          <h1 id="owner-start-title">
            Make room for <br />
            better service.
          </h1>
          <p>
            One place for your menu, your people and every step of service.
            Start with your account. Build the rest at your pace.
          </p>
          <ol className="mera-account-steps" aria-label="Getting started">
            <li aria-current="step">
              <span>01</span>
              <div>
                <strong>Your owner account</strong>
                <small>A secure starting point for your business.</small>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Your organization</strong>
                <small>Branch, service modes and your own identity.</small>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Ready for service</strong>
                <small>Menu, team and a considered launch checklist.</small>
              </div>
            </li>
          </ol>
          <div className="mera-signup-service">
            <Store size={20} aria-hidden="true" />
            <Utensils size={20} aria-hidden="true" />
            <Users size={20} aria-hidden="true" />
            <span>From the first counter to the last table.</span>
          </div>
          <a className="mera-signup-price-link" href="/mera/qr#commercial">
            Discuss plans and terms <ArrowRight size={15} aria-hidden="true" />
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
          {(providerToken || capabilities?.registration === "provider") && (
            <ProviderSignup
              verificationToken={providerToken}
              recipientPolicy={
                capabilities?.recipientPolicy === "public"
                  ? "public"
                  : "allowlist"
              }
            />
          )}
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
          {!providerToken &&
            (capabilities?.registration === "blocked" ||
              (capabilities?.registration === "simulator" && !demo)) &&
            !locked && (
              <>
                <div className="mera-signup-state-icon">
                  <ShieldCheck size={25} aria-hidden="true" />
                </div>
                <p className="mera-signup-badge">New owner registration</p>
                <h2 tabIndex={-1}>
                  Registration is awaiting verification setup
                </h2>
                <p>
                  Owner email delivery and sender authorization must be
                  configured before public registration opens.{" "}
                  {locked
                    ? "No new registration has been sent from this page; the earlier request still needs review."
                    : "No account has been created."}
                </p>
                <div className="mera-signup-readiness">
                  <strong>What this means</strong>
                  <p>
                    We will only open registration when we can securely verify
                    your email. Existing owners and invited staff can still sign
                    in.
                  </p>
                </div>
                <a className="primary" href="/mera/workspace">
                  Open existing workspace{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
                {capabilities?.registration === "simulator" && (
                  <div className="mera-signup-demo-entry">
                    <strong>Just exploring?</strong>
                    <p>
                      Use a separate demonstration account. No email is
                      delivered and no billing is activated.
                    </p>
                    <a href="/mera/signup?demo=1">
                      Explore the owner demo{" "}
                      <ArrowRight size={14} aria-hidden="true" />
                    </a>
                  </div>
                )}
              </>
            )}
          {demo &&
            capabilities?.registration === "simulator" &&
            !registration &&
            !verified &&
            !locked && (
              <>
                <p className="mera-signup-badge">
                  Demonstration · Account 1 of 2
                </p>
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
                    <label htmlFor="owner-password">Password</label>
                    <div className="mera-password-control">
                      <input
                        id="owner-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        aria-describedby="password-help"
                      />
                      <button
                        type="button"
                        className="mera-password-toggle"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? (
                          <EyeOff size={18} aria-hidden="true" />
                        ) : (
                          <Eye size={18} aria-hidden="true" />
                        )}
                      </button>
                    </div>
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
              <p className="mera-signup-badge">
                Demonstration · Verification 2 of 2
              </p>
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
              <a className="primary" href="/mera/workspace?setup=1">
                Continue to organization setup →
              </a>
            </>
          )}
        </section>
      </main>
      <footer>
        <a href="/mera/legal">Privacy & terms preparation</a>
        <a href="/mera/platform">Platform operator access</a>
        <span>
          <ShieldCheck size={14} aria-hidden="true" /> No payment is taken
          during setup.
        </span>
      </footer>
    </div>
  );
}
