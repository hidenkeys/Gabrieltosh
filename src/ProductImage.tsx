import { useState, useEffect } from "react";
import { getProductPhoto } from "./brand";
export function ProductImage({
  product,
  className = "",
  decorative = false,
}: {
  product: { code: string; category: string; name: string };
  className?: string;
  decorative?: boolean;
}) {
  const photo = getProductPhoto(product);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [photo.src]);
  return (
    <img
      className={`${className} ${photo.fit === "cover" ? "photo-cover" : ""}`}
      src={failed ? "/brand/brand-logo.png" : "/products/" + photo.src}
      alt={decorative ? "" : product.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
