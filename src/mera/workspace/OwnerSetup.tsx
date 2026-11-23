import ChoiceField from "../ui/ChoiceField";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { MeraBrand } from "../ui/MeraBrand";
import SetupChecklist from "./SetupChecklist";

type LegacyProps = React.ComponentProps<typeof SetupChecklist>;
type Props = LegacyProps & {
  organization: any;
  branch: any;
  onboarding: any;
  actorName: string;
  canGuide: boolean;
  disabled: boolean;
  demo: boolean;
  permissions: string[];
  onOpen: (section: string) => void;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
const steps = [
  ["Account", "Review your verified owner access."],
  ["Business", "Set the contact customers can use."],
  ["Branch", "Configure your location, service and customer experience."],
  ["Payments", "Review manual payment handling and commercial readiness."],
  ["Go live", "Review this branch and confirm publication deliberately."],
];
const legacyStages = [0, 1, 2, 2, 2, 2, 2, 3, 4];
export default function OwnerSetup(props: Props) {
  const [guided, setGuided] = useState(
    () => new URLSearchParams(window.location.search).get("setup") === "1",
  );
  if (!props.canGuide) return <SetupChecklist {...props} />;
  if (!guided)
    return (
      <>
        <div className="mw-owner-guide-entry">
          <div>
            <strong>Setting up your business?</strong>
            <p>
              Follow the owner guide, or keep using the settings below. Save any
              edits before switching views.
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => setGuided(true)}
          >
            Resume guided setup <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
        <SetupChecklist {...props} />
      </>
    );
  return <GuidedSetup {...props} onClose={() => setGuided(false)} />;
}
function GuidedSetup(props: Props & { onClose: () => void }) {
  const {
    organization,
    branch,
    onboarding,
    actorName,
    disabled,
    demo,
    permissions,
    onOpen,
    save,
  } = props;
  const progressKey = `ownerGuideV2Step_${branch.id}`;
  const legacyStep = onboarding?.data?.[`ownerGuideStep_${branch.id}`];
  const savedStep = onboarding?.data?.[progressKey];
  const [step, setStep] = useState(
    Number.isInteger(savedStep) && savedStep >= 0 && savedStep < steps.length
      ? savedStep
      : (legacyStages[legacyStep] ?? 0),
  );
  const [publicContact, setPublicContact] = useState<string>(
    onboarding?.data?.contact ||
      branch.settings?.publicContact ||
      onboarding?.data?.phone ||
      "",
  );
  const guidedChild = (
    child: React.ReactNode,
    extra: Record<string, unknown>,
  ) =>
    React.isValidElement(child) && typeof child.type !== "string"
      ? React.cloneElement(child as React.ReactElement<any>, extra)
      : child;
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  async function move(next: number) {
    if (disabled || inFlight.current || next < 0 || next >= steps.length)
      return;
    const target = pendingStep ?? next;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    setPendingStep(target);
    try {
      const result = await save(
        `/organizations/${organization.id}/onboarding`,
        "PATCH",
        { step: target + 1, data: { [progressKey]: target } },
        "Setup position saved.",
      );
      if (!alive.current) return;
      if (
        result?.saved !== true ||
        result?.onboarding?.data?.[progressKey] !== target
      )
        throw new Error("Save was not confirmed.");
      setStep(target);
      setPendingStep(null);
      setStatus(
        "Your place in setup is saved. Form changes use their own save buttons.",
      );
    } catch {
      if (alive.current)
        setError(
          "We could not confirm your saved place. Retry this step before moving elsewhere. Your form changes have not been submitted by this action.",
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const jump = (section: string, permission: string, label: string) =>
    permissions.includes(permission) ? (
      <button
        type="button"
        className="primary"
        disabled={disabled || busy || pendingStep !== null}
        onClick={() => onOpen(section)}
      >
        {label} <ArrowRight size={15} aria-hidden="true" />
      </button>
    ) : (
      <p className="mera-owner-note">
        Your current role cannot open this setting. Ask an organization owner to
        review access.
      </p>
    );
  const legacyPanels = [
    <section className="mera-owner-account" key="account">
      <ShieldCheck size={30} aria-hidden="true" />
      <h3>Signed in as {actorName}</h3>
      <p>
        You have organization-wide management access for {organization.name}.
      </p>
      <p className="mera-owner-note">
        {demo
          ? "Demonstration access does not establish real email ownership. No subscription or online collection is activated."
          : "Signed-in access is separate from email verification and payment-provider approval. The launch checklist checks the required readiness independently."}
      </p>
    </section>,
    guidedChild(props.basics, {
      guided: true,
      initialContact: publicContact,
      onContactSaved: setPublicContact,
    }),
    props.branchAdministration,
    <div key="brand">
      <div className="mera-owner-address">
        <span>Organization address</span>
        <strong>{organization.slug}</strong>
        <small>
          This is the claimed Mera address. Domain hosting and publication are
          checked separately; address changes require authorized support.
        </small>
      </div>
      {guidedChild(props.operations || props.appearance, { guided: true })}
    </div>,
    <section className="mera-owner-task" key="menu">
      <h3>A menu that works for your service.</h3>
      <p>
        Create categories, products, photos and options in the menu editor.
        Review branch availability and stock before publication.
      </p>
      {jump("menu", "menu.edit", "Open menu editor")}
      <p className="mera-owner-note">
        Save any edits before opening another workspace page. Return to Getting
        started → Resume guided setup to continue here. Saving products does not
        publish your menu.
      </p>
    </section>,
    <div key="service">
      <section className="mera-owner-task">
        <h3>Choose the service you need.</h3>
        <p>
          Counter-only businesses can continue without tables or reservations.
          For table service, set capacities and booking policies before
          accepting guests.
        </p>
        <div className="mera-owner-actions">
          {jump("tables", "tables.manage", "Set up tables")}
          {jump("reservations", "reservations.manage", "Review reservations")}
        </div>
      </section>
      {props.booking}
      {props.deposits}
      {props.minimumSpend}
    </div>,
    <section className="mera-owner-task" key="team">
      <h3>The right access for every role.</h3>
      <p>
        Add your team through People. Review each invitation’s role and branch
        scope; invitations do not become active memberships until accepted.
      </p>
      {jump("team", "members.manage", "Manage team invitations")}
      <p className="mera-owner-note">
        Save any edits before opening another workspace page. You can complete
        this later if you are the only operator. Email delivery readiness is
        shown in the invitation workflow.
      </p>
    </section>,
    <section className="mera-owner-task" key="payment">
      <h3>Know what is ready before you charge.</h3>
      <p>
        Review your proposed subscription, branch entitlement and provider
        status. Online collection remains unavailable until provider and
        commercial requirements are satisfied.
      </p>
      {jump("billing", "billing.manage", "Review subscription & readiness")}
      {props.pricing}
      <p className="mera-owner-note">
        No charge or provider activation happens when you continue. Reviewed
        manual payment methods are configured in the final launch checklist.
      </p>
    </section>,
    <div key="review">
      <div className="mera-owner-preview-link">
        <a
          href={`/mera/menu/${encodeURIComponent(organization.slug)}/${encodeURIComponent(branch.id)}`}
          target="_blank"
          rel="noreferrer"
        >
          Open customer menu <ExternalLink size={15} aria-hidden="true" />
        </a>
        <p>
          The customer view shows the current published menu. A draft or
          unpublished branch may not be available yet.
        </p>
      </div>
    </div>,
  ];
  const panels = [
    legacyPanels[0],
    legacyPanels[1],
    <div key="branch">
      {legacyPanels[3]}
      <details className="mera-owner-optional">
        <summary>Menu, tables and team</summary>
        {legacyPanels[4]}
        {legacyPanels[5]}
        {legacyPanels[6]}
      </details>
    </div>,
    legacyPanels[7],
    legacyPanels[8],
  ];
  return (
    <section
      className="mera-owner-setup mera-identity"
      aria-label="Guided owner setup"
    >
      <header className="mera-owner-header">
        <MeraBrand />
        <div>
          <strong>{organization.name}</strong>
          <span>{branch.name} · Owner setup</span>
        </div>
        <button
          className="secondary"
          type="button"
          disabled={busy || pendingStep !== null}
          onClick={props.onClose}
        >
          All settings
        </button>
      </header>
      <div className="mera-owner-grid">
        <nav className="mera-owner-nav" aria-label="Owner setup steps">
          <p>Your setup guide</p>
          <ChoiceField
            label={<>Setup step</>}
            className="mera-owner-mobile-steps"
            value={step}
            disabled={disabled || busy || pendingStep !== null}
            onChange={(nextValue) => void move(Number(nextValue))}
          >
            {steps.map(([title], index) => (
              <option key={title} value={index}>
                {index + 1}. {title}
              </option>
            ))}
          </ChoiceField>
          <ol>
            {steps.map(([title], index) => (
              <li key={title}>
                <button
                  type="button"
                  aria-current={step === index ? "step" : undefined}
                  disabled={disabled || busy || pendingStep !== null}
                  onClick={() => void move(index)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span> {title}
                </button>
              </li>
            ))}
          </ol>
          <p className="mera-owner-nav-note">
            Your place is saved as you move. Readiness is confirmed in the
            launch checklist.
          </p>
        </nav>
        <div className="mera-owner-main">
          <p className="mera-owner-step-count">
            Step {step + 1} of {steps.length}
          </p>
          <h2 ref={heading} tabIndex={-1}>
            {steps[step][0]}
          </h2>
          <p className="mera-owner-description">{steps[step][1]}</p>
          {error && (
            <div role="alert" className="mera-owner-error">
              <p>{error}</p>
              <button
                className="secondary"
                disabled={busy || disabled}
                onClick={() => void move(pendingStep!)}
              >
                Retry saving this step
              </button>
            </div>
          )}
          {status && (
            <p role="status" className="mera-owner-saved">
              <Check size={14} aria-hidden="true" />
              {status}
            </p>
          )}
          {panels.map((content, index) => (
            <div
              key={steps[index][0]}
              hidden={step !== index}
              className="mera-owner-step-panel"
            >
              {content}
            </div>
          ))}
          <div hidden={step !== 3 && step !== 4}>
            {guidedChild(props.readiness, {
              guidedStage: step === 3 ? "payments" : "review",
              publicContact,
            })}
          </div>
          <footer className="mera-owner-step-footer">
            <button
              className="secondary"
              type="button"
              disabled={step === 0 || disabled || busy || pendingStep !== null}
              onClick={() => void move(step - 1)}
            >
              <ArrowLeft size={15} aria-hidden="true" /> Back
            </button>
            <span>
              {step === 3
                ? "Payment choices stay in this page until you choose Go live."
                : "Save form changes before continuing."}
            </span>
            {step < steps.length - 1 ? (
              <button
                className="primary"
                type="button"
                disabled={disabled || busy || pendingStep !== null}
                onClick={() => void move(step + 1)}
              >
                {busy ? "Saving place…" : "Continue"}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <button
                className="secondary"
                type="button"
                disabled={busy || pendingStep !== null}
                onClick={props.onClose}
              >
                Return to settings
              </button>
            )}
          </footer>
        </div>
        <aside
          className="mera-owner-preview"
          aria-label="Saved business preview"
        >
          <p>Saved business details</p>
          {organization.branding?.logo && (
            <img
              src={organization.branding.logo}
              alt={`${organization.name} logo`}
            />
          )}
          <h3>{organization.name}</h3>
          <span>{branch.name}</span>
          {organization.branding?.description && (
            <p>{organization.branding.description}</p>
          )}
          <dl>
            <div>
              <dt>Address</dt>
              <dd>{organization.slug}</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{branch.timezone || "Not set"}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{branch.currency || "NGN"}</dd>
            </div>
            <div>
              <dt>Menu</dt>
              <dd>
                {branch.settings?.launchState === "published"
                  ? "Published"
                  : "Not published"}
              </dd>
            </div>
          </dl>
          <small>
            This preview reflects saved settings. Visiting a step does not mark
            it complete.
          </small>
        </aside>
      </div>
    </section>
  );
}
