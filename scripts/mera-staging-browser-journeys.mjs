/** Operator-run, destructive synthetic transactions, never production.
 * No API business writes: only versioned service-hours PATCH is permitted.
 * All other mutations originate in rendered UI. Never replay a used journal.
 * Playwright traces, request bodies, cookies and credentials are never exported.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, open, rename } from "node:fs/promises";
import path from "node:path";
import {
  VENUE_PORTFOLIO,
  portfolioId,
} from "../server/mera/venue-portfolio.js";

const ORIGIN = process.env.ORIGIN || "https://mera-web-staging.up.railway.app";
assert.equal(
  ORIGIN,
  "https://mera-web-staging.up.railway.app",
  "Exact Railway staging origin required",
);
const runId =
  process.env.RUN_ID ||
  `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
assert.match(
  runId,
  /^[A-Za-z0-9-]{1,48}$/,
  "RUN_ID must be 1–48 letters, numbers or hyphens",
);
const marker = `E2E ${runId}`;
const journalPath = path.resolve(
  process.env.JOURNAL ||
    `/private/tmp/mera-staging-browser-journeys-${runId}.json`,
);
assert(
  journalPath.startsWith("/private/tmp/"),
  "JOURNAL must remain private under /private/tmp",
);
const output = path.resolve("docs/audit/venues-staging-e2e");
const allVenues = VENUE_PORTFOLIO.map(([slug]) => slug);
const flags = new Map();
for (const arg of process.argv.slice(2)) {
  assert.match(
    arg,
    /^--(only|open-hours)=/,
    "Supported flags: --only=<venues> --open-hours=<venues>",
  );
  const at = arg.indexOf("=");
  assert(!flags.has(arg.slice(2, at)), "Duplicate flag");
  flags.set(arg.slice(2, at), arg.slice(at + 1));
}
function selection(flag, fallback) {
  const values = flags.has(flag)
    ? flags.get(flag).split(",").filter(Boolean)
    : fallback;
  assert(
    values.every((slug) => allVenues.includes(slug)),
    `Unknown venue in --${flag}`,
  );
  return new Set(values);
}
const selected = selection("only", allVenues),
  openHours = selection("open-hours", []);
assert(selected.size, "At least one venue required");
assert(
  [...openHours].every((slug) => selected.has(slug)),
  "--open-hours must be a subset of --only",
);
const results = {
  runId,
  marker,
  origin: ORIGIN,
  startedAt: new Date().toISOString(),
  steps: [],
  venues: [],
};
const journal = {
  runId,
  marker,
  origin: ORIGIN,
  state: "started",
  snapshots: {},
  operations: [],
};
let browser,
  credentials = [],
  fatalRestore = false,
  claimed = false;
const contexts = new Set();
const require = createRequire(import.meta.url);
const bpath = (v, branch = v.branch) =>
  `/api/mera/v1/organizations/${v.org.id}/branches/${branch.id}`;
const money = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    n / 100,
  );
const safe = (error) => {
  // Playwright call logs can include fill arguments; export only the first line,
  // and redact every credential before writing any diagnostic to disk/output.
  let message = String(error?.message || error).split("\n")[0];
  for (const c of credentials)
    for (const value of [c.username, c.password])
      if (value) message = message.split(value).join("[redacted]");
  return message.slice(0, 400);
};
async function persist() {
  const temporary = journalPath + ".tmp-" + randomUUID();
  await writeFile(temporary, JSON.stringify(journal, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, journalPath);
}
async function evidence() {
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
}
async function shot(v, page, name, guest = false) {
  for (const width of guest ? [1440, 390] : [1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({
      path: path.join(output, `${runId}-${v.slug}-${name}-${width}.png`),
      fullPage: true,
      animations: "disabled",
      mask: [
        page.getByLabel("Password", { exact: true }),
        page.getByRole("textbox", { name: "Username", exact: true }),
        page.locator('[aria-label="Current party joining code"]'),
      ],
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
function record(v, name, pass, notes, error) {
  results.steps.push({
    venue: v.slug,
    step: name,
    pass,
    notes,
    ...(error ? { error: safe(error) } : {}),
  });
}
async function step(v, name, fn, page, guest = false) {
  const op = {
    venue: v.slug,
    step: name,
    state: "pending",
    at: new Date().toISOString(),
  };
  journal.operations.push(op);
  await persist(); // Before clicks: an interrupted/ambiguous step is never retried.
  try {
    const notes = await fn();
    const w = await workspace(v); // Authenticated read after EVERY step.
    assert.equal(w.branch.id, v.branch.id);
    assert.equal(w.branch.settings.syntheticPortfolio, "portfolio-v1");
    if (page)
      await shot(
        v,
        page,
        name.replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
        guest,
      );
    op.state = "passed";
    record(
      v,
      name,
      true,
      typeof notes === "string"
        ? notes
        : "UI action and authenticated server state verified.",
    );
  } catch (e) {
    op.state = "failed";
    record(
      v,
      name,
      false,
      "Journey stopped at this step; no automatic retry.",
      e,
    );
    if (page)
      try {
        await shot(v, page, "failed-" + journal.operations.length, guest);
      } catch {
        /* original failure retained */
      }
    throw e;
  } finally {
    await persist();
    await evidence();
  }
}
async function context() {
  const c = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    timezoneId: "Africa/Lagos",
  });
  contexts.add(c);
  await c.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === ORIGIN ? route.continue() : route.abort();
  });
  c.on("page", (p) => p.on("dialog", (dialog) => dialog.dismiss()));
  return c;
}
async function login(slug, role) {
  const c = credentials.find(
    (c) => c.username === `${slug}.${role}@example.test`,
  );
  assert(c, `Missing ${role} credential`);
  const ctx = await context(),
    p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  try {
    await p.goto(ORIGIN + "/mera/workspace");
    await p
      .getByRole("textbox", { name: "Username", exact: true })
      .fill(c.username);
    await p.getByLabel("Password", { exact: true }).fill(c.password);
    await p
      .getByRole("button", { name: "Open workspace", exact: true })
      .click();
    await p.getByRole("combobox", { name: "Location", exact: true }).waitFor();
    await p.locator(".mw-heading h1").waitFor();
    const signedIn = await api(p, "/api/mera/v1/context");
    assert.equal(signedIn.demo, false);
    const org = signedIn.organizations.find((o) => o.id === portfolioId(slug));
    assert.equal(org?.onboarding?.syntheticPortfolio, "portfolio-v1");
    assert(
      org.branches.every(
        (b) => b.settings.syntheticPortfolio === "portfolio-v1",
      ),
    );
  } catch {
    throw Error(
      `UI sign-in failed for ${slug}/${role}; private fields omitted`,
    );
  }
  return p;
}
async function api(
  page,
  endpoint,
  { method = "GET", body, status = 200 } = {},
) {
  assert(
    endpoint === "/api/mera/v1/context" ||
      allVenues.some((slug) =>
        endpoint.startsWith(`/api/mera/v1/organizations/${portfolioId(slug)}/`),
      ),
    "Only synthetic portfolio API paths permitted",
  );
  assert(
    method === "GET" ||
      (method === "PATCH" && /\/branches\/[^/]+\/settings$/.test(endpoint)),
    "Business API writes prohibited",
  );
  const url = new URL(endpoint, ORIGIN);
  assert.equal(url.origin, ORIGIN);
  const response = await page.context().request.fetch(url.href, {
    method,
    maxRedirects: 0,
    timeout: 30000,
    headers: { "x-pos-request": "1", origin: ORIGIN },
    ...(body ? { data: body } : {}),
  });
  assert.equal(
    response.status(),
    status,
    `API ${method} ${url.pathname} returned ${response.status()}`,
  );
  assert.match(
    response.headers()["x-robots-tag"] || "",
    /noindex/,
    "Staging noindex marker missing",
  );
  return status === 403 ? null : response.json();
}
async function current(v) {
  const data = await api(v.owner, "/api/mera/v1/context");
  assert.equal(data.demo, false);
  const org = data.organizations.find((o) => o.id === portfolioId(v.slug));
  assert(org, "Synthetic organization missing");
  assert.equal(org.slug, v.slug);
  assert.equal(org.onboarding.syntheticPortfolio, "portfolio-v1");
  const branch = org.branches.find((b) => b.id === v.branch.id);
  assert(branch, "Synthetic branch missing");
  assert.equal(branch.settings.syntheticPortfolio, "portfolio-v1");
  return { org, branch };
}
const workspace = (v, branch) => api(v.owner, bpath(v, branch) + "/workspace");
const overview = (v) =>
  api(v.owner, `/api/mera/v1/organizations/${v.org.id}/overview?preset=today`);
async function go(p, name) {
  const toggle = p.getByRole("button", { name: "Workspace menu", exact: true });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  )
    await toggle.click();
  const nav = p.getByRole("navigation", {
    name: "Organization workspace",
    exact: true,
  });
  const tab = nav.getByRole("tab", { name, exact: true });
  if (!(await tab.isVisible())) {
    const more = nav.getByRole("button", { name: "More", exact: true });
    if (
      (await more.isVisible()) &&
      (await more.getAttribute("aria-expanded")) !== "true"
    )
      await more.click();
  }
  await tab.click();
}
async function clickChip(radio) {
  await radio.click();
  assert.equal(
    await radio.getAttribute("aria-checked"),
    "true",
    "Chip must expose its selected state",
  );
}
async function choose(p, label, text) {
  const combo = p.getByRole("combobox", { name: label, exact: true });
  if (await combo.count()) {
    await combo.fill(text);
    await p.getByRole("option").filter({ hasText: text }).first().click();
  } else
    await clickChip(
      p
        .getByRole("group", { name: label, exact: true })
        .getByRole("radio", { name: text, exact: true }),
    );
}
async function location(p, code) {
  const box = p.getByRole("combobox", { name: "Location", exact: true });
  await box.fill(code);
  await p
    .getByRole("listbox", { name: "Location options", exact: true })
    .getByRole("option")
    .filter({ hasText: new RegExp(`\\b${code}\\b`) })
    .click();
  await p.locator(".mw-heading h1").waitFor();
}
async function mutate(p, suffix, action) {
  const response = p.waitForResponse((r) => {
    const u = new URL(r.url());
    return (
      u.origin === ORIGIN &&
      u.pathname.endsWith(suffix) &&
      ["POST", "PATCH"].includes(r.request().method())
    );
  });
  // Consume the waiter if the UI action fails; do not leave an unhandled rejection.
  response.catch(() => {});
  await action();
  const r = await response;
  assert(r.ok(), `UI ${suffix} returned HTTP ${r.status()}`);
  const data = await r.json();
  const pending = journal.operations.at(-1);
  if (pending?.state === "pending") {
    pending.receipts ||= [];
    pending.receipts.push({
      path: new URL(r.url()).pathname,
      status: r.status(),
      id:
        data.id ||
        data.order?.id ||
        data.ticket?.id ||
        data.transfer?.id ||
        data.payment?.id ||
        data.visit?.id ||
        null,
    });
    await persist();
  }
  return data; // Never persist raw responses (joining codes/session tokens).
}
async function configurePreparation(v) {
  if (
    !["oak-ember", "velvet-lounge", "pulse", "harbour-hotel"].includes(v.slug)
  )
    return;
  await step(
    v,
    "Owner configuration: allow preparation before full payment",
    async () => {
      const { branch } = await current(v);
      if (branch.settings.payLater === true)
        return "Configuration already enabled; no settings write.";
      const change = {
        venue: v.slug,
        branchId: branch.id,
        kind: "configuration-change",
        field: "payLater",
        before: branch.settings.payLater ?? false,
        after: true,
        permanent: true,
        state: "pending",
      };
      journal.configurationChanges ||= [];
      journal.configurationChanges.push(change);
      results.configurationChanges ||= [];
      results.configurationChanges.push(change);
      await persist();
      await evidence();
      const p = v.owner;
      await go(p, "Getting started");
      const all = p.getByRole("button", { name: "All settings", exact: true });
      if (await all.isVisible()) await all.click();
      const operations = p
        .locator("details.mw-setup-disclosure")
        .filter({ hasText: "Operations & appearance" });
      if (!(await operations.getAttribute("open")))
        await operations.locator("summary").click();
      const policies = p.getByRole("region", {
        name: "Operating settings",
        exact: true,
      });
      await policies
        .getByRole("button", { name: "4. Payments", exact: true })
        .click();
      const toggle = policies.getByRole("switch", {
        name: "Allow preparation before full payment",
        exact: true,
      });
      assert.equal(await toggle.isChecked(), false);
      await toggle.click();
      assert.equal(await toggle.isChecked(), true);
      await policies
        .getByRole("button", { name: "6. Review", exact: true })
        .click();
      await mutate(p, `/branches/${branch.id}/settings`, () =>
        policies
          .getByRole("button", { name: "Save branch policies", exact: true })
          .click(),
      );
      const updated = (await current(v)).branch;
      assert.equal(updated.settings.payLater, true);
      change.state = "verified";
      change.version = updated.settings.version;
      v.branch = updated;
      return "Permanent owner configuration change: payLater enabled through branch settings UI; it is not restored.";
    },
    v.owner,
  );
}
async function openForJourney(v) {
  const { branch } = await current(v);
  journal.snapshots[v.slug] = {
    branchId: branch.id,
    settings: structuredClone(branch.settings),
    authorized: openHours.has(v.slug),
    state: "saved",
  };
  await persist();
  if (!openHours.has(v.slug)) return;
  journal.snapshots[v.slug].state = "opening";
  await persist();
  await api(v.owner, bpath(v) + "/settings", {
    method: "PATCH",
    body: {
      requestKey: randomUUID(),
      version: branch.settings.version || 1,
      serviceHours: [],
    },
  });
  assert.deepEqual((await current(v)).branch.settings.serviceHours, []);
  journal.snapshots[v.slug].state = "opened";
  await persist();
}
async function restore(v) {
  const saved = journal.snapshots[v.slug];
  if (!saved?.authorized) return;
  try {
    saved.state = "restoring";
    await persist();
    let { branch } = await current(v);
    if (
      JSON.stringify(branch.settings.serviceHours) !==
      JSON.stringify(saved.settings.serviceHours)
    )
      await api(v.owner, bpath(v) + "/settings", {
        method: "PATCH",
        body: {
          requestKey: randomUUID(),
          version: branch.settings.version || 1,
          serviceHours: saved.settings.serviceHours,
        },
      });
    ({ branch } = await current(v));
    const withoutVersion = ({ version, ...rest }) => rest;
    assert.deepEqual(
      withoutVersion(branch.settings),
      withoutVersion(saved.settings),
    );
    saved.state = "restored-verified";
    record(
      v,
      "Restore original settings",
      true,
      "Every non-version field matches the private snapshot.",
    );
  } catch (e) {
    fatalRestore = true;
    saved.state = "RESTORATION_FAILED";
    record(
      v,
      "Restore original settings",
      false,
      "STOP: reconcile private journal before any further journey.",
      e,
    );
  } finally {
    await persist();
    await evidence();
  }
}
async function guest(v, table) {
  const p = await (await context()).newPage();
  p.setDefaultTimeout(20000);
  await p.goto(
    `${ORIGIN}/mera/menu/${v.slug}/${v.branch.id}${table ? `?tableId=${encodeURIComponent(table.id)}` : ""}`,
  );
  await p.getByRole("region", { name: "Products", exact: true }).waitFor();
  return p;
}
const tracked = (v, w) => w.orders.filter((o) => v.orderIds.includes(o.id));
async function newOrder(v, p, suffix, action, expectedProducts) {
  const before = await workspace(v);
  const response = await mutate(p, suffix, action);
  const w = await workspace(v);
  const added = w.orders.filter(
    (o) => !before.orders.some((old) => old.id === o.id),
  );
  assert.equal(added.length, 1, "Exactly one new order must persist");
  const order = added[0];
  assert(
    (order.displayName || "").includes(marker),
    "New guest name must contain run marker",
  );
  assert(order.total > 0);
  v.orderIds.push(order.id);
  // Expected component quantities come from the catalog that the UI uses.
  const deductions = new Map();
  for (const { product, quantity = 1, choices = [] } of expectedProducts) {
    const components =
      product.kind === "package"
        ? product.components
        : product.kind === "combo"
          ? choices.map((c) => ({ productId: c.productId, quantity: 1 }))
          : [{ productId: product.id, quantity: 1 }];
    for (const part of components)
      deductions.set(
        part.productId,
        (deductions.get(part.productId) || 0) + part.quantity * quantity,
      );
  }
  for (const [id, q] of deductions) {
    const a = before.products.find((p) => p.id === id),
      b = w.products.find((p) => p.id === id);
    assert(a && b, "Component stock record missing");
    if (a.stockMode === "counted")
      assert.equal(b.stock, a.stock - q, `Component stock delta ${a.code}`);
  }
  assert(response, "UI order response missing");
  return order;
}
function product(w, code) {
  const p = w.counterProducts.find((p) => p.code === code);
  assert(p && p.available !== false, `Published ${code} product unavailable`);
  return p;
}
async function guestOrder(v, p, code = "MAIN") {
  const w = await workspace(v),
    item = product(w, code),
    choices = [];
  await p
    .getByRole("button", { name: `Choose: ${item.name}`, exact: true })
    .click();
  const dialog = p.getByRole("dialog"),
    add = dialog.getByRole("button", { name: "Add to basket", exact: true });
  let estimate = item.price;
  if (item.kind === "combo") {
    assert(await add.isDisabled(), "Combo minimum must block empty selection");
    for (const g of item.choiceGroups) {
      const group = dialog.getByRole("group", {
        name: `${g.name} · choose ${g.min}–${g.max}`,
        exact: true,
      });
      assert.equal(g.min, 1);
      assert.equal(g.max, 1);
      await group.getByRole("checkbox").first().check();
      assert.equal(
        await group.getByRole("checkbox", { checked: true }).count(),
        1,
      );
      for (const box of await group
        .getByRole("checkbox", { checked: false })
        .all())
        assert(await box.isDisabled(), "Maximum must disable extra choices");
      const choice = g.options[0];
      choices.push(choice);
      estimate += choice.priceDelta || 0;
    }
    const first = dialog
      .getByRole("group", { name: "Main · choose 1–1", exact: true })
      .getByRole("checkbox")
      .first();
    await first.uncheck();
    assert(await add.isDisabled());
    await first.check();
  }
  assert(
    (await dialog.locator("footer").innerText()).includes(money(estimate)),
    "Live item estimate differs from selected choices",
  );
  await shot(v, p, "guest-selection-" + code, true);
  await add.click();
  const basket = p.getByRole("button", { name: /^View basket,/ });
  if (await basket.isVisible()) await basket.click();
  await p.getByLabel("What should we call you?", { exact: true }).fill(marker);
  const review = p.getByRole("button", { name: "Review total", exact: true });
  if (await review.isVisible()) await mutate(p, "/quote", () => review.click());
  await shot(v, p, "guest-review-" + code, true);
  return newOrder(
    v,
    p,
    "/orders",
    () => p.getByRole("button", { name: "Submit order", exact: true }).click(),
    [{ product: item, choices }],
  );
}
async function pos(v, p, codes, visit) {
  await go(p, "Point of sale");
  if (visit) {
    await choose(p, "Fulfillment", "Table service");
    await choose(p, "Open table visit", marker);
  }
  const details = p.locator(".mw-pos-context-extra");
  if (!(await details.getAttribute("open")))
    await details.locator("summary").click();
  await p.getByLabel("Customer name (optional)", { exact: true }).fill(marker);
  await p
    .getByLabel("Order note", { exact: true })
    .fill(marker + " fictional round");
  const w = await workspace(v),
    products = codes.map((code) => product(w, code));
  for (const item of products) {
    await p
      .getByRole("button", { name: `Add ${item.name} to order`, exact: true })
      .click();
    if (item.kind === "package")
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Add to order", exact: true })
        .click();
  }
  await mutate(p, "/quote", () =>
    p
      .getByRole("button", { name: "Review current order total", exact: true })
      .click(),
  );
  return newOrder(
    v,
    p,
    "/orders",
    () => p.getByRole("button", { name: "Submit order", exact: true }).click(),
    products.map((product) => ({ product })),
  );
}
async function payOrder(v, p, order, method = "cash") {
  await go(p, "Transactions");
  await choose(p, "Order", order.reference);
  await choose(
    p,
    "Payment origin",
    method === "room_charge" ? "Charge to room" : "Cash",
  );
  await clickChip(
    p
      .getByRole("group", { name: "Quick amount", exact: true })
      .getByRole("radio", {
        name: method === "cash" ? /^Next ₦1,000/ : "Exact amount",
      }),
  );
  if (method === "cash") {
    const amount = Number(
      await p
        .getByLabel("Amount received (naira)", { exact: true })
        .inputValue(),
    );
    const tender = Number(
      await p
        .getByLabel("Cash handed over (naira, optional)", { exact: true })
        .inputValue(),
    );
    assert(tender > amount);
    assert(
      (await p.getByText("Change due", { exact: false }).innerText()).includes(
        money(Math.round((tender - amount) * 100)),
      ),
    );
  } else {
    await p.getByLabel("Room number", { exact: true }).fill("102");
    await p.getByLabel("Guest surname", { exact: true }).fill("Fable");
  }
  await p
    .getByLabel("Receipt / transfer reference", { exact: true })
    .fill(marker);
  await mutate(p, `/orders/${order.id}/payments`, () =>
    p
      .getByRole("button", { name: "Record verified collection", exact: true })
      .click(),
  );
  const w = await workspace(v),
    current = w.orders.find((o) => o.id === order.id);
  assert.equal(current.paymentStatus, "paid");
  assert(
    w.payments.some(
      (p) =>
        p.orderId === order.id &&
        p.method === method &&
        p.amount === order.total,
    ),
  );
  if (method === "room_charge") {
    const row = p
      .locator(".mw-financial-records tr")
      .filter({ hasText: order.reference });
    await row.getByText("Charged to room", { exact: true }).waitFor();
    assert.equal(
      w.payments.find((x) => x.orderId === order.id && x.method === method)
        .reference,
      "102 Fable",
    );
  }
}
async function prepare(v) {
  await go(v.owner, "Orders");
  for (const order of tracked(v, await workspace(v)).filter(
    (o) => o.status === "submitted",
  )) {
    const card = v.owner.getByRole("article", {
      name: `Order ${order.reference}`,
      exact: true,
    });
    await mutate(v.owner, `/orders/${order.id}/status`, () =>
      card.getByRole("button", { name: "Mark accepted", exact: true }).click(),
    );
    assert.equal(
      (await workspace(v)).orders.find((o) => o.id === order.id).status,
      "accepted",
    );
  }
  for (const station of ["kitchen", "bar"]) {
    const w = await workspace(v),
      tickets = w.tickets.filter(
        (t) =>
          v.orderIds.includes(t.orderId) &&
          t.station === station &&
          !["ready", "cancelled"].includes(t.status),
      );
    if (!tickets.length) continue;
    // Station accounts are scoped to RST; owner operates POL's preparation UI.
    const p =
      v.slug === "harbour-hotel" ? v.owner : await login(v.slug, station);
    await location(p, v.code);
    await go(p, "Preparation");
    if (v.slug === "harbour-hotel")
      await choose(p, "Preparation station", station);
    for (const t of tickets) {
      const o = w.orders.find((o) => o.id === t.orderId);
      const card = p.getByRole("article").filter({ hasText: o.reference });
      if (t.status === "queued")
        await mutate(p, `/tickets/${t.id}/status`, () =>
          card
            .getByRole("button", { name: "Start preparing", exact: true })
            .click(),
        );
      await mutate(p, `/tickets/${t.id}/status`, () =>
        card.getByRole("button", { name: "Mark ready", exact: true }).click(),
      );
      assert.equal(
        (await workspace(v)).tickets.find((x) => x.id === t.id).status,
        "ready",
      );
    }
    await shot(v, p, station + "-ready");
  }
  assert(
    tracked(v, await workspace(v)).every((o) => o.status === "ready"),
    "All station tickets must make the orders ready",
  );
}
async function complete(v, p) {
  await go(p, "Orders");
  for (const o of tracked(v, await workspace(v))) {
    const card = p.getByRole("article", {
      name: `Order ${o.reference}`,
      exact: true,
    });
    await mutate(p, `/orders/${o.id}/status`, () =>
      card.getByRole("button", { name: "Mark collected", exact: true }).click(),
    );
    assert.equal(
      (await workspace(v)).orders.find((x) => x.id === o.id).status,
      "collected",
    );
    await mutate(p, `/orders/${o.id}/status`, () =>
      card.getByRole("button", { name: "Mark completed", exact: true }).click(),
    );
    assert.equal(
      (await workspace(v)).orders.find((x) => x.id === o.id).status,
      "completed",
    );
  }
}
const partyCard = (p) =>
  p
    .locator(".mw-party-card")
    .filter({ has: p.getByRole("heading", { name: marker, exact: true }) });
async function openVisit(v, p) {
  const w = await workspace(v),
    table = w.tables.find(
      (t) =>
        t.status === "available" &&
        !w.visits.some(
          (x) =>
            x.status === "open" && (x.tableIds || [x.tableId]).includes(t.id),
        ),
    );
  assert(
    table,
    "No available synthetic table; existing parties will not be changed",
  );
  v.table = table;
  await go(p, "Tables & visits");
  const disclosure = p
    .locator("details")
    .filter({
      has: p.locator("summary").filter({ hasText: /^Open a table visit$/ }),
    });
  if (!(await disclosure.getAttribute("open")))
    await disclosure.locator("summary").click();
  const form = p.getByRole("form", { name: "Open table visit", exact: true });
  await choose(form, "Table", table.name);
  await form.getByLabel("Guest display name", { exact: true }).fill(marker);
  const ack = form.getByRole("checkbox");
  if (await ack.count()) await ack.check();
  const stepper = form.getByRole("spinbutton", {
    name: "Party size",
    exact: true,
  });
  const initialPartySize = Number(await stepper.inputValue());
  if (v.slug === "oak-ember")
    await form
      .getByRole("button", { name: "Increase Party size", exact: true })
      .click();
  const expectedPartySize = initialPartySize + (v.slug === "oak-ember" ? 1 : 0);
  const response = await mutate(p, "/visits", () =>
    form.getByRole("button", { name: "Open visit", exact: true }).click(),
  );
  const visit = (await workspace(v)).visits.find(
    (x) => x.displayName === marker,
  );
  assert(visit && visit.status === "open");
  assert.equal(visit.partySize, expectedPartySize);
  v.visit = visit;
  // Read the joining code from the actual UI only, and keep it out of evidence.
  if (response.joiningCode) {
    await p
      .getByRole("button", { name: "Show private joining code", exact: true })
      .click();
    v.joinCode = await p
      .locator('[aria-label="Current party joining code"]')
      .innerText();
    await p
      .getByRole("button", { name: "Hide private joining code", exact: true })
      .click();
  }
  return visit;
}
async function minimumProgress(v, p) {
  if (!v.visit.minimumSpendPolicy?.enabled)
    return "No minimum-spend policy configured on this visit.";
  await go(p, "Tables & visits");
  const card = partyCard(p),
    disclosure = card
      .locator("details")
      .filter({
        has: p
          .locator("summary")
          .filter({ hasText: /^Minimum-spend commitment$/ }),
      });
  if (!(await disclosure.getAttribute("open")))
    await disclosure.locator("summary").click();
  await card.getByText(/Commitment shortfall:/).waitFor();
  const state = await api(
    v.owner,
    bpath(v) + `/visits/${v.visit.id}/minimum-spend`,
  );
  assert.equal(state.summary.target, v.visit.minimumSpendPolicy.amount);
  assert((await card.innerText()).includes(money(state.summary.shortfall)));
}
async function chooseBill(p, name) {
  const combo = p.getByRole("combobox", {
    name: "Bill to manage",
    exact: true,
  });
  await combo.fill(name);
  const option = p
    .getByRole("option")
    .filter({ hasText: name })
    .filter({ hasText: marker });
  await option.first().waitFor();
  assert.equal(
    await option.count(),
    1,
    "Bill selection must identify this run’s party uniquely",
  );
  await option.click();
}
async function settleBills(v, p, split = false) {
  await go(p, "Tables & visits");
  await p.getByRole("button", { name: "Manage bills", exact: true }).click();
  let bills = (await workspace(v)).bills.filter(
    (b) => b.visitId === v.visit.id && b.status === "open",
  );
  assert.equal(bills.length, 1, "One original open bill expected");
  if (split) {
    const original = bills[0];
    await chooseBill(p, original.name);
    await p.getByText("Split this bill", { exact: true }).click();
    await p
      .getByLabel("New bill name", { exact: true })
      .fill(marker + " part two");
    await choose(p, "Split by", "Outstanding amount");
    await p
      .getByLabel("Amount to move (naira)", { exact: true })
      .fill(String(Math.floor(original.balance / 2) / 100));
    await mutate(p, `/bills/${original.id}/split`, () =>
      p.getByRole("button", { name: "Split bill", exact: true }).click(),
    );
    bills = (await workspace(v)).bills.filter(
      (b) => b.visitId === v.visit.id && b.status === "open",
    );
    assert.equal(bills.length, 2);
    assert.equal(
      bills.reduce((n, b) => n + b.balance, 0),
      original.balance,
    );
  }
  for (const [i, bill] of bills.entries()) {
    await chooseBill(p, bill.name);
    const disclosure = p
      .locator(".mw-bills details")
      .filter({
        has: p
          .locator("summary")
          .filter({ hasText: /^Record money received$/ }),
      });
    if (!(await disclosure.getAttribute("open")))
      await disclosure.locator("summary").click();
    await p
      .getByLabel("Amount received (naira)", { exact: true })
      .fill(String(bill.balance / 100));
    const method = split && i === 1 ? "external_pos" : "cash";
    await choose(p, "Method", method === "cash" ? "Cash" : "External POS");
    await p.getByLabel("Verified reference", { exact: true }).fill(marker);
    await mutate(p, `/bills/${bill.id}/payments`, () =>
      p
        .getByRole("button", { name: "Record bill collection", exact: true })
        .click(),
    );
    const w = await workspace(v);
    assert.equal(w.bills.find((b) => b.id === bill.id).balance, 0);
    assert(
      w.payments.some(
        (x) =>
          x.billId === bill.id &&
          x.method === method &&
          x.amount === bill.balance,
      ),
      "Manual payment must persist",
    );
  }
}
async function closeVisit(v, p) {
  await go(p, "Tables & visits");
  await p
    .getByRole("button", { name: "Tables & parties", exact: true })
    .click();
  const card = partyCard(p);
  await card.getByText("Close this visit", { exact: true }).click();
  await mutate(p, `/visits/${v.visit.id}/close`, () =>
    card.getByRole("button", { name: "Close visit", exact: true }).click(),
  );
  assert.equal(
    (await workspace(v)).visits.find((x) => x.id === v.visit.id).status,
    "closed",
  );
}
async function joinGuest(v, p) {
  assert(
    v.joinCode && v.joinCode !== "••••••",
    "A current joining code must have been read from the UI",
  );
  await p.getByRole("button", { name: "Join a table", exact: true }).click();
  await p.getByLabel("Your name", { exact: true }).fill(marker);
  await choose(p, "Table", v.table.name);
  await p.getByLabel("Joining code", { exact: true }).fill(v.joinCode);
  const join = p.getByRole("button", {
    name: "Join current visit",
    exact: true,
  });
  await join.click();
  const ack = p.getByRole("checkbox", {
    name: "I acknowledge this visit’s minimum-spend policy",
    exact: true,
  });
  await Promise.race([
    ack.waitFor(),
    p
      .getByRole("heading", { name: "Your table & bill", exact: true })
      .waitFor(),
  ]);
  if (await ack.isVisible()) {
    await ack.check();
    await join.click();
  }
  await p
    .getByRole("heading", { name: "Your table & bill", exact: true })
    .waitFor();
  await p.getByRole("button", { name: "Menu", exact: true }).click();
}
async function reservation(v, p) {
  await p.getByRole("button", { name: "Reserve a table", exact: true }).click();
  await p.getByLabel("Your name", { exact: true }).fill(marker);
  await p
    .getByLabel("Contact email or phone", { exact: true })
    .fill(`e2e-${runId.toLowerCase()}@example.test`);
  await p
    .getByRole("button", { name: "Increase Party size", exact: true })
    .click();
  assert.equal(
    await p
      .getByRole("spinbutton", { name: "Party size", exact: true })
      .inputValue(),
    "3",
  );
  // Day 6 stays beyond a 24h cancellation cutoff; time chosen through chips.
  await clickChip(
    p
      .getByRole("group", { name: "Date & time day", exact: true })
      .getByRole("radio")
      .nth(5),
  );
  await clickChip(
    p
      .getByRole("group", { name: "Date & time time", exact: true })
      .getByRole("radio")
      .first(),
  );
  const preferred = p.getByRole("combobox", {
    name: "Preferred table (optional)",
    exact: true,
  });
  if (await preferred.count())
    await choose(
      p,
      "Preferred table (optional)",
      v.slug === "pulse" ? "VIP 1" : "Table 1",
    );
  await p.getByText("Add a reservation note", { exact: true }).click();
  await p
    .getByLabel("Notes", { exact: true })
    .fill(marker + " fictional booking");
  const ack = p.getByRole("checkbox", {
    name: "I acknowledge this minimum-spend policy",
    exact: true,
  });
  if (await ack.count()) await ack.check();
  await mutate(p, "/reservations", () =>
    p.getByRole("button", { name: "Request reservation", exact: true }).click(),
  );
  const r = (await workspace(v)).reservations.find(
    (r) => r.displayName === marker,
  );
  assert(r && r.status === "requested");
  assert.equal(r.partySize, 3);
  const cutoff =
    r.depositPolicy?.cancellationCutoffHours ||
    v.branch.settings.depositPolicy?.cancellationCutoffHours ||
    24;
  assert(
    Date.parse(r.startsAt) - Date.now() > cutoff * 3600000,
    "Booking must be before cancellation cutoff",
  );
  v.reservation = r;
}
const reservationCard = (p) =>
  p
    .locator(".mw-reservation-record")
    .filter({ has: p.getByRole("heading", { name: marker, exact: true }) });
async function reports(v) {
  const after = await overview(v),
    w = await workspace(v),
    orders = tracked(v, w);
  assert.equal(orders.length, v.orderIds.length);
  const amountFor = (r, method) =>
    r.paymentMix.find((p) => p.method === method)?.amount || 0;
  const payments = [
    ...w.payments.filter((p) => !v.beforePaymentIds.has(p.id)),
    ...w.deposits.filter((p) => !v.beforeDepositIds.has(p.id)),
  ];
  for (const method of new Set(payments.map((p) => p.method)))
    assert.equal(
      amountFor(after, method) - amountFor(v.reportBefore, method),
      payments
        .filter((p) => p.method === method)
        .reduce((n, p) => n + p.amount, 0),
      `Exact ${method} report delta`,
    );
  assert.equal(
    after.totals.orders - v.reportBefore.totals.orders,
    orders.length,
    "Exact Today order-count delta",
  );
  assert.equal(
    after.totals.revenue - v.reportBefore.totals.revenue,
    orders
      .filter((o) => o.collectedAt || o.completedAt)
      .reduce((n, o) => n + (o.recognitionTotal ?? o.total), 0),
    "Exact Today net-sales delta",
  );
  if (v.visit?.minimumSpendPolicy?.enabled) {
    const minimum = await api(
      v.owner,
      bpath(v) + `/visits/${v.visit.id}/minimum-spend`,
    );
    assert.equal(
      minimum.summary.shortfall,
      0,
      "Settled visit must reach minimum spend without waiver",
    );
  }
  if (v.slug === "kerbside-grill") {
    await go(v.owner, "All locations");
    await clickChip(v.owner.getByRole("radio", { name: "Today", exact: true }));
    const totals = v.owner.locator(".mw-location-totals dd");
    await totals.first().waitFor();
    assert.equal(
      Number((await totals.nth(1).innerText()).replace(/[^\d.-]/g, "")),
      after.totals.orders,
    );
    await shot(v, v.owner, "all-locations-today");
  }
}
async function transfer(v) {
  const branches = v.org.branches,
    from = branches.find((b) => b.settings.code === "CST"),
    to = branches.find((b) => b.settings.code === "RST");
  assert(from && to);
  assert.equal(from.settings.syntheticPortfolio, "portfolio-v1");
  assert.equal(to.settings.syntheticPortfolio, "portfolio-v1");
  const beforeFrom = await workspace(v, from),
    beforeTo = await workspace(v, to);
  const item = beforeFrom.products.find(
    (p) =>
      p.stockMode === "counted" &&
      p.stock >= 1 &&
      beforeTo.products.some((x) => x.code === p.code),
  );
  assert(item);
  const p = await login(v.slug, "central_stock");
  await location(p, "CST");
  await go(p, "Stock transfers");
  await choose(p, "From location", "CST");
  await choose(p, "To location", "RST");
  await choose(p, "Item 1", item.name);
  assert.equal(
    await p
      .getByRole("spinbutton", { name: "Quantity 1", exact: true })
      .inputValue(),
    "1",
  );
  await p.getByLabel("Note (optional)", { exact: true }).fill(marker);
  const sent = await mutate(p, "/stock-transfers", () =>
    p.getByRole("button", { name: "Send transfer", exact: true }).click(),
  );
  const id = sent.id || sent.transfer?.id;
  assert(id, "Transfer ID missing");
  const endpoint = `/api/mera/v1/organizations/${v.org.id}/stock-transfers`;
  const rows = (data) => (Array.isArray(data) ? data : data.transfers);
  let transfers = rows(await api(v.owner, endpoint));
  assert.equal(transfers.find((x) => x.id === id).status, "sent");
  assert.equal(
    (await workspace(v, from)).products.find((p) => p.id === item.id).stock,
    item.stock - 1,
  );
  const receiver = await login(v.slug, "branch_manager");
  await location(receiver, "RST");
  await go(receiver, "Stock transfers");
  // The rendered article does not show the note/ID: identify exactly one article
  // by the new transfer's item and route, refusing ambiguous existing transfers.
  const card = receiver
    .locator(".mw-stock-transfers article")
    .filter({
      has: receiver.getByRole("heading", {
        name: `${from.name} → ${to.name}`,
        exact: true,
      }),
    })
    .filter({ hasText: `${item.name} · 1 sent` })
    .filter({
      has: receiver.getByRole("button", {
        name: "Receive transfer",
        exact: true,
      }),
    });
  await card.first().waitFor();
  assert.equal(
    await card.count(),
    1,
    "Ambiguous sent transfer UI; reconcile manually rather than receive another record",
  );
  await mutate(receiver, `/stock-transfers/${id}/receive`, () =>
    card.getByRole("button", { name: "Receive transfer", exact: true }).click(),
  );
  transfers = rows(await api(v.owner, endpoint));
  assert.equal(transfers.find((x) => x.id === id).status, "received");
  const target = beforeTo.products.find((p) => p.code === item.code);
  assert.equal(
    (await workspace(v, to)).products.find((p) => p.id === target.id).stock,
    target.stock + 1,
  );
  await shot(v, receiver, "transfer-received");
}
async function journey(v) {
  const p = await login(v.slug, v.slug === "oak-ember" ? "waiter" : "cashier");
  // Hotel cashier is RST-scoped in the portfolio; POL payment requires owner.
  const staff = v.slug === "harbour-hotel" ? v.owner : p;
  if (v.slug !== "harbour-hotel") await location(p, v.code);
  const guestPage = [
    "kerbside-grill",
    "harbour-hotel",
    "daybreak-afterdark",
    "saffron-room",
    "pulse",
  ].includes(v.slug)
    ? await guest(v)
    : null;
  if (["kerbside-grill", "harbour-hotel"].includes(v.slug)) {
    let order;
    await step(
      v,
      "Guest QR order and component stock",
      async () => {
        order = await guestOrder(
          v,
          guestPage,
          v.slug === "kerbside-grill" ? "COMBO" : "MAIN",
        );
      },
      guestPage,
      true,
    );
    await step(
      v,
      "Manual collection and tender or room label",
      () =>
        payOrder(
          v,
          staff,
          order,
          v.slug === "harbour-hotel" ? "room_charge" : "cash",
        ),
      staff,
    );
    await step(v, "Kitchen and bar preparation", () => prepare(v), staff);
    await step(v, "Collected and completed", () => complete(v, staff), staff);
    if (v.slug === "kerbside-grill")
      await step(
        v,
        "Cashier LKI access denied",
        async () => {
          await p
            .getByRole("combobox", { name: "Location", exact: true })
            .fill("LKI");
          assert.equal(await p.getByRole("option").count(), 0);
          await p.keyboard.press("Escape");
          const lki = v.org.branches.find((b) => b.settings.code === "LKI");
          await api(p, bpath(v, lki) + "/orders", { status: 403 });
        },
        p,
      );
    else
      await step(
        v,
        "CST to RST one-unit transfer and manager receipt",
        () => transfer(v),
        v.owner,
      );
  } else if (["saffron-room", "pulse"].includes(v.slug)) {
    await step(
      v,
      "Guest future reservation day and time chips",
      () => reservation(v, guestPage),
      guestPage,
      true,
    );
    const front = await login(v.slug, "front_desk");
    await location(front, v.code);
    // Front desk lacks payments.record; the owner records the manual deposit in
    // the same UI, while front desk performs confirmation and seating below.
    await step(
      v,
      "Manual deposit and front-desk confirmation",
      async () => {
        // Use owner for deposit; Confirm itself is explicitly performed by front desk.
        await go(v.owner, "Reservations");
        await v.owner
          .getByLabel("Search reservation names", { exact: true })
          .fill(marker);
        const card = reservationCard(v.owner),
          details = card
            .locator("details")
            .filter({
              has: v.owner
                .locator("summary")
                .filter({ hasText: "Deposit & seating" }),
            });
        await details.locator("summary").click();
        const amount =
          v.reservation.depositRequired ||
          v.branch.settings.depositPolicy?.amount ||
          500000;
        await card
          .getByLabel("Deposit already received (naira)", { exact: true })
          .fill(String(amount / 100));
        await card
          .getByLabel("Verified reference", { exact: true })
          .fill(marker);
        await mutate(
          v.owner,
          `/reservations/${v.reservation.id}/deposits`,
          () =>
            card
              .getByRole("button", { name: "Record deposit", exact: true })
              .click(),
        );
        assert.equal(
          (await workspace(v)).reservations.find(
            (r) => r.id === v.reservation.id,
          ).depositAmount,
          amount,
        );
        await go(front, "Reservations");
        await front
          .getByLabel("Search reservation names", { exact: true })
          .fill(marker);
        await mutate(front, `/reservations/${v.reservation.id}/status`, () =>
          reservationCard(front)
            .getByRole("button", { name: "Confirm", exact: true })
            .click(),
        );
        assert.equal(
          (await workspace(v)).reservations.find(
            (r) => r.id === v.reservation.id,
          ).status,
          "confirmed",
        );
      },
      front,
    );
    if (v.slug === "saffron-room") {
      await step(
        v,
        "Guest cancellation requires staff review and no refund",
        async () => {
          const before = await workspace(v);
          await guestPage
            .getByRole("button", { name: "Your order", exact: true })
            .click();
          await guestPage
            .getByText("Request cancellation", { exact: true })
            .click();
          await clickChip(
            guestPage
              .getByRole("group", { name: "Cancellation reason", exact: true })
              .getByRole("radio", { name: "Plans changed", exact: true }),
          );
          await guestPage
            .getByRole("button", { name: "Add a note", exact: true })
            .click();
          await guestPage
            .getByLabel("Cancellation reason additional note", { exact: true })
            .fill(marker);
          const reply = await mutate(
            guestPage,
            `/reservations/${v.reservation.id}/cancellation`,
            () =>
              guestPage
                .getByRole("button", {
                  name: "Send cancellation request",
                  exact: true,
                })
                .click(),
          );
          assert.equal(reply.refundConfirmed, false);
          assert.equal(reply.venueReviewRequired, true);
          assert.equal(reply.depositReviewRequired, true);
          const after = await workspace(v),
            r = after.reservations.find((r) => r.id === v.reservation.id);
          assert(r.cancellationRequestedAt);
          assert.equal(r.status, "confirmed");
          assert.deepEqual(after.refunds, before.refunds);
          assert.deepEqual(after.deposits, before.deposits);
        },
        guestPage,
        true,
      );
    } else {
      await step(
        v,
        "Front desk seats VIP booking",
        async () => {
          const w = await workspace(v);
          v.table = w.tables.find((t) => t.status === "available");
          assert(v.table);
          const card = reservationCard(front),
            details = card
              .locator("details")
              .filter({
                has: front
                  .locator("summary")
                  .filter({ hasText: "Deposit & seating" }),
              });
          if (!(await details.getAttribute("open")))
            await details.locator("summary").click();
          await choose(card, "Seat at table", v.table.name);
          await mutate(front, `/reservations/${v.reservation.id}/seat`, () =>
            card
              .getByRole("button", { name: "Seat reservation", exact: true })
              .click(),
          );
          const after = await workspace(v);
          v.visit = after.visits.find(
            (x) => x.reservationId === v.reservation.id,
          );
          assert(v.visit?.status === "open");
          assert.equal(
            after.reservations.find((r) => r.id === v.reservation.id).status,
            "seated",
          );
        },
        front,
      );
      await step(
        v,
        "Bottle package counter restriction and seated POS order",
        async () => {
          await guestPage
            .getByRole("button", { name: "Menu", exact: true })
            .click();
          const pack = product(await workspace(v), "PACK");
          assert(
            await guestPage
              .getByRole("button", {
                name: `Choose: ${pack.name}`,
                exact: true,
              })
              .isDisabled(),
          );
          await pos(v, v.owner, ["PACK"], v.visit);
        },
        v.owner,
      );
      await step(
        v,
        "Door guest list check-in two and entry collection",
        async () => {
          await go(v.owner, "Door & guest list");
          await v.owner.getByText("Add guest", { exact: true }).click();
          await v.owner.getByLabel("Guest name", { exact: true }).fill(marker);
          await v.owner
            .getByRole("button", { name: "Increase Party size", exact: true })
            .click();
          await mutate(v.owner, "/guest-list", () =>
            v.owner
              .getByRole("button", { name: "Add entry", exact: true })
              .click(),
          );
          const card = v.owner
            .locator(".mw-card article")
            .filter({
              has: v.owner.getByRole("heading", {
                name: `${marker} · 2 guests`,
                exact: true,
              }),
            });
          await mutate(v.owner, "/check-in", () =>
            card
              .getByRole("button", { name: `Check in ${marker}`, exact: true })
              .click(),
          );
          const data = await api(v.owner, bpath(v) + "/guest-list");
          const rows = Array.isArray(data) ? data : data.entries;
          assert.equal(rows.find((e) => e.name === marker).arrivedCount, 2);
          await card
            .getByRole("button", { name: "Collect entry", exact: true })
            .click();
          const w = await workspace(v),
            entry = w.counterProducts.find(
              (x) => x.id === v.branch.settings.entryProductId,
            );
          assert(entry);
          await v.owner
            .getByRole("button", {
              name: `Increase Quantity of ${entry.name}`,
              exact: true,
            })
            .click();
          const details = v.owner.locator(".mw-pos-context-extra");
          if (!(await details.getAttribute("open")))
            await details.locator("summary").click();
          await v.owner
            .getByLabel("Customer name (optional)", { exact: true })
            .fill(marker);
          await v.owner
            .getByLabel("Order note", { exact: true })
            .fill(marker + " entry");
          await mutate(v.owner, "/quote", () =>
            v.owner
              .getByRole("button", {
                name: "Review current order total",
                exact: true,
              })
              .click(),
          );
          const order = await newOrder(
            v,
            v.owner,
            "/orders",
            () =>
              v.owner
                .getByRole("button", { name: "Submit order", exact: true })
                .click(),
            [{ product: entry, quantity: 2 }],
          );
          await payOrder(v, v.owner, order);
        },
        v.owner,
      );
      await step(
        v,
        "Minimum-spend progress",
        () => minimumProgress(v, v.owner),
        v.owner,
      );
      await step(
        v,
        "Settle VIP tab to minimum spend",
        () => settleBills(v, v.owner),
        v.owner,
      );
      await step(v, "VIP kitchen and bar ready", () => prepare(v), v.owner);
      await step(
        v,
        "VIP orders completed",
        () => complete(v, v.owner),
        v.owner,
      );
      await step(v, "VIP visit closed", () => closeVisit(v, v.owner), v.owner);
    }
  } else {
    if (v.slug === "daybreak-afterdark") {
      let counter;
      await step(
        v,
        "Cashier counter POS order",
        async () => {
          counter = await pos(v, p, ["MAIN"]);
        },
        p,
      );
      await step(
        v,
        "Cashier counter cash tender",
        () => payOrder(v, p, counter),
        p,
      );
    }
    const waiter = v.slug === "oak-ember" ? p : v.owner;
    await step(v, "Open named table visit", () => openVisit(v, waiter), waiter);
    if (v.slug === "daybreak-afterdark") {
      await step(
        v,
        "Guest table QR joins open tab and orders",
        async () => {
          await joinGuest(v, guestPage);
          await guestOrder(v, guestPage);
        },
        guestPage,
        true,
      );
    } else
      await step(
        v,
        "First seated POS round kitchen and bar",
        () => pos(v, waiter, ["MAIN", "DRINK"], v.visit),
        waiter,
      );
    if (v.slug !== "oak-ember")
      await step(
        v,
        "Second seated POS round",
        () =>
          pos(
            v,
            waiter,
            [v.slug === "velvet-lounge" ? "MAIN" : "DRINK"],
            v.visit,
          ),
        waiter,
      );
    await step(
      v,
      "Minimum-spend progress",
      () => minimumProgress(v, v.owner),
      v.owner,
    );
    // Daybreak has a ₦20k commitment; add qualifying ordinary items via POS.
    if (v.visit.minimumSpendPolicy?.enabled)
      await step(
        v,
        "Ordinary orders cover disclosed minimum spend",
        async () => {
          const target = v.visit.minimumSpendPolicy.amount;
          let w = await workspace(v),
            total = tracked(v, w)
              .filter((o) => o.visitId === v.visit.id)
              .reduce((n, o) => n + o.total, 0);
          const main = product(w, "MAIN");
          if (total < target)
            await pos(
              v,
              v.owner,
              Array(Math.ceil((target - total) / main.price)).fill("MAIN"),
              v.visit,
            );
          w = await workspace(v);
          total = tracked(v, w)
            .filter((o) => o.visitId === v.visit.id)
            .reduce((n, o) => n + o.total, 0);
          assert(total >= target);
        },
        v.owner,
      );
    const prepayRequired = !(await workspace(v)).branch.settings.payLater;
    if (v.slug === "oak-ember")
      assert.equal(
        prepayRequired,
        false,
        "Owner configuration must allow preparation before payment",
      );
    if (!prepayRequired)
      await step(v, "Kitchen and bar mark ready", () => prepare(v), v.owner);
    await step(
      v,
      v.slug === "oak-ember"
        ? "Split amount into two and collect cash plus external POS"
        : "Settle open tab",
      () => settleBills(v, v.owner, v.slug === "oak-ember"),
      v.owner,
    );
    if (prepayRequired)
      await step(
        v,
        "Kitchen and bar mark ready after required collection",
        () => prepare(v),
        v.owner,
      );
    await step(
      v,
      "Mark collected and completed",
      () => complete(v, v.owner),
      v.owner,
    );
    await step(v, "Close settled visit", () => closeVisit(v, v.owner), v.owner);
  }
  await step(v, "Authenticated Today report deltas", () => reports(v), v.owner);
}

try {
  await mkdir(output, { recursive: true });
  // Exclusive create refuses every existing journal, including empty/finished
  // files. A new RUN_ID is an intentional new transaction run, not recovery.
  const handle = await open(journalPath, "wx", 0o600);
  claimed = true;
  await handle.writeFile(JSON.stringify(journal, null, 2));
  await handle.close();
  try {
    const data = JSON.parse(
      await readFile(
        process.env.CREDENTIALS ||
          "/private/tmp/mera-staging-venues-20261124.json",
        "utf8",
      ),
    );
    if (data.origin !== undefined) assert.equal(data.origin, ORIGIN);
    assert(Array.isArray(data.credentials));
    credentials = data.credentials;
  } catch {
    throw Error(
      "Private credential file unavailable or invalid; contents omitted",
    );
  }
  const {
    chromium,
  } = require("/private/tmp/claude-503/pw/node_modules/playwright");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const slug of selected) {
    const code =
      slug === "harbour-hotel"
        ? "POL"
        : VENUE_PORTFOLIO.find(([s]) => s === slug)[3][0];
    const v = {
      slug,
      code,
      branch: { id: portfolioId(`${slug}:${code}`) },
      orderIds: [],
    };
    const start = results.steps.length;
    try {
      v.owner = await login(slug, "owner");
      Object.assign(v, await current(v));
      await location(v.owner, code);
      const w = await workspace(v);
      v.beforePaymentIds = new Set(w.payments.map((p) => p.id));
      v.beforeDepositIds = new Set(w.deposits.map((p) => p.id));
      v.reportBefore = await overview(v);
      // The owner configuration is deliberate and permanent. Snapshot hours
      // only afterwards so finally restores hours without undoing that change.
      await configurePreparation(v);
      try {
        await openForJourney(v);
        await journey(v);
      } finally {
        await restore(v);
      } // Immediately after this venue, before next login.
    } catch (e) {
      if (!results.steps.slice(start).some((s) => !s.pass))
        record(
          v,
          "Journey setup or execution",
          false,
          "Independent venue failed; subsequent venues continue unless restoration failed.",
          e,
        );
    } finally {
      for (const c of contexts) await c.close().catch(() => {});
      contexts.clear();
      results.venues.push({
        venue: slug,
        pass: results.steps.slice(start).every((s) => s.pass),
        orderIds: v.orderIds,
      });
      await evidence();
    }
    if (fatalRestore) break;
  }
} catch (e) {
  record(
    { slug: "runner" },
    "Runner preflight",
    false,
    e.code === "EEXIST"
      ? "Existing journal: rerun refused before login or writes. Reconcile it manually."
      : "No secret values exported.",
    e,
  );
} finally {
  await browser?.close();
  results.finishedAt = new Date().toISOString();
  results.exitCode = fatalRestore
    ? 2
    : results.steps.some((s) => !s.pass)
      ? 1
      : 0;
  if (claimed) {
    journal.state = fatalRestore ? "RESTORATION_FAILED" : "finished";
    await persist();
  }
  await mkdir(output, { recursive: true });
  await evidence();
  console.log(
    fatalRestore
      ? "STOP: service-hours restoration could not be verified. Exit 2; reconcile the private journal before further runs."
      : `Browser journeys: ${results.steps.filter((s) => s.pass).length} passed, ${results.steps.filter((s) => !s.pass).length} failed. See docs/audit/venues-staging-e2e/results.json.`,
  );
  process.exitCode = results.exitCode;
}
