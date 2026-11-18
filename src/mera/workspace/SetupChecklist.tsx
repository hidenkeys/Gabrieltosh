import React from "react";
type Props = {
  basics?: React.ReactNode;
  appearance?: React.ReactNode;
  operations?: React.ReactNode;
  booking?: React.ReactNode;
  pricing?: React.ReactNode;
  minimumSpend?: React.ReactNode;
  deposits?: React.ReactNode;
  readiness?: React.ReactNode;
};
/** Layout only: supplied forms retain their existing permissions, state and save handlers. */
export default function SetupChecklist({
  basics,
  appearance,
  operations,
  booking,
  pricing,
  minimumSpend,
  deposits,
  readiness,
}: Props) {
  const hasBasics = basics != null && basics !== false;
  const optional = [
    {
      id: "operations",
      title: "Operations & appearance",
      description:
        "Set service hours, order preferences and your customer-facing brand.",
      content: operations,
    },
    {
      id: "appearance",
      title: "Appearance",
      description: "Set your logo, photos and customer-facing colours.",
      content: appearance,
    },
    {
      id: "booking",
      title: "Reservation timing",
      description: "Review booking notice, arrival timing and table buffers.",
      content: booking,
    },
    {
      id: "pricing",
      title: "Prices & charges",
      description:
        "Review discounts, service charges and tax before enabling them.",
      content: pricing,
    },
    {
      id: "deposits",
      title: "Reservation deposits",
      description:
        "Choose deposit amounts and cancellation terms with explicit approval.",
      content: deposits,
    },
    {
      id: "minimum-spend",
      title: "Minimum spend",
      description:
        "Review commitments for new visits and how shortfalls are handled.",
      content: minimumSpend,
    },
  ].filter((section) => section.content != null && section.content !== false);
  return (
    <div className="mw-setup-page">
      <section className="mw-setup-basics" aria-label="Business basics">
        <header className="mw-setup-section-heading">
          <div>
            <h2>Start with the essentials</h2>
            <p>
              Keep your business details and service preferences up to date.
              Each form saves separately.
            </p>
          </div>
        </header>
        {hasBasics ? (
          basics
        ) : (
          <p className="mw-setup-empty">
            No business settings are available to edit here.
          </p>
        )}
      </section>
      {!!optional.length && (
        <section
          className="mw-setup-options"
          aria-label="Additional branch settings"
        >
          <header className="mw-setup-section-heading">
            <div>
              <h2>Make it work for your branch</h2>
              <p>
                Open the settings you need. Closing a section keeps your edits;
                use its save action to apply them.
              </p>
            </div>
          </header>
          {optional.map((section) => (
            <details className="mw-setup-disclosure" key={section.id}>
              <summary>
                <span>
                  <strong>{section.title}</strong>
                  <span className="mw-setup-description">
                    {section.description}
                  </span>
                </span>
                <span className="mw-setup-expand" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="mw-setup-section-body">{section.content}</div>
            </details>
          ))}
        </section>
      )}
      {readiness != null && readiness !== false && (
        <section className="mw-setup-readiness" aria-label="Menu publication">
          <header className="mw-setup-section-heading">
            <div>
              <h2>Review & publish</h2>
              <p>
                Check this branch’s setup before making its menu available to
                customers.
              </p>
            </div>
          </header>
          {readiness}
        </section>
      )}
    </div>
  );
}
