import React, { useState } from "react";
import LaunchReadiness from "./LaunchReadiness";
const checks: Record<string, [string, string, string?, string?]> = {
  subscription_access: [
    "Free trial",
    "Your free trial lets you take orders. Subscribe before it ends to keep going.",
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
    "Add items by hand or import a menu file, then publish.",
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
  props: Omit<React.ComponentProps<typeof LaunchReadiness>, "checklist"> & {
    onImportMenu?: () => void;
  },
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
        const rows = [...(readiness?.checks || [])].filter((check: any) => readiness?.billingEnabled !== false || check.id !== "subscription_access").sort(
            (a: any, b: any) =>
              Number(a.id === "manual_platform_policy") -
              Number(b.id === "manual_platform_policy"),
          ),
          done = rows.filter((c: any) => c.status === "ready").length;
        return (
          <section className="mw-card mgl" aria-label="Go-live checklist">
            <header className="mgl-head">
              <div>
                <h2>Ready to go live</h2>
                <p>
                  {done === rows.length
                    ? "Everything is ready. Go live to start taking orders."
                    : `${done} of ${rows.length} done. Finish these to start taking orders.`}
                </p>
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
            </header>
            <div
              className="mgl-bar"
              role="progressbar"
              aria-label="Go-live progress"
              aria-valuemin={0}
              aria-valuemax={rows.length || 1}
              aria-valuenow={done}
            >
              <span
                style={{ width: `${(done / (rows.length || 1)) * 100}%` }}
              />
            </div>
            {!collapsed && (
              <>
                <ol className="mgl-list">
                  {rows.map((c: any) => {
                    const row = checks[c.id] || [c.label, c.detail];
                    const state =
                      c.status === "ready"
                        ? "done"
                        : c.id === "manual_platform_policy"
                          ? "waiting"
                          : "todo";
                    return (
                      <li key={c.id} className={`mgl-row is-${state}`}>
                        <span className="mgl-dot" aria-hidden="true">
                          {state === "done" ? "✓" : ""}
                        </span>
                        <div className="mgl-text">
                          <b>{row[0]}</b>
                          <p>{row[1]}</p>
                          {c.id === "menu" && props.onImportMenu && (
                            <button
                              className="secondary"
                              onClick={props.onImportMenu}
                            >
                              Import from a menu file
                            </button>
                          )}
                        </div>
                        <span className={`mgl-status is-${state}`}>
                          {state === "done"
                            ? "Done"
                            : state === "waiting"
                              ? "Waiting on Mera"
                              : "To do"}
                        </span>
                        {row[2] && state !== "waiting" ? (
                          <button
                            className={
                              state === "todo" ? "primary" : "secondary"
                            }
                            onClick={() => props.onOpen?.(row[2]!)}
                          >
                            {row[3]}
                          </button>
                        ) : (
                          <span />
                        )}
                      </li>
                    );
                  })}
                </ol>
                {actions.error && <p role="alert">{actions.error}</p>}
                {actions.uncertain && (
                  <p role="alert">
                    A previous launch attempt is unconfirmed. Recheck readiness
                    before trying again.
                  </p>
                )}
                <footer className="mgl-foot">
                  <p>
                    Going live publishes this location’s menu in Mera. It does
                    not switch on online payments or printers.
                  </p>
                  <div className="mw-actions">
                    <button
                      className="secondary"
                      disabled={actions.busy || actions.checking}
                      onClick={actions.recheck}
                    >
                      Recheck readiness
                    </button>
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
                  </div>
                </footer>
              </>
            )}
          </section>
        );
      }}
    />
  );
}
