import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Download,
  QrCode,
  Upload,
} from "lucide-react";
import { api, money, type Product } from "./api";
import { ProductImage } from "./ProductImage";

type Publication = { productIds: string[]; count: number; publishedAt: string };
type MenuInfo = {
  url: string;
  canPublish: boolean;
  publication: Publication | null;
};
const categoryNames: Record<string, string> = {
  "Fruit milk tea": "Milk tea",
  "Fresh fruit tea": "Fruit tea",
  "Ice cream series": "Ice cream & desserts",
  "Smoothie series": "Smoothies",
};

export function CustomerMenu({
  products,
  notify,
}: {
  products: Product[];
  notify: (message: string) => void;
}) {
  const [menu, setMenu] = useState<MenuInfo | null>(null);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api<MenuInfo>("/customer-menu");
      setMenu(data);
      setSelection(
        data.publication ? new Set(data.publication.productIds) : null,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const eligible = products.filter((p) => p.available && !p.needs_review);
  const selected = selection ?? new Set(eligible.map((p) => p.id));
  const ids = eligible.filter((p) => selected.has(p.id)).map((p) => p.id);
  const categories = [...new Set(products.map((p) => p.category))];
  async function publish() {
    setBusy(true);
    setError("");
    try {
      const publication = await api<Publication>(
        "/customer-menu/publish",
        "POST",
        { productIds: ids },
      );
      setMenu((current) => current && { ...current, publication });
      setSelection(new Set(publication.productIds));
      notify(`${publication.count} items published to the customer menu.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!menu)
    return (
      <div className="info-box" role="status">
        {error ? (
          <>
            {error}{" "}
            <button className="text-button" onClick={load}>
              Try again
            </button>
          </>
        ) : (
          "Loading the customer menu…"
        )}
      </div>
    );

  return (
    <div className="customer-menu-layout">
      <section className="customer-share" aria-labelledby="qr-heading">
        <div className="eyebrow">
          <QrCode size={15} /> CUSTOMER ACCESS
        </div>
        <h2 id="qr-heading">Scan for the menu</h2>
        <p>
          Put this code on tables or at the counter. It stays the same when you
          update the menu.
        </p>
        <img
          className="customer-qr"
          src="/api/customer-menu/qr.png"
          width="230"
          height="230"
          alt="QR code for the Bing Chun Surulere customer menu"
        />
        <div className="customer-qr-actions">
          <a
            className="secondary"
            href="/api/customer-menu/qr.png?download=1"
            download
          >
            <Download size={16} /> PNG
          </a>
          <a
            className="secondary"
            href="/api/customer-menu/qr.svg?download=1"
            download
          >
            <Download size={16} /> SVG
          </a>
        </div>
        <label className="customer-link">
          Public menu link
          <input
            value={menu.url}
            readOnly
            onFocus={(event) => event.target.select()}
          />
        </label>
        <div className="customer-qr-actions">
          <button
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(menu.url);
                notify("Menu link copied.");
              } catch {
                notify("Select the public menu link to copy it.");
              }
            }}
          >
            <Copy size={15} /> Copy link
          </button>
          <a
            className="text-button"
            href={menu.url}
            target="_blank"
            rel="noreferrer"
          >
            Open menu <ArrowUpRight size={15} />
          </a>
        </div>
      </section>
      <section
        className="customer-selection"
        aria-labelledby="selection-heading"
      >
        <div className="customer-selection-heading">
          <div>
            <div className="eyebrow">PUBLISH FROM YOUR STORE</div>
            <h2 id="selection-heading">Choose what customers see</h2>
          </div>
          <span className="badge fulfilled">{ids.length} selected</span>
        </div>
        <p>
          Names, prices and sizes come from Menu library. Unavailable items and
          items marked for review can’t be published. Changes go live when you
          publish.
        </p>
        <div className="customer-publish-status">
          <CheckCircle2 size={17} />
          <span>
            {menu.publication
              ? `${menu.publication.count} items last published from this workspace · ${new Date(menu.publication.publishedAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}`
              : "No menu has been published from this workspace yet."}
          </span>
        </div>
        <div className="customer-qr-actions">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setSelection(new Set(eligible.map((p) => p.id)))}
          >
            Select available
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setSelection(new Set())}
          >
            Clear selection
          </button>
        </div>
        <div className="customer-products">
          {categories.map((category) => (
            <fieldset key={category} disabled={busy}>
              <legend>
                {Object.hasOwn(categoryNames, category)
                  ? categoryNames[category]
                  : category}
              </legend>
              {products
                .filter((p) => p.category === category)
                .map((product) => {
                  const available = product.available && !product.needs_review;
                  return (
                    <label className="customer-product" key={product.id}>
                      <input
                        type="checkbox"
                        checked={available && selected.has(product.id)}
                        disabled={!available}
                        onChange={(event) => {
                          const next = new Set(selected);
                          if (event.target.checked) next.add(product.id);
                          else next.delete(product.id);
                          setSelection(next);
                        }}
                      />
                      <span className="mini-product">
                        <ProductImage product={product} decorative />
                      </span>
                      <span>
                        <strong>{product.name}</strong>
                        <small>
                          {available
                            ? product.size
                            : product.needs_review
                              ? "Needs review"
                              : "Unavailable"}
                        </small>
                      </span>
                      <b>{money(product.price)}</b>
                    </label>
                  );
                })}
            </fieldset>
          ))}
        </div>
        {!menu.canPublish && (
          <p className="info-box">
            Publishing isn’t connected on this computer. The live link and QR
            code still work.
          </p>
        )}
        {error && (
          <p className="info-box" role="alert">
            {error}
          </p>
        )}
        <div className="customer-publish-actions">
          <button
            className="primary"
            disabled={
              busy || !menu.canPublish || !ids.length || ids.length > 250
            }
            onClick={publish}
          >
            <Upload size={16} /> {busy ? "Publishing…" : "Publish menu"}
          </button>
          <small>
            {ids.length > 250
              ? "Select up to 250 items."
              : "An internet connection is needed to publish."}
          </small>
        </div>
      </section>
    </div>
  );
}
