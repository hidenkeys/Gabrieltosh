import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const root = "/api/mera/v1";
export async function migrateMeraAssets(db) {
  await db.query(
    await readFile(new URL("./assets-schema.sql", import.meta.url), "utf8"),
  );
}
export function inspectImage(bytes, mime) {
  try { return inspectRaster(bytes,mime); } catch(error) {
    if(error.status) throw error;
    throw fail("Use a valid PNG, JPEG or WebP image.");
  }
}
function inspectRaster(bytes, mime) {
  let width, height;
  if (
    mime === "image/png" &&
    bytes.length >= 24 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  ) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (
    mime === "image/jpeg" &&
    bytes.length > 10 &&
    bytes[0] === 255 &&
    bytes[1] === 216
  ) {
    let p = 2;
    while (p + 4 < bytes.length) {
      if (bytes[p++] !== 255) throw fail("Invalid JPEG encoding.");
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const size = bytes.readUInt16BE(p);
      if (size < 2 || p + size > bytes.length)
        throw fail("Invalid JPEG segment.");
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        size >= 7
      ) {
        height = bytes.readUInt16BE(p + 3);
        width = bytes.readUInt16BE(p + 5);
        break;
      }
      p += size;
    }
  } else if (
    mime === "image/webp" &&
    bytes.length >= 30 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  ) {
    const type = bytes.toString("ascii", 12, 16);
    if (type === "VP8X") {
      width = bytes.readUIntLE(24, 3) + 1;
      height = bytes.readUIntLE(27, 3) + 1;
    } else if (
      type === "VP8 " &&
      bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))
    ) {
      width = bytes.readUInt16LE(26) & 16383;
      height = bytes.readUInt16LE(28) & 16383;
    } else if (type === "VP8L" && bytes[20] === 47) {
      const bits = bytes.readUInt32LE(21);
      width = (bits & 16383) + 1;
      height = ((bits >>> 14) & 16383) + 1;
    }
  }
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    width * height > 16777216
  )
    throw fail(
      "Use a valid PNG, JPEG or WebP image up to 4096 pixels per side.",
    );
  return { width, height };
}
export async function assertMeraAsset(db, organizationId, branchId, url) {
  if (!url) return;
  const match = /^\/api\/mera\/v1\/public\/assets\/([a-f\d-]{36})$/i.exec(url);
  if (!match) throw fail("Use a scoped uploaded image.");
  const row = (
    await db.query(
      "SELECT id FROM mera_assets WHERE id=$1 AND organization_id=$2 AND (branch_id IS NULL OR branch_id=$3)",
      [match[1], organizationId, branchId],
    )
  ).rows[0];
  if (!row)
    throw fail(
      "This image is not available to this organization and branch.",
      403,
    );
}
export function mountMeraAssets(router, { db, guard, scope, event }) {
  const B = "/organizations/:organizationId/branches/:branchId",
    O = "/organizations/:organizationId";
  const input = z
    .object({
      filename: z.string().trim().min(1).max(100),
      mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
      data: z
        .string()
        .min(4)
        .max(699052)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .strict();
  function view(row, base) {
    return {
      id: row.id,
      filename: row.filename,
      mime: row.mime,
      width: row.width,
      height: row.height,
      url: root + "/public/assets/" + row.id,
      previewUrl: root + base + "/assets/" + row.id,
    };
  }
  for (const [base, permission] of [
    [B, "menu.edit"],
    [O, "organization.manage"],
  ]) {
    router.post(base + "/assets", guard(permission), async (req, res) => {
      const value = input.parse(req.body),
        bytes = Buffer.from(value.data, "base64");
      if (bytes.length > 524288 || bytes.toString("base64") !== value.data)
        throw fail("Choose an image up to 512 KB in valid base64 encoding.");
      const dimensions = inspectImage(bytes, value.mime),
        s = scope(req),
        branchId = req.params.branchId || null,
        sha = createHash("sha256").update(bytes).digest("hex");
      const asset = await db.transaction(async (c) => {
        await c.query(
          "SELECT id FROM mera_organizations WHERE id=$1 FOR UPDATE",
          [s.organizationId],
        );
        const existing = (
          await c.query(
            "SELECT id,filename,mime,width,height FROM mera_assets WHERE organization_id=$1 AND branch_id IS NOT DISTINCT FROM $2 AND sha256=$3",
            [s.organizationId, branchId, sha],
          )
        ).rows[0];
        if (existing) return existing;
        const count = Number(
          (
            await c.query(
              "SELECT COUNT(*) AS count FROM mera_assets WHERE organization_id=$1",
              [s.organizationId],
            )
          ).rows[0].count,
        );
        if (count >= 500)
          throw fail(
            "Image storage limit reached. Contact an administrator before uploading more.",
            409,
          );
        const row = {
          id: randomUUID(),
          filename: value.filename,
          mime: value.mime,
          ...dimensions,
        };
        await c.query(
          "INSERT INTO mera_assets(id,organization_id,branch_id,filename,mime,width,height,bytes,sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            row.id,
            s.organizationId,
            branchId,
            row.filename,
            row.mime,
            row.width,
            row.height,
            bytes,
            sha,
            req.user.id,
          ],
        );
        const auditBranch =
          branchId ||
          (
            await c.query(
              "SELECT id FROM mera_branches WHERE organization_id=$1 ORDER BY id LIMIT 1",
              [s.organizationId],
            )
          ).rows[0]?.id;
        if (auditBranch && event)
          await event(
            c,
            { organizationId: s.organizationId, branchId: auditBranch },
            "image_uploaded",
            req.user,
            {
              assetId: row.id,
              mime: row.mime,
              width: row.width,
              height: row.height,
              bytes: bytes.length,
            },
          );
        return row;
      });
      res.status(201).json(view(asset, req.path.replace(/\/assets$/, "")));
    });
    router.get(base + "/assets", guard(permission), async (req, res) => {
      const s = scope(req),
        branchId = req.params.branchId || null;
      const rows = (
        await db.query(
          "SELECT id,filename,mime,width,height FROM mera_assets WHERE organization_id=$1 AND branch_id IS NOT DISTINCT FROM $2 ORDER BY created_at DESC",
          [s.organizationId, branchId],
        )
      ).rows;
      res.json({
        assets: rows.map((row) => view(row, req.path.replace(/\/assets$/, ""))),
      });
    });
    router.get(base + "/assets/:id", guard(permission), async (req, res) => {
      const id = z.string().uuid().parse(req.params.id),
        s = scope(req);
      const asset = (
        await db.query(
          "SELECT mime,bytes FROM mera_assets WHERE id=$1 AND organization_id=$2 AND branch_id IS NOT DISTINCT FROM $3",
          [id, s.organizationId, req.params.branchId || null],
        )
      ).rows[0];
      if (!asset) throw fail("Image not found.", 404);
      res
        .set("Cache-Control", "private, no-store")
        .set("X-Content-Type-Options", "nosniff")
        .type(asset.mime)
        .send(asset.bytes);
    });
  }
  router.get("/public/assets/:id", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      asset = (await db.query("SELECT * FROM mera_assets WHERE id=$1", [id]))
        .rows[0];
    if (!asset) throw fail("Image not found.", 404);
    const org = (
        await db.query(
          "SELECT branding,onboarding FROM mera_organizations WHERE id=$1",
          [asset.organization_id],
        )
      ).rows[0],
      demo =
        process.env.MERA_DEMO === "true" &&
        process.env.NODE_ENV !== "production";
    const branches = (
      await db.query(
        "SELECT id,published_menu,settings FROM mera_branches WHERE organization_id=$1 AND menu_version>0",
        [asset.organization_id],
      )
    ).rows.filter((b) => demo || b.settings.launchState === "published");
    const url = root + "/public/assets/" + id,
      brandVisible =
        asset.branch_id === null &&
        [org?.branding?.logo, org?.branding?.coverImage].includes(url),
      menuVisible = branches.some(
        (b) =>
          (!asset.branch_id || asset.branch_id === b.id) &&
          b.published_menu.some((p) => p.image === url),
      );
    if (
      (!demo && org?.onboarding?.status !== "published") ||
      !branches.length ||
      (!brandVisible && !menuVisible)
    )
      throw fail("Image not found.", 404);
    res
      .set("Cache-Control", "no-store")
      .set("X-Content-Type-Options", "nosniff")
      .type(asset.mime)
      .send(asset.bytes);
  });
}
