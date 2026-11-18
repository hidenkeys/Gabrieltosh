import { z } from "zod";
import { randomUUID } from "node:crypto";
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status });
const merchantView = (row) => ({
  id: row.id,
  reference: row.reference,
  organizationId: row.organizationId,
  branchId: row.branchId,
  subject: row.subject,
  topic: row.topic,
  message: row.message,
  status: row.status,
  customerReply: row.customerReply || "",
  version: row.version,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  history: (row.history || []).map(({ status, customerReply, at }) => ({
    status,
    customerReply,
    at,
  })),
  externalDelivery: false,
});
const createSchema = z
  .object({
    requestKey: z.string().uuid(),
    subject: z.string().trim().min(3).max(140),
    topic: z.enum(["operations", "billing", "integration", "account"]),
    message: z.string().trim().min(1).max(4000),
    branchId: z.string().uuid().optional(),
  })
  .strict();
export function mountMeraPlatformSupport(
  router,
  { db, guard, platformGuard, platformAudit },
) {
  const O = "/organizations/:organizationId/support-cases";
  const assertOrgWide = (req) => {
    if (!req.meraMembership?.organization_wide)
      throw fail("Organization-wide management access is required.", 403);
  };
  const read = async (c, org) =>
    (
      await c.query(
        "SELECT id,organization_id,branch_id,data FROM mera_records WHERE kind='support_case'" +
          (org ? " AND organization_id=$1" : "") +
          " ORDER BY created_at DESC,id",
        org ? [org] : [],
      )
    ).rows.map((row) => ({
      ...row.data,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      id: row.id,
    }));
  router.get(O, guard("organization.manage"), async (req, res) => {
    assertOrgWide(req);
    res
      .set("Cache-Control", "no-store")
      .json({
        cases: (await read(db, req.params.organizationId)).map(merchantView),
        externalDelivery: false,
      });
  });
  router.post(O, guard("organization.manage"), async (req, res) => {
    assertOrgWide(req);
    const input = createSchema.parse(req.body);
    const result = await db.transaction(async (c) => {
      const org = (
        await c.query(
          "SELECT id FROM mera_organizations WHERE id=$1 FOR UPDATE",
          [req.params.organizationId],
        )
      ).rows[0];
      if (!org) throw fail("Organization not found.", 404);
      const intent = {
        subject: input.subject,
        topic: input.topic,
        message: input.message,
        branchId: input.branchId || null,
      };
      const prior = (await read(c, org.id)).find(
        (row) => row.requestKey === input.requestKey,
      );
      if (prior) {
        if (
          prior.createdBy !== req.user.id ||
          ["subject", "topic", "message", "branchId"].some(
            (key) => (prior.intent?.[key] ?? null) !== (intent[key] ?? null),
          )
        )
          throw fail(
            "This support request key belongs to a different actor or request.",
          );
        return prior;
      }
      const branch = (
        await c.query(
          "SELECT id FROM mera_branches WHERE organization_id=$1" +
            (input.branchId ? " AND id=$2" : "") +
            " ORDER BY id LIMIT 1",
          input.branchId ? [org.id, input.branchId] : [org.id],
        )
      ).rows[0];
      if (!branch)
        throw fail("A valid branch in this organization is required.", 404);
      const now = new Date().toISOString(),
        row = {
          id: randomUUID(),
          reference: "S-" + randomUUID().slice(0, 8).toUpperCase(),
          organizationId: org.id,
          branchId: branch.id,
          ...input,
          intent,
          createdBy: req.user.id,
          status: "open",
          customerReply: "",
          internalNotes: [],
          version: 1,
          createdAt: now,
          updatedAt: now,
          history: [
            {
              status: "open",
              at: now,
              actorId: req.user.id,
              customerReply: "",
            },
          ],
        };
      row.branchId = branch.id;
      await c.query(
        "INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'support_case',$4)",
        [row.id, org.id, branch.id, JSON.stringify(row)],
      );
      await platformAudit(c, req, "merchant_support_case_created", org.id, {
        caseId: row.id,
        topic: row.topic,
        externalDelivery: false,
      });
      return row;
    });
    res.status(201).json(merchantView(result));
  });
  router.get("/platform/support-cases", platformGuard, async (req, res) => {
    res
      .set("Cache-Control", "no-store")
      .json({ cases: await read(db), externalDelivery: false });
  });
  router.patch(
    "/platform/support-cases/:id",
    platformGuard,
    async (req, res) => {
      const input = z
        .object({
          version: z.number().int().positive(),
          status: z.enum(["acknowledged", "in_progress", "resolved"]),
          customerReply: z.string().trim().max(4000).optional(),
          internalNote: z.string().trim().max(4000).optional(),
        })
        .strict()
        .parse(req.body);
      const id = z.string().uuid().parse(req.params.id);
      res.json(
        await db.transaction(async (c) => {
          const found = (
            await c.query(
              "SELECT id,organization_id,branch_id,data FROM mera_records WHERE id=$1 AND kind='support_case' FOR UPDATE",
              [id],
            )
          ).rows[0];
          if (!found) throw fail("Support case not found.", 404);
          const row = found.data;
          if (row.version !== input.version)
            throw fail("This support case changed. Refresh before saving.");
          if (row.status === "resolved" && input.status !== "resolved")
            throw fail("A resolved support case cannot be reopened.");
          const reply = input.customerReply ?? row.customerReply;
          if (input.status === "resolved" && !reply?.trim())
            throw fail(
              "A customer-visible reply is required to resolve a case.",
            );
          const now = new Date().toISOString(),
            next = {
              ...row,
              status: input.status,
              customerReply: reply,
              version: row.version + 1,
              updatedAt: now,
              internalNotes: [
                ...(row.internalNotes || []),
                ...(input.internalNote
                  ? [
                      {
                        text: input.internalNote,
                        actorId: req.user.id,
                        at: now,
                      },
                    ]
                  : []),
              ],
              history: [
                ...(row.history || []),
                {
                  status: input.status,
                  customerReply: reply,
                  actorId: req.user.id,
                  at: now,
                },
              ],
            };
          await c.query(
            "UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind='support_case'",
            [
              JSON.stringify(next),
              found.id,
              found.organization_id,
              found.branch_id,
            ],
          );
          await platformAudit(
            c,
            req,
            "platform_support_case_updated",
            found.organization_id,
            {
              caseId: id,
              status: next.status,
              version: next.version,
              externalDelivery: false,
            },
          );
          return { ...next, externalDelivery: false };
        }),
      );
    },
  );
}
