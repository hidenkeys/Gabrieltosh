import {
  ArrowRight,
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
import { PricingAndSupport, LegalInformationPage } from "./MarketingSecondary";
import { Disclosure } from "../ui/OperationalPrimitives";
import ProjectBrief from "../company/ProjectBrief";
import TravelInterest from "../company/TravelInterest";
const actualDemo = "/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001";
const offerings = [
  {
    id: "qr",
    number: "01",
    title: "Mera QR",
    type: "HOSPITALITY OPERATIONS",
    status: "Explore the working product",
    text: "Connect the menu, the team and the entire service. QR ordering, counters, tables, reservations and daily operations in one workspace.",
    cta: "Explore Mera QR",
    icon: QrCode,
  },
  {
    id: "travel",
    number: "02",
    title: "MeraTravel Suite",
    type: "TRAVEL BUSINESS SOFTWARE",
    status: "Planned · coming soon",
    text: "A new direction for travel-business technology. Help shape a more connected way to present services, organize enquiries and follow customer relationships.",
    cta: "Discover the planned direction",
    icon: Compass,
  },
  {
    id: "consultancy",
    number: "03",
    title: "MeraTech Consultancy",
    type: "SOFTWARE BUILT AROUND YOUR NEEDS",
    status: "Start with a project brief",
    text: "For the problem that needs its own solution. Tell us what your business needs, who it serves and what stands in the way.",
    cta: "Tell us about your project",
    icon: Layers,
  },
];
function OfferingRows() {
  return (
    <div className="mt-offering-rows">
      {offerings.map((item) => (
        <article key={item.id}>
          <span className="mt-offering-index">{item.number}</span>
          <div className="mt-offering-name">
            <span className="eyebrow">{item.type}</span>
            <h3>{item.title}</h3>
            <span
              className={`mt-status ${item.id === "travel" ? "is-planned" : ""}`}
            >
              {item.status}
            </span>
          </div>
          <div>
            <p>{item.text}</p>
            <a className="mt-text-link" href={`/mera/${item.id}`}>
              {item.cta}
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
function Home() {
  return (
    <MarketingShell>
      <section className="mt-home-hero mt-container">
        <div className="mt-home-promise">
          <p className="eyebrow">MERATECH · TECHNOLOGY FOR REAL BUSINESS</p>
          <h1>
            Behind every
            <br />
            great experience,
            <br />
            <em>better systems.</em>
          </h1>
          <p>
            We build products and bespoke software for the businesses that bring
            people together.
          </p>
          <div className="mt-actions">
            <a className="primary" href="/mera/products">
              Explore our products <ArrowRight aria-hidden="true" />
            </a>
            <a className="mt-text-link" href="/mera/consultancy">
              Build something with us <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <div className="mt-home-offerings">
            <span>Mera QR</span>
            <span>
              MeraTravel Suite <small>Planned</small>
            </span>
            <span>Consultancy</span>
          </div>
        </div>
        <div className="mt-home-demonstration">
          <div className="mt-featured-product">
            <span>MEET MERA QR</span>
            <a href="/mera/qr">
              Hospitality, connected <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <ProductDemonstration compact />
        </div>
      </section>
      <section className="mt-company-statement">
        <div className="mt-container">
          <p className="eyebrow">ONE COMPANY. DISTINCT WAYS TO HELP.</p>
          <h2>
            Choose the product.
            <br />
            Or shape the solution.
          </h2>
          <p>
            A hospitality platform you can explore today. A travel product we’re
            planning. A consultancy for the work that needs a different
            approach.
          </p>
        </div>
      </section>
      <section id="products" className="mt-container mt-section">
        <div className="mt-heading-row">
          <div>
            <p className="eyebrow">OUR PRODUCTS & SERVICES</p>
            <h2>
              Built for the work
              <br />
              behind the scenes.
            </h2>
          </div>
          <p>
            Each offering has a clear purpose.
            <br />
            Each starts with the people using it.
          </p>
        </div>
        <OfferingRows />
      </section>
      <section className="mt-principles mt-container">
        <div>
          <p className="eyebrow">HOW WE THINK</p>
          <h2>
            Useful by design.
            <br />
            Grounded in your business.
          </h2>
        </div>
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
      </section>
      <section id="pricing" className="mt-commercial-note mt-container">
        <ShieldCheck aria-hidden="true" />
        <div>
          <h2>A considered start, not a hidden commitment.</h2>
          <p>
            Product terms and readiness are reviewed before launch. Exploring
            MeraTech does not activate a subscription or live payments.
          </p>
        </div>
        <a className="mt-text-link" href="/mera/qr#commercial">
          Mera QR setup details <ArrowRight aria-hidden="true" />
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
        eyebrow="PRODUCTS & SERVICES"
        title={
          <>
            The right technology.
            <br />
            For your next chapter.
          </>
        }
        text="Explore what exists, see what’s planned, or start a conversation about a solution built for you."
      />
      <section className="mt-container mt-section mt-section-tight">
        <OfferingRows />
      </section>
      <section className="mt-contrast-section">
        <div className="mt-container mt-split">
          <div>
            <p className="eyebrow">A CLEAR DIFFERENCE</p>
            <h2>
              Working product.
              <br />
              Planned product.
              <br />
              Bespoke service.
            </h2>
          </div>
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
function QRProduct() {
  return (
    <MarketingShell active="products">
      <section className="mt-product-hero mt-container">
        <div>
          <p className="eyebrow">MERA QR · HOSPITALITY OPERATIONS</p>
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
              Set up Mera QR <ArrowRight aria-hidden="true" />
            </a>
            <a className="mt-text-link" href={actualDemo}>
              Try the Bing Chun test menu <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <p className="mt-small-note">
            The working demo uses Bing Chun, our explicit test business. The
            illustrations below use fictional data.
          </p>
        </div>
        <div className="mt-product-summary">
          <QrCode aria-hidden="true" />
          <span>ONE CONNECTED SERVICE</span>
          <ol>
            <li>Menu discovery</li>
            <li>Orders & preparation</li>
            <li>Tables & reservations</li>
            <li>Payments & reporting</li>
          </ol>
        </div>
      </section>
      <nav
        className="mt-product-jump mt-container"
        aria-label="Mera QR page sections"
      >
        <a href="#experience">Walkthrough</a>
        <a href="#modes">Service modes</a>
        <a href="#commercial">Readiness</a>
        <a href="#questions">Questions</a>
      </nav>
      <section
        id="experience"
        className="mt-container mt-section mt-section-tight"
      >
        <div className="mt-heading-row">
          <div>
            <p className="eyebrow">TAKE A CLOSER LOOK</p>
            <h2>
              Every role.
              <br />A clearer view.
            </h2>
          </div>
          <p>
            Switch between illustrations to explore how the workflow fits
            together. This demonstration doesn’t submit orders or move money.
          </p>
        </div>
        <ProductDemonstration />
      </section>
      <section className="mt-qr-journey">
        <div className="mt-container">
          <div className="mt-heading-row">
            <div>
              <p className="eyebrow">THE SERVICE JOURNEY</p>
              <h2>
                Good service flows.
                <br />
                Keep it connected.
              </h2>
            </div>
            <p>
              Give guests a simple way in.
              <br />
              Give your team a clear way through.
            </p>
          </div>
          <ol>
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
                <span>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section id="modes" className="mt-container mt-section">
        <div className="mt-heading-row">
          <div>
            <p className="eyebrow">FIT THE WAY YOU SERVE</p>
            <h2>
              One platform.
              <br />
              Different rhythms.
            </h2>
          </div>
          <p>
            Combine the service modes your venue needs. Keep roles, branch
            access and readiness explicit.
          </p>
        </div>
        <div className="mt-service-modes">
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
          ].map(([title, text], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="reporting" className="mt-contrast-section">
        <div className="mt-container mt-split">
          <div>
            <p className="eyebrow">YOUR BRAND. YOUR OPERATION.</p>
            <h2>
              More than a<br />
              digital menu.
            </h2>
            <p>
              Bring the details around service into the same working picture.
            </p>
          </div>
          <dl className="mt-feature-list">
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
      <section className="mt-container mt-faq" id="questions">
        <div>
          <p className="eyebrow">BEFORE YOU BEGIN</p>
          <h2>A few useful answers.</h2>
        </div>
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
      <section className="mt-travel-hero mt-container">
        <div>
          <p className="eyebrow">MERATRAVEL SUITE</p>
          <span className="mt-status is-planned">Planned · coming soon</span>
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
          <a className="primary" href="#travel-interest">
            Register your interest <ArrowRight aria-hidden="true" />
          </a>
          <p className="mt-small-note">
            Not an available application. No launch date, pricing or
            integrations are being promised.
          </p>
        </div>
        <TravelConcept />
      </section>
      <section className="mt-travel-intent mt-container">
        <div>
          <p className="eyebrow">HELP INFORM THE DIRECTION</p>
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
        eyebrow="MERATECH CONSULTANCY"
        title={
          <>
            Your business challenge.
            <br />A considered solution.
          </>
        }
        text="When your needs don’t fit a ready-made product, start with the problem. We help shape bespoke software around your users, systems and goals."
      />
      <section className="mt-consultancy-process mt-container">
        <div>
          <p className="eyebrow">FROM NEED TO NEXT STEP</p>
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
              <span>0{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="mt-project-brief-section" id="project-brief">
        <div className="mt-container">
          <div className="mt-heading-row">
            <div>
              <p className="eyebrow">TELL US WHAT YOU NEED</p>
              <h2>Start with your brief.</h2>
            </div>
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
        eyebrow="ABOUT MERATECH"
        title={
          <>
            Technology should
            <br />
            understand the work.
          </>
        }
        text="MeraTech brings product thinking and software development to hospitality, travel and the business needs around them."
      />
      <section className="mt-about-principle">
        <div className="mt-container">
          <p className="eyebrow">OUR STARTING POINT</p>
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
      <section className="mt-container mt-section">
        <div className="mt-heading-row">
          <div>
            <p className="eyebrow">WHAT WE’RE BUILDING</p>
            <h2>
              A clear purpose
              <br />
              for each offering.
            </h2>
          </div>
          <p>
            We distinguish working software, future direction and bespoke
            project work so you can choose the right next step.
          </p>
        </div>
        <OfferingRows />
      </section>
      <FinalAction />
    </MarketingShell>
  );
}
function Contact() {
  return (
    <MarketingShell active="contact">
      <PageIntro
        eyebrow="CONTACT MERATECH"
        title={
          <>
            Start the right
            <br />
            conversation.
          </>
        }
        text="Choose what you need and share the details that will make the next conversation useful."
      />
      <section className="mt-contact-choices mt-container">
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
          <article key={item.title}>
            <item.icon aria-hidden="true" />
            <div>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
              <a className="mt-text-link" href={item.href}>
                {item.cta}
                <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </article>
        ))}
      </section>
    </MarketingShell>
  );
}
function SignInRouting() {
  return (
    <MarketingShell>
      <PageIntro
        eyebrow="PRODUCT SIGN-IN"
        title={
          <>
            The right workspace.
            <br />
            The right access.
          </>
        }
        text="Choose your existing workspace. New business registration and platform operator access are separate journeys."
      />
      <section className="mt-entry-choices mt-container">
        <article>
          <QrCode aria-hidden="true" />
          <p className="eyebrow">MERA QR</p>
          <h2>Owner & staff workspace</h2>
          <p>
            Sign in with your existing account. Access follows your
            organization, branch and assigned role.
          </p>
          <a className="primary" href="/mera/workspace">
            Sign in to Mera QR <ArrowRight aria-hidden="true" />
          </a>
          <a className="mt-text-link" href="/mera/signup">
            New business? Start registration
          </a>
        </article>
        <article>
          <Compass aria-hidden="true" />
          <p className="eyebrow">MERATRAVEL SUITE</p>
          <h2>Planned, not launched.</h2>
          <p>
            There is no Travel application account to sign into yet. You can
            register interest in the planned product.
          </p>
          <a className="mt-text-link" href="/mera/travel#travel-interest">
            Register product interest <ArrowRight aria-hidden="true" />
          </a>
        </article>
      </section>
      <div className="mt-operator-entry mt-container">
        <ShieldCheck aria-hidden="true" />
        <p>Authorized Mera operator?</p>
        <a href="/mera/platform/sign-in">
          Open platform sign-in <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    </MarketingShell>
  );
}
function PageIntro({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: ReactNode;
  text: string;
}) {
  return (
    <section className="mt-page-intro mt-container">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{text}</p>
    </section>
  );
}
function FinalAction({ product = false }: { product?: boolean }) {
  return (
    <section className="mt-final-action">
      <div className="mt-container">
        <div>
          <p className="eyebrow">
            {product
              ? "YOUR NEXT CHAPTER OF SERVICE"
              : "LET’S MAKE THE NEXT STEP USEFUL"}
          </p>
          <h2>
            {product
              ? "Bring your service together."
              : "A product. A possibility. A project."}
          </h2>
        </div>
        <a
          className="primary"
          href={product ? "/mera/signup" : "/mera/contact"}
        >
          {product ? "Start with Mera QR" : "Find your next step"}
          <ArrowRight aria-hidden="true" />
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
