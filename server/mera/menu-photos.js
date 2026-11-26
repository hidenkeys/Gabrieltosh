import { randomUUID, createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { z } from "zod";
import { inspectImage, storeMeraAsset } from "./assets.js";
const B = "/organizations/:organizationId/branches/:branchId";
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function placeholderPng(name) {
  const hash = createHash("sha256").update(name).digest();
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length);
    body.copy(out, 4);
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256);
  header.writeUInt32BE(256, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(256 * 769);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const offset = y * 769 + 1 + x * 3;
      pixels[offset] = 180 + (hash[0] % 60);
      pixels[offset + 1] = 130 + (hash[1] % 60);
      pixels[offset + 2] = 90 + (hash[2] % 60);
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
export function parsePhoto(url) {
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      url || "",
    );
  if (!match) throw fail("The photo service returned an invalid image.", 502);
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.toString("base64") !== match[2])
    throw fail("Invalid photo encoding.", 502);
  try {
    inspectImage(bytes, match[1]);
  } catch {
    throw fail("The photo service returned an invalid image.", 502);
  }
  return { mime: match[1], data: match[2] };
}
export function mountMenuPhotos(
  router,
  {
    db,
    guard,
    scope,
    locked,
    find,
    update,
    event,
    env = process.env,
    aiFetch = fetch,
  },
) {
  const model = env.AI_IMAGE_MODEL || "google/gemini-2.5-flash-image";
  const base = (
    env.AI_GATEWAY_BASE_URL || "https://ai-gateway.vercel.sh/v1"
  ).replace(/\/$/, "");
  const configuredLimit = Number(env.MERA_AI_MONTHLY_LIMIT_USD ?? 5);
  const limit =
    Number.isFinite(configuredLimit) && configuredLimit >= 0
      ? configuredLimit
      : 5;
  router.post(
    B + "/menu-photos/generate",
    guard("menu.edit"),
    async (req, res) => {
      const s = scope(req),
        id = randomUUID();
      let costUsd = 0,
        status = "failed",
        reserved = false,
        output;
      const save = (c = db) =>
        c.query(
          "INSERT INTO mera_ai_usage(id,organization_id,branch_id,user_id,feature,model,input_tokens,output_tokens,cost_usd,status,files) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            id,
            s.organizationId,
            s.branchId,
            req.user.id,
            "menu_photo",
            model,
            0,
            0,
            costUsd,
            status,
            "[]",
          ],
        );
      try {
        const { productId } = z
          .object({ productId: z.string().uuid() })
          .strict()
          .parse(req.body);
        const product = await find(db, s, "product", productId);
        // Photo-only mock keeps menu reading real while image models are unavailable.
        const mock = env.MERA_AI_MOCK === "true" || env.MERA_AI_PHOTO_MOCK === "true";
        if (!mock && !env.AI_GATEWAY_API_KEY)
          throw fail("AI photos aren't set up yet.", 503);
        await db.transaction(async (c) => {
          await c.query(
            "SELECT id FROM mera_organizations WHERE id=$1 FOR UPDATE",
            [s.organizationId],
          );
          const count = Number(
            (
              await c.query(
                "SELECT COUNT(*) AS count FROM mera_ai_usage WHERE organization_id=$1 AND feature='menu_photo' AND created_at >= now() - interval '1 hour'",
                [s.organizationId],
              )
            ).rows[0]?.count || 0,
          );
          const total = Number(
            (
              await c.query(
                "SELECT COALESCE(SUM(cost_usd),0) AS total FROM mera_ai_usage WHERE organization_id=$1 AND created_at >= date_trunc('month',now())",
                [s.organizationId],
              )
            ).rows[0]?.total || 0,
          );
          if (
            count >= 60 ||
            total >= limit ||
            total + (mock ? 0 : 0.039) > limit
          )
            throw fail(
              "Your AI photo limit has been reached. Try again later or contact your administrator.",
              429,
            );
          costUsd = mock ? 0 : 0.039;
          await save(c);
        });
        reserved = true;
        let photo;
        if (mock) {
          photo = {
            mime: "image/png",
            data: placeholderPng(product.name).toString("base64"),
          };
          status = "mock";
        } else {
          const branch = (
            await db.query(
              "SELECT * FROM mera_branches WHERE id=$1 AND organization_id=$2",
              [s.branchId, s.organizationId],
            )
          ).rows[0];
          const venue = branch?.settings?.venueType || "restaurant";
          const prompt = `Professional appetising ${product.station === "bar" ? "drink photograph" : "food photograph"} of ${product.name}${product.description ? ", " + product.description : ""} as served in a ${venue} in Nigeria.${product.station === "bar" ? " In an appropriate glass." : ""} Overhead or 45° angle, natural light, plain neutral background, no text, no people, no hands, no logos.`;
          try {
            const response = await aiFetch(base + "/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
                modalities: ["image", "text"],
              }),
              signal: AbortSignal.timeout(90000),
            });
            if (!response.ok) throw Error();
            const data = await response.json();
            const cost = data.usage?.cost;
            if (
              cost !== undefined &&
              cost !== null &&
              Number.isFinite(Number(cost)) &&
              Number(cost) >= 0
            )
              costUsd = Number(cost);
            photo = parsePhoto(
              data.choices?.[0]?.message?.images?.[0]?.image_url?.url,
            );
            status = "ok";
          } catch {
            // Only keep a charge the gateway actually reported; release the reservation otherwise.
            if (status !== "ok" && costUsd === 0.039) costUsd = 0;
            throw fail("Could not generate this photo. Try again.", 502);
          }
        }
        output = { productId, ...photo, usage: { model, costUsd } };
      } finally {
        if (reserved)
          await db.query(
            "UPDATE mera_ai_usage SET input_tokens=$1,output_tokens=$2,cost_usd=$3,status=$4 WHERE id=$5",
            [0, 0, costUsd, status, id],
          );
        else await save();
      }
      res.json(output);
    },
  );
  router.post(
    B + "/menu-photos/apply",
    guard("menu.edit"),
    async (req, res) => {
      const value = z
          .object({
            productId: z.string().uuid(),
            mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
            data: z
              .string()
              .min(4)
              .max(699052)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          })
          .strict()
          .parse(req.body),
        s = scope(req);
      const product = await locked(s, async (c) => {
        const product = await find(c, s, "product", value.productId);
        const asset = await storeMeraAsset(
          c,
          s,
          s.branchId,
          { ...value, filename: `${product.name}`.slice(0, 90) + " photo" },
          req.user,
          event,
        );
        const updated = await update(c, s, "product", value.productId, {
          ...product,
          image: "/api/mera/v1/public/assets/" + asset.id,
        });
        await event(c, s, "product_photo_added", req.user, {
          productId: value.productId,
          assetId: asset.id,
        });
        return updated;
      });
      res.json(product);
    },
  );
}
