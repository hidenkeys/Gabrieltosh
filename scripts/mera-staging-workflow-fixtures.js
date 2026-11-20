// Explicit synthetic browser fixtures. No DB access, customer import, money or provider activation.
import assert from "node:assert/strict";
import { readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
const origin = "https://mera-web-staging.up.railway.app";
const organizationId = "10000000-0000-4000-8000-000000000001";
const branchId = "20000000-0000-4000-8000-000000000001";
const base = `/api/mera/v1/organizations/${organizationId}/branches/${branchId}`;
const publicPath = `/api/mera/v1/public/bing-chun/${branchId}/menu`;
const tableName = "QA workflow table",
  productName = "QA complimentary sample",
  productCode = "MQA-ZERO-20261120";
const manifestPath = process.env.MERA_STAGING_FIXTURE_MANIFEST;
assert.ok(
  manifestPath?.startsWith("/private/tmp/"),
  "Explicit private staging manifest path required.",
);
assert.ok(
  ["prepare", "inspect"].includes(process.argv[2]),
  "Choose prepare or inspect explicitly.",
);
const secretsPath = process.env.MERA_STAGING_SECRETS_FILE;
assert.ok(
  secretsPath?.startsWith("/private/tmp/"),
  "Explicit private credentials path required.",
);
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const digest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const headers = {
  "content-type": "application/json",
  "x-pos-request": "1",
  origin,
};
async function request(path, method = "GET", body) {
  assert.ok(path.startsWith("/api/"));
  const response = await fetch(origin + path, {
    method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.match(
    response.headers.get("x-robots-tag") || "",
    /noindex/,
    "Staging noindex guard missing.",
  );
  if (!response.ok)
    throw new Error(
      `Staging API ${method} ${path} returned ${response.status}; stop and reconcile before retry.`,
    );
  return response;
}
const json = async (...args) => (await request(...args)).json();
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
async function persist() {
  await writeFile(manifestPath + ".tmp", JSON.stringify(manifest, null, 2), {
    mode: 0o600,
  });
  await rename(manifestPath + ".tmp", manifestPath);
}
const { ownerPassword } = JSON.parse(await readFile(secretsPath, "utf8"));
const login = await request("/api/login", "POST", {
  username: "staging.owner",
  password: ownerPassword,
});
headers.cookie = login.headers.get("set-cookie").split(";")[0];
try {
  const context = await json("/api/mera/v1/context");
  assert.equal(context.demo, false);
  const organization = context.organizations.find(
    (row) => row.id === organizationId,
  );
  assert.equal(organization?.name, "Bing Chun · Staging");
  assert.equal(organization?.slug, "bing-chun");
  assert.equal(organization?.onboarding?.syntheticStaging, true);
  assert.equal(organization?.organizationWide, true);
  assert.equal(organization?.subscription?.billingEnabled, false);
  const branch = organization.branches.find((row) => row.id === branchId);
  assert.equal(branch?.name, "Surulere · Staging");
  assert.equal(branch?.settings?.syntheticStaging, true);
  assert.equal(branch?.settings?.minimumSpendPolicy?.enabled || false, false);
  assert.equal(branch?.settings?.depositPolicy?.enabled || false, false);
  assert.equal(branch?.settings?.pricingPolicy?.enabled || false, false);
  let workspace = await json(base + "/workspace"),
    menu = await json(publicPath);
  assert.equal(menu.providers.rubies.state, "blocked");
  assert.equal(menu.orderingAvailable, true);
  if (!manifest) {
    assert.equal(
      menu.products.length,
      34,
      "Expected the 34-item synthetic baseline before creating fixtures.",
    );
    assert.equal(
      workspace.products.filter((row) => row.code === productCode).length,
      0,
      "Unmanifested product exists; reconcile manually.",
    );
    assert.equal(
      workspace.tables.filter((row) => row.name === tableName).length,
      0,
      "Unmanifested table exists; reconcile manually.",
    );
    manifest = {
      version: 1,
      origin,
      organizationId,
      branchId,
      createdAt: new Date().toISOString(),
      baseline: {
        publishedVersion: menu.menuVersion ?? workspace.menuVersion,
        publicProducts: menu.products,
        products: workspace.products,
        tables: workspace.tables,
        branchSettings: branch.settings,
        categories: workspace.categories,
        counts: {
          orders: workspace.orders.length,
          reservations: workspace.reservations.length,
          visits: workspace.visits.length,
          payments: workspace.payments.length,
          deposits: workspace.deposits.length,
          refunds: workspace.refunds.length,
        },
      },
      table: { name: tableName, phase: "not_started" },
      product: { name: productName, code: productCode, phase: "not_started" },
      publication: null,
    };
    assert.equal(process.argv[2], "prepare", "No fixture manifest exists yet.");
    await persist();
  }
  assert.equal(manifest.origin, origin);
  assert.equal(manifest.organizationId, organizationId);
  assert.equal(manifest.branchId, branchId);
  const baselineIds = manifest.baseline.products.map((row) => row.id);
  for (const product of manifest.baseline.products)
    assert.equal(
      digest(workspace.products.find((row) => row.id === product.id)),
      digest(product),
      "A pre-existing draft product changed; stop.",
    );
  if (process.argv[2] === "prepare") {
    for (const [kind, collection, match, payload] of [
      [
        "table",
        "tables",
        (row) => row.name === tableName,
        { name: tableName, capacity: 2, zone: "QA checks", x: 70, y: 70 },
      ],
      [
        "product",
        "products",
        (row) => row.code === productCode,
        {
          name: productName,
          code: productCode,
          category: "QA checks",
          description:
            "Synthetic complimentary sample for receipt testing. No real service or payment.",
          price: 0,
          size: "Sample",
          available: true,
          stockMode: "unlimited",
          stock: 0,
          station: "bar",
          imageCode:
            manifest.baseline.publicProducts.find((row) => row.imageCode)
              ?.imageCode || "",
          variants: [],
          modifierGroups: [],
        },
      ],
    ]) {
      const found = workspace[collection].filter(match);
      assert.ok(found.length <= 1, "Duplicate fixture detected; stop.");
      if (found.length) {
        if (manifest[kind].id) assert.equal(found[0].id, manifest[kind].id);
        assert.notEqual(
          manifest[kind].phase,
          "not_started",
          "Unmanifested fixture collision; stop.",
        );
        manifest[kind] = {
          ...manifest[kind],
          id: found[0].id,
          phase: "created",
        };
        await persist();
      } else {
        assert.equal(
          manifest[kind].phase,
          "not_started",
          "Earlier request may still be pending; no replay allowed.",
        );
        manifest[kind].phase = "pending";
        await persist();
        const created = await json(base + "/" + collection, "POST", payload);
        assert.match(created.id, /^[a-f\d-]{36}$/i);
        manifest[kind] = {
          ...manifest[kind],
          id: created.id,
          phase: "created",
        };
        await persist();
        workspace = await json(base + "/workspace");
      }
    }
    const product = workspace.products.find(
      (row) => row.id === manifest.product.id,
    );
    assert.equal(product.name, productName);
    assert.equal(product.price, 0);
    assert.equal(product.stockMode, "unlimited");
    assert.equal(product.available, true);
    const table = workspace.tables.find((row) => row.id === manifest.table.id);
    assert.equal(table.capacity, 2);
    assert.equal(
      table.status,
      "available",
      "Fixture is already in use; do not alter it.",
    );
    if (!menu.products.some((row) => row.id === manifest.product.id)) {
      if (!manifest.publication) {
        const preview = await json(base + "/menu/publication-preview");
        assert.equal(
          preview.products.length,
          35,
          "Unexpected draft changes; do not publish them.",
        );
        assert.deepEqual(
          preview.products
            .filter((row) => row.id !== manifest.product.id)
            .map((row) => row.id)
            .sort(),
          manifest.baseline.publicProducts.map((row) => row.id).sort(),
          "Publication would change baseline membership.",
        );
        for (const old of manifest.baseline.products)
          assert.equal(
            digest(workspace.products.find((row) => row.id === old.id)),
            digest(old),
          );
        manifest.publication = {
          requestKey: randomUUID(),
          previewHash: preview.previewHash,
          expectedVersion: preview.publishedVersion,
        };
        await persist();
      }
      const published = await json(
        base + "/menu/publish",
        "POST",
        manifest.publication,
      );
      manifest.publishedVersion = published.version;
      await persist();
    }
  }
  workspace = await json(base + "/workspace");
  menu = await json(publicPath);
  for (const product of manifest.baseline.products)
    assert.equal(
      digest(workspace.products.find((row) => row.id === product.id)),
      digest(product),
      "Baseline draft product changed.",
    );
  assert.deepEqual(
    menu.products
      .filter((row) => baselineIds.includes(row.id))
      .map((row) => row.id)
      .sort(),
    manifest.baseline.publicProducts.map((row) => row.id).sort(),
  );
  for (const old of manifest.baseline.publicProducts) {
    const current = menu.products.find((row) => row.id === old.id);
    for (const key of Object.keys(old))
      assert.equal(
        digest(current[key]),
        digest(old[key]),
        `Published baseline field changed: ${key}`,
      );
  }
  const verifiedTable = workspace.tables.find(
    (row) => row.id === manifest.table.id,
  );
  assert.equal(verifiedTable?.name, tableName);
  assert.equal(verifiedTable?.capacity, 2);
  const sample = menu.products.find((row) => row.id === manifest.product.id);
  assert.equal(sample?.price, 0);
  assert.equal(sample?.stockMode, "unlimited");
  manifest.verifiedAt = new Date().toISOString();
  manifest.baselinePreserved = true;
  await persist();
  console.log(
    JSON.stringify(
      {
        origin,
        organizationId,
        branchId,
        table: manifest.table,
        product: manifest.product,
        publishedProducts: menu.products.length,
        publishedVersion: workspace.menuVersion,
        baselinePreserved: true,
        manifest: manifestPath,
        checks: {
          preexistingDraftProductsUnchanged: true,
          preexistingPublishedFieldsUnchanged: true,
          providerBlocked: true,
          scriptCreatedOnlyTableProductAndPublication: true,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await request("/api/logout", "POST").catch(() => {});
}
