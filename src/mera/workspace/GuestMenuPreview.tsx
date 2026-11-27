import { brandingStyle } from "../branding";
import { formatMoney } from "../../../shared/mera-money.js";
type Props = {
  organization?: any;
  branding?: any;
  slug?: string;
  rootDomain?: string | null;
  publicAddress?: string | null;
  items?: any[];
};
export default function GuestMenuPreview({
  organization = {},
  branding = organization.branding || {},
  slug = organization.slug,
  rootDomain = organization.rootDomain,
  publicAddress = organization.publicAddress,
  items,
}: Props) {
  const previewAsset = (url: string) => organization.id
    ? url.replace("/api/mera/v1/public/assets/", `/api/mera/v1/organizations/${organization.id}/assets/`)
    : url;
  const menu = items?.length
    ? items.slice(0, 3)
    : [
        { name: "House special", price: 450000 },
        { name: "Garden bowl", price: 320000 },
        { name: "Fresh lemonade", price: 150000 },
      ];
  return (
    <section
      className="mera-customer mera-guest-preview"
      style={brandingStyle(branding)}
      aria-label="Guest menu preview"
    >
      <div className="mgp-browser">
        {rootDomain && slug
          ? `${slug}.${rootDomain}`
          : publicAddress || "Your menu address"}
      </div>
      {branding.coverImage && (
        <img className="mgp-cover" src={previewAsset(branding.coverImage)} alt="" />
      )}
      <header className="mc-hero">
        {branding.logo && (
          <img className="mgp-logo" src={previewAsset(branding.logo)} alt="" />
        )}
        <h2>{organization.name || "Your restaurant"}</h2>
        <p>{branding.description || "Fresh favourites, made for you."}</p>
      </header>
      <nav className="mc-categories" aria-label="Preview categories">
        <button type="button" aria-pressed="true">
          Popular
        </button>
        <button type="button" aria-pressed="false">
          Drinks
        </button>
      </nav>
      <div className="mgp-items">
        {menu.map((item, i) => (
          <article className="mc-product" key={item.id || i}>
            <div>
              <h3>{item.name}</h3>
              <span className="mc-price">
                {formatMoney(
                  Number(item.price ?? item.basePrice ?? item.priceAmount ?? 0),
                  organization.currency || "NGN",
                )}
              </span>
            </div>
            <button
              className="mc-primary"
              type="button"
              aria-label={`Preview add ${item.name}`}
            >
              +
            </button>
          </article>
        ))}
      </div>
      <div className="mgp-cart">
        1 item <strong>View basket →</strong>
      </div>
    </section>
  );
}
