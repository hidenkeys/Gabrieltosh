import { useRef, useState } from "react";
import { ArrowRight, Store } from "lucide-react";
import { MeraBrand } from "../ui/MeraBrand";
import { workspaceApi } from "./api";
import OwnerVerification from "./OwnerVerification";
type Props = {
  rootDomain?: string | null;
  actorId: string;
  actorName: string;
  disabled: boolean;
  demo: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
  onCreated: () => Promise<any>;
};
export default function CreateOrganization({
  rootDomain,
  actorId,
  actorName,
  disabled,
  demo,
  save,
  onCreated,
}: Props) {
  const [verification, setVerification] = useState({ actorId, verified: demo });
  const [verificationRefresh, setVerificationRefresh] = useState(0);
  const ownerVerified =
    verification.actorId === actorId && verification.verified;
  const [name, setName] = useState(""),
    [slug, setSlug] = useState(""),
    [branch, setBranch] = useState("");
  const slugEdited = useRef(false);
  const [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false),
    [error, setError] = useState("");
  const [availability, setAvailability] = useState<{
    slug: string;
    text: string;
    available: boolean;
  } | null>(null);
  const recoveryKey = `mera:organization-create:v1:${actorId}`;
  const [locked, setLocked] = useState(() => {
    try {
      return !!window.sessionStorage.getItem(recoveryKey);
    } catch {
      return true;
    }
  });
  const flight = useRef(false),
    checkSequence = useRef(0);
  async function checkAddress() {
    const sequence = ++checkSequence.current,
      candidate = slug.trim().toLowerCase();
    setChecking(true);
    setAvailability(null);
    try {
      const result = await workspaceApi(
        `/organizations/address-availability?slug=${encodeURIComponent(candidate)}`,
      );
      if (sequence !== checkSequence.current) return;
      if (typeof result?.available !== "boolean")
        throw new Error("Unavailable");
      setAvailability({
        slug: candidate,
        available: result.available,
        text: result.available
          ? "Available now. The address is reserved when your organization is created."
          : result.reason === "already_claimed"
            ? "This address is already claimed. Choose another."
            : "Use 3–50 lowercase letters, numbers or single hyphens, starting with a letter. Platform names are reserved.",
      });
    } catch {
      if (sequence === checkSequence.current)
        setAvailability({
          slug: candidate,
          available: false,
          text: "Availability could not be checked. Try again before creating your organization.",
        });
    } finally {
      if (sequence === checkSequence.current) setChecking(false);
    }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (
      busy ||
      disabled ||
      locked ||
      flight.current ||
      !actorId ||
      !ownerVerified
    )
      return;
    const normalized = slug.trim().toLowerCase();
    if (!availability?.available || availability.slug !== normalized) {
      setError(
        "Check that your requested address is available before continuing.",
      );
      return;
    }
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      window.sessionStorage.setItem(recoveryKey, "pending");
      if (window.sessionStorage.getItem(recoveryKey) !== "pending")
        throw new Error("Recovery storage unavailable");
    } catch {
      setLocked(true);
      setError(
        "Safe recovery storage is unavailable. No organization request was sent.",
      );
      flight.current = false;
      setBusy(false);
      return;
    }
    try {
      const result = await save(
        "/organizations",
        "POST",
        { name: name.trim(), slug: normalized, branchName: branch.trim() },
        "Organization created.",
      );
      if (!result?.organizationId || !result?.branchId)
        throw new Error("Creation was not confirmed");
      window.sessionStorage.removeItem(recoveryKey);
      const url = new URL(window.location.href);
      url.searchParams.set("setup", "1");
      window.history.replaceState({}, "", url);
      await onCreated();
    } catch (failure: any) {
      if (
        [400, 409].includes(failure.status) ||
        failure.code === "OWNER_VERIFICATION_REQUIRED"
      ) {
        try {
          window.sessionStorage.removeItem(recoveryKey);
        } catch {
          setLocked(true);
        }
        if (failure.code === "OWNER_VERIFICATION_REQUIRED") {
          setVerification({ actorId, verified: false });
          setVerificationRefresh((value) => value + 1);
        }
        setError(failure.message);
        setAvailability(null);
      } else {
        setLocked(true);
        setError(
          "We could not confirm organization creation. Refresh workspace access to check for the original organization before attempting another request.",
        );
      }
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="mera-create-organization mera-identity"
      aria-label="Create your organization"
    >
      <div className="mera-create-story">
        <MeraBrand />
        <p className="mera-owner-step-count">OWNER SETUP · BUSINESS DETAILS</p>
        <h2>
          Your business.
          <br />
          Your way of serving.
        </h2>
        <p>
          Start with one organization and its first branch. You can shape the
          menu, service and team next.
        </p>
        <div>
          <Store size={25} aria-hidden="true" />
          <strong>{name || "Your organization"}</strong>
          <span>{branch || "Your first branch"}</span>
        </div>
      </div>
      <div className="mera-create-form">
        <p className="mera-owner-step-count">SIGNED IN AS {actorName}</p>
        <h2>Create your organization</h2>
        <p>
          Joining an existing team? Ask its owner for an invitation instead.
        </p>
        {demo && (
          <p className="mera-owner-note">
            Demonstration workspace. Creating an organization does not verify a
            real email, publish a menu or activate billing.
          </p>
        )}
        <OwnerVerification
          key={actorId}
          actorId={actorId}
          demo={demo}
          refreshKey={verificationRefresh}
          disabled={disabled}
          onVerified={(verified) => setVerification({ actorId, verified })}
        />
        {error && <p role="alert">{error}</p>}
        {locked ? (
          <div>
            <h3>Check your existing access</h3>
            <p>
              An earlier organization request may still need review. This tab
              will not submit a second request automatically.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={disabled || busy}
              onClick={() => void onCreated()}
            >
              Refresh workspace access
            </button>
          </div>
        ) : (
          <form onSubmit={create}>
            <fieldset disabled={disabled || busy || !ownerVerified}>
              <label>
                Organization name
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugEdited.current) {
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          // "Jay's Diner" \u2192 "jays-diner", not "jay-s-diner".
                          .replace(/['\u2019]/g, "")
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, "")
                          .slice(0, 50),
                      );
                      checkSequence.current++;
                      setAvailability(null);
                      setChecking(false);
                    }
                  }}
                  required
                  maxLength={100}
                  autoComplete="organization"
                />
              </label>
              <label htmlFor="mera-owner-address">Requested Mera address</label>
              <div className="mera-create-address">
                <input
                  id="mera-owner-address"
                  value={slug}
                  onChange={(e) => {
                    slugEdited.current = true;
                    setSlug(e.target.value);
                    checkSequence.current++;
                    setChecking(false);
                    setAvailability(null);
                  }}
                  required
                  minLength={3}
                  maxLength={50}
                  pattern="[a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-describedby="mera-owner-address-help"
                />
                <button
                  type="button"
                  className="secondary"
                  disabled={checking || !slug.trim()}
                  onClick={() => void checkAddress()}
                >
                  {checking ? "Checking…" : "Check address"}
                </button>
              </div>
              {rootDomain && slug.trim() && <p>Your menu link: https://{slug.trim().toLowerCase()}.{rootDomain}</p>}
              <p id="mera-owner-address-help" role="status">
                {availability?.text ||
                  "Choose a unique address for your organization. This is not a custom domain."}
              </p>
              <label>
                First branch name
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="e.g. Surulere"
                />
              </label>
              <button className="primary">
                {busy ? "Creating organization…" : "Create organization"}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </fieldset>
          </form>
        )}
      </div>
    </section>
  );
}
