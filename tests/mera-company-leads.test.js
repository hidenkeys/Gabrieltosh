import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  consultancyEnquirySchema,
  travelInterestSchema,
  companyAcknowledgementSchema,
} from "../shared/mera-company-contracts.js";
import {
  validateCompanyDocuments,
  updateCompanyLead,
} from "../server/mera/company-leads.js";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const textDocument = {
  filename: "brief.txt",
  mime: "text/plain",
  data: Buffer.from("A synthetic project brief.").toString("base64"),
};
const enquiry = () => ({
  requestKey: randomUUID(),
  name: "Synthetic enquiry",
  company: "Example business",
  email: "qa@example.invalid",
  phone: "",
  problem: "We need a simpler way to coordinate our customer service.",
  intendedUsers: "Service staff",
  capabilities: "Requests, assignments and reporting",
  projectType: "new_build",
  budgetRange: "not_sure",
  timeline: "Discuss during discovery",
  privacyAcknowledged: true,
  documents: [textDocument],
});
test("company submissions validate contact, privacy and unapproved-field boundaries", () => {
  const value = enquiry();
  assert.equal(
    consultancyEnquirySchema.parse({ ...value, email: "QA@EXAMPLE.INVALID" })
      .email,
    "qa@example.invalid",
  );
  for (const invalid of [
    { privacyAcknowledged: false },
    { problem: "short" },
    { company: "" },
    { email: "invalid" },
    { documents: [textDocument, textDocument, textDocument, textDocument] },
    { status: "accepted" },
  ])
    assert.equal(
      consultancyEnquirySchema.safeParse({ ...value, ...invalid }).success,
      false,
    );
  assert.equal(
    travelInterestSchema.safeParse({
      requestKey: randomUUID(),
      name: "Interest",
      email: "interest@example.invalid",
      privacyAcknowledged: true,
    }).success,
    true,
  );
  assert.equal(travelInterestSchema.safeParse({ ...value }).success, false);
});
test("supporting files enforce aggregate bytes, extension, signatures and private safe-download formats", () => {
  assert.equal(validateCompanyDocuments([textDocument])[0].byteLength, 26);
  assert.throws(() =>
    validateCompanyDocuments([{ ...textDocument, filename: "brief.exe" }]),
  );
  assert.throws(() =>
    validateCompanyDocuments([
      { ...textDocument, data: Buffer.from([0, 1, 2]).toString("base64") },
    ]),
  );
  assert.throws(() =>
    validateCompanyDocuments([
      { ...textDocument, data: Buffer.from([255, 254]).toString("base64") },
    ]),
  );
  assert.throws(() =>
    validateCompanyDocuments([
      { ...textDocument, mime: "image/png", filename: "brief.png" },
    ]),
  );
  assert.throws(() =>
    validateCompanyDocuments([
      { ...textDocument, mime: "application/pdf", filename: "brief.pdf" },
    ]),
  );
  const pdf = {
    filename: "brief.pdf",
    mime: "application/pdf",
    data: Buffer.from(
      "%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF",
    ).toString("base64"),
  };
  assert.equal(validateCompanyDocuments([pdf])[0].mime, "application/pdf");
  assert.throws(() =>
    validateCompanyDocuments([
      {
        ...pdf,
        data: Buffer.from("%PDF-1.7\n/JavaScript (bad)\n%%EOF").toString(
          "base64",
        ),
      },
    ]),
  );
  assert.throws(
    () =>
      validateCompanyDocuments([
        { ...textDocument, data: Buffer.alloc(300000, 65).toString("base64") },
        { ...textDocument, data: Buffer.alloc(300000, 65).toString("base64") },
      ]),
    { status: 413 },
  );
});
test("acknowledgements cannot imply acceptance, email delivery or the wrong product", () => {
  const ack = {
    kind: "consultancy",
    reference: "ENQ-123456ABCDEF",
    status: "received",
    externalDelivery: false,
    emailDelivery: "not_sent",
    receivedAt: new Date().toISOString(),
  };
  assert.equal(companyAcknowledgementSchema.safeParse(ack).success, true);
  for (const bad of [
    { externalDelivery: true },
    { status: "accepted" },
    { reference: "TRV-123456ABCDEF" },
    { emailDelivery: "sent" },
  ])
    assert.equal(
      companyAcknowledgementSchema.safeParse({ ...ack, ...bad }).success,
      false,
    );
});
test(
  "PostgreSQL company lead integration: duplicate submits, private attachments, MFA, concurrent updates and audit rollback",
  { skip: process.env.RUN_MERA_COMPANY_PG_TESTS !== "true", timeout: 120000 },
  async () => {
    const [
      { default: EmbeddedPostgres },
      { default: pg },
      { default: express },
      { default: cookieParser },
      { mkdtemp, rm, readFile },
      { tmpdir },
      { join },
      { createMeraRouter, migrateMera },
      { base32, totp, encryptFactor },
    ] = await Promise.all([
      import("embedded-postgres"),
      import("pg"),
      import("express"),
      import("cookie-parser"),
      import("node:fs/promises"),
      import("node:os"),
      import("node:path"),
      import("../server/mera/index.js"),
      import("../server/mera/platform.js"),
    ]);
    const directory = await mkdtemp(join(tmpdir(), "mera-company-test-"));
    const postgres = new EmbeddedPostgres({
      databaseDir: join(directory, "db"),
      user: "company_test",
      password: "IsolatedCompanyTestOnly",
      port: 55445,
      persistent: false,
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: () => {},
    });
    let pool, server;
    const oldKey = process.env.MERA_PLATFORM_MFA_KEY;
    try {
      await postgres.initialise();
      await postgres.start();
      pool = new pg.Pool({
        connectionString:
          "postgres://company_test:IsolatedCompanyTestOnly@127.0.0.1:55445/postgres",
      });
      const db = {
        query: (s, v) => pool.query(s, v),
        transaction: async (fn) => {
          const c = await pool.connect();
          try {
            await c.query("BEGIN");
            const result = await fn(c);
            await c.query("COMMIT");
            return result;
          } catch (e) {
            await c.query("ROLLBACK");
            throw e;
          } finally {
            c.release();
          }
        },
      };
      await db.query(
        await readFile(
          new URL("../server/schema.sql", import.meta.url),
          "utf8",
        ),
      );
      await migrateMera(db);
      await migrateMera(db);
      const operator = randomUUID(),
        owner = randomUUID(),
        token = randomBytes(24).toString("hex"),
        key = randomBytes(32),
        secret = base32(randomBytes(20));
      process.env.MERA_PLATFORM_MFA_KEY = key.toString("hex");
      for (const id of [operator, owner])
        await db.query(
          "INSERT INTO users(id,name,username,password_hash,role) VALUES($1,$2,$1,'unused-test-hash','cashier')",
          [
            id,
            id === operator
              ? "Synthetic platform operator"
              : "Organization owner",
          ],
        );
      await db.query(
        "INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP+INTERVAL '1 hour')",
        [hash(token), operator],
      );
      await db.query("INSERT INTO mera_platform_members(user_id) VALUES($1)", [
        operator,
      ]);
      await db.query(
        "INSERT INTO mera_platform_factors(user_id,secret_cipher) VALUES($1,$2)",
        [operator, encryptFactor(secret, key)],
      );
      const app = express();
      app.use(express.json({ limit: "1mb" }));
      app.use(cookieParser());
      app.use((req, res, next) => {
        if (req.get("x-test-user"))
          req.user = { id: req.get("x-test-user"), name: "Synthetic actor" };
        next();
      });
      app.use("/api/mera/v1", createMeraRouter(db));
      app.use((e, req, res, next) =>
        res.status(e.status || 500).json({ error: e.message }),
      );
      server = app.listen(0, "127.0.0.1");
      await new Promise((r) => server.once("listening", r));
      const root = "http://127.0.0.1:" + server.address().port + "/api/mera/v1",
        base = "/platform/company-leads";
      const call = async (
        path,
        method = "GET",
        body,
        user = null,
        extraHeaders = {},
      ) => {
        const response = await fetch(root + path, {
          method,
          headers: {
            "content-type": "application/json",
            ...extraHeaders,
            ...(user
              ? { "x-test-user": user, cookie: "pos_session=" + token }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        let data;
        try {
          data = JSON.parse(bytes.toString());
        } catch {
          data = null;
        }
        return {
          status: response.status,
          headers: response.headers,
          data,
          bytes,
        };
      };
      const input = enquiry();
      const submitted = await Promise.all([
        call("/public/company/enquiries", "POST", input),
        call("/public/company/enquiries", "POST", input),
      ]);
      assert.deepEqual(submitted.map((x) => x.status).sort(), [200, 201]);
      assert.deepEqual(submitted[0].data, submitted[1].data);
      assert.equal(
        companyAcknowledgementSchema.safeParse(submitted[0].data).success,
        true,
      );
      assert.equal(
        (
          await call("/public/company/enquiries", "POST", {
            ...input,
            problem: "A different project must not replace the first one.",
          })
        ).status,
        409,
      );
      const travel = await call("/public/company/travel-interest", "POST", {
        requestKey: randomUUID(),
        name: "Travel interest",
        email: "travel@example.invalid",
        privacyAcknowledged: true,
      });
      assert.equal(travel.status, 201);
      assert.equal(travel.data.kind, "travel_interest");
      assert.equal((await call(base)).status, 401);
      assert.equal((await call(base, "GET", null, owner)).status, 403);
      assert.equal((await call(base, "GET", null, operator)).status, 403);
      assert.equal(
        (
          await call(
            "/platform/auth/verify",
            "POST",
            { code: totp(secret, Math.floor(Date.now() / 30000)) },
            operator,
          )
        ).status,
        200,
      );
      const list = await call(
        base + "?kind=consultancy&search=Synthetic",
        "GET",
        null,
        operator,
      );
      assert.equal(list.status, 200);
      assert.equal(list.data.total, 1);
      assert.equal(list.data.items.length, 1);
      const id = list.data.items[0].id;
      assert.equal(
        (await call(base + "?limit=51", "GET", null, operator)).status,
        400,
      );
      assert.equal(
        (await call(base + "/handlers", "GET", null, operator)).data.handlers
          .length,
        1,
      );
      const detail = (await call(base + "/" + id, "GET", null, operator)).data;
      assert.equal(detail.data.problem, input.problem);
      assert.equal(detail.documents.length, 1);
      assert.equal(detail.payload_hash, undefined);
      assert.equal(detail.request_key, undefined);
      assert.equal(detail.documents[0].bytes, undefined);
      const path = base + "/" + id + "/documents/" + detail.documents[0].id;
      assert.equal((await call(path)).status, 401);
      assert.equal((await call(path, "GET", null, owner)).status, 403);
      const document = await call(path, "GET", null, operator);
      assert.equal(document.status, 200);
      assert.equal(document.bytes.toString(), "A synthetic project brief.");
      assert.match(document.headers.get("content-disposition"), /^attachment/);
      assert.equal(document.headers.get("cache-control"), "no-store");
      assert.equal(document.headers.get("x-content-type-options"), "nosniff");
      assert.equal(
        (
          await call(
            base + "/" + randomUUID() + "/documents/" + detail.documents[0].id,
            "GET",
            null,
            operator,
          )
        ).status,
        404,
      );
      const update = {
        requestKey: randomUUID(),
        expectedVersion: 1,
        status: "reviewing",
        assignedHandlerId: operator,
        internalNote: "Arrange a discovery conversation. No email sent.",
        followUp: {
          stage: "discovery",
          dueAt: null,
          summary: "Contact through an approved channel.",
        },
      };
      assert.equal(
        (
          await call(base + "/" + id, "PATCH", update, operator, {
            "X-Mera-Actor-Id": owner,
          })
        ).status,
        403,
      );
      const competing = {
        ...update,
        requestKey: randomUUID(),
        status: "discovery",
      };
      const updated = await Promise.all([
        call(base + "/" + id, "PATCH", update, operator),
        call(base + "/" + id, "PATCH", competing, operator),
      ]);
      assert.deepEqual(updated.map((x) => x.status).sort(), [200, 409]);
      const winner = updated[0].status === 200 ? update : competing;
      await assert.rejects(
        updateCompanyLead(
          db,
          { user: { id: owner } },
          id,
          winner,
          async () => {},
        ),
        { status: 403, code: "ACTOR_CHANGED" },
      );
      const retried = await call(base + "/" + id, "PATCH", winner, operator);
      assert.equal(retried.status, 200);
      assert.equal(retried.data.version, 2);
      assert.equal(
        (
          await call(
            base + "/" + id,
            "PATCH",
            { ...winner, internalNote: "Changed on retry" },
            operator,
          )
        ).status,
        409,
      );
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT COUNT(*) AS count FROM mera_company_lead_changes WHERE lead_id=$1",
              [id],
            )
          ).rows[0].count,
        ),
        1,
      );
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT COUNT(*) AS count FROM mera_platform_audit WHERE action='company_lead_updated'",
            )
          ).rows[0].count,
        ),
        1,
      );
      await assert.rejects(
        updateCompanyLead(
          db,
          { user: { id: operator } },
          id,
          {
            ...winner,
            requestKey: randomUUID(),
            expectedVersion: 2,
            status: "proposal",
          },
          async () => {
            throw new Error("Audit write failed");
          },
        ),
      );
      assert.equal(
        (
          await db.query("SELECT version FROM mera_company_leads WHERE id=$1", [
            id,
          ])
        ).rows[0].version,
        2,
      );
      assert.equal(
        (
          await call(
            base + "/" + id,
            "PATCH",
            {
              ...winner,
              requestKey: randomUUID(),
              expectedVersion: 2,
              assignedHandlerId: owner,
            },
            operator,
          )
        ).status,
        400,
      );
      await db.query(
        "UPDATE mera_platform_members SET active=false WHERE user_id=$1",
        [operator],
      );
      assert.equal((await call(path, "GET", null, operator)).status, 403);
      assert.equal((await call(base, "GET", null, operator)).status, 403);
      assert.equal(
        Number(
          (await db.query("SELECT COUNT(*) AS count FROM mera_company_leads"))
            .rows[0].count,
        ),
        2,
      );
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT COUNT(*) AS count FROM mera_company_documents",
            )
          ).rows[0].count,
        ),
        1,
      );
    } finally {
      if (server) await new Promise((r) => server.close(r));
      if (pool) await pool.end();
      await postgres.stop();
      await rm(directory, { recursive: true, force: true });
      if (oldKey === undefined) delete process.env.MERA_PLATFORM_MFA_KEY;
      else process.env.MERA_PLATFORM_MFA_KEY = oldKey;
    }
  },
);
