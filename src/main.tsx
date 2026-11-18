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
if (window.location.pathname.startsWith("/mera"))
  document.title = window.location.pathname.startsWith("/mera/workspace")
    ? "Workspace · Mera"
    : window.location.pathname.startsWith("/mera/platform")
      ? "Platform administration · Mera"
      : /^\/mera\/(menu|store)\//.test(window.location.pathname)
        ? "Menu & guest services · Mera"
        : window.location.pathname.startsWith("/mera/legal")
          ? "Policy preparation · Mera"
          : "Mera · Hospitality, connected";

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
        <h1>Let’s reopen your workspace.</h1>
        <p>
          A page could not be displayed. Saved records remain on the server.
          Check your connection before reopening this page.
        </p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reopen workspace
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
            <h1>Opening your workspace…</h1>
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
