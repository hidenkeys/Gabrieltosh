import { useRef, useState, type ReactNode } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { MeraBrand } from "../ui/MeraBrand";
import { usePublicNavigation } from "./publicNavigation";
const sections = [
  "mt-main",
  "products",
  "experience",
  "modes",
  "reporting",
  "pricing",
  "commercial",
  "project-brief",
  "travel-interest",
  "support",
  "questions",
] as const;
export default function MarketingShell({
  children,
  active = "",
}: {
  children: ReactNode;
  active?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = usePublicNavigation(sections);
  return (
    <div
      className="mera-marketing mera-identity mt-site"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <a className="mera-marketing-skip" href="#mt-main" onClick={navigate}>
        Skip to content
      </a>
      <header className="mt-header">
        <a className="mt-company-brand" href="/mera" aria-label="MeraTech home">
          <MeraBrand />
          <span>MeraTech</span>
        </a>
        <button
          className="mt-mobile-toggle"
          type="button"
          ref={trigger}
          aria-controls="mt-navigation"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          <span>{open ? "Close menu" : "Open menu"}</span>
        </button>
        <nav
          id="mt-navigation"
          className={open ? "is-open" : ""}
          aria-label="MeraTech navigation"
        >
          <div>
            {[
              ["products", "Products"],
              ["consultancy", "Consultancy"],
              ["about", "About"],
              ["contact", "Contact"],
            ].map(([path, label]) => (
              <a
                key={path}
                href={`/mera/${path}`}
                aria-current={active === path ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </div>
          <a className="mt-signin-link" href="/mera/sign-in">
            Sign in <ArrowRight aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main
        id="mt-main"
        onClick={(event) => {
          const anchor = (
            event.target as HTMLElement
          ).closest<HTMLAnchorElement>('a[href^="#"]');
          if (anchor) {
            const synthetic = {
              ...event,
              currentTarget: anchor,
              preventDefault: () => event.preventDefault(),
            };
            navigate(synthetic);
          }
        }}
      >
        {children}
      </main>
      <footer className="mt-footer">
        <div className="mt-footer-top">
          <div>
            <a
              className="mt-company-brand"
              href="/mera"
              aria-label="MeraTech home"
            >
              <MeraBrand tone="light" />
              <span>MeraTech</span>
            </a>
            <p>
              Thoughtful technology.
              <br />
              Better business experiences.
            </p>
          </div>
          <nav aria-label="Products and services">
            <span>WHAT WE DO</span>
            <a href="/mera/qr">Mera QR</a>
            <a href="/mera/travel">MeraTravel Suite · planned</a>
            <a href="/mera/consultancy">MeraTech Consultancy</a>
          </nav>
          <nav aria-label="Company">
            <span>COMPANY</span>
            <a href="/mera/about">About</a>
            <a href="/mera/contact">Contact</a>
            <a href="/mera/sign-in">Product sign-in</a>
          </nav>
        </div>
        <div className="mt-footer-bottom">
          <span>MeraTech · Built around real work.</span>
          <a href="/mera/legal">Privacy & terms preparation</a>
          <a href="/mera/platform/sign-in">Platform operator sign-in</a>
        </div>
      </footer>
    </div>
  );
}
