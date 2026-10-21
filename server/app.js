import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "./db.js";
import {
  priceOrder,
  buildPrintPayloads,
  reportFor,
  dayBounds,
  lagosDate,
} from "./domain.js";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const safeUser = (u) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
  active: u.active,
});
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const local = (req) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip);
const guard =
  (roles, localOnly = false) =>
  (req, res, next) => {
    if (!req.user) return next(fail("Sign in to continue.", 401));
    if (!roles.includes(req.user.role))
      return next(fail("You do not have permission.", 403));
    if (localOnly && !local(req) && process.env.ADMIN_ALLOW_REMOTE !== "true")
      return next(fail("Open the admin workspace on the Windows server.", 403));
    next();
  };
const staff = guard(["admin", "supervisor", "cashier"]);
const manager = guard(["admin", "supervisor"]);
const admin = guard(["admin"], true);
export async function audit(client, user, action, orderId, details = {}) {
  await client.query(
    "INSERT INTO audit(id,user_id,user_name,action,order_id,details) VALUES($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(),
      user?.id || null,
      user?.name || "System",
      action,
      orderId || null,
      JSON.stringify(details),
    ],
  );
}
export async function getReport(client, date) {
  const [start, end] = dayBounds(date);
  const orders = (
    await client.query(
      "SELECT * FROM orders WHERE (created_at >= $1 AND created_at < $2) OR (paid_at >= $1 AND paid_at < $2) ORDER BY created_at DESC",
      [start, end],
    )
  ).rows;
  const refunds = (
    await client.query(
      "SELECT * FROM refunds WHERE created_at >= $1 AND created_at < $2",
      [start, end],
    )
  ).rows;
  const summaryOrders = orders.filter(
    (o) =>
      new Date(o.created_at) >= new Date(start) &&
      new Date(o.created_at) < new Date(end),
  );
  const sales = orders.filter(
    (o) =>
      o.paid_at &&
      new Date(o.paid_at) >= new Date(start) &&
      new Date(o.paid_at) < new Date(end),
  );
  const salesReport = reportFor(sales, refunds);
  const activity = reportFor(summaryOrders, []);
  return {
    ...salesReport,
    orders: activity.orders,
    statuses: activity.statuses,
    date,
    transactions: orders,
  };
}
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "data:"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "upgrade-insecure-requests": null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.get("origin");
      const allowed = [
        `http://${req.get("host")}`,
        `https://${req.get("host")}`,
        process.env.PUBLIC_ORIGIN,
      ].filter(Boolean);
      if (origin && !allowed.includes(origin))
        return next(fail("Request origin is not permitted.", 403));
      if (req.get("x-pos-request") !== "1")
        return next(fail("Missing request header.", 403));
    }
    next();
  });
  app.use("/api", async (req, res, next) => {
    try {
      const token = req.cookies.pos_session;
      if (token) {
        const r = await query(
          "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>$2 AND u.active=true",
          [hash(token), new Date()],
        );
        req.user = r.rows[0];
      }
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/health", async (req, res) => {
    await query("SELECT 1");
    res.json({
      ok: true,
      local: local(req),
      date: lagosDate(),
      mode: process.env.PRINT_MODE || "simulation",
    });
  });
  const attempts = new Map();
  app.post("/api/login", async (req, res) => {
    const ip = req.ip;
    const entry = attempts.get(ip) || { count: 0, since: Date.now() };
    if (Date.now() - entry.since > 900000) {
      entry.count = 0;
      entry.since = Date.now();
    }
    if (entry.count >= 10)
      throw fail("Too many attempts. Try again in 15 minutes.", 429);
    const { username, password } = z
      .object({
        username: z.string().min(1).max(80),
        password: z.string().min(1).max(200),
      })
      .parse(req.body);
    const user = (
      await query("SELECT * FROM users WHERE username=$1 AND active=true", [
        username.toLowerCase(),
      ])
    ).rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      entry.count++;
      attempts.set(ip, entry);
      throw fail("Username or password is incorrect.", 401);
    }
    if (
      user.role === "admin" &&
      !local(req) &&
      process.env.ADMIN_ALLOW_REMOTE !== "true"
    )
      throw fail(
        "Administrator sign-in is restricted to the Windows server.",
        403,
      );
    attempts.delete(ip);
    const token = randomBytes(32).toString("hex");
    await query(
      "INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,$3)",
      [hash(token), user.id, new Date(Date.now() + 12 * 3600000)],
    );
    res.cookie("pos_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 12 * 3600000,
    });
    await audit({ query }, user, "signed_in", null);
    res.json(safeUser(user));
  });
  app.get("/api/me", staff, (req, res) =>
    res.json({ ...safeUser(req.user), local: local(req) }),
  );
  app.post("/api/logout", staff, async (req, res) => {
    await query("DELETE FROM sessions WHERE token=$1", [
      hash(req.cookies.pos_session),
    ]);
    res.clearCookie("pos_session").json({ ok: true });
  });
  app.get("/api/products", staff, async (req, res) =>
    res.json(
      (await query("SELECT * FROM products ORDER BY category,code")).rows,
    ),
  );
  const productSchema = z.object({
    code: z.string().trim().min(1).max(30),
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(80),
    price: z.number().int().min(0).max(100000000),
    size: z.string().max(40),
    available: z.boolean(),
    label_required: z.boolean(),
    options: z.boolean(),
    needs_review: z.boolean().optional().default(false),
  });
  app.post("/api/products", admin, async (req, res) => {
    const p = productSchema.parse(req.body);
    const id = randomUUID();
    await transaction(async (c) => {
      await c.query(
        "INSERT INTO products(id,code,name,category,price,size,available,label_required,options,needs_review) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [id, ...Object.values(p)],
      );
      await audit(c, req.user, "product_created", null, { id, ...p });
    });
    res.json({ id });
  });
  app.put("/api/products/:id", admin, async (req, res) => {
    const p = productSchema.parse(req.body);
    await transaction(async (c) => {
      const old = (
        await c.query("SELECT * FROM products WHERE id=$1", [req.params.id])
      ).rows[0];
      if (!old) throw fail("Product not found.", 404);
      await c.query(
        "UPDATE products SET code=$1,name=$2,category=$3,price=$4,size=$5,available=$6,label_required=$7,options=$8,needs_review=$9 WHERE id=$10",
        [...Object.values(p), req.params.id],
      );
      await audit(c, req.user, "product_updated", null, {
        before: old,
        after: p,
      });
    });
    res.json({ ok: true });
  });
  app.get("/api/orders", staff, async (req, res) => {
    const date = String(req.query.date || lagosDate());
    const [start, end] = dayBounds(date);
    res.json(
      (
        await query(
          date === lagosDate()
            ? "SELECT * FROM orders WHERE (created_at >= $1 AND created_at < $2) OR status IN ('pending','paid','preparing','ready') ORDER BY created_at DESC"
            : "SELECT * FROM orders WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC",
          [start, end],
        )
      ).rows,
    );
  });
  app.post("/api/orders", staff, async (req, res) => {
    const input = z
      .object({
        requestKey: z.string().uuid(),
        items: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number().int(),
              sweetness: z.string().optional(),
              ice: z.string().optional(),
              toppings: z.array(z.string()).optional(),
            }),
          )
          .min(1)
          .max(100),
        note: z.string().max(500).default(""),
        discount: z
          .object({
            type: z.enum(["percent", "fixed"]),
            value: z.number().min(0),
            reason: z.string().max(200),
          })
          .optional(),
      })
      .parse(req.body);
    const order = await transaction(async (c) => {
      await c.query("SELECT key FROM settings WHERE key='business' FOR UPDATE");
      const existing = (
        await c.query("SELECT * FROM orders WHERE request_key=$1", [
          input.requestKey,
        ])
      ).rows[0];
      if (existing) {
        if (existing.staff_id !== req.user.id)
          throw fail("Invalid request key.", 409);
        return existing;
      }
      if (
        (
          await c.query("SELECT id FROM closures WHERE business_date=$1", [
            lagosDate(),
          ])
        ).rows.length
      )
        throw fail("Today is closed. An administrator must reopen it.", 409);
      const products = (await c.query("SELECT * FROM products")).rows;
      const totals = priceOrder(
        input.items,
        products,
        input.discount,
        req.user.role,
      );
      const row = (
        await c.query(
          "INSERT INTO orders(id,staff_id,staff_name,items,subtotal,discount,discount_reason,total,note,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
          [
            randomUUID(),
            req.user.id,
            req.user.name,
            JSON.stringify(totals.items),
            totals.subtotal,
            totals.discount,
            totals.discountReason,
            totals.total,
            input.note,
            input.requestKey,
          ],
        )
      ).rows[0];
      await audit(c, req.user, "order_created", row.id, {
        total: row.total,
        discount: row.discount,
        discountReason: row.discount_reason,
      });
      return row;
    });
    res.status(201).json(order);
  });
  app.put("/api/orders/:id", staff, async (req, res) => {
    const input = z
      .object({
        version: z.number().int(),
        items: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number().int(),
              sweetness: z.string().optional(),
              ice: z.string().optional(),
              toppings: z.array(z.string()).optional(),
            }),
          )
          .min(1)
          .max(100),
        note: z.string().max(500).default(""),
      })
      .parse(req.body);
    const result = await transaction(async (c) => {
      const o = (
        await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!o) throw fail("Order not found.", 404);
      if (o.status !== "pending" || o.payment_status !== "unpaid")
        throw fail("Only unpaid orders can be edited.", 409);
      if (o.version !== input.version)
        throw fail(
          "This order changed on another device. Reopen it before editing.",
          409,
        );
      if (o.discount && req.user.role === "cashier")
        throw fail("A supervisor must edit a discounted order.", 403);
      const totals = priceOrder(
        input.items,
        (await c.query("SELECT * FROM products")).rows,
        o.discount
          ? {
              type: "fixed",
              value: o.discount / 100,
              reason: o.discount_reason,
            }
          : null,
        req.user.role,
      );
      const row = (
        await c.query(
          "UPDATE orders SET items=$1,subtotal=$2,total=$3,note=$4,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$5 RETURNING *",
          [
            JSON.stringify(totals.items),
            totals.subtotal,
            totals.total,
            input.note,
            o.id,
          ],
        )
      ).rows[0];
      await audit(c, req.user, "order_edited", o.id, {
        before: { items: o.items, total: o.total, note: o.note },
        after: { items: row.items, total: row.total, note: row.note },
      });
      return row;
    });
    res.json(result);
  });
  app.post("/api/orders/:id/pay", staff, async (req, res) => {
    const input = z
      .object({
        method: z.enum(["cash", "card", "transfer"]),
        cashTendered: z.number().int().min(0).optional(),
      })
      .parse(req.body);
    const order = await transaction(async (c) => {
      await c.query("SELECT key FROM settings WHERE key='business' FOR UPDATE");
      const o = (
        await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!o) throw fail("Order not found.", 404);
      if (o.payment_status === "paid") return o;
      if (o.status !== "pending") throw fail("This order cannot be paid.", 409);
      if (
        (
          await c.query("SELECT id FROM closures WHERE business_date=$1", [
            lagosDate(),
          ])
        ).rows.length
      )
        throw fail("Today is closed.", 409);
      if (input.method === "cash" && (input.cashTendered ?? 0) < o.total)
        throw fail("Cash tendered is below the order total.");
      const row = (
        await c.query(
          "UPDATE orders SET status='paid',payment_status='paid',payment_method=$1,cash_tendered=$2,paid_by=$3,paid_by_name=$4,paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$5 RETURNING *",
          [
            input.method,
            input.method === "cash" ? input.cashTendered : null,
            req.user.id,
            req.user.name,
            o.id,
          ],
        )
      ).rows[0];
      const template = (
        await c.query("SELECT value FROM settings WHERE key='receipt'")
      ).rows[0].value;
      for (const j of buildPrintPayloads(row, template))
        await c.query(
          "INSERT INTO print_jobs(id,order_id,kind,sequence,payload) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), row.id, j.kind, j.sequence, JSON.stringify(j.payload)],
        );
      await audit(c, req.user, "payment_confirmed", o.id, {
        method: input.method,
        total: o.total,
      });
      return row;
    });
    res.json(order);
  });
  app.post("/api/orders/:id/status", staff, async (req, res) => {
    const { status, reason } = z
      .object({
        status: z.enum(["ready", "fulfilled", "cancelled"]),
        reason: z.string().max(300).default(""),
      })
      .parse(req.body);
    const result = await transaction(async (c) => {
      const o = (
        await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!o) throw fail("Order not found.", 404);
      const valid =
        (status === "ready" && o.status === "preparing") ||
        (status === "fulfilled" && o.status === "ready") ||
        (status === "cancelled" &&
          o.status === "pending" &&
          o.payment_status === "unpaid");
      if (!valid) throw fail("That status change is not allowed.", 409);
      if (status === "cancelled" && !reason.trim())
        throw fail("A cancellation reason is required.");
      const row = (
        await c.query(
          "UPDATE orders SET status=$1,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$2 RETURNING *",
          [status, o.id],
        )
      ).rows[0];
      await audit(c, req.user, "order_" + status, o.id, {
        from: o.status,
        reason,
      });
      return row;
    });
    res.json(result);
  });
  app.post("/api/orders/:id/refund", manager, async (req, res) => {
    const { reason, method } = z
      .object({
        reason: z.string().trim().min(3).max(300),
        method: z.enum(["cash", "card", "transfer"]),
      })
      .parse(req.body);
    await transaction(async (c) => {
      await c.query("SELECT key FROM settings WHERE key='business' FOR UPDATE");
      const o = (
        await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!o || o.payment_status !== "paid")
        throw fail("Only paid, non-refunded orders can be refunded.", 409);
      if (
        (
          await c.query("SELECT id FROM closures WHERE business_date=$1", [
            lagosDate(),
          ])
        ).rows.length
      )
        throw fail("Today is closed.", 409);
      await c.query(
        "INSERT INTO refunds(id,order_id,amount,method,reason,staff_name) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), o.id, o.total, method, reason, req.user.name],
      );
      await c.query(
        "UPDATE orders SET status='cancelled',payment_status='refunded',refund_amount=total,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
        [o.id],
      );
      await c.query(
        "UPDATE print_jobs SET status='cancelled' WHERE order_id=$1 AND status IN ('queued','failed')",
        [o.id],
      );
      await audit(c, req.user, "order_refunded", o.id, {
        amount: o.total,
        reason,
        method,
      });
    });
    res.json({ ok: true });
  });
  app.get("/api/printing", staff, async (req, res) => {
    const jobs = (
      await query(
        "SELECT id,order_id,kind,sequence,status,attempts,error,simulated,reprint,created_at FROM print_jobs ORDER BY created_at DESC LIMIT 200",
      )
    ).rows;
    const worker = (
      await query("SELECT value FROM settings WHERE key='worker'")
    ).rows[0]?.value;
    res.json({ jobs, worker });
  });
  app.post("/api/printing/:id/retry", manager, async (req, res) => {
    const reason = z.string().trim().min(3).max(200).parse(req.body.reason);
    await transaction(async (c) => {
      const j = (
        await c.query("SELECT * FROM print_jobs WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!j || !["failed", "uncertain"].includes(j.status))
        throw fail("Only failed or uncertain jobs can be retried.", 409);
      const o = (
        await c.query("SELECT * FROM orders WHERE id=$1", [j.order_id])
      ).rows[0];
      if (o.payment_status !== "paid")
        throw fail("Order is no longer paid.", 409);
      await c.query(
        "UPDATE print_jobs SET status='queued',error=NULL,lease_at=NULL WHERE id=$1",
        [j.id],
      );
      await audit(c, req.user, "print_retry", j.order_id, {
        jobId: j.id,
        reason,
      });
    });
    res.json({ ok: true });
  });
  app.post("/api/orders/:id/reprint", manager, async (req, res) => {
    const reason = z.string().trim().min(3).max(200).parse(req.body.reason);
    await transaction(async (c) => {
      const o = (
        await c.query("SELECT * FROM orders WHERE id=$1", [req.params.id])
      ).rows[0];
      if (!o || o.payment_status !== "paid")
        throw fail("Only paid orders can be reprinted.");
      const t = (
        await c.query("SELECT value FROM settings WHERE key='receipt'")
      ).rows[0].value;
      await c.query(
        "INSERT INTO print_jobs(id,order_id,kind,sequence,payload,reprint) VALUES($1,$2,$3,$4,$5,true)",
        [
          randomUUID(),
          o.id,
          "receipt",
          0,
          JSON.stringify({ order: o, template: t, duplicate: true }),
        ],
      );
      await audit(c, req.user, "receipt_reprint", o.id, { reason });
    });
    res.json({ ok: true });
  });
  app.get("/api/settings", staff, async (req, res) => {
    const rows = (
      await query("SELECT * FROM settings WHERE key IN ('receipt','business')")
    ).rows;
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  });
  app.put("/api/settings/receipt", admin, async (req, res) => {
    const template = z
      .object({
        businessName: z.string().min(1).max(80),
        subtitle: z.string().max(120),
        address: z.string().max(180),
        phone: z.string().max(40),
        footer: z.string().max(200),
        showLogo: z.boolean().default(true),
        showStaff: z.boolean(),
        showOptions: z.boolean(),
        showPayment: z.boolean(),
        showCode: z.boolean(),
        headingSize: z.enum(["small", "large"]),
        align: z.enum(["left", "center"]),
        paperWidth: z.literal(58),
        labelWidth: z.number().min(20).max(60),
        labelHeight: z.number().min(15).max(150),
        labelShowStaff: z.boolean(),
      })
      .parse(req.body);
    await transaction(async (c) => {
      const before = (
        await c.query("SELECT value FROM settings WHERE key='receipt'")
      ).rows[0].value;
      await c.query("UPDATE settings SET value=$1 WHERE key='receipt'", [
        JSON.stringify(template),
      ]);
      await audit(c, req.user, "receipt_template_updated", null, {
        before,
        after: template,
      });
    });
    res.json(template);
  });
  app.get("/api/users", admin, async (req, res) =>
    res.json(
      (
        await query(
          "SELECT id,name,username,role,active,created_at FROM users ORDER BY name",
        )
      ).rows,
    ),
  );
  app.post("/api/users", admin, async (req, res) => {
    const u = z
      .object({
        name: z.string().trim().min(2).max(80),
        username: z.string().regex(/^[a-zA-Z0-9._-]{3,40}$/),
        password: z.string().min(10).max(200),
        role: z.enum(["admin", "supervisor", "cashier"]),
      })
      .parse(req.body);
    const id = randomUUID();
    await transaction(async (c) => {
      await c.query(
        "INSERT INTO users(id,name,username,password_hash,role) VALUES($1,$2,$3,$4,$5)",
        [
          id,
          u.name,
          u.username.toLowerCase(),
          await bcrypt.hash(u.password, 12),
          u.role,
        ],
      );
      await audit(c, req.user, "user_created", null, {
        id,
        name: u.name,
        role: u.role,
      });
    });
    res.json({ id });
  });
  app.patch("/api/users/:id", admin, async (req, res) => {
    const u = z
      .object({
        active: z.boolean().optional(),
        password: z.string().min(10).max(200).optional(),
      })
      .parse(req.body);
    if (req.params.id === req.user.id && u.active === false)
      throw fail("You cannot deactivate your own account.");
    await transaction(async (c) => {
      if (
        !(await c.query("SELECT id FROM users WHERE id=$1", [req.params.id]))
          .rows.length
      )
        throw fail("User not found.", 404);
      if (u.active !== undefined)
        await c.query("UPDATE users SET active=$1 WHERE id=$2", [
          u.active,
          req.params.id,
        ]);
      if (u.password)
        await c.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
          await bcrypt.hash(u.password, 12),
          req.params.id,
        ]);
      await c.query("DELETE FROM sessions WHERE user_id=$1", [req.params.id]);
      await audit(c, req.user, "user_access_updated", null, {
        id: req.params.id,
        active: u.active,
        passwordReset: !!u.password,
      });
    });
    res.json({ ok: true });
  });
  app.get("/api/report", manager, async (req, res) => {
    const date = String(req.query.date || lagosDate());
    dayBounds(date);
    const closed = (
      await query("SELECT report FROM closures WHERE business_date=$1", [date])
    ).rows[0];
    res.json(
      closed
        ? { ...closed.report, closed: true }
        : await getReport({ query }, date),
    );
  });
  app.get("/api/closures", admin, async (req, res) =>
    res.json(
      (
        await query(
          "SELECT * FROM closures ORDER BY business_date DESC LIMIT 90",
        )
      ).rows,
    ),
  );
  app.post("/api/closures", admin, async (req, res) => {
    const { date, countedCash } = z
      .object({ date: z.string(), countedCash: z.number().int().min(0) })
      .parse(req.body);
    if (date > lagosDate()) throw fail("Cannot close a future date.");
    const report = await transaction(async (c) => {
      await c.query("SELECT key FROM settings WHERE key='business' FOR UPDATE");
      const r = await getReport(c, date);
      if (
        r.transactions.some((o) =>
          ["pending", "paid", "preparing", "ready"].includes(o.status),
        )
      )
        throw fail("Resolve pending and unfulfilled orders before closing.");
      await c.query(
        "INSERT INTO closures(id,business_date,report,counted_cash,expected_cash,variance,closed_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          randomUUID(),
          date,
          JSON.stringify(r),
          countedCash,
          r.payments.cash,
          countedCash - r.payments.cash,
          req.user.name,
        ],
      );
      await audit(c, req.user, "day_closed", null, {
        date,
        countedCash,
        expectedCash: r.payments.cash,
      });
      return r;
    });
    res.json(report);
  });
  app.post("/api/closures/:date/reopen", admin, async (req, res) => {
    const reason = z.string().trim().min(3).max(200).parse(req.body.reason);
    await transaction(async (c) => {
      const before = (
        await c.query("SELECT * FROM closures WHERE business_date=$1", [
          req.params.date,
        ])
      ).rows[0];
      if (!before) throw fail("Closure not found.", 404);
      await c.query("DELETE FROM closures WHERE business_date=$1", [
        req.params.date,
      ]);
      await audit(c, req.user, "day_reopened", null, {
        reason,
        closure: before,
      });
    });
    res.json({ ok: true });
  });
  app.get("/api/audit", admin, async (req, res) =>
    res.json(
      (await query("SELECT * FROM audit ORDER BY created_at DESC LIMIT 300"))
        .rows,
    ),
  );
  app.get("/api/backups", admin, async (req, res) =>
    res.json(
      (
        await query(
          "SELECT id,status,cloud_status,error,created_at FROM backup_runs ORDER BY created_at DESC LIMIT 30",
        )
      ).rows,
    ),
  );
  return app;
}
export function errorHandler(err, req, res, next) {
  console.error(err.message);
  if (err instanceof z.ZodError)
    return res.status(400).json({
      error: err.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .join("; "),
    });
  if (err.code === "23505")
    return res
      .status(409)
      .json({ error: "This entry already exists. Refresh and try again." });
  res.status(err.status || 400).json({
    error: err.status
      ? err.message
      : process.env.NODE_ENV === "production" && err.code
        ? "Unable to complete the request."
        : err.message,
  });
}
