import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { inspectImage } from "./assets.js";
import {
  consultancyEnquirySchema,
  travelInterestSchema,
  companyDocumentLimit,
  companyLeadStatuses,
  companyLeadUpdateSchema,
} from "../../shared/mera-company-contracts.js";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message, status = 400, code = "VALIDATION_ERROR", issues) =>
  Object.assign(new Error(message), { status, code, issues });
const iso = (value) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();
export async function migrateCompanyLeads(db) {
  await db.query(
    await readFile(
      new URL("./company-leads-schema.sql", import.meta.url),
      "utf8",
    ),
  );
}
export function validateCompanyDocuments(documents = []) {
  let total = 0;
  return documents.map((d, index) => {
    const bytes = Buffer.from(d.data, "base64");
    if (!bytes.length || bytes.toString("base64") !== d.data)
      throw fail(
        "Select a readable supporting document.",
        400,
        "VALIDATION_ERROR",
        [
          {
            path: ["documents", index],
            message: "The document could not be read.",
          },
        ],
      );
    total += bytes.length;
    if (total > companyDocumentLimit)
      throw fail(
        "Supporting documents must total 512 KB or less.",
        413,
        "DOCUMENT_LIMIT",
        [{ path: ["documents"], message: "The combined limit is 512 KB." }],
      );
    const extension = d.filename.split(".").pop().toLowerCase();
    const expected = {
      "application/pdf": ["pdf"],
      "text/plain": ["txt"],
      "image/png": ["png"],
      "image/jpeg": ["jpg", "jpeg"],
    }[d.mime];
    if (!expected?.includes(extension))
      throw fail("The document extension must match its file type.");
    if (d.mime === "image/png" || d.mime === "image/jpeg")
      inspectImage(bytes, d.mime);
    else if (d.mime === "application/pdf") {
      const content = bytes.toString("latin1");
      if (
        !/^%PDF-(?:1\.[0-7]|2\.0)/.test(content) ||
        !content.trimEnd().endsWith("%%EOF")
      )
        throw fail("Choose a valid PDF document.");
      // Reject obvious active attachments. This is format validation, not a malware-scan claim.
      if (
        /\/(?:JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b/.test(content)
      )
        throw fail(
          "Use a PDF without scripts, launch actions or embedded files.",
        );
    } else if (d.mime === "text/plain") {
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw fail("Use a UTF-8 text document.");
      }
      if (bytes.includes(0))
        throw fail("Text documents cannot contain binary data.");
    }
    return {
      id: randomUUID(),
      filename: d.filename,
      mime: d.mime,
      bytes,
      byteLength: bytes.length,
      sha256: digest(bytes),
    };
  });
}
export async function submitCompanyLead(db, kind, raw) {
  const input = (
    kind === "consultancy" ? consultancyEnquirySchema : travelInterestSchema
  ).parse(raw);
  const documents = validateCompanyDocuments(input.documents || []);
  const { requestKey, documents: ignored, ...data } = input;
  const payloadHash = digest(
    JSON.stringify({
      kind,
      data,
      documents: documents.map(({ filename, mime, sha256 }) => ({
        filename,
        mime,
        sha256,
      })),
    }),
  );
  return db.transaction(async (c) => {
    const id = randomUUID(),
      reference =
        (kind === "consultancy" ? "ENQ-" : "TRV-") +
        randomBytes(6).toString("hex").toUpperCase();
    const acknowledgement = {
      kind,
      reference,
      status: "received",
      externalDelivery: false,
      emailDelivery: "not_sent",
      receivedAt: new Date().toISOString(),
    };
    const inserted = await c.query(
      "INSERT INTO mera_company_leads(id,kind,reference,request_key,payload_hash,data,acknowledgement) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(request_key) DO NOTHING RETURNING id",
      [
        id,
        kind,
        reference,
        requestKey,
        payloadHash,
        JSON.stringify(data),
        JSON.stringify(acknowledgement),
      ],
    );
    if (!inserted.rows.length) {
      const prior = (
        await c.query(
          "SELECT payload_hash,acknowledgement FROM mera_company_leads WHERE request_key=$1",
          [requestKey],
        )
      ).rows[0];
      if (!prior || prior.payload_hash !== payloadHash)
        throw fail(
          "This submission reference belongs to different details. Keep the original request when retrying.",
          409,
          "IDEMPOTENCY_CONFLICT",
        );
      return { created: false, acknowledgement: prior.acknowledgement };
    }
    for (const d of documents)
      await c.query(
        "INSERT INTO mera_company_documents(id,lead_id,filename,mime,bytes,sha256,byte_length) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [d.id, id, d.filename, d.mime, d.bytes, d.sha256, d.byteLength],
      );
    return { created: true, acknowledgement };
  });
}
function view(row) {
  return {
    id: row.id,
    kind: row.kind,
    reference: row.reference,
    data: row.data,
    status: row.status,
    assignedHandlerId: row.assigned_handler_id || null,
    assignedHandlerName: row.assigned_handler_name || null,
    followUp: row.follow_up,
    version: row.version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    externalDelivery: false,
  };
}
export async function updateCompanyLead(db, req, id, input, audit) {
  const expectedActor = req.get?.("X-Mera-Actor-Id");
  if (expectedActor !== undefined && expectedActor !== req.user.id)
    throw fail(
      "Your signed-in account changed. Refresh before continuing.",
      403,
      "ACTOR_CHANGED",
    );
  const body = companyLeadUpdateSchema.parse(input),
    payloadHash = digest(JSON.stringify(body));
  return db.transaction(async (c) => {
    const lead = (
      await c.query("SELECT * FROM mera_company_leads WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (!lead) throw fail("Enquiry not found.", 404, "NOT_FOUND");
    const prior = (
      await c.query(
        "SELECT payload_hash,result,actor_id FROM mera_company_lead_changes WHERE lead_id=$1 AND request_key=$2",
        [id, body.requestKey],
      )
    ).rows[0];
    if (prior) {
      if (prior.actor_id !== req.user.id)
        throw fail(
          "This update belongs to another signed-in operator.",
          403,
          "ACTOR_CHANGED",
        );
      if (prior.payload_hash !== payloadHash)
        throw fail(
          "Retry the original update without changing its details.",
          409,
          "IDEMPOTENCY_CONFLICT",
        );
      return prior.result;
    }
    if (lead.version !== body.expectedVersion)
      throw fail(
        "This enquiry changed. Refresh before saving another update.",
        409,
        "STALE_VERSION",
      );
    if (body.assignedHandlerId) {
      const active = (
        await c.query(
          "SELECT p.user_id FROM mera_platform_members p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND p.active=true AND u.active=true",
          [body.assignedHandlerId],
        )
      ).rows[0];
      if (!active)
        throw fail(
          "Choose an active platform handler.",
          400,
          "INVALID_HANDLER",
        );
    }
    const updated = (
      await c.query(
        "UPDATE mera_company_leads SET status=$1,assigned_handler_id=$2,follow_up=$3,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *",
        [
          body.status,
          body.assignedHandlerId,
          JSON.stringify(body.followUp),
          id,
        ],
      )
    ).rows[0];
    const result = {
      id,
      reference: lead.reference,
      version: updated.version,
      status: updated.status,
      assignedHandlerId: updated.assigned_handler_id || null,
      followUp: updated.follow_up,
      externalDelivery: false,
    };
    const change = {
      status: body.status,
      assignedHandlerId: body.assignedHandlerId,
      internalNote: body.internalNote,
      followUp: body.followUp,
      previousVersion: lead.version,
      version: updated.version,
    };
    await c.query(
      "INSERT INTO mera_company_lead_changes(id,lead_id,request_key,payload_hash,actor_id,data,result) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        id,
        body.requestKey,
        payloadHash,
        req.user.id,
        JSON.stringify(change),
        JSON.stringify(result),
      ],
    );
    await audit(c, req, "company_lead_updated", null, {
      leadId: id,
      reference: lead.reference,
      previousStatus: lead.status,
      status: body.status,
      assignedHandlerId: body.assignedHandlerId,
      noteAdded: !!body.internalNote,
      followUpStage: body.followUp.stage,
      version: updated.version,
    });
    return result;
  });
}
const safe = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({
          error: "Check the highlighted details.",
          code: "VALIDATION_ERROR",
          issues: error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        });
    if (error.status)
      return res
        .status(error.status)
        .json({
          error: error.message,
          code: error.code || "VALIDATION_ERROR",
          ...(error.issues ? { issues: error.issues } : {}),
        });
    console.error("Company request failed", error.code || error.name);
    return res
      .status(503)
      .json({
        error:
          "We could not confirm the result. Retry the same request to check safely.",
        code: "REQUEST_UNCERTAIN",
      });
  }
};
export function mountCompanyLeads(
  router,
  { db, platformGuard, platformAudit },
) {
  const attempts = new Map();
  function limit(req) {
    const now = Date.now(),
      key = req.ip || "unknown";
    for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    let entry = attempts.get(key);
    if (!entry) {
      if (attempts.size >= 10000)
        throw fail(
          "Submissions are busy. Please retry later.",
          503,
          "RATE_LIMITED",
        );
      entry = { count: 0, until: now + 900000 };
      attempts.set(key, entry);
    }
    if (++entry.count > 12)
      throw fail(
        "Please wait fifteen minutes before submitting again.",
        429,
        "RATE_LIMITED",
      );
  }
  for (const [path, kind] of [
    ["enquiries", "consultancy"],
    ["travel-interest", "travel_interest"],
  ])
    router.post(
      "/public/company/" + path,
      safe(async (req, res) => {
        limit(req);
        const result = await submitCompanyLead(db, kind, req.body);
        res.status(result.created ? 201 : 200).json(result.acknowledgement);
      }),
    );
  const base = "/platform/company-leads";
  router.get(
    base + "/handlers",
    platformGuard,
    safe(async (req, res) => {
      const rows = (
        await db.query(
          "SELECT u.id,u.name FROM mera_platform_members p JOIN users u ON u.id=p.user_id WHERE p.active=true AND u.active=true ORDER BY u.name,u.id LIMIT 200",
        )
      ).rows;
      await platformAudit(db, req, "company_handlers_viewed", null, {});
      res.json({ handlers: rows });
    }),
  );
  router.get(
    base,
    platformGuard,
    safe(async (req, res) => {
      const input = z
        .object({
          kind: z.enum(["consultancy", "travel_interest"]).optional(),
          status: z.enum(companyLeadStatuses).optional(),
          search: z.string().trim().max(100).default(""),
          assignedHandlerId: z.string().uuid().optional(),
          page: z.coerce.number().int().min(1).max(10000).default(1),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        })
        .strict()
        .parse(req.query);
      const conditions = [],
        args = [];
      const add = (sql, value) => {
        args.push(value);
        conditions.push(sql.replaceAll("?", "$" + args.length));
      };
      if (input.kind) add("l.kind=?", input.kind);
      if (input.status) add("l.status=?", input.status);
      if (input.assignedHandlerId)
        add("l.assigned_handler_id=?", input.assignedHandlerId);
      if (input.search)
        add(
          "(l.reference ILIKE ? OR l.data->>'name' ILIKE ? OR l.data->>'company' ILIKE ? OR l.data->>'email' ILIKE ?)",
          "%" + input.search.replace(/[\\%_]/g, "\\$&") + "%",
        );
      const where = conditions.length
        ? " WHERE " + conditions.join(" AND ")
        : "";
      const total = Number(
        (
          await db.query(
            "SELECT COUNT(*) AS count FROM mera_company_leads l" + where,
            args,
          )
        ).rows[0].count,
      );
      const rows = (
        await db.query(
          "SELECT l.*,u.name AS assigned_handler_name FROM mera_company_leads l LEFT JOIN users u ON u.id=l.assigned_handler_id" +
            where +
            " ORDER BY l.created_at DESC,l.id LIMIT $" +
            (args.length + 1) +
            " OFFSET $" +
            (args.length + 2),
          [...args, input.limit, (input.page - 1) * input.limit],
        )
      ).rows;
      await platformAudit(db, req, "company_leads_viewed", null, {
        kind: input.kind || "all",
        status: input.status || "all",
        page: input.page,
        limit: input.limit,
        searchApplied: !!input.search,
      });
      res.json({
        items: rows.map((r) => {
          const { data, ...rest } = view(r);
          return {
            ...rest,
            contact: {
              name: data.name,
              company: data.company,
              email: data.email,
            },
          };
        }),
        page: input.page,
        limit: input.limit,
        total,
      });
    }),
  );
  router.get(
    base + "/:id",
    platformGuard,
    safe(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id),
        row = (
          await db.query(
            "SELECT l.*,u.name AS assigned_handler_name FROM mera_company_leads l LEFT JOIN users u ON u.id=l.assigned_handler_id WHERE l.id=$1",
            [id],
          )
        ).rows[0];
      if (!row) throw fail("Enquiry not found.", 404, "NOT_FOUND");
      const documents = (
        await db.query(
          'SELECT id,filename,mime,byte_length AS "byteLength",created_at AS "createdAt" FROM mera_company_documents WHERE lead_id=$1 ORDER BY created_at,id',
          [id],
        )
      ).rows;
      const changes = (
        await db.query(
          'SELECT c.id,c.data,c.created_at AS "createdAt",u.name AS "actorName" FROM mera_company_lead_changes c JOIN users u ON u.id=c.actor_id WHERE c.lead_id=$1 ORDER BY c.created_at DESC,c.id DESC LIMIT 500',
          [id],
        )
      ).rows;
      await platformAudit(db, req, "company_lead_viewed", null, {
        leadId: id,
        reference: row.reference,
      });
      res.json({
        ...view(row),
        documents,
        changes,
        documentSafety:
          "Files are format-checked, not malware-scanned. Download only if you trust the sender.",
      });
    }),
  );
  router.patch(
    base + "/:id",
    platformGuard,
    safe(async (req, res) =>
      res.json(
        await updateCompanyLead(
          db,
          req,
          z.string().uuid().parse(req.params.id),
          req.body,
          platformAudit,
        ),
      ),
    ),
  );
  router.get(
    base + "/:id/documents/:documentId",
    platformGuard,
    safe(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id),
        documentId = z.string().uuid().parse(req.params.documentId);
      const row = (
        await db.query(
          "SELECT filename,mime,bytes FROM mera_company_documents WHERE id=$1 AND lead_id=$2",
          [documentId, id],
        )
      ).rows[0];
      if (!row) throw fail("Document not found.", 404, "NOT_FOUND");
      await platformAudit(db, req, "company_document_downloaded", null, {
        leadId: id,
        documentId,
      });
      res.set({
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Content-Disposition":
          "attachment; filename=\"supporting-document\"; filename*=UTF-8''" +
          encodeURIComponent(row.filename).replace(
            /[!'()*]/g,
            (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
          ),
      });
      res.type(row.mime).send(row.bytes);
    }),
  );
}
