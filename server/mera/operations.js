import { buildOverview } from "./overview.js";
import { effectiveBranchAccess,canSeeBranch } from "./venue-access.js";
import { z } from "zod";
import { loadBranchReportRecords } from "./queries.js";
import { billingEnabled, subscriptionEntitlement } from "./subscriptions.js";
import { randomUUID } from "node:crypto";
import { report, fail,assertMoney } from "./domain.js";
const now = () => new Date().toISOString();
const cell = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  let text = String(value ?? "");
  if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
export function exportReportCSV(summary, branch, window = {}) {
  const validAmount=value=>Number.isSafeInteger(value)&&value>=0;
  const major=value=>validAmount(value)?Number((value/100).toFixed(2)):"Unavailable";
  const readable=value=>String(value).replaceAll("_"," ").replace(/^./,c=>c.toUpperCase());
  const rows=[["Mera EOD export format","v2"],["Branch",branch.name],["Trading date",summary.date],["Timezone",branch.timezone],["Trading cutoff minutes after midnight",branch.cutoff||0],["Window starts (inclusive)",window.from||"Unavailable"],["Window ends (exclusive)",window.to||"Unavailable"],["Currency",branch.currency||"NGN"],["Money representation","Major currency units; source amounts are integer minor units"],[],["Metric","Value","Unit"]];
  const labels={grossOrderValue:"Order value (current non-cancelled orders placed this day)",grossSales:"Recognized bill totals including tax",salesReturns:"Recognized sales returns",netSales:"Net recognized bill totals including tax",netRevenueExTax:"Net revenue excluding tax",netTaxLiability:"Net tax liability",outstanding:"Current outstanding on orders placed this day",collections:"Payments and deposits received",refunds:"Refunds and deposit returns paid",writeOffs:"Receivable write-offs (not collections)",reservationLiability:"Reservation liability at trading-day end"};
  const nonMoney=new Set(["orders"]);
  for(const [key,value] of Object.entries(summary)) {
    if((typeof value!=="number"&&value!==null)||key==="historicalTaxStatus") continue;
    const label=labels[key]||key.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase());
    rows.push([label,value===null?"Unavailable":nonMoney.has(key)?value:Number((value/100).toFixed(2)),nonMoney.has(key)?"count":branch.currency||"NGN"]);
  }
  rows.push(["Recognition basis",summary.recognitionBasis],["Tax breakdown",summary.taxBreakdownStatus],["Mera fees",summary.platformFees?.status==="unavailable"?"Unavailable":major(summary.platformFees?.amount)],["Mera fee explanation",summary.platformFees?.reason||""],[],["Current state of orders placed on this trading day","Count"]);
  for(const [status,count] of Object.entries(summary.orderStates?.counts||{})) rows.push([readable(status),Number.isSafeInteger(count)&&count>=0?count:"Unavailable"]);
  rows.push([],["Recognized products","Quantity","Recorded item value ("+(branch.currency||"NGN")+")"]);
  const products=new Map();
  for(const p of summary.products||[]){
    const key=JSON.stringify([p.productId||p.id||null,p.name,p.variantId||null,p.size||null]);
    const r=products.get(key)||{name:p.name||"Product name unavailable",size:p.size||"",quantity:0,total:0};
    r.quantity=r.quantity!==null&&validAmount(p.quantity)&&Number.isSafeInteger(r.quantity+p.quantity)?r.quantity+p.quantity:null;
    r.total=r.total!==null&&validAmount(p.total)&&Number.isSafeInteger(r.total+p.total)?r.total+p.total:null;
    products.set(key,r);
  }
  for(const p of products.values())rows.push([p.size?`${p.name} — ${p.size}`:p.name,p.quantity===null?"Unavailable":p.quantity,major(p.total)]);
  rows.push([],["Payment method","Receipts including deposits ("+(branch.currency||"NGN")+")"]);for(const [method,amount]of Object.entries(summary.paymentMethods||{}))rows.push([({cash:"Cash",external_pos:"External POS",external_transfer:"External transfer",room_charge:"Charged to rooms (settled by the hotel)"})[method]||method,major(amount)]);
  rows.push([],["Staff activity basis",summary.staffActivity?.basis||"Unavailable"],["Recorded actor name","Actor type","Order history events","Action","Action count"]);for(const e of summary.staffActivity?.entries||[])for(const [action,count]of Object.entries(e.actions))rows.push([e.name||"Identity unavailable",e.actorType,e.eventCount,action.replaceAll("_"," "),count]);
  return rows.map(row=>row.map(cell).join(",")).join("\r\n");
}
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
    row.data.leaseToken = randomUUID();
    await c.query("UPDATE mera_records SET data=$1 WHERE id=$2", [
      JSON.stringify(row.data),
      row.id,
    ]);
    return row;
  });
  if (!job) return false;
  let artifact = null;
  try {
    const m = (
      await db.query(
        "SELECT m.* FROM mera_memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.organization_id=$2 AND m.active=true AND u.active=true",
        [job.data.requestedBy, job.organization_id],
      )
    ).rows[0];
    if (
      !m ||
      !effectiveBranchAccess(m,job.branch_id).permissions.includes("reports.export") ||
      (job.data.scope==="organization" && (!effectiveBranchAccess(m).permissions.includes("organization.overview") || job.data.branchIds.some(id=>!canSeeBranch(m,id))))
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
      let csv;
      if(job.data.scope==='organization') {
        const branches=(await db.query('SELECT * FROM mera_branches WHERE organization_id=$1 AND id = ANY($2::text[])',[job.organization_id,job.data.branchIds])).rows;
        const records=(await db.query('SELECT * FROM mera_records WHERE organization_id=$1 AND branch_id = ANY($2::text[])',[job.organization_id,job.data.branchIds])).rows;
        const overview=buildOverview(branches,records,{from:job.data.from||job.data.date,to:job.data.to||job.data.date});
        csv=[['Location','Code','Revenue (kobo)','Orders','Average order (kobo)','Refunds (kobo)'],...overview.branches.map(b=>[b.name,b.code,b.revenue,b.orders,b.averageOrder,b.refunds]),['All locations','',overview.totals.revenue,overview.totals.orders,overview.totals.averageOrder,overview.totals.refunds],[],['Payment method','Amount (kobo)'],...overview.paymentMix.map(p=>[p.method==='room_charge'?'Charged to rooms (settled by the hotel)':p.method,p.amount])].map(row=>row.map(cell).join(',')).join('\r\n');
      } else {
      const reportData=await loadBranchReportRecords(db,{organizationId:job.organization_id,branchId:job.branch_id},branch,job.data.date);
      const summary={...report(reportData.reportRecords,branch,job.data.date),reservationLiability:reportData.reservationLiabilityAsOf};
      csv = exportReportCSV(summary,branch,reportData.window);
      }
      artifact = {
        id: job.data.artifactId,
        jobId: job.id,
        ...(job.data.scope?{scope:job.data.scope,branchIds:job.data.branchIds}:{}),
        date: job.data.date,
        contentType: "text/csv",
        content: csv,
        createdAt: now(),
      };
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
  await db.transaction(async (c) => {
    const current = (await c.query("SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND branch_id=$3 AND kind='job' FOR UPDATE", [job.id, job.organization_id, job.branch_id])).rows[0];
    if (!current || current.data.status !== "processing" || current.data.leaseToken !== job.data.leaseToken) return;
    // A stale worker can neither publish an artifact nor overwrite a newer lease.
    const member = (await c.query("SELECT m.* FROM mera_memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.organization_id=$2 AND m.active=true AND u.active=true FOR SHARE OF m,u", [job.data.requestedBy, job.organization_id])).rows[0];
    if (!member || !effectiveBranchAccess(member,job.branch_id).permissions.includes("reports.export") || (job.data.scope==="organization" && (!effectiveBranchAccess(member).permissions.includes("organization.overview") || job.data.branchIds.some(id=>!canSeeBranch(member,id))))) {
      job.data.status = "cancelled";
      job.data.error = "Export permission was revoked.";
      artifact = null;
    }
    if (artifact && job.data.status === "complete") await c.query("INSERT INTO mera_records(id,organization_id,branch_id,kind,data) VALUES($1,$2,$3,'export',$4) ON CONFLICT(id) DO NOTHING", [artifact.id, job.organization_id, job.branch_id, JSON.stringify(artifact)]);
    await c.query("UPDATE mera_records SET data=$1 WHERE id=$2 AND organization_id=$3 AND branch_id=$4 AND kind='job'", [JSON.stringify(job.data), job.id, job.organization_id, job.branch_id]);
  });
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
      .object({ date: z.string().date(), requestKey: z.string().uuid(),scope:z.literal("organization").optional(),branchIds:z.array(z.string().uuid()).min(1).max(100).optional() })
      .parse(req.body);
    res.status(202).json(
      await locked(scope(req), async (c) => {
        if(input.scope==='organization') {
          const m=(await c.query('SELECT * FROM mera_memberships WHERE user_id=$1 AND organization_id=$2 AND active=true',[req.user.id,req.params.organizationId])).rows[0];
          if(!effectiveBranchAccess(m).permissions.includes('organization.overview'))throw fail('Organization overview access is required.',403);
          const branches=(await c.query('SELECT id FROM mera_branches WHERE organization_id=$1',[req.params.organizationId])).rows;
          const ids=input.branchIds||branches.filter(b=>canSeeBranch(m,b.id)).map(b=>b.id);
          if(ids.some(id=>!branches.some(b=>b.id===id)||!canSeeBranch(m,id)))throw fail('Invalid location scope.',403);
          input.branchIds=[...new Set(ids)].sort();
        } else if(input.branchIds)throw fail('Location selection requires organization scope.',400);
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
            existing.data.requestedBy !== req.user.id || existing.data.scope!==input.scope || JSON.stringify(existing.data.branchIds)!==JSON.stringify(input.branchIds)
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
      if(artifact.scope==='organization') {
        const m=(await db.query('SELECT * FROM mera_memberships WHERE user_id=$1 AND organization_id=$2 AND active=true',[req.user.id,req.params.organizationId])).rows[0];
        if(!effectiveBranchAccess(m).permissions.includes('organization.overview') || artifact.branchIds.some(id=>!canSeeBranch(m,id)))throw fail('Organization export access is unavailable.',403);
      }
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
      res.json({ ...org, billingEnabled: billingEnabled(), entitlements:subscriptionEntitlement(org.subscription,org.subscription?.approvedPolicySnapshot||org.policy,Date.now(),process.env.MERA_DEMO==="true"&&process.env.NODE_ENV!=="production"),invoices, liveBillingEnabled: false });
    },
  );
  router.post(
    "/organizations/:organizationId/invoices",
    guard("billing.manage"),
    async (req, res) => {
      if (!billingEnabled()) return res.status(409).json({ error: "Billing is off.", code: "BILLING_DISABLED" });
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
          const invoicePolicy=org.subscription?.approvedPolicySnapshot||org.policy;
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
          if (!Number.isSafeInteger(invoicePolicy.monthlyPrice))
            throw fail(
              "Monthly pricing has not been approved.",
              409,
              "POLICY_BLOCKED",
            );
          const additional = Math.max(0, count - invoicePolicy.includedBranches);
          if (additional && invoicePolicy.additionalBranchPrice === null)
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
              amount:assertMoney(invoicePolicy.monthlyPrice + additional * (invoicePolicy.additionalBranchPrice || 0)),
              policyBasis:invoicePolicy.status==="approved"?"approved_subscription":"unapproved_draft_preview",
              currency: invoicePolicy.currency,
              policySnapshot: invoicePolicy,
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
