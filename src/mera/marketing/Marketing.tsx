import {
  ArrowUpRight,
  Compass,
  Layers,
  MessageSquare,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import MarketingShell from "./MarketingShell";
import { ProductDemonstration, TravelConcept } from "./ProductDemonstrations";
import { OrderThread } from "./OrderThread";
import { PricingAndSupport, LegalInformationPage } from "./MarketingSecondary";
import { Disclosure } from "../ui/OperationalPrimitives";
import ProjectBrief from "../company/ProjectBrief";
import TravelInterest from "../company/TravelInterest";
const actualDemo = "/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001";
const offerings = [
  {
    id: "qr",
    tone: "live",
    title: "Mera QR",
    kind: "Hospitality operations",
    status: "Working product",
    text: "Connect the menu, the team and the entire service in one workspace.",
    points: [
      "QR menus and ordering",
      "Counters, tables and reservations",
      "Kitchen and bar tickets",
      "Reports and daily operations",
    ],
    cta: "Explore Mera QR",
  },
  {
    id: "travel",
    tone: "planned",
    title: "MeraTravel Suite",
    kind: "Travel business software",
    status: "Planned, coming soon",
    text: "A new direction for travel-business technology, shaped with the businesses it is for.",
    points: [
      "Present your services",
      "Organize enquiries",
      "Follow customer relationships",
    ],
    cta: "Discover the planned direction",
  },
  {
    id: "consultancy",
    tone: "open",
    title: "MeraTech Consultancy",
    kind: "Software built around your needs",
    status: "Start with a project brief",
    text: "For the problem that needs its own solution. Tell us what your business needs, who it serves and what stands in the way.",
    points: [
      "Start from your problem",
      "Software shaped around your users",
      "Built and put to work with you",
    ],
    cta: "Tell us about your project",
  },
];
/** Offerings hang like order tickets on a rail; size and fill encode status. */
function OfferingRail() {
  return (
    <ul className="mx-rail">
      {offerings.map((item) => (
        <li key={item.id} className="mx-slip-wrap" data-tone={item.tone}>
          <article className="mx-slip">
            <header>
              <h3>{item.title}</h3>
              <span className="mx-slip-status">{item.status}</span>
            </header>
            <p className="mx-slip-kind">{item.kind}</p>
            <p>{item.text}</p>
            <ul>
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <a className="mx-link" href={`/mera/${item.id}`}>
              {item.cta}
            </a>
          </article>
        </li>
      ))}
    </ul>
  );
}
function Home() {
  return (
    <MarketingShell>
      <section className="mx-hero mt-container">
        <div className="mx-hero-top">
          <h1 className="mx-hero-title">
            <span className="mx-line">
              <span>Behind every</span>
            </span>{" "}
            <span className="mx-line">
              <span>great experience,</span>
            </span>{" "}
            <span className="mx-line">
              <span>better systems.</span>
            </span>
          </h1>
          <div className="mx-hero-aside">
            <p>
              We build products and bespoke software for the businesses that
              bring people together.
            </p>
            <div className="mt-actions">
              <a className="primary" href="/mera/products">
                Explore our products
              </a>
              <a className="mx-link" href="/mera/consultancy">
                Build something with us
              </a>
            </div>
          </div>
        </div>
        <OrderThread />
      </section>
      <section id="products" className="mx-section mt-container">
        <div className="mx-heading">
          <h2>Built for the work behind the scenes.</h2>
          <p>
            A hospitality platform you can explore today. A travel product
            we’re planning. A consultancy for the work that needs a different
            approach.
          </p>
        </div>
        <OfferingRail />
      </section>
      <section className="mx-principles">
        <div className="mt-container">
          <h2>
            Useful by design.
            <br />
            Grounded in your business.
          </h2>
          <dl>
            <div>
              <dt>Start with the work</dt>
              <dd>
                Understand the daily decisions, handoffs and exceptions before
                choosing the technology.
              </dd>
            </div>
            <div>
              <dt>Keep the experience clear</dt>
              <dd>
                Give customers and teams the right information and a meaningful
                next step.
              </dd>
            </div>
            <div>
              <dt>Build with responsibility</dt>
              <dd>
                Make permissions, payment readiness and operational boundaries
                explicit.
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section id="pricing" className="mx-note mt-container">
        <ShieldCheck aria-hidden="true" />
        <div>
          <h2>A considered start, not a hidden commitment.</h2>
          <p>
            Product terms and readiness are reviewed before launch. Exploring
            MeraTech does not activate a subscription or live payments.
          </p>
        </div>
        <a className="mx-link" href="/mera/qr#commercial">
          Mera QR setup details
        </a>
      </section>
      <FinalAction />
    </MarketingShell>
  );
}
function Products() {
  return (
    <MarketingShell active="products">
      <PageIntro
        title={
          <>
            The right technology.
            <br />
            For your next chapter.
          </>
        }
        text="Explore what exists, see what’s planned, or start a conversation about a solution built for you."
      />
      <section className="mx-section mx-section-tight mt-container">
        <OfferingRail />
      </section>
      <section className="mx-contrast">
        <div className="mt-container mx-split">
          <h2>
            Working product.
            <br />
            Planned product.
            <br />
            Bespoke service.
          </h2>
          <div>
            <p>
              Mera QR is the existing hospitality platform. Its readiness checks
              keep unconfigured services and live financial integrations clearly
              separated.
            </p>
            <p>
              MeraTravel Suite is planned. Registering interest does not create
              a travel account or make a booking.
            </p>
            <p>
              Consultancy begins with an enquiry. Scope, price and delivery
              commitments require a separate review and agreement.
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
/** A stylised table tent. It is a picture of a QR card, not a scannable code. */
const tentSize = 15;
const tentCells = (() => {
  const cells: [number, number][] = [];
  let seed = 11;
  for (let y = 0; y < tentSize; y++)
    for (let x = 0; x < tentSize; x++) {
      const finder =
        (x < 7 && y < 7) ||
        (x >= tentSize - 7 && y < 7) ||
        (x < 7 && y >= tentSize - 7);
      if (finder) continue;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if ((seed >> 16) & 1) cells.push([x, y]);
    }
  return cells;
})();
function TableTent() {
  const finders: [number, number][] = [
    [0, 0],
    [tentSize - 7, 0],
    [0, tentSize - 7],
  ];
  return (
    <figure className="mx-tent" aria-hidden="true">
      <div className="mx-tent-card">
        <span>Table 04</span>
        <svg viewBox={`0 0 ${tentSize} ${tentSize}`} focusable="false">
          {finders.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width="7" height="7" />
              <rect x={x + 1} y={y + 1} width="5" height="5" className="gap" />
              <rect x={x + 2} y={y + 2} width="3" height="3" />
            </g>
          ))}
          {tentCells.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
          ))}
        </svg>
        <strong>Scan to see the menu</strong>
      </div>
    </figure>
  );
}
function QRProduct() {
  return (
    <MarketingShell active="products">
      <section className="mx-qr-hero mt-container">
        <div>
          <h1>
            From first scan.
            <br />
            To final handoff.
          </h1>
          <p>
            Your menu, guests and team, connected through one service. Built for
            counters, restaurants, lounges and clubs.
          </p>
          <div className="mt-actions">
            <a className="primary" href="/mera/signup">
              Set up Mera QR
            </a>
            <a className="mx-link" href={actualDemo}>
              Try the Bing Chun test menu
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <p className="mt-small-note">
            The working demo uses Bing Chun, our explicit test business. The
            illustrations below use fictional data.
          </p>
        </div>
        <TableTent />
      </section>
      <nav className="mx-jump mt-container" aria-label="Mera QR page sections">
        <a href="#experience">Walkthrough</a>
        <a href="#modes">Service modes</a>
        <a href="#commercial">Readiness</a>
        <a href="#questions">Questions</a>
      </nav>
      <section id="experience" className="mx-section mx-section-tight mt-container">
        <div className="mx-heading">
          <h2>
            Every role.
            <br />A clearer view.
          </h2>
          <p>
            Switch between illustrations to explore how the workflow fits
            together. This demonstration doesn’t submit orders or move money.
          </p>
        </div>
        <ProductDemonstration />
      </section>
      <section className="mx-journey">
        <div className="mt-container">
          <div className="mx-heading">
            <h2>
              Good service flows.
              <br />
              Keep it connected.
            </h2>
            <p>
              Give guests a simple way in.
              <br />
              Give your team a clear way through.
            </p>
          </div>
          <ol className="mx-steps">
            {[
              [
                "Scan & discover",
                "A permanent QR resolves the venue, branch and optional table context.",
              ],
              [
                "Choose & order",
                "Guests or staff choose items, customize them and review the total.",
              ],
              [
                "Prepare & serve",
                "Station tickets and responsibility keep kitchen, bar and service aligned.",
              ],
              [
                "Close & review",
                "Payment records, receipts and reports make the outcome easier to understand.",
              ],
            ].map(([title, text], index) => (
              <li key={title}>
                <span className="mx-step-no">{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section id="modes" className="mx-section mt-container">
        <div className="mx-heading">
          <h2>
            One platform.
            <br />
            Different rhythms.
          </h2>
          <p>
            Combine the service modes your venue needs. Keep roles, branch
            access and readiness explicit.
          </p>
        </div>
        <ul className="mx-modes">
          {[
            [
              "Counter & takeaway",
              "Photo menus, staff-assisted orders, preparation and collection.",
            ],
            [
              "Restaurants",
              "Reservations, arrivals, tables, additional rounds and private bills.",
            ],
            [
              "Lounges & clubs",
              "Table service and repeat orders, with venue policies reviewed before launch.",
            ],
          ].map(([title, text]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>
      <section id="reporting" className="mx-features">
        <div className="mt-container mx-split">
          <div>
            <h2>
              More than a<br />
              digital menu.
            </h2>
            <p>
              Bring the details around service into the same working picture.
            </p>
          </div>
          <dl>
            {[
              [
                "Brand & menu",
                "Configure your logo, colors, categories, item choices and receipt layouts.",
              ],
              [
                "Finished-product stock",
                "Manage counted sellable items or unlimited stock. Ingredient inventory is not included.",
              ],
              [
                "Team & accountability",
                "Assign roles and branch access. See who created, prepared and completed the work.",
              ],
              [
                "Business visibility",
                "Review sales, actual collections and outstanding balances as distinct measures.",
              ],
            ].map(([title, text]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section id="commercial">
        <PricingAndSupport />
      </section>
      <section className="mx-faq mt-container" id="questions">
        <h2>A few useful answers.</h2>
        <div>
          {[
            [
              "Can guests browse without an account?",
              "Yes. Published menus are accessible without signing in. Details are requested when needed to place an order, reserve or join a private table visit.",
            ],
            [
              "Which payment methods are available?",
              "The platform supports staff-recorded cash, external POS and manually verified transfers. Integrated online collections require verified provider access and approved policies; they are not enabled in this staging preview.",
            ],
            [
              "Can we use our own branding?",
              "Yes. Organization branding, published menu presentation and receipt layouts can be configured. Your venue’s identity leads the customer experience.",
            ],
            [
              "Does it work without a connection?",
              "Mera QR is web-first. Changes need a connection, and an interrupted submission must be reconciled before it is treated as confirmed. Physical printing requires a supported setup and hardware testing.",
            ],
          ].map(([question, answer]) => (
            <Disclosure key={question} summary={question}>
              <p>{answer}</p>
            </Disclosure>
          ))}
        </div>
      </section>
      <FinalAction product />
    </MarketingShell>
  );
}
function Travel() {
  return (
    <MarketingShell active="products">
      <section className="mx-travel mt-container">
        <div>
          <span className="mx-status">Planned, coming soon</span>
          <h1>
            A better business journey.
            <br />
            Worth shaping together.
          </h1>
          <p>
            We’re exploring software for travel businesses: a clearer way to
            present services, organize enquiries and follow customer
            relationships.
          </p>
          <div className="mt-actions">
            <a className="primary" href="#travel-interest">
              Register your interest
            </a>
          </div>
          <p className="mt-small-note">
            Not an available application. No launch date, pricing or
            integrations are being promised.
          </p>
        </div>
        <TravelConcept />
      </section>
      <section className="mx-travel-intent mt-container">
        <div>
          <h2>
            What would make
            <br />
            your work easier?
          </h2>
          <p>
            Tell us the kind of travel business you run and the problem you
            would most like to solve.
          </p>
          <p>
            Registering interest is not a subscription, a booking or a
            commitment to buy.
          </p>
        </div>
        <section id="travel-interest" aria-label="MeraTravel product interest">
          <TravelInterest />
        </section>
      </section>
    </MarketingShell>
  );
}
function Consultancy() {
  return (
    <MarketingShell active="consultancy">
      <PageIntro
        title={
          <>
            Your business challenge.
            <br />A considered solution.
          </>
        }
        text="When your needs don’t fit a ready-made product, start with the problem. We help shape bespoke software around your users, systems and goals."
      />
      <section className="mx-process mt-container">
        <div>
          <h2>Clarity before complexity.</h2>
          <p>
            A project brief starts a review. It is not a quotation, an accepted
            project or a delivery promise.
          </p>
        </div>
        <ol>
          {[
            ["Discover", "Understand the problem, users and constraints."],
            ["Define", "Agree the scope and the outcomes that matter."],
            [
              "Design & build",
              "Shape, implement and test the agreed experience.",
            ],
            [
              "Put it to work",
              "Plan implementation and the support your solution needs.",
            ],
          ].map(([title, text], index) => (
            <li key={title}>
              <span className="mx-step-no">{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="mx-brief" id="project-brief">
        <div className="mt-container">
          <div className="mx-heading">
            <h2>Start with your brief.</h2>
            <p>
              New software or an existing system. A clear plan or an early idea.
              Share enough context to make the next conversation useful.
            </p>
          </div>
          <ProjectBrief />
        </div>
      </section>
    </MarketingShell>
  );
}
function About() {
  return (
    <MarketingShell active="about">
      <PageIntro
        title={
          <>
            Technology should
            <br />
            understand the work.
          </>
        }
        text="MeraTech brings product thinking and software development to hospitality, travel and the business needs around them."
      />
      <section className="mx-about">
        <div className="mt-container">
          <h2>
            Better experiences begin
            <br />
            behind the scenes.
          </h2>
          <p>
            The customer sees an order, a visit or an enquiry. Behind it sit
            people, decisions and handoffs. We build technology that helps those
            parts work together.
          </p>
        </div>
      </section>
      <section className="mx-section mt-container">
        <div className="mx-heading">
          <h2>
            A clear purpose
            <br />
            for each offering.
          </h2>
          <p>
            We distinguish working software, future direction and bespoke
            project work so you can choose the right next step.
          </p>
        </div>
        <OfferingRail />
      </section>
      <FinalAction />
    </MarketingShell>
  );
}
function Contact() {
  return (
    <MarketingShell active="contact">
      <PageIntro
        title={
          <>
            Start the right
            <br />
            conversation.
          </>
        }
        text="Choose what you need and share the details that will make the next conversation useful."
      />
      <ul className="mx-choices mt-container">
        {[
          {
            title: "A bespoke software project",
            text: "Share the problem, intended users and what you need your solution to do.",
            href: "/mera/consultancy#project-brief",
            cta: "Write a project brief",
            icon: Layers,
          },
          {
            title: "MeraTravel product interest",
            text: "Help inform the planned product and record your interest in its direction.",
            href: "/mera/travel#travel-interest",
            cta: "Register interest",
            icon: Compass,
          },
          {
            title: "Getting started with Mera QR",
            text: "Explore the working product, its setup journey and current readiness.",
            href: "/mera/qr",
            cta: "Explore Mera QR",
            icon: QrCode,
          },
          {
            title: "Support for your organization",
            text: "Existing Mera QR teams can create and follow support cases in their workspace.",
            href: "/mera/workspace",
            cta: "Open your workspace",
            icon: MessageSquare,
          },
        ].map((item) => (
          <li key={item.title}>
            <item.icon aria-hidden="true" />
            <div>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </div>
            <a className="mx-link" href={item.href}>
              {item.cta}
            </a>
          </li>
        ))}
      </ul>
    </MarketingShell>
  );
}
function SignInRouting() {
  return (
    <MarketingShell>
      <PageIntro
        title={
          <>
            The right workspace.
            <br />
            The right access.
          </>
        }
        text="Choose your existing workspace. New business registration and platform operator access are separate journeys."
      />
      <section className="mx-entry mt-container">
        <article>
          <QrCode aria-hidden="true" />
          <h2>Mera QR owner & staff workspace</h2>
          <p>
            Sign in with your existing account. Access follows your
            organization, branch and assigned role.
          </p>
          <div className="mt-actions">
            <a className="primary" href="/mera/workspace">
              Sign in to Mera QR
            </a>
            <a className="mx-link" href="/mera/signup">
              New business? Start registration
            </a>
          </div>
        </article>
        <article>
          <Compass aria-hidden="true" />
          <h2>MeraTravel Suite is planned, not launched.</h2>
          <p>
            There is no Travel application account to sign into yet. You can
            register interest in the planned product.
          </p>
          <div className="mt-actions">
            <a className="mx-link" href="/mera/travel#travel-interest">
              Register product interest
            </a>
          </div>
        </article>
      </section>
      <div className="mx-operator mt-container">
        <ShieldCheck aria-hidden="true" />
        <p>Authorized Mera operator?</p>
        <a className="mx-link" href="/mera/platform/sign-in">
          Open platform sign-in
          <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    </MarketingShell>
  );
}
function PageIntro({ title, text }: { title: ReactNode; text: string }) {
  return (
    <section className="mx-intro mt-container">
      <h1>{title}</h1>
      <p>{text}</p>
    </section>
  );
}
function FinalAction({ product = false }: { product?: boolean }) {
  return (
    <section className="mx-cta">
      <div className="mt-container">
        <h2>
          {product
            ? "Bring your service together."
            : "A product. A possibility. A project."}
        </h2>
        <a
          className="primary"
          href={product ? "/mera/signup" : "/mera/contact"}
        >
          {product ? "Start with Mera QR" : "Find your next step"}
        </a>
      </div>
    </section>
  );
}
export default function Marketing() {
  const page = window.location.pathname.replace(/\/$/, "");
  if (page === "/mera/products") return <Products />;
  if (page === "/mera/qr") return <QRProduct />;
  if (page === "/mera/travel") return <Travel />;
  if (page === "/mera/consultancy") return <Consultancy />;
  if (page === "/mera/about") return <About />;
  if (page === "/mera/contact") return <Contact />;
  if (page === "/mera/sign-in") return <SignInRouting />;
  return <Home />;
}
export function LegalInformation() {
  return <LegalInformationPage />;
}
