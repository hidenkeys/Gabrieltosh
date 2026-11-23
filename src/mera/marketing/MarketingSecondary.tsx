import { usePublicNavigation } from "./publicNavigation";
import { MeraBrand } from "../ui/MeraBrand";
import { ArrowRight } from "lucide-react";

/** Commercial terms remain unpublished until an approved policy exists. */
export function PricingAndSupport() {
  return (
    <section id="pricing" className="mt-commercial-section">
      <div className="mt-container mt-split">
        <div>
          <p className="eyebrow">Before you begin</p>
          <h2>
            Review your setup.
            <br />
            Understand the terms.
          </h2>
          <p>
            Review the subscription and branch terms that apply to your business
            before launch. Choose a setup that fits your operation.
          </p>
          <a className="primary" href="/mera/signup">
            Explore Mera QR setup <ArrowRight aria-hidden="true" />
          </a>
        </div>
        <div className="mt-readiness-list">
          <article>
            <div>
              <h3>Organization readiness</h3>
              <p>
                Configure the menu, team and service policies your business
                needs.
              </p>
            </div>
          </article>
          <article>
            <div>
              <h3>Payment readiness</h3>
              <p>
                Manual payment records are distinct from integrated collections.
                Provider approval and approved commercial policies are required
                before live financial services.
              </p>
            </div>
          </article>
          <article>
            <div>
              <h3>Review before launch</h3>
              <p>
                Confirm the applicable subscription, fees and launch
                requirements. Exploring setup does not activate billing.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
const policySections = [
  "mera-policy-main",
  "privacy",
  "customer-information",
  "communication-preferences",
  "payments-policies",
  "retention-support",
] as const;
export function LegalInformationPage() {
  const navigate = usePublicNavigation(policySections);
  const topics = [
    ["privacy", "Enquiries and Travel interest"],
    ["customer-information", "Customer information"],
    ["communication-preferences", "Communication preferences"],
    ["payments-policies", "Payments and service policies"],
    ["retention-support", "Retention and support"],
  ];
  return (
    <div className="mera-marketing mera-identity mera-secondary-page">
      <a
        className="mera-marketing-skip"
        href="#mera-policy-main"
        onClick={navigate}
      >
        Skip to policy information
      </a>
      <header className="mera-secondary-header">
        <a className="mera-home-link" href="/mera" aria-label="MeraTech home">
          <MeraBrand />
        </a>
        <nav aria-label="Public information">
          <a href="/mera/products">Products</a>
          <a href="/mera/qr#commercial">Mera QR</a>
          <a href="/mera/sign-in">Sign in</a>
        </nav>
      </header>
      <main id="mera-policy-main" className="mera-legal-main">
        <div className="mera-legal-heading">
          <p className="eyebrow">POLICY INFORMATION</p>
          <h1>
            Privacy & terms <br />
            preparation
          </h1>
          <p>
            Final terms, retention schedules, tax disclosures and service
            agreements require business and legal approval before public launch.
            No final legal text or customer consent is represented by this
            development page.
          </p>
          <span className="mera-secondary-proposal">
            Pending business and legal approval
          </span>
        </div>
        <div className="mera-legal-layout">
          <nav aria-label="Policy topics">
            <span>On this page</span>
            {topics.map(([id, label]) => (
              <a key={id} href={"#" + id} onClick={navigate}>
                {label}
              </a>
            ))}
          </nav>
          <div className="mera-legal-topics">
            <section id="privacy">
              <h2>Enquiries and Travel interest</h2>
              <p>
                This notice describes the current test experience. The complete
                privacy policy remains subject to business and legal approval.
                Use synthetic details and documents when testing this staging
                site; do not submit passwords, payment-card details or
                confidential personal records.
              </p>
              <p>
                A consultancy brief collects your name, email, organization and
                project details, including the problem, scope, budget preference
                and preferred timeline. You may add contact details and
                supporting documents. Travel interest collects your name and
                email, with optional organization, role and interest details.
                These details are used to review the enquiry or interest and its
                follow-up. Neither form accepts a project, creates a Travel
                account or subscribes you to marketing messages.
              </p>
              <p>
                Submitted records and supporting documents are private to
                authorized platform operators. They are not published in a
                public menu or shared with organization staff through these
                forms. Operator review, notes, assignment and follow-up are
                subject to platform access controls and auditing.
              </p>
              <p>
                When you send, this browser tab keeps a temporary recovery copy
                of the submitted details and attachments so an interrupted
                request can be retried without creating another submission. The
                private payload is removed from that recovery copy when receipt
                is confirmed. Do not clear an uncertain submission before
                checking its outcome. This local recovery copy is separate from
                the record received by the service.
              </p>
              <p>
                A receipt confirms that the service received the submission; it
                does not confirm an email was sent. These forms currently send
                no confirmation email. Retention periods, controller contact
                details and procedures for data requests still need approval
                before public launch; this page does not invent or replace those
                policies.
              </p>
            </section>
            <section id="customer-information">
              <h2>Customer information</h2>
              <p>
                You can browse without signing in. Order names identify the
                current interaction; a name, table number or QR code must never
                unlock someone’s private history. Operational activity stays
                organization-scoped.
              </p>
            </section>
            <section id="communication-preferences">
              <h2>Communication preferences</h2>
              <p>
                Marketing consent must be separate from transactional
                communication. Notification-provider setup and authorization are
                required before messages are sent.
              </p>
            </section>
            <section id="payments-policies">
              <h2>Payments and service policies</h2>
              <p>
                Providers, settlement arrangements, subscription terms,
                collection charges, cancellation policies and refund treatment
                need explicit approval and disclosure before live charging. A
                client redirect or customer payment claim is not payment
                verification.
              </p>
            </section>
            <section id="retention-support">
              <h2>Retention and support</h2>
              <p>
                Retention periods, account recovery, data access/export
                procedures and support contact details remain launch decisions.
                These controls must be reviewed against the actual operating
                jurisdiction and business requirements.
              </p>
            </section>
            <a className="secondary" href="/mera">
              Return to MeraTech
            </a>
          </div>
        </div>
      </main>
      <footer>
        <a href="/mera/signup">Explore onboarding</a>
        <a href="/mera/workspace">Existing workspace</a>
        <span>Policy preparation · no final agreement published</span>
      </footer>
    </div>
  );
}
