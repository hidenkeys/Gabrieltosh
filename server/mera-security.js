export function validateMeraRuntime(env = process.env) {
  if (env.MERA_ENABLED !== "true" || env.NODE_ENV !== "production") return;
  if (env.MERA_DEMO === "true" || env.MEMORY_DB === "true" || env.DEMO_PASSWORD)
    throw new Error(
      "Production MERA cannot run demonstration identities, data or simulators.",
    );
  if (env.COOKIE_SECURE !== "true")
    throw new Error("Production MERA requires secure session cookies.");
  if (!env.DATABASE_URL)
    throw new Error(
      "Production MERA requires an explicitly configured database.",
    );
  let origin;
  try {
    origin = new URL(env.MERA_PUBLIC_ORIGIN);
  } catch {
    /* validated below */
  }
  if (
    !origin ||
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password
  )
    throw new Error("Production MERA requires its public HTTPS origin.");
}

// A bounded process-local abuse guard. Shared distributed limits are a hosting
// prerequisite for multiple replicas; this does not claim to provide them.
export function meraPublicLimits({
  clock = Date.now,
  maximum = 60,
  windowMs = 60_000,
} = {}) {
  const entries = new Map();
  return (req, res, next) => {
    if (
      !req.path.startsWith("/public/") ||
      !["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
    )
      return next();
    const now = clock(),
      key = req.ip || req.socket?.remoteAddress || "unknown";
    for (const [id, value] of entries)
      if (value.until <= now) entries.delete(id);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= 10_000)
        return res
          .status(503)
          .json({ error: "Public requests are busy. Please retry shortly." });
      entry = { count: 0, until: now + windowMs };
      entries.set(key, entry);
    }
    if (++entry.count > maximum) {
      res.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((entry.until - now) / 1000))),
      );
      return res
        .status(429)
        .json({ error: "Too many requests. Please wait and retry." });
    }
    next();
  };
}
