import { isIP } from "node:net";

// Enable only on the single public Railway edge; do not trust arbitrary chains.
export function hostingOptions(env = process.env) {
  if (env.MERA_RAILWAY_STAGING !== "true") return { railway: false, trustProxy: "loopback" };
  if (env.RAILWAY_PROJECT_ID !== "242b97ee-5c3d-4991-8613-ff3a2628732b" || env.RAILWAY_ENVIRONMENT_ID !== "1d313de7-1669-4ded-a6c8-4fe3581abee4" || env.NODE_ENV !== "production" || env.MERA_ENABLED !== "true")
    throw new Error("Railway staging hosting is restricted to the verified staging environment.");
  return { railway: true, trustProxy: 1 };
}
export function stagingHeaders(req, res, next) {
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  // Railway documents X-Real-IP, not an arbitrary client-supplied XFF chain.
  const address = req.get("x-real-ip");
  if (address && isIP(address)) req.headers["x-forwarded-for"] = address;
  else delete req.headers["x-forwarded-for"];
  if (req.path === "/robots.txt") return res.type("text/plain").send("User-agent: *\nDisallow: /\n");
  next();
}
