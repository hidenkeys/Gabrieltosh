// Host routing is opt-in. This does not provision DNS, certificates or ownership.
export function resolveMeraHost(hostname, rootDomain) {
  const root = String(rootDomain || "")
      .trim()
      .toLowerCase(),
    host = String(hostname || "").toLowerCase();
  if (
    !root ||
    root.includes("..") ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(root)
  )
    return null;
  if (host === root || host === "www." + root) return { surface: "marketing" };
  if (host === "app." + root) return { surface: "workspace" };
  if (host === "platform." + root) return { surface: "platform" };
  if (!host.endsWith("." + root)) return null;
  const slug = host.slice(0, -root.length - 1);
  if (
    !/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(slug) ||
    ["api", "admin", "support", "mail", "cdn", "status", "www"].includes(slug)
  )
    return null;
  return { surface: "organization", slug };
}
export function meraHostRoutes(query) {
  return async (req, res, next) => {
    if (
      process.env.MERA_ENABLED !== "true" ||
      process.env.MERA_DEMO === "true" ||
      !["GET", "HEAD"].includes(req.method) ||
      req.path !== "/"
    )
      return next();
    const root = process.env.MERA_ROOT_DOMAIN;
    if (!root) return res.redirect(302, "/mera");
    const context = resolveMeraHost(req.hostname, root);
    if (!context)
      return res.status(404).send("This Mera destination is unavailable.");
    if (context.surface !== "organization")
      return res.redirect(
        302,
        {
          marketing: "/mera",
          workspace: "/mera/workspace",
          platform: "/mera/platform",
        }[context.surface],
      );
    try {
      const result = (
        await query(
          "SELECT o.slug,b.id FROM mera_organizations o JOIN mera_branches b ON b.organization_id=o.id WHERE o.slug=$1 AND o.onboarding->>'status'='published' AND b.settings->>'launchState'='published' AND b.menu_version>0 ORDER BY b.name,b.id LIMIT 1",
          [context.slug],
        )
      ).rows[0];
      if (!result)
        return res.status(404).send("This organization has no published menu.");
      return res.redirect(
        302,
        "/mera/menu/" +
          encodeURIComponent(result.slug) +
          "/" +
          result.id +
          "?chooseBranch=1",
      );
    } catch (error) {
      next(error);
    }
  };
}
