import { usePublicNavigation } from "./publicNavigation";
import { PricingAndSupport, LegalInformationPage } from "./MarketingSecondary";
import { MeraBrand } from "../ui/MeraBrand";
import { Disclosure } from "../ui/OperationalPrimitives";
import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  Menu,
  QrCode,
  ReceiptText,
  Utensils,
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
  "questions",
] as const;
const serviceModes = [
  {
    title: "Counter & takeaway",
    label: "A good order. A clear handoff.",
    description:
      "Bring the menu, your counter team and preparation queue together. Build an order, record its payment and follow it through to collection.",
    features: [
      "Photo menus and item customizations",
      "Staff-assisted and guest orders",
      "Preparation and pickup status",
    ],
    icon: ReceiptText,
  },
  {
    title: "Restaurants",
    label: "From the first booking to the last round.",
    description:
      "Give front desk, waiters and the kitchen a shared picture of service. Connect reservations to table visits, then keep additional rounds on the right bill.",
    features: [
      "Reservations, arrivals and table allocation",
      "Private visits and shared bills",
      "Kitchen and bar preparation",
    ],
    icon: Utensils,
  },
  {
    title: "Lounges & clubs",
    label: "Keep the evening in view.",
    description:
      "Support table service and repeat orders with clear ownership. Configure the service policies that fit your venue, with deposits and minimum spend reviewed before launch.",
    features: [
      "Table visits and additional rounds",
      "Assigned staff and service requests",
      "Venue-specific readiness checks",
    ],
    icon: LayoutGrid,
  },
];
const questions = [
  [
    "Can customers browse without an account?",
    "Yes. A guest can open the published menu from a QR code without signing in. Mera asks for the details needed when they place an order, reserve or join a private table visit.",
  ],
  [
    "Can we keep our own branding?",
    "Yes. Your organization can configure its logo, colors, menu presentation and receipt designs. Guests see your venue’s identity; staff keep a consistent operational workspace.",
  ],
  [
    "How are payments handled?",
    "Staff can record cash, external POS and manually verified transfers. Integrated online collections require payment-provider approval and approved commercial policies. This preview does not activate live collections or billing.",
  ],
  [
    "Can Mera support more than one branch?",
    "The workspace supports branch-specific staff access, stock and reporting. One branch is included in the proposed starting plan. Additional-branch pricing and entitlement must be agreed before launch.",
  ],
  [
    "Do we need a dedicated device?",
    "Mera is web-first and designed for desktop and handheld browsers. Changes need a working connection. Receipt and sticker printing depend on a supported setup and physical printer testing.",
  ],
];
export default function Marketing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigate = usePublicNavigation(publicSections);
  const selected = serviceModes[mode];
  return (
    <div
      className="mera-marketing mera-identity"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }}
    >
      <a className="mera-marketing-skip" href="#mera-main" onClick={navigate}>
        Skip to content
      </a>
      <header className="mera-marketing-header">
        <a className="mera-home-link" href="/mera" aria-label="Mera home">
          <MeraBrand />
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
            {[
              ["experience", "Product"],
              ["modes", "Solutions"],
              ["pricing", "Pricing"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(event) => {
                  if (navigate(event)) setMenuOpen(false);
                }}
              >
                {label}
              </a>
            ))}
          </div>
          <div className="mera-nav-actions">
            <a href="/mera/workspace">Sign in</a>
            <a className="primary" href="/mera/signup">
              Get started <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </nav>
      </header>
      <main id="mera-main">
        <section className="mera-hero" aria-labelledby="mera-hero-title">
          <div className="mera-hero-copy">
            <p className="eyebrow">
              <span aria-hidden="true" /> HOSPITALITY, CONNECTED
            </p>
            <h1 id="mera-hero-title">
              The whole service.
              <br />
              <em>Beautifully connected.</em>
            </h1>
            <p className="mera-hero-description">
              From the first scan to the final bill. Bring your menu, guests and
              team into one clear operation.
            </p>
            <div className="mera-hero-actions">
              <a className="primary" href="/mera/signup">
                Start with your business <ArrowRight aria-hidden="true" />
              </a>
              <a className="mera-inline-link" href={demo}>
                Explore the menu demo <ChevronRight aria-hidden="true" />
              </a>
            </div>
            <p className="mera-hero-note">
              For counters, restaurants, lounges and clubs.
            </p>
          </div>
          <div className="mera-hero-aside">
            <span className="mera-section-number">
              01 / THE CONNECTED WORKSPACE
            </span>
            <p>
              Less switching.
              <br />
              More service.
            </p>
            <a
              href="#experience"
              onClick={navigate}
              aria-label="See how Mera connects service"
            >
              <ArrowDown aria-hidden="true" />
            </a>
          </div>
          <figure className="mera-product-stage">
            <div className="mera-product-frame">
              <div className="mera-preview-toolbar">
                <span>
                  <LayoutGrid aria-hidden="true" /> A workspace built for
                  service
                </span>
                <span>Bing Chun · Surulere demo</span>
              </div>
              <a
                href="/mera/bing-chun-counter-preview.jpg"
                target="_blank"
                rel="noreferrer"
                aria-label="Open full-size Bing Chun counter screenshot in a new tab"
              >
                <img
                  src="/mera/bing-chun-counter-preview.jpg"
                  alt="Bing Chun counter workspace with a photo menu, category filters and current order panel"
                  width="1778"
                  height="1235"
                  fetchPriority="high"
                />
              </a>
            </div>
            <figcaption>
              <span>Actual product screen · demonstration workspace</span>
              <a
                href="/mera/bing-chun-counter-preview.jpg"
                target="_blank"
                rel="noreferrer"
              >
                View full-size screen <ArrowRight aria-hidden="true" />
              </a>
            </figcaption>
          </figure>
        </section>
        <section
          id="experience"
          className="mera-journey"
          aria-labelledby="mera-journey-title"
        >
          <div className="mera-section-heading">
            <p className="eyebrow">ONE JOURNEY, EVERY HANDOFF</p>
            <h2 id="mera-journey-title">
              Good service flows.
              <br />
              Your systems should, too.
            </h2>
            <p>
              Give guests an easy way in. Give every team member a clear next
              step.
            </p>
          </div>
          <ol className="mera-journey-steps">
            {[
              {
                icon: QrCode,
                title: "Scan & discover",
                text: "A permanent QR opens your published menu, with the right branch and table context.",
              },
              {
                icon: ClipboardList,
                title: "Choose & order",
                text: "Guests or staff select items, customize them and review the complete total.",
              },
              {
                icon: Utensils,
                title: "Prepare & serve",
                text: "Kitchen and bar follow their tickets. Your team sees what is ready and who is responsible.",
              },
              {
                icon: ReceiptText,
                title: "Close & understand",
                text: "Keep bills, payment records and receipts together. Review the day with clear reporting.",
              },
            ].map((step, index) => (
              <li key={step.title}>
                <div className="mera-journey-step-top">
                  <step.icon aria-hidden="true" />
                  <span>0{index + 1}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section
          id="modes"
          className="mera-modes-section"
          aria-labelledby="mera-modes-title"
        >
          <div className="mera-modes-intro">
            <p className="eyebrow">MADE FOR YOUR KIND OF SERVICE</p>
            <h2 id="mera-modes-title">
              Your place.
              <br />
              Your pace.
            </h2>
            <p>
              Different venues, different rhythms. Build the operation around
              the way you serve.
            </p>
          </div>
          <div
            className="mera-mode-selector"
            role="group"
            aria-label="Explore service modes"
          >
            {serviceModes.map((item, index) => (
              <button
                type="button"
                key={item.title}
                aria-pressed={mode === index}
                aria-controls="mera-mode-detail"
                onClick={() => setMode(index)}
              >
                <item.icon aria-hidden="true" />
                <span>{item.title}</span>
                <ArrowRight aria-hidden="true" />
              </button>
            ))}
          </div>
          <div
            className="mera-mode-detail"
            id="mera-mode-detail"
            aria-live="polite"
          >
            <span className="mera-section-number">
              0{mode + 1} / {selected.title.toUpperCase()}
            </span>
            <h3>{selected.label}</h3>
            <p>{selected.description}</p>
            <ul>
              {selected.features.map((feature) => (
                <li key={feature}>
                  <Check aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <a className="mera-inline-link" href="/mera/signup">
              Set up your service <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </section>
        <section
          className="mera-menu-story"
          aria-labelledby="mera-menu-story-title"
        >
          <div className="mera-menu-story-copy">
            <p className="eyebrow">YOUR BRAND, AT EVERY TOUCHPOINT</p>
            <h2 id="mera-menu-story-title">Make the first impression yours.</h2>
            <p>
              Let your food and drinks do the talking. Build a photo-rich menu
              with categories, sizes and choices, then publish it behind a QR
              code that stays the same.
            </p>
            <ul>
              <li>One place to manage menu and availability</li>
              <li>Your logo, colors and guest-facing presentation</li>
              <li>Branded receipt and preparation-label layouts</li>
            </ul>
            <a className="mera-inline-link" href={demo}>
              Browse the real menu demo <ArrowRight aria-hidden="true" />
            </a>
          </div>
          <figure className="mera-menu-story-visual">
            <div className="mera-menu-screen">
              <img
                src="/mera/bing-chun-menu-preview.jpg"
                alt="Bing Chun photo menu with drinks, smoothie and topping categories, item names and prices"
                width="918"
                height="1056"
                loading="lazy"
              />
            </div>
            <figcaption>Bing Chun Surulere · actual menu workspace</figcaption>
          </figure>
        </section>
        <section
          id="reporting"
          className="mera-reporting-story"
          aria-labelledby="mera-reporting-title"
        >
          <div>
            <p className="eyebrow">A CLEARER PICTURE OF YOUR BUSINESS</p>
            <h2 id="mera-reporting-title">
              Know what happened.
              <br />
              See what needs you.
            </h2>
            <p>
              From today’s service to end-of-day review, keep the detail
              connected to the decisions.
            </p>
            <a className="mera-inline-link" href="/mera/signup">
              Explore your workspace setup <ArrowRight aria-hidden="true" />
            </a>
          </div>
          <dl>
            <div>
              <dt>Service</dt>
              <dd>
                Orders, preparation, arrivals and responsibility, in one
                operational view.
              </dd>
            </div>
            <div>
              <dt>Sales</dt>
              <dd>
                Items sold, discounts and sales totals with their own clear
                definitions.
              </dd>
            </div>
            <div>
              <dt>Collections</dt>
              <dd>
                Money received, payment methods and balances still outstanding.
              </dd>
            </div>
            <div>
              <dt>Accountability</dt>
              <dd>
                Staff activity, shifts and an audit history behind important
                changes.
              </dd>
            </div>
          </dl>
        </section>
        <PricingAndSupport />
        <section
          id="questions"
          className="mera-faq"
          aria-labelledby="mera-faq-title"
        >
          <div>
            <p className="eyebrow">BEFORE YOU BEGIN</p>
            <h2 id="mera-faq-title">A few useful answers.</h2>
          </div>
          <div>
            {questions.map(([question, answer]) => (
              <Disclosure key={question} summary={question}>
                <p>{answer}</p>
              </Disclosure>
            ))}
          </div>
        </section>
        <section className="mera-final-cta" aria-labelledby="mera-final-title">
          <div>
            <p className="eyebrow">YOUR NEXT CHAPTER OF SERVICE</p>
            <h2 id="mera-final-title">Bring it all together.</h2>
            <p>Start with your business. Make the workspace your own.</p>
          </div>
          <a className="primary" href="/mera/signup">
            Get started with Mera <ArrowRight aria-hidden="true" />
          </a>
        </section>
      </main>
      <footer>
        <a className="mera-home-link" href="/mera" aria-label="Mera home">
          <MeraBrand />
        </a>
        <p>Built around the way you serve.</p>
        <nav aria-label="Footer">
          <a href="/mera/legal">Privacy & terms preparation</a>
          <a href="#support" onClick={navigate}>
            Support
          </a>
          <a href="/mera/platform">Platform sign in</a>
        </nav>
      </footer>
    </div>
  );
}
export function LegalInformation() {
  return <LegalInformationPage />;
}
