import React, { useState } from "react";
export default function CatalogOperations({
  base,
  products,
  alerts,
  disabled,
  save,
  canEditAvailability = true,
}: {
  base: string;
  products: any[];
  alerts: any[];
  disabled: boolean;
  canEditAvailability?: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [available, setAvailable] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const shown = products.filter((product) =>
    [product.name, product.code, product.categoryPath, product.category].some(
      (value) =>
        String(value || "")
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
  );
  return (
    <section className="mw-card">
      <h2>Availability & stock alerts</h2>
      <p>
        Alerts use each product or size’s configured threshold. Update
        thresholds in the product editor if you have menu-editing access.
        {canEditAvailability
          ? " Availability changes apply to all selected products together and are recorded with your reason."
          : " Availability changes require menu-editing access."}
      </p>
      {alerts.length ? (
        <div className="mw-note">
          <strong>
            {alerts.length} counted stock{" "}
            {alerts.length === 1 ? "alert" : "alerts"}
          </strong>
          {alerts.map((alert) => (
            <div
              className="mw-row"
              key={alert.productId + ":" + (alert.variantId || "product")}
            >
              <span>
                {alert.name}
                {alert.size ? " · " + alert.size : ""}
              </span>
              <b>
                {alert.stock === 0 ? "Sold out" : alert.stock + " left"} ·
                threshold {alert.threshold}
              </b>
            </div>
          ))}
        </div>
      ) : (
        <p>No counted products or sizes are at their alert threshold.</p>
      )}
      {canEditAvailability && (
        <>
          {error && <p role="alert">{error}</p>}
          <details>
            <summary>Change availability for several products</summary>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (!canEditAvailability || disabled || working) return;
                setWorking(true);
                setError("");
                try {
                  await save(
                    base + "/products/availability",
                    "POST",
                    { productIds: selected, available, reason },
                    "Selected product availability updated.",
                  );
                  setSelected([]);
                  setReason("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setWorking(false);
                }
              }}
            >
              <fieldset
                disabled={disabled || working}
                style={{ border: 0, padding: 0 }}
              >
                <label>
                  Find products for availability
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="mw-actions">
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        shown.slice(0, 200).map((product) => product.id),
                      )
                    }
                  >
                    Select up to 200 matching products
                  </button>
                  <button type="button" onClick={() => setSelected([])}>
                    Clear selection
                  </button>
                  <span>{selected.length} selected</span>
                </div>
                <div className="mw-grid">
                  {shown.map((product) => (
                    <label className="mw-row" key={product.id}>
                      <span>
                        {product.name} ·{" "}
                        {product.available ? "available" : "unavailable"}
                      </span>
                      <input
                        type="checkbox"
                        checked={selected.includes(product.id)}
                        disabled={
                          !selected.includes(product.id) &&
                          selected.length >= 200
                        }
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, product.id]
                              : current.filter((id) => id !== product.id),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="mw-form">
                  <label>
                    New availability
                    <select
                      value={String(available)}
                      onChange={(event) =>
                        setAvailable(event.target.value === "true")
                      }
                    >
                      <option value="false">Unavailable</option>
                      <option value="true">Available</option>
                    </select>
                  </label>
                  <label>
                    Bulk availability reason
                    <input
                      required
                      minLength={3}
                      maxLength={300}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                </div>
                <p>
                  Products absent from the published menu still need publication
                  before customers can order them.
                </p>
                <button className="secondary" disabled={!selected.length}>
                  Update selected availability
                </button>
              </fieldset>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
