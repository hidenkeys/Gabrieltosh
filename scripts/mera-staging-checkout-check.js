// Explicit hosted acceptance for the seven fictional portfolio organizations only.
// Explicitly authorized temporary synthetic branch hours; always restore in finally.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { buildVenuePortfolio } from "../server/mera/venue-portfolio.js";
const origin = "https://mera-web-staging.up.railway.app";
const privateFile = "/private/tmp/mera-staging-venues-20261124.json";
const journalPath = "/private/tmp/mera-staging-checkout-check-20261124.json";
const evidencePath = "docs/audit/venues-staging/checkout-checks.json";
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
    "Three synthetic branches temporarily open for checks; original settings verified restored.",
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
assert.equal(
  Object.keys(journal.operations).length,
  0,
  "Existing checkout journal requires manual reconciliation; rerun refused before login or settings changes.",
);
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
async function write(key, path, body, cookie, status = 200, method = "POST") {
  const prior = journal.operations[key];
  if (prior?.state === "complete") return prior.result;
  assert(
    !prior,
    `Previous ${key} outcome needs reconciliation; automatic replay refused.`,
  );
  journal.operations[key] = { state: "pending", path, body };
  await persist();
  const response = await request(path, method, body, cookie);
  if (response.status !== status) {
    journal.operations[key].state = "rejected";
    journal.operations[key].status = response.status;
    journal.operations[key].code = response.data.code;
    await persist();
  }
  const result = ok(response, status);
  journal.operations[key] = {
    ...journal.operations[key],
    state: "complete",
    result,
  };
  await persist();
  return result;
}
async function orders(slug, kind, method) {
  const { org, branchId } = states.get(slug),
    b = org.branches.find((b) => b.id === branchId),
    path = B(org, b);
  await withRole(slug, "owner", async (cookie) => {
    let workspace = ok(
      await request(path + "/workspace", "GET", undefined, cookie),
    );
    const product = workspace.counterProducts.find(
      (p) =>
        (p.kind || "single") === kind &&
        !p.requiresTable &&
        p.available !== false,
    );
    assert(product, "Required published synthetic product missing");
    const choices = (product.choiceGroups || []).flatMap((g) =>
      g.options.slice(0, g.min).map((p) => ({
        groupId: g.id,
        productId: p.productId,
        ...(p.variantId ? { variantId: p.variantId } : {}),
      })),
    );
    const stockBefore = new Map(workspace.products.map((p) => [p.id, p.stock]));
    const components =
      kind === "package"
        ? product.components
        : kind === "combo"
          ? choices.map((c) => ({ productId: c.productId, quantity: 1 }))
          : [{ productId: product.id, quantity: 1 }];
    const overviewPath = `/api/mera/v1/organizations/${org.id}/overview?preset=today`;
    const reportBefore = ok(
      await request(overviewPath, "GET", undefined, cookie),
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
    workspace = ok(
      await request(path + "/workspace", "GET", undefined, cookie),
    );
    const deductions = components.map((c) => {
      const p = workspace.products.find((p) => p.id === c.productId);
      if (p.stockMode === "counted")
        assert.equal(p.stock, stockBefore.get(p.id) - c.quantity);
      return {
        code: p.code,
        quantity: c.quantity,
        stockBefore: stockBefore.get(p.id),
        stockAfter: p.stock,
      };
    });
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
    const amountFor = (r, m) =>
      r.paymentMix.find((p) => p.method === m)?.amount || 0;
    assert.equal(
      amountFor(overview, method) - amountFor(reportBefore, method),
      order.total,
    );
    if (method !== "room_charge")
      assert.equal(
        overview.totals.revenue - reportBefore.totals.revenue,
        order.total,
      );
    if (method === "room_charge")
      assert.equal(
        amountFor(overview, "cash"),
        amountFor(reportBefore, "cash"),
      );
    add(
      slug,
      `${kind} order → manual ${method} record → all station tickets ready → collected → completed → report`,
      "passed",
      {
        orderId: order.id,
        total: order.total,
        method,
        componentStock: deductions,
        reportPaymentDelta: order.total,
        roomChargeSeparated: method === "room_charge",
      },
    );
  });
}
async function currentBranch(orgId, branchId, cookie) {
  const context = ok(
    await request("/api/mera/v1/context", "GET", undefined, cookie),
  );
  assert.equal(context.demo, false);
  const org = context.organizations.find((o) => o.id === orgId);
  assert.equal(org.onboarding.syntheticPortfolio, "portfolio-v1");
  const branch = org.branches.find((b) => b.id === branchId);
  assert.equal(branch.settings.syntheticPortfolio, "portfolio-v1");
  return { org, branch };
}
async function checkedVenue(slug, kind, method) {
  const expected = portfolio.find((o) => o.slug === slug);
  assert(["kerbside-grill", "oak-ember", "harbour-hotel"].includes(slug));
  const branchId = expected.branches.find(
    (b) => b.settings.role !== "stock_room",
  ).id;
  await withRole(slug, "owner", async (cookie) => {
    let { org, branch } = await currentBranch(expected.id, branchId, cookie);
    states.set(slug, { org, expected, branchId });
    const key = slug + "-hours",
      path = B(org, branch) + "/settings";
    journal.snapshots ||= {};
    if (!journal.snapshots[slug]) {
      journal.snapshots[slug] = { branchId, settings: branch.settings };
      await persist();
    }
    const original = journal.snapshots[slug].settings;
    try {
      await write(
        key + "-open",
        path,
        {
          requestKey: randomUUID(),
          version: branch.settings.version || 1,
          serviceHours: [],
        },
        cookie,
        200,
        "PATCH",
      );
      ({ branch } = await currentBranch(org.id, branchId, cookie));
      assert.deepEqual(branch.settings.serviceHours, []);
      await orders(slug, kind, method);
    } finally {
      ({ branch } = await currentBranch(org.id, branchId, cookie));
      if (
        JSON.stringify(branch.settings.serviceHours) !==
        JSON.stringify(original.serviceHours)
      ) {
        await write(
          key + "-restore",
          path,
          {
            requestKey: randomUUID(),
            version: branch.settings.version || 1,
            serviceHours: original.serviceHours,
          },
          cookie,
          200,
          "PATCH",
        );
      }
      ({ branch } = await currentBranch(org.id, branchId, cookie));
      const withoutVersion = ({ version, ...rest }) => rest;
      assert.deepEqual(
        withoutVersion(branch.settings),
        withoutVersion(original),
      );
      add(
        slug,
        "Original service hours and every non-version settings field restored",
      );
    }
  });
}
try {
  ok(await request("/api/health"));
  for (const [slug, kind, method] of [
    ["kerbside-grill", "combo", "cash"],
    ["oak-ember", "package", "cash"],
    ["harbour-hotel", "single", "room_charge"],
  ]) {
    try {
      await checkedVenue(slug, kind, method);
    } catch (error) {
      add(
        slug,
        "checkout workflow",
        "failed",
        String(error.message).slice(0, 300),
      );
      process.exitCode = 1;
    }
  }
} finally {
  evidence.finishedAt = new Date().toISOString();
  await mkdir("docs/audit/venues-staging", { recursive: true });
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
}
