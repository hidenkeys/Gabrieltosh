import QRCode from "qrcode";
import { z } from "zod";
import { query, transaction } from "./db.js";

export const customerMenuUrl =
  "https://bing-chun-surulere-menu.akporkofi11.chatgpt.site/";
const setting = "customer_menu_publication";
const idsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(250),
});
const publicationSchema = z.object({
  publishedAt: z.string().datetime(),
  count: z.number().int(),
});
const publishKey = () => process.env.PUBLIC_MENU_PUBLISH_KEY || "";
const canPublish = () => /^[a-f0-9]{64}$/.test(publishKey());

// Explicit field projection: no IDs, order information, operational flags or staff data.
export function menuItems(products, productIds) {
  const indexed = new Map(
    products
      .filter((p) => p.available && !p.needs_review)
      .map((p) => [p.id, p]),
  );
  return [...new Set(productIds)].map((id) => {
    const product = indexed.get(id);
    if (!product)
      throw Object.assign(
        new Error(
          "An item is no longer available or needs review. Refresh the menu and check your selection.",
        ),
        { status: 409 },
      );
    const { code, name, category, size, price } = product;
    return { code, name, category, size, price };
  });
}

export function mountCustomerMenu(app, admin, audit) {
  let publishing = false;
  app.get("/api/customer-menu", admin, async (req, res) => {
    const result = await query("SELECT value FROM settings WHERE key=$1", [
      setting,
    ]);
    res.json({
      url: customerMenuUrl,
      canPublish: canPublish(),
      publication: result.rows[0]?.value ?? null,
    });
  });
  app.get("/api/customer-menu/qr.:format", admin, async (req, res) => {
    const { format } = req.params;
    if (format !== "png" && format !== "svg")
      return res.status(404).json({ error: "QR format not found." });
    const options = { errorCorrectionLevel: "M", margin: 4, width: 1024 };
    if (req.query.download === "1")
      res.attachment(`bing-chun-surulere-menu-qr.${format}`);
    res.type(format);
    if (format === "svg")
      return res.send(
        await QRCode.toString(customerMenuUrl, { ...options, type: "svg" }),
      );
    res.send(await QRCode.toBuffer(customerMenuUrl, options));
  });
  app.post("/api/customer-menu/publish", admin, async (req, res) => {
    if (!canPublish())
      return res
        .status(503)
        .json({ error: "Menu publishing is not connected on this computer." });
    if (publishing)
      return res
        .status(409)
        .json({ error: "A menu update is already being published." });
    const { productIds } = idsSchema.parse(req.body);
    publishing = true;
    try {
      const uniqueIds = [...new Set(productIds)];
      const items = menuItems(
        (
          await query(
            "SELECT id,code,name,category,size,price,available,needs_review FROM products",
          )
        ).rows,
        uniqueIds,
      );
      let result;
      try {
        const response = await fetch(new URL("/publish", customerMenuUrl), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${publishKey()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ items }),
          redirect: "error",
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok)
          throw new Error("The public menu rejected the update.");
        result = publicationSchema.parse(await response.json());
        if (result.count !== items.length)
          throw new Error("The public menu returned an unexpected item count.");
      } catch {
        return res
          .status(502)
          .json({
            error:
              "Could not confirm the public menu update. Check the connection and try again.",
          });
      }
      const publication = { ...result, productIds: uniqueIds };
      await transaction(async (client) => {
        await client.query(
          "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
          [setting, JSON.stringify(publication)],
        );
        await audit(client, req.user, "customer_menu_published", null, {
          count: result.count,
        });
      });
      res.json(publication);
    } finally {
      publishing = false;
    }
  });
}
