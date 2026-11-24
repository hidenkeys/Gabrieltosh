// Explicit hosted acceptance for the seven fictional portfolio organizations only.
// No signup/email, real payment provider, launch, settings change or deployment.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { buildVenuePortfolio } from "../server/mera/venue-portfolio.js";
import { availableNow, tradingDate } from "../server/mera/domain.js";
const origin = "https://mera-web-staging.up.railway.app";
const privateFile = "/private/tmp/mera-staging-venues-20261124.json";
const journalPath = "/private/tmp/mera-staging-venue-check-20261124.json";
const evidencePath = "docs/audit/venues-staging/api-checks.json";
assert.equal(
  process.argv[2],
  "--run",
  "Explicit --run required after both web and jobs are ready.",
);
const secrets = JSON.parse(await readFile(privateFile, "utf8"));
assert.equal(secrets.origin, origin);
const portfolio = buildVenuePortfolio();
const ids = new Set(portfolio.map((o) => o.id));
const states = new Map();
const evidence = {
  at: new Date().toISOString(),
  origin,
  checks: [],
  limitations: [
    "API checks do not replace browser verification.",
    "Service hours are preserved; closed-venue checkout is reported as blocked.",
    "Only synthetic manual payment records are created; no real funds or email.",
  ],
};
let journal = { origin, operations: {} };
try {
  journal = JSON.parse(await readFile(journalPath, "utf8"));
  assert.equal(journal.origin, origin);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
async function persist() {
  await writeFile(journalPath + ".tmp", JSON.stringify(journal, null, 2), {
    mode: 0o600,
  });
  await rename(journalPath + ".tmp", journalPath);
}
function add(venue, check, status = "passed", detail) {
  evidence.checks.push({ venue, check, status, ...(detail ? { detail } : {}) });
}
async function request(path, method = "GET", body, cookie) {
  assert(
    path === "/api/health" ||
      path === "/api/login" ||
      path === "/api/logout" ||
      path === "/api/mera/v1/context" ||
      path === "/api/mera/v1/platform" ||
      [...ids].some((id) =>
        path.startsWith(`/api/mera/v1/organizations/${id}/`),
      ),
    "Non-portfolio request refused",
  );
  const r = await fetch(origin + path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-pos-request": "1",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.match(r.headers.get("x-robots-tag") || "", /noindex/);
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie"),
  };
}
const ok = (r, status = 200) => {
  assert.equal(
    r.status,
    status,
    `Unexpected API status ${r.status}: ${r.data?.code || "no code"}`,
  );
  return r.data;
};
async function login(slug, role) {
  const credential = secrets.credentials.find(
    (c) => c.username === `${slug}.${role}@example.test`,
  );
  assert(credential);
  const r = await request("/api/login", "POST", credential);
  ok(r);
  assert.match(r.cookie, /HttpOnly/i);
  assert.match(r.cookie, /Secure/i);
  assert.match(r.cookie, /SameSite=Strict/i);
  return r.cookie.split(";")[0];
}
async function withRole(slug, role, fn) {
  const cookie = await login(slug, role);
  try {
    return await fn(cookie);
  } finally {
    ok(await request("/api/logout", "POST", {}, cookie));
  }
}
const B = (org, b) => `/api/mera/v1/organizations/${org.id}/branches/${b.id}`;
async function write(key, path, body, cookie, status = 200) {
  const prior = journal.operations[key];
  if (prior?.state === "complete") return prior.result;
  assert(
    !prior,
    `Previous ${key} outcome needs reconciliation; automatic replay refused.`,
  );
  journal.operations[key] = { state: "pending", path, body };
  await persist();
  const result = ok(await request(path, "POST", body, cookie), status);
  journal.operations[key] = {
    ...journal.operations[key],
    state: "complete",
    result,
  };
  await persist();
  return result;
}
async function inspectRoles() {
  for (const expected of portfolio) {
    await withRole(expected.slug, "owner", async (cookie) => {
      const context = ok(
        await request("/api/mera/v1/context", "GET", undefined, cookie),
      );
      assert.equal(context.demo, false);
      assert.equal(context.organizations.length, 1);
      const org = context.organizations[0];
      assert.equal(org.id, expected.id);
      assert.equal(org.role, "owner");
      assert.equal(org.onboarding.syntheticPortfolio, "portfolio-v1");
      assert.equal(org.branches.length, expected.branches.length);
      assert.equal(
        org.operating.inventoryMode,
        expected.operating.inventoryMode,
      );
      for (const branch of org.branches) {
        const source = expected.branches.find((b) => b.id === branch.id);
        assert(source);
        assert.equal(branch.settings.syntheticPortfolio, "portfolio-v1");
        assert.equal(branch.settings.venueType, source.settings.venueType);
        assert.deepEqual(
          branch.settings.capabilities,
          source.settings.capabilities,
        );
        assert.equal(branch.settings.code, source.code);
      }
      assert.equal(
        (await request("/api/mera/v1/platform", "GET", undefined, cookie))
          .status,
        403,
      );
      const overview = ok(
        await request(
          `/api/mera/v1/organizations/${org.id}/overview?preset=today`,
          "GET",
          undefined,
          cookie,
        ),
      );
      assert.equal(
        overview.branches.length,
        expected.branches.filter((b) => b.settings.role !== "stock_room")
          .length,
      );
      const foreign = portfolio.find((o) => o.id !== org.id);
      assert.equal(
        (
          await request(
            B(foreign, foreign.branches[0]) + "/workspace",
            "GET",
            undefined,
            cookie,
          )
        ).status,
        403,
      );
      states.set(expected.slug, { org, expected });
      add(
        expected.slug,
        "owner login, persisted venue/location configuration, overview and tenant/platform boundaries",
      );
    });
    await withRole(expected.slug, "cashier", async (cookie) => {
      const context = ok(
          await request("/api/mera/v1/context", "GET", undefined, cookie),
        ),
        org = context.organizations[0];
      assert.equal(org.id, expected.id);
      assert.equal(org.branches.length, 1);
      assert.equal(org.branches[0].id, expected.branches[0].id);
      ok(
        await request(
          B(expected, expected.branches[0]) + "/workspace",
          "GET",
          undefined,
          cookie,
        ),
      );
      assert.equal(
        (
          await request(
            `/api/mera/v1/organizations/${expected.id}/overview?preset=today`,
            "GET",
            undefined,
            cookie,
          )
        ).status,
        403,
      );
      if (expected.branches.length > 1)
        assert.equal(
          (
            await request(
              B(expected, expected.branches[1]) + "/workspace",
              "GET",
              undefined,
              cookie,
            )
          ).status,
          403,
        );
      add(
        expected.slug,
        "cashier permitted workspace and denied organization/other-location access",
      );
    });
  }
  await withRole("kerbside-grill", "branch_manager", async (cookie) => {
    const context = ok(
        await request("/api/mera/v1/context", "GET", undefined, cookie),
      ),
      org = context.organizations[0];
    assert.equal(org.branches.length, 2);
    assert.equal(
      org.branches.find((b) => b.settings.code === "SUR").role,
      "branch_manager",
    );
    assert.equal(
      org.branches.find((b) => b.settings.code === "LKI").role,
      "cashier",
    );
    assert(!org.branches.some((b) => b.settings.code === "IKJ"));
    add(
      "kerbside-grill",
      "manager per-location role downgrade and hidden third outlet",
    );
  });
}
async function door() {
  const { org } = states.get("pulse"),
    b = org.branches[0],
    path = B(org, b) + "/guest-list";
  await withRole("pulse", "owner", async (cookie) => {
    const entry = await write(
      "door-create",
      path,
      {
        requestKey: randomUUID(),
        name: "QA staging venue acceptance",
        partySize: 2,
        tradingDate: tradingDate(
          new Date().toISOString(),
          b.timezone,
          b.cutoff,
        ),
      },
      cookie,
      201,
    );
    const arrived = await write(
      "door-checkin",
      path + `/${entry.id}/check-in`,
      { requestKey: randomUUID(), version: entry.version, count: 1 },
      cookie,
    );
    assert.equal(arrived.arrivedCount, 1);
    const rows = ok(await request(path, "GET", undefined, cookie));
    assert(
      (Array.isArray(rows) ? rows : rows.entries).some(
        (e) => e.id === entry.id && e.arrivedCount === 1,
      ),
    );
    add("pulse", "synthetic door entry check-in persists");
  });
}
async function transfers() {
  const { org } = states.get("harbour-hotel"),
    central = org.branches.find((b) => b.settings.role === "stock_room"),
    outlet = org.branches.find((b) => b.settings.code === "RST"),
    path = `/api/mera/v1/organizations/${org.id}/stock-transfers`;
  await withRole(org.slug, "owner", async (cookie) => {
    const sent = await write(
      "transfer-send",
      path,
      {
        requestKey: randomUUID(),
        fromBranchId: central.id,
        toBranchId: outlet.id,
        lines: [{ code: "DRINK", quantity: 2 }],
        note: "QA staging venue acceptance",
      },
      cookie,
      201,
    );
    const received = await write(
      "transfer-receive",
      path + `/${sent.transfer.id}/receive`,
      { requestKey: randomUUID(), version: 1 },
      cookie,
    );
    assert.equal(received.transfer.status, "received");
    const pending = await write(
      "transfer-cancel-send",
      path,
      {
        requestKey: randomUUID(),
        fromBranchId: central.id,
        toBranchId: outlet.id,
        lines: [{ code: "DRINK", quantity: 1 }],
        note: "QA cancel acceptance",
      },
      cookie,
      201,
    );
    const cancelled = await write(
      "transfer-cancel",
      path + `/${pending.transfer.id}/cancel`,
      { requestKey: randomUUID(), version: 1 },
      cookie,
    );
    assert.equal(cancelled.transfer.status, "cancelled");
    add(
      org.slug,
      "synthetic central transfer send/receive and separate cancellation",
    );
  });
}
async function orders(slug, kind, method) {
  const { org } = states.get(slug),
    b = org.branches.find((b) => b.settings.role !== "stock_room"),
    path = B(org, b);
  await withRole(slug, "owner", async (cookie) => {
    let workspace = ok(
      await request(path + "/workspace", "GET", undefined, cookie),
    );
    if (
      !availableNow(
        b.settings.serviceHours,
        b.timezone,
        new Date(workspace.serverTime),
      )
    ) {
      add(
        slug,
        `${kind} order lifecycle`,
        "blocked",
        "Venue is outside configured service hours; settings unchanged.",
      );
      return;
    }
    const product = workspace.counterProducts.find(
      (p) =>
        (p.kind || "single") === kind &&
        !p.requiresTable &&
        p.available !== false,
    );
    assert(product, "Required published synthetic product missing");
    const choices = (product.choiceGroups || []).flatMap((g) =>
      g.options
        .slice(0, g.min)
        .map((p) => ({
          groupId: g.id,
          productId: p.productId,
          ...(p.variantId ? { variantId: p.variantId } : {}),
        })),
    );
    const tag = `${slug}-${kind}`,
      order = await write(
        tag + "-order",
        path + "/orders",
        {
          requestKey: randomUUID(),
          menuVersion: workspace.menuVersion,
          displayName: "QA staging venue acceptance",
          items: [
            {
              productId: product.id,
              quantity: 1,
              modifiers: [],
              ...(choices.length ? { choices } : {}),
            },
          ],
        },
        cookie,
        201,
      );
    await write(
      tag + "-payment",
      path + `/orders/${order.id}/payments`,
      {
        requestKey: randomUUID(),
        amount: order.total,
        method,
        ...(method === "room_charge" ? { reference: "102 Synthetic" } : {}),
      },
      cookie,
    );
    workspace = ok(
      await request(path + "/workspace", "GET", undefined, cookie),
    );
    let current = workspace.orders.find((o) => o.id === order.id);
    assert(current);
    await write(
      tag + "-accept",
      path + `/orders/${order.id}/status`,
      { status: "accepted", version: current.version },
      cookie,
    );
    workspace = ok(
      await request(path + "/workspace", "GET", undefined, cookie),
    );
    const tickets = workspace.tickets.filter((t) => t.orderId === order.id);
    assert(tickets.length);
    for (const ticket of tickets)
      await write(
        tag + "-ready-" + ticket.id,
        path + `/tickets/${ticket.id}/status`,
        { status: "ready", version: ticket.version },
        cookie,
      );
    workspace = ok(
      await request(path + "/workspace", "GET", undefined, cookie),
    );
    current = workspace.orders.find((o) => o.id === order.id);
    assert.equal(current.status, "ready");
    const collected = await write(
      tag + "-collect",
      path + `/orders/${order.id}/status`,
      { status: "collected", version: current.version },
      cookie,
    );
    const completed = await write(
      tag + "-complete",
      path + `/orders/${order.id}/status`,
      { status: "completed", version: collected.version },
      cookie,
    );
    assert.equal(completed.status, "completed");
    const overview = ok(
      await request(
        `/api/mera/v1/organizations/${org.id}/overview?preset=today`,
        "GET",
        undefined,
        cookie,
      ),
    );
    assert(
      overview.paymentMix.some(
        (p) => p.method === method && p.amount >= order.total,
      ),
    );
    add(
      slug,
      `${kind} order → manual ${method} record → all station tickets ready → collected → completed → report`,
    );
  });
}
try {
  ok(await request("/api/health"));
  await inspectRoles();
  await door();
  await transfers();
  await orders("kerbside-grill", "combo", "cash");
  await orders("oak-ember", "package", "cash");
  await orders("harbour-hotel", "single", "room_charge");
} catch (error) {
  evidence.failure = String(error.message).slice(0, 300);
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  await mkdir("docs/audit/venues-staging", { recursive: true });
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(
    JSON.stringify({
      checks: evidence.checks.length,
      passed: evidence.checks.filter((c) => c.status === "passed").length,
      blocked: evidence.checks.filter((c) => c.status === "blocked").length,
      failure: evidence.failure || null,
      evidencePath,
    }),
  );
}
