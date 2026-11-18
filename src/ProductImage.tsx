import { useState, useEffect } from "react";
import { getProductPhoto } from "./brand";
export function ProductImage({
  product,
  className = "",
  decorative = false,
}: {
  product: { code: string; category: string; name: string; image?: string };
  className?: string;
  decorative?: boolean;
}) {
  const photo = getProductPhoto(product);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [photo.src, product.image]);
  if (failed && product.image)
    return (
      <span
        className={`${className} product-image-placeholder`}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : product.name}
      >
        {product.name.slice(0, 2).toUpperCase()}
      </span>
    );
  return (
    <img
      className={`${className} ${photo.fit === "cover" ? "photo-cover" : ""}`}
      src={
        failed
          ? "/brand/brand-logo.png"
          : product.image || "/products/" + photo.src
      }
      alt={decorative ? "" : product.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
