import React from "react";
type Props = {
  status?: React.ReactNode;
  services?: React.ReactNode;
  invoices?: React.ReactNode;
  proposedPolicy?: React.ReactNode;
  reconciliation?: React.ReactNode;
};
const present = (slot: React.ReactNode) =>
  slot !== undefined && slot !== null && slot !== false;
/** Composition only: callers retain data, permissions, mutations and uncertainty state. */
export default function BillingManagement({
  status,
  services,
  invoices,
  proposedPolicy,
  reconciliation,
}: Props) {
  return (
    <div className="mw-billing-management">
      <section
        className="mw-billing-current"
        aria-label="Current subscription and services"
      >
        <header className="mw-billing-heading">
          <h2>Current subscription</h2>
          <p>
            Review your organization’s subscription and service availability.
          </p>
        </header>
        {present(status) ? (
          status
        ) : (
          <p className="mw-billing-unavailable">
            Subscription details are unavailable. Refresh your records to check
            again.
          </p>
        )}
        {present(services) && (
          <div className="mw-billing-services">{services}</div>
        )}
      </section>
      <section className="mw-billing-invoices" aria-label="Invoice records">
        {present(invoices) ? (
          invoices
        ) : (
          <p className="mw-billing-unavailable">
            Invoice records are unavailable. Refresh your records to check
            again.
          </p>
        )}
      </section>
      {(present(proposedPolicy) || present(reconciliation)) && (
        <section
          className="mw-billing-advanced"
          aria-label="Advanced billing review"
        >
          <header className="mw-billing-heading">
            <h2>Advanced review</h2>
            <p>
              Open these details when reviewing proposed terms or checking
              payment records.
            </p>
          </header>
          {present(proposedPolicy) && (
            <details className="mw-billing-disclosure">
              <summary>
                <span>
                  <strong>Proposed commercial terms</strong>
                  <span>
                    Review proposed prices, fees and approval requirements.
                  </span>
                </span>
                <span className="mw-billing-expand" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="mw-billing-disclosure-body">{proposedPolicy}</div>
            </details>
          )}
          {present(reconciliation) && (
            <details className="mw-billing-disclosure">
              <summary>
                <span>
                  <strong>Payment reconciliation</strong>
                  <span>
                    Compare recorded activity and review any differences.
                  </span>
                </span>
                <span className="mw-billing-expand" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="mw-billing-disclosure-body">{reconciliation}</div>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
