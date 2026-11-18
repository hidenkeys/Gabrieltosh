import { useState, useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";

const groups = [
  [
    "Service",
    [
      "counter",
      "orders",
      "preparation",
      "tables",
      "reservations",
      "waitlist",
      "help",
    ],
  ],
  [
    "Management",
    ["overview", "menu", "payments", "shifts", "team", "care", "exports"],
  ],
  [
    "Settings",
    ["onboarding", "printing", "qr", "billing", "integrations", "support"],
  ],
] as const;
export default function WorkspaceNavigation({
  sections,
  active,
  onSelect,
  organization,
  branch,
}: {
  sections: string[][];
  active: string;
  onSelect: (id: string) => void;
  organization: string;
  branch: string;
}) {
  const [open, setOpen] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open)
      navigation.current
        ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
        ?.focus();
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="secondary mw-mobile-nav-toggle"
        aria-expanded={open}
        aria-controls="mw-operational-navigation"
        onClick={() => setOpen(!open)}
      >
        <Menu size={18} /> Workspace menu
      </button>
      {open && (
        <button
          type="button"
          className="mw-nav-backdrop"
          aria-label="Close workspace menu"
          onClick={() => setOpen(false)}
        />
      )}
      <nav
        ref={navigation}
        id="mw-operational-navigation"
        className={"mw-side-nav" + (open ? " is-open" : "")}
        aria-label="Organization workspace"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            document
              .querySelector<HTMLButtonElement>(".mw-mobile-nav-toggle")
              ?.focus();
          }
          if (open && e.key === "Tab") {
            const controls = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                "a,button:not(:disabled)",
              ),
            ).filter((el) => el.tabIndex >= 0);
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
          <a className="mw-brand" href="/mera">
            mera<span>.</span>
          </a>
          <button
            type="button"
            className="secondary mw-close-nav"
            aria-label="Close workspace menu"
            onClick={() => setOpen(false)}
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
          role="tablist"
          aria-label="Workspace pages"
          aria-orientation="vertical"
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
            );
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
          {groups.map(([label, ids]) => {
            const items = ids
              .map((id) => sections.find((s) => s[0] === id))
              .filter(Boolean) as string[][];
            return (
              items.length > 0 && (
                <div key={label}>
                  <p className="nav-label">{label}</p>
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
                        onSelect(id);
                        setOpen(false);
                      }}
                    >
                      {id === "counter"
                        ? "Point of sale"
                        : id === "overview"
                          ? "Overview"
                          : name}
                    </button>
                  ))}
                </div>
              )
            );
          })}
        </div>
        <div className="mw-side-bottom">
          <span className="online-dot" /> Mera workspace
        </div>
      </nav>
    </>
  );
}
