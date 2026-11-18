import { z } from "zod";
import { randomUUID } from "node:crypto";
import { report, fail } from "./domain.js";
const now = () => new Date().toISOString();
const cell = (value) => {
  let text = String(value ?? "");
  if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
export async function processMeraJobs(db) {
  await db.query(
    "UPDATE mera_records SET data=jsonb_set(jsonb_set(data,'{status}',to_jsonb(CASE WHEN (data->>'attempts')::int>=3 THEN 'failed'::text ELSE 'queued'::text END)),'{error}',to_jsonb('Recovered interrupted export'::text)) WHERE kind='job' AND data->>'status'='processing' AND (data->>'leaseAt')::timestamptz<CURRENT_TIMESTAMP-INTERVAL '2 minutes'",
  );
  const job = await db.transaction(async (c) => {
    const row = (
      await c.query(
        "SELECT * FROM mera_records WHERE kind='job' AND data->>'status'='queued' AND ((data->>'nextAttemptAt') IS NULL OR (data->>'nextAttemptAt')::timestamptz<=CURRENT_TIMESTAMP) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
      )
    ).rows[0];
    if (!row) return null;
    row.data.status = "processing";
    row.data.attempts++;
    row.data.leaseAt = now();
    await c.query("UPDATE mera_records SET data=$1 WHERE id=$2", [
      JSON.stringify(row.data),
      row.id,
    ]);
    return row;
  });
  if (!job) return false;
  try {
    const m = (
      await db.query(
        "SELECT * FROM mera_memberships WHERE user_id=$1 AND organization_id=$2 AND active=true",
        [job.data.requestedBy, job.organization_id],
      )
    ).rows[0];
    if (
      !m ||
      !m.permissions.includes("reports.export") ||
      (!m.organization_wide && !m.branch_ids.includes(job.branch_id))
    ) {
      job.data.status = "cancelled";
      job.data.error = "Export permission was revoked.";
    } else {
      if (job.data.type !== "report_export")
        throw new Error("Unsupported job type.");
      const branch = (
        await db.query(
          "SELECT * FROM mera_branches WHERE id=$1 AND organization_id=$2",
          [job.branch_id, job.organization_id],
        )
      ).rows[0];
      const records = (
        await db.query(
          "SELECT * FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind IN ('order','payment','refund')",
          [job.organization_id, job.branch_id],
        )
      ).rows;
      if (records.length > 50000)
        throw new Error(
          "This branch requires a paged export; contact support.",
        );
      const summary = report(records, branch, job.data.date);
      const csv = [
        "Metric,Amount or count",
        ...Object.entries(summary)
          .filter(([, v]) => typeof v === "number" || typeof v === "string")
          .map(([k, v]) => [k, v].map(cell).join(",")),
      ].join("\r\n");
      const artifact = {
        id: job.data.artifactId,
        jobId: job.id,
        date: job.data.date,
        contentType: "text/csv",
        content: csv,
        createdAt: now(),
      };
      await db.query(
        "INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'export',$4) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data WHERE mera_records.organization_id=EXCLUDED.organization_id AND mera_records.branch_id=EXCLUDED.branch_id",
        [
          artifact.id,
          job.organization_id,
          job.branch_id,
          JSON.stringify(artifact),
        ],
      );
      job.data.status = "complete";
      job.data.completedAt = now();
      job.data.error = null;
    }
  } catch (error) {
    job.data.error = error.code ? "Export processing failed." : error.message;
    job.data.status = job.data.attempts >= 3 ? "failed" : "queued";
    job.data.nextAttemptAt = new Date(
      Date.now() + job.data.attempts * 10000,
    ).toISOString();
  }
  await db.query(
    "UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind='job'",
    [JSON.stringify(job.data), job.id, job.organization_id, job.branch_id],
  );
  return true;
}
export function mountMeraOperations(
  router,
  { db, guard, scope, locked, record, readRecords, event, find },
) {
  const B = "/organizations/:organizationId/branches/:branchId";
  router.get(
    B + "/jobs",
    guard(["reports.export", "organization.manage"]),
    async (req, res) =>
      res.json(
        (
          await readRecords(
            db,
            req.params.organizationId,
            req.params.branchId,
            "job",
          )
        )
          .map((r) => r.data)
          .reverse(),
      ),
  );
  router.post(B + "/exports", guard("reports.export"), async (req, res) => {
    const input = z
      .object({ date: z.string().date(), requestKey: z.string().uuid() })
      .parse(req.body);
    res.status(202).json(
      await locked(scope(req), async (c) => {
        const existing = (
          await readRecords(
            c,
            req.params.organizationId,
            req.params.branchId,
            "job",
          )
        ).find((r) => r.data.requestKey === input.requestKey);
        if (existing) {
          if (
            existing.data.date !== input.date ||
            existing.data.requestedBy !== req.user.id
          )
            throw fail("Export request key conflict.", 409);
          return existing.data;
        }
        const job = await record(c, scope(req), "job", {
          ...input,
          type: "report_export",
          status: "queued",
          attempts: 0,
          artifactId: randomUUID(),
          requestedBy: req.user.id,
          createdAt: now(),
        });
        await event(c, scope(req), "report_export_requested", req.user, {
          jobId: job.id,
          date: input.date,
        });
        return job;
      }),
    );
  });
  router.get(
    B + "/exports/:id/download",
    guard("reports.export"),
    async (req, res) => {
      const artifact = await find(db, scope(req), "export", req.params.id);
      res
        .attachment("mera-trading-day-" + artifact.date + ".csv")
        .type("text/csv")
        .send(artifact.content);
    },
  );
  router.post(
    B + "/jobs/:id/retry",
    guard("reports.export"),
    async (req, res) => {
      const { reason } = z
        .object({ reason: z.string().trim().min(3).max(300) })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const job = await find(c, scope(req), "job", req.params.id);
          if (job.status !== "failed")
            throw fail("Only failed jobs can be manually retried.", 409);
          job.status = "queued";
          job.attempts = 0;
          job.nextAttemptAt = now();
          job.retryReason = reason;
          await c.query(
            "UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4",
            [
              JSON.stringify(job),
              job.id,
              req.params.organizationId,
              req.params.branchId,
            ],
          );
          await event(c, scope(req), "export_retry", req.user, {
            jobId: job.id,
            reason,
          });
          return job;
        }),
      );
    },
  );
  router.get(
    "/organizations/:organizationId/billing",
    guard("billing.manage"),
    async (req, res) => {
      const org = (
        await db.query(
          "SELECT policy,subscription FROM mera_organizations WHERE id=$1",
          [req.params.organizationId],
        )
      ).rows[0];
      const invoices = (
        await db.query(
          "SELECT data FROM mera_records WHERE organization_id=$1 AND kind='invoice' ORDER BY created_at DESC",
          [req.params.organizationId],
        )
      ).rows.map((r) => r.data);
      res.json({ ...org, invoices, liveBillingEnabled: false });
    },
  );
  router.post(
    "/organizations/:organizationId/invoices",
    guard("billing.manage"),
    async (req, res) => {
      const input = z
        .object({
          periodStart: z.string().datetime(),
          periodEnd: z.string().datetime(),
          requestKey: z.string().uuid(),
        })
        .refine(
          (v) => Date.parse(v.periodEnd) > Date.parse(v.periodStart),
          "Invoice end must follow start",
        )
        .parse(req.body);
      res.status(201).json(
        await db.transaction(async (c) => {
          const org = (
            await c.query(
              "SELECT * FROM mera_organizations WHERE id=$1 FOR UPDATE",
              [req.params.organizationId],
            )
          ).rows[0];
          const branch = (
            await c.query(
              "SELECT id FROM mera_branches WHERE organization_id=$1 ORDER BY id LIMIT 1",
              [org.id],
            )
          ).rows[0];
          const prior = (
            await readRecords(c, org.id, branch.id, "invoice")
          ).find((r) => r.data.requestKey === input.requestKey);
          if (prior) {
            if (
              prior.data.periodStart !== input.periodStart ||
              prior.data.periodEnd !== input.periodEnd
            )
              throw fail("Invoice request key conflict.", 409);
            return prior.data;
          }
          const count = Number(
            (
              await c.query(
                "SELECT COUNT(*) AS count FROM mera_branches WHERE organization_id=$1",
                [org.id],
              )
            ).rows[0].count,
          );
          if (!Number.isSafeInteger(org.policy.monthlyPrice))
            throw fail(
              "Monthly pricing has not been approved.",
              409,
              "POLICY_BLOCKED",
            );
          const additional = Math.max(0, count - org.policy.includedBranches);
          if (additional && org.policy.additionalBranchPrice === null)
            throw fail(
              "Additional branch pricing has not been approved.",
              409,
              "POLICY_BLOCKED",
            );
          return record(
            c,
            { organizationId: org.id, branchId: branch.id },
            "invoice",
            {
              ...input,
              status: "draft",
              amount:
                org.policy.monthlyPrice +
                additional * (org.policy.additionalBranchPrice || 0),
              currency: org.policy.currency,
              policySnapshot: org.policy,
              notCharged: true,
              createdAt: now(),
            },
          );
        }),
      );
    },
  );
  router.patch(
    B + "/complaints/:id",
    guard("organization.manage"),
    async (req, res) => {
      const input = z
        .object({
          status: z.enum(["open", "investigating", "resolved"]),
          resolution: z.string().max(1000).optional(),
          handlerId: z.string().uuid().optional(),
        })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const complaint = await find(
            c,
            scope(req),
            "complaint",
            req.params.id,
          );
          if (input.status === "resolved" && !input.resolution?.trim())
            throw fail("Describe the resolution.");
          if (input.handlerId) {
            const member = (
              await c.query(
                "SELECT * FROM mera_memberships WHERE user_id=$1 AND organization_id=$2 AND active=true",
                [input.handlerId, req.params.organizationId],
              )
            ).rows[0];
            if (
              !member ||
              (!member.organization_wide &&
                !member.branch_ids.includes(req.params.branchId))
            )
              throw fail("Handler is not authorized for this branch.");
          }
          const updated = {
            ...complaint,
            ...input,
            updatedBy: req.user.id,
            updatedAt: now(),
          };
          await c.query(
            "UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4",
            [
              JSON.stringify(updated),
              complaint.id,
              req.params.organizationId,
              req.params.branchId,
            ],
          );
          await event(c, scope(req), "complaint_updated", req.user, {
            complaintId: complaint.id,
            status: input.status,
          });
          return updated;
        }),
      );
    },
  );
  router.get(B + "/waitlist", guard("reservations.manage"), async (req, res) =>
    res.json(
      (
        await readRecords(
          db,
          req.params.organizationId,
          req.params.branchId,
          "waitlist",
        )
      ).map((r) => r.data),
    ),
  );
  router.post(
    B + "/waitlist",
    guard("reservations.manage"),
    async (req, res) => {
      const input = z
        .object({
          displayName: z.string().trim().min(1).max(100),
          partySize: z.number().int().min(1).max(100),
          contact: z.string().max(160),
          notes: z.string().max(500).default(""),
        })
        .parse(req.body);
      res.status(201).json(
        await locked(scope(req), (c) =>
          record(c, scope(req), "waitlist", {
            ...input,
            status: "waiting",
            createdBy: req.user.id,
            createdAt: now(),
          }),
        ),
      );
    },
  );
  router.patch(
    B + "/waitlist/:id",
    guard("reservations.manage"),
    async (req, res) => {
      const { status } = z
        .object({
          status: z.enum(["waiting", "notified", "seated", "cancelled"]),
        })
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const row = await find(c, scope(req), "waitlist", req.params.id);
          if (["seated", "cancelled"].includes(row.status))
            throw fail("This waitlist entry is already closed.", 409);
          row.status = status;
          row.updatedAt = now();
          row.updatedBy = req.user.id;
          if (status === "notified")
            row.notificationSource = "staff_recorded_external_contact";
          await c.query(
            "UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4",
            [
              JSON.stringify(row),
              row.id,
              req.params.organizationId,
              req.params.branchId,
            ],
          );
          await event(c, scope(req), "waitlist_status", req.user, {
            waitlistId: row.id,
            status,
          });
          return row;
        }),
      );
    },
  );
}
