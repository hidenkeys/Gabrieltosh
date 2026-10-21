import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

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
      <App />
    </WorkspaceBoundary>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && window.isSecureContext)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
