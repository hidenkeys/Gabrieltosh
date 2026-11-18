import { z } from "zod";
import QRCode from "qrcode";
const B = "/organizations/:organizationId/branches/:branchId";
const input = z
  .object({
    kind: z.enum(["organization", "branch", "table"]).default("branch"),
    tableId: z.string().uuid().optional(),
  })
  .refine(
    (v) => (v.kind === "table" ? !!v.tableId : !v.tableId),
    "Only table codes accept a table identifier.",
  );
export function qrOrigin(req) {
  if (process.env.MERA_DEMO === "true" && process.env.NODE_ENV !== "production")
    return `${req.protocol}://${req.get("host")}`;
  try {
    const origin = new URL(process.env.MERA_PUBLIC_ORIGIN || "");
    if (origin.protocol !== "https:" || origin.username || origin.password)
      throw new Error();
    return origin.origin;
  } catch {
    throw Object.assign(
      new Error(
        "A verified public HTTPS origin must be configured before exporting QR codes.",
      ),
      { status: 503 },
    );
  }
}
export function mountMeraQr(router, services) {
  const { db, guard, scope, locked, record, readRecords, event, find } =
    services;
  router.get(
    B + "/qr-codes",
    guard(["menu.publish", "tables.manage"]),
    async (req, res) => {
      const s = scope(req),
        origin = qrOrigin(req);
      const codes = (
        await readRecords(db, s.organizationId, s.branchId, "qr_code")
      ).map((r) => ({
        ...r.data,
        url: origin + "/api/mera/v1/public/qr/" + r.id,
      }));
      res.json({ codes });
    },
  );
  router.post(
    B + "/qr-codes",
    guard(["menu.publish", "tables.manage"]),
    async (req, res) => {
      const values = input.parse(req.body),
        origin = qrOrigin(req),
        s = scope(req);
      const code = await locked(s, async (c) => {
        if (values.tableId) await find(c, s, "table", values.tableId);
        const existing = (
          await readRecords(c, s.organizationId, s.branchId, "qr_code")
        ).find(
          (r) =>
            r.data.kind === values.kind &&
            r.data.tableId === values.tableId &&
            r.data.active !== false,
        );
        if (existing) return existing.data;
        const created = await record(c, s, "qr_code", {
          ...values,
          active: true,
          createdBy: req.user.id,
          createdAt: new Date().toISOString(),
        });
        await event(c, s, "qr_code_created", req.user, {
          id: created.id,
          kind: values.kind,
          tableId: values.tableId || null,
        });
        return created;
      });
      res
        .status(201)
        .json({ ...code, url: origin + "/api/mera/v1/public/qr/" + code.id });
    },
  );
  router.get(
    B + "/qr-codes/:id/image.:format",
    guard(["menu.publish", "tables.manage"]),
    async (req, res) => {
      if (!["png", "svg"].includes(req.params.format))
        return res.status(404).json({ error: "QR format not found." });
      const code = await find(db, scope(req), "qr_code", req.params.id);
      if (code.active === false)
        return res.status(404).json({ error: "QR code not found." });
      const value = qrOrigin(req) + "/api/mera/v1/public/qr/" + code.id;
      const options = { errorCorrectionLevel: "M", margin: 4, width: 1024 };
      res.attachment("mera-menu-" + code.id + "." + req.params.format);
      res.type(req.params.format);
      if (req.params.format === "svg")
        return res.send(
          await QRCode.toString(value, { ...options, type: "svg" }),
        );
      res.send(await QRCode.toBuffer(value, options));
    },
  );
  router.get("/public/qr/:id", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const row = (
      await db.query(
        "SELECT * FROM mera_records WHERE id=$1 AND kind='qr_code'",
        [id],
      )
    ).rows[0];
    if (!row || row.data.active === false)
      return res.status(404).json({ error: "This menu code is unavailable." });
    const org = (
      await db.query("SELECT id,slug FROM mera_organizations WHERE id=$1", [
        row.organization_id,
      ])
    ).rows[0];
    const branch = (
      await db.query(
        "SELECT id FROM mera_branches WHERE id=$1 AND organization_id=$2",
        [row.branch_id, row.organization_id],
      )
    ).rows[0];
    if (!org || !branch)
      return res.status(404).json({ error: "This menu code is unavailable." });
    let suffix = row.data.kind === "organization" ? "?chooseBranch=1" : "";
    if (row.data.kind === "table") {
      const table = await find(
        db,
        { organizationId: org.id, branchId: branch.id },
        "table",
        row.data.tableId,
      );
      if (table.status === "unavailable")
        return res.status(404).json({ error: "This table is unavailable." });
      suffix = "?tableId=" + encodeURIComponent(table.id);
    }
    // Only routing context, never a visit token or joining code, is encoded here.
    res.set("Cache-Control", "no-store");
    res.redirect(
      302,
      "/mera/menu/" + encodeURIComponent(org.slug) + "/" + branch.id + suffix,
    );
  });
}
