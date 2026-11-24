import "./mera/workspace/multi-location.css";
import "./mera/workspace/go-live-checklist.css";
import React from "react";
import { createRoot } from "react-dom/client";
const App = React.lazy(() => import("./App"));
import "./styles.css";
import "./mera/ui/mera-foundations.css";
import "./mera/ui/mera-entry.css";
import { MeraLoading, MeraSiteEntry } from "./mera/ui/MeraEntry";
import { MeraBrand } from "./mera/ui/MeraBrand";
import "./mera/platform.css";
import "./mera/company/company-inbox.css";
import "./mera/company/company-forms.css";
import "./mera/signup.css";
import "./mera/mera-signin.css";
const MeraSignIn = React.lazy(() => import("./mera/MeraSignIn"));
const Signup = React.lazy(() => import("./mera/Signup"));
import "./mera/marketing/marketing.css";
import "./mera/marketing/marketing-v2.css";
import "./mera/customer/customer.css";
import "./mera/workspace/workspace.css";
import "./mera/workspace/management.css";
import "./mera/workspace/setup.css";
import "./mera/workspace/owner-setup.css";
import "./mera/workspace/branch-admin.css";
import "./mera/workspace/menu-management.css";
import "./mera/workspace/publication.css";
import "./mera/workspace/preparation.css";
import "./mera/workspace/staff-management.css";
import "./mera/customer/visit-summary.css";
import "./mera/workspace/billing-management.css";
import "./mera/ui/operational-primitives.css";
import "./mera/workspace/support-cases.css";
import "./mera/workspace/order-history.css";
import "./mera/workspace/help-requests.css";
import "./mera/workspace/live-orders.css";
import "./mera/workspace/printing-qr.css";
import "./mera/workspace/print-studio-v2.css";
import "./mera/workspace/reservation-request.css";
import "./mera/workspace/shift-operation.css";
import "./mera/customer/help-requests.css";
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
          : "MeraTech · Technology for hospitality and travel";
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
          <MeraBrand />
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
          <MeraLoading
            title={
              /^\/mera\/(menu|store)\//.test(window.location.pathname)
                ? "Opening the menu…"
                : "Opening MeraTech…"
            }
            description="Preparing this page."
            onRetry={() => window.location.reload()}
          />
        }
      >
        {[
          "/mera",
          "/mera/",
          "/mera/products",
          "/mera/qr",
          "/mera/travel",
          "/mera/consultancy",
          "/mera/about",
          "/mera/contact",
          "/mera/sign-in",
        ].includes(window.location.pathname) ? (
          <MeraSiteEntry>
            <Marketing />
          </MeraSiteEntry>
        ) : window.location.pathname === "/mera/legal" ? (
          <LegalInformation />
        ) : window.location.pathname === "/mera/signup" ? (
          <Signup />
        ) : /^\/mera\/(menu|store)\//.test(window.location.pathname) ? (
          <CustomerExperience />
        ) : window.location.pathname === "/mera/platform" ? (
          <Platform />
        ) : window.location.pathname === "/mera/platform/sign-in" ? (
          <MeraSignIn mode="operator" />
        ) : (
          <App />
        )}
      </React.Suspense>
    </WorkspaceBoundary>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && window.isSecureContext)
  navigator.serviceWorker.register("/sw.js").catch(() => {});

import "./mera/workspace/finance-records.css";

import "./mera/workspace/finance-operations.css";
import "./mera/workspace/management-utilities.css";
import "./mera/workspace/customer-care.css";

import "./mera/workspace/service-attention.css";
import "./mera/workspace/waitlist.css";

import "./mera/customer/customization-dialog.css";
import "./mera/marketing/marketing-secondary.css";

import "./mera/workspace/table-service.css";
import "./mera/workspace/bills.css";
import "./mera/workspace/visit-tools.css";

import "./mera/workspace/responsibility.css";

import "./mera/workspace/item-fulfillment.css";

import "./mera/customer/checkout.css";
import "./mera/customer/customer-v2.css";
import "./mera/account-v2.css";
import "./mera/workspace/workspace-v2.css";

import "./mera/workspace/reporting.css";

import "./mera/workspace/people.css";

import "./mera/workspace/reservation-desk.css";
import "./mera/workspace/shift-workspace.css";

import "./mera/ui/inputs-v2.css";
import "./mera/workspace/stock-inputs.css";

import "./mera/workspace/settings-inputs.css";
