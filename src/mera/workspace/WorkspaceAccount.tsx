import { useEffect, useRef } from "react";
import { ChevronDown, LogOut, CircleAlert } from "lucide-react";

/** Pilot account controls. Sign-out reconciliation stays with the workspace. */
export default function WorkspaceAccount({
  name,
  role,
  disabled,
  signingOut,
  onSignOut,
  notice,
}: {
  name: string;
  role: string;
  disabled: boolean;
  signingOut: boolean;
  onSignOut?: () => void;
  notice?: { message: string; label: string; onReview: () => void };
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
      <summary
        aria-label={`Account for ${name}`}
        aria-describedby={notice ? "mw-account-notice" : undefined}
      >
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
        {notice && (
          <CircleAlert
            className="mw-account-alert"
            size={15}
            aria-hidden="true"
          />
        )}
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="mw-account-panel">
        <strong>{name}</strong>
        <span>{role}</span>
        {notice && (
          <>
            <p id="mw-account-notice">{notice.message}</p>
            <button
              type="button"
              className="secondary"
              disabled={disabled}
              onClick={() => {
                if (container.current) container.current.open = false;
                notice.onReview();
              }}
            >
              {notice.label}
            </button>
          </>
        )}
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
