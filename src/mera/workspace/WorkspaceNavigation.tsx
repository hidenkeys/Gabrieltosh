import { useState, useEffect, useRef } from "react";
import {
  Menu,
  X,
  LayoutGrid,
  ClipboardList,
  ChefHat,
  ChartNoAxesCombined,
  Users,
  Settings2,
  Printer,
  ReceiptText,
  Package,
  QrCode,
  CalendarDays,
  Table2,
  CreditCard,
  Clock3,
  MessageSquare,
  Download,
  LifeBuoy,
  Plug,
  ChevronDown,
} from "lucide-react";
const pageIcons: Record<string, typeof LayoutGrid> = {
  organization: ChartNoAxesCombined,
  door: Users,
  transfers: Package,
  counter: LayoutGrid,
  orders: ClipboardList,
  preparation: ChefHat,
  soldout: Package,
  overview: ChartNoAxesCombined,
  team: Users,
  onboarding: Settings2,
  printing: Printer,
  menu: Package,
  qr: QrCode,
  reservations: CalendarDays,
  tables: Table2,
  payments: CreditCard,
  shifts: Clock3,
  help: MessageSquare,
  care: MessageSquare,
  exports: Download,
  support: LifeBuoy,
  integrations: Plug,
  billing: ReceiptText,
  waitlist: CalendarDays,
};

const groups = [
  [
    "Service",
    [
      "counter",
      "orders",
      "preparation",
      "soldout",
      "tables",
      "reservations",
      "waitlist",
      "door",
      "help",
      "payments",
      "shifts",
      "organization",
      "overview",
    ],
  ],
  [
    "Menu",
    [
      "menu",
      "transfers",

    ],
  ],
  ["Team", ["team"]],

] as const;
const moreIds = [
  "care",
  "exports",
  "onboarding",
  "printing",
  "qr",
  "billing",
  "integrations",
  "support",
];
export default function WorkspaceNavigation({
  sections,
  turnedOffSections = [],
  active,
  onSelect,
  organization,
  branch,
  logo,
  connectionState = "unknown",
  billingEnabled = false,
  role = "",
}: {
  sections: string[][];
  role?: string;
  billingEnabled?: boolean;
  turnedOffSections?: string[];
  active: string;
  onSelect: (id: string, options?: { focusDestination: boolean }) => void;
  organization: string;
  branch: string;
  logo?: string;
  connectionState?: "unknown" | "connecting" | "connected" | "offline";
}) {
  sections = sections.filter(([id]) => billingEnabled || !["billing", "subscription", "invoices"].includes(id));
  const [phone, setPhone] = useState(() => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 767px)");
    const changed = () => setPhone(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const preferred = /owner|manager|admin/.test(role) ? ["overview", "orders", "menu"] : /kitchen|bar/.test(role) ? ["preparation", sections.some(s=>s[0]==="soldout") ? "soldout" : "menu"] : ["orders", "tables", "counter", "help"];
  const phoneItems = preferred.flatMap(id => {
    const item = sections.find(s => s[0] === id && !turnedOffSections.includes(id));
    return item ? [[id, ({soldout: "Sold out", counter: "New order", preparation: "Tickets", menu: /kitchen|bar/.test(role) ? "Sold out" : "Menu", help: "Help requests", tables: "Tables", overview: "Overview"} as Record<string,string>)[id] || item[1]]] : [];
  });
  const extraMoreIds = [...moreIds, ...turnedOffSections];
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(() => extraMoreIds.includes(active));
  const moreToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (extraMoreIds.includes(active)) setMoreOpen(true);
  }, [active, turnedOffSections.join("|")]);
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [logo]);
  const bottomMore = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const closeMenu = () => {
    setOpen(false);
    (bottomMore.current || toggle.current)?.focus();
  };
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 1000px)");
    const changed = () => {
      if (media.matches) return;
      setOpen(false);
      if (
        document.activeElement ===
        navigation.current?.querySelector(".mw-close-nav")
      )
        navigation.current
          ?.querySelector<HTMLButtonElement>(
            '[role="tab"][aria-selected="true"]',
          )
          ?.focus();
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (open)
      navigation.current
        ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
        ?.focus();
  }, [open]);
  const renderGroup = (label: string, ids: readonly string[]) => {
    const items = ids
      .map((id) => sections.find((s) => s[0] === id))
      .filter(Boolean) as string[][];
    return (
      items.length > 0 && (
        <div key={label || "more"}>
          {label && <p className="nav-label">{label}</p>}
          {items.map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={"mw-tab-" + id}
              aria-controls="mw-workspace-panel"
              aria-selected={active === id}
              tabIndex={active === id ? 0 : -1}
              className={"nav-item" + (active === id ? " active" : "")}
              onClick={() => {
                if (open) closeMenu();
                onSelect(id, { focusDestination: open });
              }}
            >
              {(() => {
                const Icon = pageIcons[id] || LayoutGrid;
                return <Icon size={18} aria-hidden="true" />;
              })()}
              {id === "counter"
                ? "Point of sale"
                : id === "overview"
                  ? "Overview"
                  : name}
              {turnedOffSections.includes(id) && (
                <>
                  {" "}
                  <small>Turned off</small>
                </>
              )}
            </button>
          ))}
        </div>
      )
    );
  };
  return (
    <>
      {phone && <nav className="mw-bottom-nav" aria-label="Quick workspace pages">
        {phoneItems.map(([id,label]) => <button key={id} type="button" aria-current={active === id ? "page" : undefined} onClick={() => onSelect(id, {focusDestination:true})}>{label}</button>)}
        <button ref={bottomMore} type="button" aria-current={!phoneItems.some(([id])=>id===active) ? "page" : undefined} aria-expanded={open} aria-controls="mw-operational-navigation" onClick={() => {setMoreOpen(true); setOpen(!open);}}>More</button>
      </nav>}
      <button
        type="button"
        ref={toggle}
        className="secondary mw-mobile-nav-toggle"
        aria-expanded={open}
        aria-controls="mw-operational-navigation"
        onClick={() => {
          if (!open && extraMoreIds.includes(active)) setMoreOpen(true);
          setOpen(!open);
        }}
      >
        <Menu size={18} /> Workspace menu
      </button>
      {open && (
        <button
          type="button"
          className="mw-nav-backdrop"
          aria-label="Close workspace menu"
          onClick={closeMenu}
        />
      )}
      <nav
        ref={navigation}
        id="mw-operational-navigation"
        className={"mw-side-nav" + (open ? " is-open" : "")}
        aria-label="Organization workspace"
        onKeyDown={(e) => {
          if (open && e.key === "Escape") {
            e.preventDefault();
            closeMenu();
          }
          if (open && e.key === "Tab") {
            const controls = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                "a,button:not(:disabled)",
              ),
            ).filter(
              (el) =>
                !el.closest("[hidden]") &&
                (el.tabIndex >= 0 || el === document.activeElement),
            );
            const first = controls[0],
              last = controls.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="mw-side-brand">
          <div className="mw-organization-brand">
            {logo && !logoFailed && (
              <img src={logo} alt="" onError={() => setLogoFailed(true)} />
            )}
            <span>
              <strong>{organization}</strong>
              <small>WORKSPACE</small>
            </span>
          </div>
          <button
            type="button"
            className="secondary mw-close-nav"
            aria-label="Close workspace menu"
            onClick={closeMenu}
          >
            <X size={18} />
          </button>
        </div>
        <div className="store-label">
          <span className="store-dot" />
          <span>
            <strong>{organization}</strong>
            <small>{branch}</small>
          </span>
        </div>
        <div
          className="mw-side-links"
          onKeyDown={(e) => {
            const keys = [
              "ArrowDown",
              "ArrowUp",
              "ArrowRight",
              "ArrowLeft",
              "Home",
              "End",
            ];
            if (!keys.includes(e.key)) return;
            const buttons = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              ),
            ).filter((button) => !button.closest("[hidden]"));
            const current = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (current < 0) return;
            e.preventDefault();
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? buttons.length - 1
                  : (current +
                      (["ArrowDown", "ArrowRight"].includes(e.key) ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }}
        >
          <div
            role="tablist"
            aria-label="Workspace pages"
            aria-orientation="vertical"
          >
            {groups.map(([label, ids]) =>
              renderGroup(
                label,
                ids.filter((id) => !turnedOffSections.includes(id)),
              ),
            )}
            {phone && renderGroup("Settings", extraMoreIds)}
          </div>
          {!phone && extraMoreIds.some((id) =>
            sections.some((section) => section[0] === id),
          ) && (
            <div className="mw-nav-more">
              <button
                ref={moreToggle}
                type="button"
                className="nav-item mw-more-toggle"
                aria-expanded={moreOpen}
                aria-controls="mw-more-workspace-pages"
                onClick={() => {
                  if (moreOpen) moreToggle.current?.focus();
                  setMoreOpen(!moreOpen);
                }}
              >
                <ChevronDown size={18} aria-hidden="true" />
                More
              </button>
              <div
                id="mw-more-workspace-pages"
                role="tablist"
                aria-label="More workspace pages"
                aria-orientation="vertical"
                hidden={!moreOpen}
              >
                {renderGroup("Settings", extraMoreIds)}
              </div>
            </div>
          )}
        </div>
        <div className="mw-side-bottom">
          <span
            className={"online-dot mw-connection-" + connectionState}
            aria-hidden="true"
          />
          {connectionState === "connected"
            ? "Service connected"
            : connectionState === "offline"
              ? "Connection interrupted"
              : connectionState === "connecting"
                ? "Connecting…"
                : "Mera workspace"}
        </div>
      </nav>
    </>
  );
}
