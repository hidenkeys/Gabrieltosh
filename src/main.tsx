import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./mera/marketing/marketing.css";
import "./mera/customer/customer.css";
import "./mera/workspace/workspace.css";
import Marketing, { LegalInformation } from "./mera/marketing/Marketing";
import CustomerExperience from "./mera/customer/CustomerExperience";
import Platform from "./mera/Platform";
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
        <img src="/brand/brand-logo.png" alt="Bing Chun" />
        <h1>Let’s reopen your workspace.</h1>
        <p>
          A page could not be displayed. Your saved orders remain on the store
          server.
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
      {window.location.pathname === "/mera" ||
      window.location.pathname === "/mera/" ? (
        <Marketing />
      ) : window.location.pathname === "/mera/legal" ? (
        <LegalInformation />
      ) : /^\/mera\/(menu|store)\//.test(window.location.pathname) ? (
        <CustomerExperience />
      ) : window.location.pathname === "/mera/platform" ? (
        <Platform />
      ) : (
        <App />
      )}
    </WorkspaceBoundary>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && window.isSecureContext)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
