import React from "react";
import { createRoot } from "react-dom/client";
const App = React.lazy(() => import("./App"));
import "./styles.css";
import "./mera/platform.css";
import "./mera/signup.css";
const Signup = React.lazy(() => import("./mera/Signup"));
import "./mera/marketing/marketing.css";
import "./mera/customer/customer.css";
import "./mera/workspace/workspace.css";
import "./mera/workspace/management.css";
import "./mera/workspace/setup.css";
import "./mera/workspace/branch-admin.css";
import "./mera/workspace/menu-management.css";
import "./mera/workspace/publication.css";
import "./mera/workspace/preparation.css";
import "./mera/workspace/staff-management.css";
import "./mera/customer/visit-summary.css";
import "./mera/workspace/billing-management.css";
const Marketing = React.lazy(() => import("./mera/marketing/Marketing"));
const LegalInformation = React.lazy(() =>
  import("./mera/marketing/Marketing").then((module) => ({
    default: module.LegalInformation,
  })),
);
const CustomerExperience = React.lazy(
  () => import("./mera/customer/CustomerExperience"),
);
const Platform = React.lazy(() => import("./mera/Platform"));
if (window.location.pathname.startsWith("/mera")) {
  if (/^\/mera\/(menu|store)\//.test(window.location.pathname))
    document.querySelector('link[rel="manifest"]')?.remove();
  else
    document
      .querySelector('link[rel="manifest"]')
      ?.setAttribute("href", "/mera.webmanifest");
  document
    .querySelector('link[rel="icon"]')
    ?.setAttribute("href", "/mera-icon.svg");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", "#fffdf8");
  document.title = window.location.pathname.startsWith("/mera/workspace")
    ? "Workspace · Mera"
    : window.location.pathname.startsWith("/mera/platform")
      ? "Platform administration · Mera"
      : /^\/mera\/(menu|store)\//.test(window.location.pathname)
        ? "Menu & guest services · Mera"
        : window.location.pathname.startsWith("/mera/legal")
          ? "Policy preparation · Mera"
          : "Mera · Hospitality, connected";
}

class WorkspaceBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("Workspace error", error);
  }
  render() {
    return this.state.failed ? (
      <div className="workspace-recovery" role="alert">
        {window.location.pathname.startsWith("/mera") ? (
          <p className="mera-wordmark">mera.</p>
        ) : (
          <img src="/brand/brand-logo.png" alt="Bing Chun" />
        )}
        <h1>Let’s reopen this page.</h1>
        <p>
          A page could not be displayed. Saved records remain on the server.
          Check your connection before reopening this page.
        </p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkspaceBoundary>
      <React.Suspense
        fallback={
          <main style={{ padding: 40 }} role="status">
            <h1>
              {/^\/mera\/(menu|store)\//.test(window.location.pathname)
                ? "Opening the menu…"
                : window.location.pathname === "/mera" ||
                    window.location.pathname === "/mera/"
                  ? "Loading Mera…"
                  : window.location.pathname === "/mera/legal"
                    ? "Opening policy information…"
                    : window.location.pathname === "/mera/signup"
                      ? "Opening registration…"
                      : window.location.pathname === "/mera/platform"
                        ? "Opening platform administration…"
                        : "Opening your workspace…"}
            </h1>
            <p>Connecting to the current service.</p>
          </main>
        }
      >
        {window.location.pathname === "/mera" ||
        window.location.pathname === "/mera/" ? (
          <Marketing />
        ) : window.location.pathname === "/mera/legal" ? (
          <LegalInformation />
        ) : window.location.pathname === "/mera/signup" ? (
          <Signup />
        ) : /^\/mera\/(menu|store)\//.test(window.location.pathname) ? (
          <CustomerExperience />
        ) : window.location.pathname === "/mera/platform" ? (
          <Platform />
        ) : (
          <App />
        )}
      </React.Suspense>
    </WorkspaceBoundary>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && window.isSecureContext)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
