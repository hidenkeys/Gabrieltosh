import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Menu, X } from "lucide-react";
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
const links = [
  ["products", "Products"],
  ["consultancy", "Consultancy"],
  ["about", "About"],
  ["contact", "Contact"],
];
export default function MarketingShell({
  children,
  active = "",
}: {
  children: ReactNode;
  active?: string;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const navigate = usePublicNavigation(sections);
  // The header only gains a surface once the page has moved under it.
  useEffect(() => {
    const target = sentinel.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver(([entry]) =>
      setScrolled(!entry.isIntersecting),
    );
    watcher.observe(target);
    return () => watcher.disconnect();
  }, []);
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
      <div ref={sentinel} className="mx-sentinel" aria-hidden="true" />
      <header
        className="mx-header"
        data-scrolled={scrolled ? "" : undefined}
        data-open={open ? "" : undefined}
      >
        <div className="mx-header-inner">
          <a className="mx-brand" href="/mera" aria-label="MeraTech home">
            <MeraBrand />
            <span>MeraTech</span>
          </a>
          <button
            className="mx-menu-button"
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
            className={`mx-nav ${open ? "is-open" : ""}`}
            aria-label="MeraTech navigation"
          >
            <div className="mx-nav-links">
              {links.map(([path, label], index) => (
                <a
                  key={path}
                  href={`/mera/${path}`}
                  style={{ "--i": index } as CSSProperties}
                  aria-current={active === path ? "page" : undefined}
                >
                  {label}
                </a>
              ))}
            </div>
            <a className="mx-signin" href="/mera/sign-in">
              Sign in
            </a>
          </nav>
        </div>
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
      <footer className="mx-footer">
        <div className="mx-footer-top mt-container">
          <div>
            <a className="mx-brand" href="/mera" aria-label="MeraTech home">
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
            <span>What we do</span>
            <a href="/mera/qr">Mera QR</a>
            <a href="/mera/travel">MeraTravel Suite (planned)</a>
            <a href="/mera/consultancy">MeraTech Consultancy</a>
          </nav>
          <nav aria-label="Company">
            <span>Company</span>
            <a href="/mera/about">About</a>
            <a href="/mera/contact">Contact</a>
            <a href="/mera/sign-in">Product sign-in</a>
          </nav>
        </div>
        <div className="mx-footer-base mt-container">
          <span>MeraTech. Built around real work.</span>
          <a href="/mera/legal">Privacy & terms preparation</a>
          <a href="/mera/platform/sign-in">Platform operator sign-in</a>
        </div>
      </footer>
    </div>
  );
}
