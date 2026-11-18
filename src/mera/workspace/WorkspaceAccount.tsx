import { useEffect, useRef } from "react";
import { ChevronDown, LogOut } from "lucide-react";

/** Pilot account controls. Sign-out reconciliation stays with the workspace. */
export default function WorkspaceAccount({
  name,
  role,
  disabled,
  signingOut,
  onSignOut,
}: {
  name: string;
  role: string;
  disabled: boolean;
  signingOut: boolean;
  onSignOut?: () => void;
}) {
  const container = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (
        !container.current?.contains(event.target as Node) &&
        container.current
      )
        container.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return (
    <details
      ref={container}
      className="mw-account"
      onKeyDown={(event) => {
        if (event.key === "Escape" && container.current?.open) {
          event.preventDefault();
          container.current.open = false;
          container.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={`Account for ${name}`}>
        <span className="mw-staff-avatar" aria-hidden="true">
          {name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase()}
        </span>
        <span className="mw-account-name">{name}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="mw-account-panel">
        <strong>{name}</strong>
        <span>{role}</span>
        {onSignOut && (
          <button
            type="button"
            className="secondary"
            disabled={disabled || signingOut}
            onClick={() => {
              if (container.current) container.current.open = false;
              onSignOut();
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        )}
      </div>
    </details>
  );
}
