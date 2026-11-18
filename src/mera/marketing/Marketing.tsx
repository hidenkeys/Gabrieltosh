import { useRef, useState } from "react";
import {
  ArrowRight,
  ChartNoAxesColumnIncreasing,
  ConciergeBell,
  Layers,
  Menu,
  Play,
  X,
} from "lucide-react";
const demo = "/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001";
const preview = "/mera/bing-chun-counter-preview.jpg";
export default function Marketing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  function closeMenu() {
    setMenuOpen(false);
  }
  return (
    <div
      className="mera-marketing"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          closeMenu();
          menuButton.current?.focus();
        }
      }}
    >
      <a className="mera-marketing-skip" href="#mera-main">
        Skip to content
      </a>
      <header className="mera-marketing-header">
        <a className="mera-wordmark" href="/mera" aria-label="Mera home">
          mera<span>.</span>
        </a>
        <button
          className="mera-mobile-menu"
          ref={menuButton}
          aria-expanded={menuOpen}
          aria-controls="mera-public-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          <span>{menuOpen ? "Close menu" : "Open menu"}</span>
        </button>
        <nav
          id="mera-public-navigation"
          className={menuOpen ? "is-open" : ""}
          aria-label="Mera navigation"
        >
          <div className="mera-nav-links">
            <a href="#experience" onClick={closeMenu}>
              Product
            </a>
            <a href="#modes" onClick={closeMenu}>
              Solutions
            </a>
            <a href="#pricing" onClick={closeMenu}>
              Pricing
            </a>
          </div>
          <div className="mera-nav-actions">
            <a href="/mera/workspace">Sign in</a>
            <a className="primary" href="/mera/signup">
              Explore Mera
            </a>
          </div>
        </nav>
      </header>
      <main id="mera-main">
        <section className="mera-hero" aria-labelledby="mera-hero-title">
          <div className="mera-hero-copy">
            <h1 id="mera-hero-title">
              Every service.
              <br />
              One clear view.
            </h1>
            <div className="mera-heading-rule" />
            <p>
              Menus, orders and your team,
              <br className="mera-desktop-break" /> connected.
            </p>
            <div className="mera-hero-actions">
              <a className="primary" href="/mera/signup">
                Explore Mera <ArrowRight aria-hidden="true" />
              </a>
              <a className="secondary" href={demo}>
                View demo <Play aria-hidden="true" />
              </a>
            </div>
          </div>
          <a
            className="mera-product-preview"
            href={demo}
            aria-label="Explore the Bing Chun menu demo"
          >
            <img
              src={preview}
              alt="Bing Chun Surulere counter: searchable drinks menu, product photos and staff workspace"
              width="1778"
              height="1235"
              fetchPriority="high"
            />
          </a>
        </section>
        <section
          id="experience"
          className="mera-feature-strip"
          aria-label="The Mera experience"
        >
          <a href="#modes">
            <ConciergeBell aria-hidden="true" />
            <span>Menu and ordering</span>
          </a>
          <a href="#modes">
            <Layers aria-hidden="true" />
            <span>Service operations</span>
          </a>
          <a href="#reporting">
            <ChartNoAxesColumnIncreasing aria-hidden="true" />
            <span>Reporting</span>
          </a>
        </section>
        <section
          className="mera-service-section"
          id="modes"
          aria-labelledby="mera-service-title"
        >
          <div className="mera-service-preview">
            <img
              src="/mera/bing-chun-menu-preview.jpg"
              alt="A closer look at the real Bing Chun menu with drinks, categories and prices"
              width="918"
              height="1056"
              loading="lazy"
            />
          </div>
          <div className="mera-service-copy">
            <h2 id="mera-service-title">
              Built around
              <br />
              the way you
              <br />
              serve.
            </h2>
            <div className="mera-heading-rule" />
            <p>
              A connected operating system for restaurant owners, multi-branch
              operators and service teams.
            </p>
          </div>
        </section>
        <section className="mera-service-modes" aria-label="Ways to serve">
          <article>
            <h3>Counter & takeaway</h3>
            <p>
              Connect menu discovery, counter orders and preparation with a
              clear path to collection.
            </p>
          </article>
          <article>
            <h3>Tables & reservations</h3>
            <p>
              Keep table visits, additional rounds and arrivals together, with
              policies set by your venue.
            </p>
          </article>
          <article id="reporting">
            <h3>A clearer daily picture</h3>
            <p>
              Review sales, actual collections and outstanding balances as
              distinct parts of your day.
            </p>
          </article>
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
          <a className="text-button" href="/mera/signup">
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
            <a className="primary" href="/mera/signup">
              Explore onboarding →
            </a>
            <a className="secondary" href="/mera/legal">
              Review policy preparation
            </a>
          </div>
          <p>
            Existing merchants can create and follow in-app support cases from
            their organization workspace. Email, SMS and push delivery remain
            unavailable.
          </p>
          <a className="text-button" href="/mera/workspace">
            Open merchant support in your workspace →
          </a>
        </section>
      </main>
      <footer>
        <a className="mera-wordmark" href="/mera">
          mera<span>.</span>
        </a>
        <span>Built around the way you serve.</span>
        <a href="/mera/legal">Privacy & terms preparation</a>
        <a href="#support">Support</a>
        <a href="/">Bing Chun workspace</a>
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
