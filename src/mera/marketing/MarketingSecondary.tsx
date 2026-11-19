import { usePublicNavigation } from "./publicNavigation";
import { Disclosure } from "../ui/OperationalPrimitives";

export function PricingAndSupport() {
  return (
    <>
      <section
        id="pricing"
        className="mera-secondary-pricing"
        aria-labelledby="mera-plan-title"
      >
        <div className="mera-secondary-section-heading">
          <p className="eyebrow">TRANSPARENT BY DESIGN</p>
          <h2 id="mera-plan-title">
            A plan that fits
            <br />
            your operation.
          </h2>
          <p>
            Start with one organization and one branch. Review the commercial
            terms before you launch.
          </p>
        </div>
        <div className="mera-secondary-plan-grid">
          <article className="mera-secondary-plan">
            <span className="mera-secondary-proposal">
              PROPOSED STARTING PLAN
            </span>
            <p className="mera-secondary-price">
              <strong>₦13,500</strong>
              <span> / organization / month</span>
            </p>
            <p>One branch included. Commercial terms are pending approval.</p>
            <ul>
              <li>Your organization and its service team</li>
              <li>One branch in the proposed starting plan</li>
              <li>Menu, orders and daily operations in one workspace</li>
            </ul>
            <a className="primary" href="/mera/signup">
              Explore onboarding
            </a>
            <small>
              Additional-branch pricing is configurable and not yet approved;
              unlimited branches are not included.
            </small>
          </article>
          <div className="mera-secondary-fees">
            <h3>Understand the collection fee.</h3>
            <p>
              A proposed <strong>0.1%</strong> fee applies only to confirmed
              Mera-integrated collections.
            </p>
            <div
              className="mera-secondary-table"
              role="region"
              aria-label="Proposed collection fee by payment method"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Payment method</th>
                    <th scope="col">Proposed collection fee</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Confirmed Mera-integrated collection</td>
                    <td>0.1%</td>
                  </tr>
                  <tr>
                    <td>Recorded cash</td>
                    <td>No collection fee</td>
                  </tr>
                  <tr>
                    <td>External POS</td>
                    <td>No collection fee</td>
                  </tr>
                  <tr>
                    <td>Manually recorded external transfer</td>
                    <td>No collection fee</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Disclosure
              className="mera-secondary-disclosure"
              summary="Commercial choices still to be agreed"
            >
              <p>
                Who pays the fee, its calculation basis, rounding, refund
                treatment, trial and grace periods must be approved before live
                billing. No recurring debit or live collection is enabled by
                this preview.
              </p>
            </Disclosure>
            <p className="mera-secondary-readiness">
              Owner verification, payment-provider approval and service policies
              need review before launch. Exploring onboarding does not activate
              billing.
            </p>
          </div>
        </div>
      </section>
      <section
        id="support"
        className="mera-secondary-support"
        aria-labelledby="mera-support-title"
      >
        <div>
          <p className="eyebrow">HERE FOR YOUR OPERATION</p>
          <h2 id="mera-support-title">
            Keep the conversation
            <br />
            with your team.
          </h2>
          <p>
            Existing merchants can create and follow in-app support cases from
            their organization workspace.
          </p>
        </div>
        <div className="mera-secondary-support-actions">
          <a className="primary" href="/mera/workspace">
            Open your workspace
          </a>
          <a className="text-button" href="/mera/legal">
            Review policy preparation
          </a>
          <p>
            Messages and replies stay in Mera. Email, SMS and push delivery
            remain unavailable.
          </p>
        </div>
      </section>
    </>
  );
}
const policySections = [
  "mera-policy-main",
  "customer-information",
  "communication-preferences",
  "payments-policies",
  "retention-support",
] as const;
export function LegalInformationPage() {
  const navigate = usePublicNavigation(policySections);
  const topics = [
    ["customer-information", "Customer information"],
    ["communication-preferences", "Communication preferences"],
    ["payments-policies", "Payments and service policies"],
    ["retention-support", "Retention and support"],
  ];
  return (
    <div className="mera-marketing mera-secondary-page">
      <a
        className="mera-marketing-skip"
        href="#mera-policy-main"
        onClick={navigate}
      >
        Skip to policy information
      </a>
      <header className="mera-secondary-header">
        <a className="mera-wordmark" href="/mera" aria-label="Mera home">
          mera<span>.</span>
        </a>
        <nav aria-label="Public information">
          <a href="/mera#experience">Product</a>
          <a href="/mera#pricing">Pricing</a>
          <a href="/mera/workspace">Sign in</a>
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
              Return to Mera
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
