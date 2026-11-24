import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { effectiveCapabilities } from "../../shared/mera-venues.js";
import { fail } from "./domain.js";
import { qrOrigin } from "./qr.js";

const B = "/organizations/:organizationId/branches/:branchId";
export const PREVIEW_TTL_MS = 30 * 60 * 1000;
// Restarting a process invalidates its preview links; these tokens never confer guest access.
export function createPreviewTokens(secret = process.env.MERA_PREVIEW_SECRET || randomBytes(32), clock = Date.now) {
  const signature = value => createHmac("sha256", secret).update(value).digest();
  return {
    issue(organizationId, branchId, target) {
      const body = Buffer.from(JSON.stringify({ organizationId, branchId, target, expiresAt: clock() + PREVIEW_TTL_MS })).toString("base64url");
      return body + "." + signature(body).toString("base64url");
    },
    verify(token, organizationId, branchId) {
      try {
        const [body, mac, extra] = String(token).split(".");
        const actual = Buffer.from(mac || "", "base64url"), expected = signature(body || "");
        if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
        const value = JSON.parse(Buffer.from(body, "base64url").toString());
        if (!Number.isFinite(value.expiresAt) || value.expiresAt <= clock() || value.expiresAt > clock() + PREVIEW_TTL_MS || value.organizationId !== organizationId || value.branchId !== branchId) throw new Error();
        return value;
      } catch {
        throw fail("This preview link has expired or is invalid. Open a new preview from the workspace.", 403, "PREVIEW_EXPIRED");
      }
    },
  };
}
export function previewWriteGuard(req, res, next) {
  if (Object.hasOwn(req.query || {}, "preview") && !["GET", "HEAD", "OPTIONS"].includes(req.method))
    return res.status(403).json({ error: "Preview, orders are off.", code: "PREVIEW_ONLY" });
  next();
}
export function mountMeraQrPreview(router, { db, guard, scope, find, tokens }) {
  // Existing QR permissions remain usable while qr.manage is introduced by the access workstream.
  router.get(B + "/qr-preview", guard(["qr.manage", "menu.publish", "tables.manage"]), async (req, res) => {
    const target = z.string().regex(/^(counter|table:[0-9a-f-]{36})$/i).parse(req.query.target ?? "counter");
    const s = scope(req);
    const b = (await db.query("SELECT * FROM mera_branches WHERE id=$1 AND organization_id=$2", [s.branchId, s.organizationId])).rows[0];
    if (!b || b.settings.role === "stock_room") throw fail("Guest menu not found.", 404);
    const org = (await db.query("SELECT id,slug FROM mera_organizations WHERE id=$1", [s.organizationId])).rows[0];
    if (!org) throw fail("Organization not found.", 404);
    const table = target.startsWith("table:") ? await find(db, s, "table", z.string().uuid().parse(target.slice(6))) : null;
    const capabilities = effectiveCapabilities(b.settings);
    const tableService = capabilities.includes("table_service");
    const ordering = capabilities.includes("qr_ordering");
    const opensAs = table && tableService ? "table_order" : ordering ? "counter_pickup" : "menu_only";
    const warnings = [];
    if (!b.menu_version) warnings.push("Menu not published yet");
    if (table && !tableService) warnings.push(ordering ? "Table service is off, so this QR opens order-and-collect" : "Table service and QR ordering are off, so this QR opens the menu only");
    if (b.settings.orderingPaused) warnings.push("Orders are paused for this location");
    const url = new URL("/mera/menu/" + encodeURIComponent(org.slug) + "/" + b.id, qrOrigin(req));
    if (table) url.searchParams.set("tableId", table.id);
    url.searchParams.set("preview", tokens.issue(org.id, b.id, target));
    res.set("Cache-Control", "no-store").json({ url: url.toString(), label: table?.name || "Counter", opensAs, capabilities, menuPublished: !!b.menu_version, warnings });
  });
}
