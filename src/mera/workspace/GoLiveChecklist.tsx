import React, { useState } from "react";
import LaunchReadiness from "./LaunchReadiness";
const checks: Record<string, [string, string, string?, string?]> = {
  subscription_access: [
    "Subscription access",
    "Review your subscription access.",
    "billing",
    "Review subscription",
  ],
  owner_identity: [
    "Owner verification",
    "Verify the owner's contact details.",
    "onboarding",
    "Review account",
  ],
  identity: [
    "Business details",
    "Check your business and location names.",
    "onboarding",
    "Review business details",
  ],
  timezone: [
    "Trading timezone",
    "Check your location's timezone and currency.",
    "onboarding",
    "Review location",
  ],
  contacts: [
    "Customer contact",
    "Give customers a phone number or email.",
    "onboarding",
    "Review business details",
  ],
  menu: [
    "Menu",
    "Add items and publish your menu.",
    "menu",
    "Add and publish your menu",
  ],
  printing: [
    "Receipt and sticker layouts",
    "Prepare the layouts staff will print.",
    "printing",
    "Design receipt and stickers",
  ],
  manual_branch_policy: [
    "Payment handling",
    "Review how staff record payments.",
    "onboarding",
    "Review payment settings",
  ],
  manual_platform_policy: [
    "Mera launch review",
    "Mera reviews new businesses before the first launch. We'll enable this for you.",
  ],
};
export default function GoLiveChecklist(
  props: Omit<React.ComponentProps<typeof LaunchReadiness>, "checklist">,
) {
  const key = `mera:go-live-collapsed:${props.base}`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(key) === "true";
    } catch {
      return false;
    }
  });
  return (
    <LaunchReadiness
      {...props}
      guidedStage="review"
      publicContact={props.settings?.publicContact}
      checklist={(readiness, actions) => {
        if (readiness?.launchState === "published") return null;
        const rows = readiness?.checks || [],
          done = rows.filter((c: any) => c.status === "ready").length;
        return (
          <section
            className="mw-card mw-management"
            aria-label="Go-live checklist"
          >
            <h2>
              Ready to go live · {done} of {rows.length} done
            </h2>
            <div
              role="progressbar"
              aria-label="Go-live progress"
              aria-valuemin={0}
              aria-valuemax={rows.length || 1}
              aria-valuenow={done}
            >
              <progress max={rows.length || 1} value={done} />
            </div>
            <button
              className="secondary"
              aria-expanded={!collapsed}
              onClick={() => {
                setCollapsed(!collapsed);
                try {
                  window.localStorage.setItem(key, String(!collapsed));
                } catch {}
              }}
            >
              {collapsed ? "Show checklist" : "Hide checklist"}
            </button>
            {!collapsed && (
              <>
                <ul className="mw-management-checklist">
                  {rows.map((c: any) => {
                    const row = checks[c.id] || [c.label, c.detail];
                    return (
                      <li key={c.id}>
                        <div>
                          <b>{row[0]}</b>
                          <p>{row[1]}</p>
                          <span>
                            {c.status === "ready"
                              ? "Done"
                              : c.id === "manual_platform_policy"
                                ? "Waiting on Mera"
                                : "To do"}
                          </span>
                        </div>
                        {row[2] && (
                          <button
                            className="secondary"
                            onClick={() => props.onOpen?.(row[2]!)}
                          >
                            {row[3]}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {actions.error && <p role="alert">{actions.error}</p>}
                {actions.uncertain && (
                  <p role="alert">
                    A previous launch attempt is unconfirmed. Recheck readiness
                    before trying again.
                  </p>
                )}
                <p>
                  This publishes the branch’s configured menu state within Mera.
                  Public hosting, verified payment providers and physical
                  printer output require separate validation. No website
                  deployment or live payment activation happens here.
                </p>
                <button
                  className="primary"
                  disabled={
                    props.disabled ||
                    actions.busy ||
                    actions.uncertain ||
                    !readiness?.canPublish
                  }
                  onClick={actions.goLive}
                >
                  Go live
                </button>
                <button
                  className="secondary"
                  disabled={actions.busy || actions.checking}
                  onClick={actions.recheck}
                >
                  Recheck readiness
                </button>
              </>
            )}
          </section>
        );
      }}
    />
  );
}
