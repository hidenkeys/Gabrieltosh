const demo = "/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001";
export default function Marketing() {
  return (
    <div className="mera-marketing">
      <header>
        <a className="mera-wordmark" href="/mera">
          mera<span>.</span>
        </a>
        <nav aria-label="Mera navigation">
          <a href="#experience">The experience</a>
          <a href="#modes">Your service</a>
          <a href="#pricing">Pricing</a>
          <a href="/mera/workspace">Workspace →</a>
        </nav>
      </header>
      <main>
        <section className="mera-hero">
          <p className="eyebrow">HOSPITALITY, CONNECTED</p>
          <h1>
            Beautiful service.
            <br />
            From first scan
            <br />
            to last goodbye.
          </h1>
          <p>
            One workspace for your menu, your team and the moments in between.
            Built for counters, tables and the people who make them work.
          </p>
          <div>
            <a className="primary" href="/mera/workspace">
              Preview organization onboarding →
            </a>
            <a className="secondary" href={demo}>
              View the Bing Chun demo
            </a>
          </div>
          <small>
            Development preview · onboarding verification and live collections
            are not enabled.
          </small>
        </section>
        <section
          id="experience"
          aria-label="The Mera experience"
          className="mera-features"
        >
          {[
            [
              "Discover",
              "A permanent QR leads guests to the right branch and published menu.",
            ],
            [
              "Serve",
              "Keep customer requests, preparation and staff responsibilities connected.",
            ],
            [
              "Understand",
              "Separate sales, collections and outstanding balances when reviewing your day.",
            ],
          ].map(([title, text]) => (
            <article key={title}>
              <p className="eyebrow">MADE FOR YOUR SHIFT</p>
              <h2>{title}</h2>
              <p>{text}</p>
            </article>
          ))}
        </section>
        <section className="mera-pricing" id="modes">
          <p className="eyebrow">YOUR OPERATION, YOUR WAY</p>
          <h2>
            A counter today.
            <br />
            More possibilities tomorrow.
          </h2>
          <p>
            Combine counter pickup, takeaway, table service and reservations as
            your venue needs them. Branch menus, service settings and staff
            permissions belong to your organization.
          </p>
          <div className="mera-mode-list">
            <article>
              <h3>Quick-service counters</h3>
              <p>
                Let guests browse before they reach the counter, then connect
                orders with preparation and collection.
              </p>
            </article>
            <article>
              <h3>Restaurants and cafés</h3>
              <p>
                Bring table context, service ownership and additional rounds
                into the same workflow.
              </p>
            </article>
            <article>
              <h3>Lounges and reservations</h3>
              <p>
                Review availability, guest arrivals and capacity. Deposit and
                minimum-spend policies require explicit configuration before
                launch.
              </p>
            </article>
          </div>
          <p className="mera-readiness-note">
            This is an implementation preview. Provider approval, domain
            configuration and hardware calibration are separate launch checks. A
            demo is not evidence of settled funds or physical printing.
          </p>
        </section>
        <section id="pricing" className="mera-pricing">
          <p className="eyebrow">TRANSPARENT BY DESIGN</p>
          <h2>A plan that fits your operation.</h2>
          <div className="mera-price-card">
            <span>PROPOSED STARTING PLAN</span>
            <strong>
              ₦13,500<small> / organization / month</small>
            </strong>
            <p>
              One branch included. Commercial terms are pending approval.
              Additional-branch pricing is configurable and not yet approved;
              unlimited branches are not included.
            </p>
          </div>
          <p>
            A proposed 0.1% fee applies only to confirmed Mera-integrated
            collections. Cash, external POS and manually recorded external
            transfers do not incur that collection fee under the proposed
            policy.
          </p>
          <p>
            Who pays the fee, its calculation basis, rounding, refund treatment,
            trial and grace periods must be approved before live billing. No
            recurring debit or live collection is enabled by this preview.
          </p>
          <a className="text-button" href="/mera/workspace">
            Review onboarding and readiness →
          </a>
        </section>
        <section className="mera-pricing mera-contact" id="support">
          <p className="eyebrow">LET’S GET YOU READY</p>
          <h2>Build your venue’s next chapter.</h2>
          <p>
            Start with your organization, branch details and menu. Readiness
            checks keep incomplete payment-provider approval and service
            policies visible before launch.
          </p>
          <div className="mera-support-links">
            <a className="primary" href="/mera/workspace">
              Open onboarding →
            </a>
            <a className="secondary" href="/mera/legal">
              Review policy preparation
            </a>
          </div>
          <p>
            Support contact and production notification delivery are awaiting
            configuration. This preview does not send email or claim a support
            request was delivered.
          </p>
        </section>
      </main>
      <footer>
        <b>mera.</b>
        <span>Built around the way you serve.</span>
        <a href="/mera/legal">Privacy & terms preparation</a>
        <a href="#support">Support readiness</a>
        <a href="/">Existing Bing Chun workspace</a>
      </footer>
    </div>
  );
}
export function LegalInformation() {
  return (
    <div className="mera-marketing">
      <header>
        <a className="mera-wordmark" href="/mera">
          mera<span>.</span>
        </a>
        <a href="/mera/workspace">Open workspace →</a>
      </header>
      <main className="mera-pricing">
        <p className="eyebrow">PRE-LAUNCH POLICY WORK</p>
        <h1>Privacy & terms preparation</h1>
        <p>
          Final terms, retention schedules, tax disclosures and service
          agreements require business and legal approval before public launch.
          No final legal text or customer consent is represented by this
          development page.
        </p>
        <section>
          <h2>Customer information</h2>
          <p>
            Browsing is anonymous. Order names identify the current interaction;
            a name, table number or QR code must never unlock someone’s private
            history. Operational activity stays organization-scoped.
          </p>
        </section>
        <section>
          <h2>Communication preferences</h2>
          <p>
            Marketing consent must be separate from transactional communication.
            Notification-provider setup and authorization are required before
            messages are sent.
          </p>
        </section>
        <section>
          <h2>Payments and service policies</h2>
          <p>
            Providers, settlement arrangements, subscription terms, collection
            charges, cancellation policies and refund treatment need explicit
            approval and disclosure before live charging. A client redirect or
            customer payment claim is not payment verification.
          </p>
        </section>
        <section>
          <h2>Retention and support</h2>
          <p>
            Retention periods, account recovery, data access/export procedures
            and support contact details remain launch decisions. These controls
            must be reviewed against the actual operating jurisdiction and
            business requirements.
          </p>
        </section>
        <a className="secondary" href="/mera">
          Return to Mera
        </a>
      </main>
    </div>
  );
}
