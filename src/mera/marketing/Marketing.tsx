import { usePublicNavigation } from "./publicNavigation";
import { PricingAndSupport, LegalInformationPage } from "./MarketingSecondary";
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
const publicSections = [
  "experience",
  "modes",
  "reporting",
  "pricing",
  "support",
  "mera-main",
] as const;
const preview = "/mera/bing-chun-counter-preview.jpg";
export default function Marketing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigate = usePublicNavigation(publicSections);
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
      <a className="mera-marketing-skip" href="#mera-main" onClick={navigate}>
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
            <a
              href="#experience"
              onClick={(event) => {
                if (navigate(event)) closeMenu();
              }}
            >
              Product
            </a>
            <a
              href="#modes"
              onClick={(event) => {
                if (navigate(event)) closeMenu();
              }}
            >
              Solutions
            </a>
            <a
              href="#pricing"
              onClick={(event) => {
                if (navigate(event)) closeMenu();
              }}
            >
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
          <a href="#modes" onClick={navigate}>
            <ConciergeBell aria-hidden="true" />
            <span>Menu and ordering</span>
          </a>
          <a href="#modes" onClick={navigate}>
            <Layers aria-hidden="true" />
            <span>Service operations</span>
          </a>
          <a href="#reporting" onClick={navigate}>
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
        <PricingAndSupport />
      </main>
      <footer>
        <a className="mera-wordmark" href="/mera">
          mera<span>.</span>
        </a>
        <span>Built around the way you serve.</span>
        <a href="/mera/legal">Privacy & terms preparation</a>
        <a href="#support" onClick={navigate}>
          Support
        </a>
        <a href="/">Bing Chun workspace</a>
      </footer>
    </div>
  );
}
export function LegalInformation() {
  return <LegalInformationPage />;
}
