import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedCurrencies,
  formatMoney,
  importCurrencyNotice,
} from "../shared/mera-money.js";
import {
  currencySchema,
  validateCurrencyChange,
  providersForCurrency,
} from "../server/mera/currency.js";
import { createMeraRouter } from "../server/mera/index.js";
import { rolePermissions } from "../shared/mera-contracts.js";

test("shared formatter uses integer minor units and currency locales, including zero and credits", () => {
  const locales = [
    "en-NG",
    "en-US",
    "en-GB",
    "de-DE",
    "en-GH",
    "en-KE",
    "en-ZA",
  ];
  allowedCurrencies.forEach((currency, i) => {
    for (const minor of [0, 123456, -101])
      assert.equal(
        formatMoney(minor, currency),
        new Intl.NumberFormat(locales[i], {
          style: "currency",
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(minor / 100),
      );
  });
  assert.equal(formatMoney(123, "USD"), "$1.23");
});
test("currency validation permits supported ISO codes and refuses unsupported inputs", () => {
  for (const currency of allowedCurrencies)
    assert.equal(currencySchema.parse(currency), currency);
  for (const currency of ["usd", "JPY", "US", "", null, 123])
    assert.equal(currencySchema.safeParse(currency).success, false);
});
test("currency changes check scoped orders even on unpublished branches; same currency is safe", async () => {
  const branch = {
    id: "branch",
    organization_id: "org",
    currency: "NGN",
    menu_version: 0,
  };
  let calls = 0;
  const db = {
    query: async (sql, args) => {
      calls++;
      assert.match(sql, /kind='order'/);
      assert.deepEqual(args, ["org", "branch"]);
      return { rows: [{ id: "order" }] };
    },
  };
  await validateCurrencyChange(db, branch, "NGN");
  assert.equal(calls, 0);
  await assert.rejects(
    validateCurrencyChange(db, branch, "USD"),
    (error) => error.status === 409 && /has orders/.test(error.message),
  );
  await validateCurrencyChange(
    { query: async () => ({ rows: [] }) },
    { ...branch, menu_version: 1 },
    "USD",
  );
});
test("branch settings endpoint validates, updates a locked branch and refuses changes once orders exist", async () => {
  const branch = {
    id: "branch",
    organization_id: "org",
    currency: "NGN",
    menu_version: 1,
    settings: {},
  };
  let hasOrders = false;
  const db = {
    transaction: async (fn) => fn(db),
    query: async (sql, args) => {
      if (sql.includes("FROM mera_memberships"))
        return {
          rows: [
            {
              role: "owner",
              permissions: rolePermissions.owner,
              organization_wide: true,
              branch_ids: [],
              active: true,
            },
          ],
        };
      if (sql.includes("FROM mera_branches")) {
        assert.match(sql, /FOR UPDATE/);
        return { rows: [branch] };
      }
      if (sql.includes("kind='order'"))
        return { rows: hasOrders ? [{ id: "order" }] : [] };
      if (sql.startsWith("UPDATE mera_branches SET currency")) {
        assert.deepEqual(args.slice(1), ["branch", "org"]);
        if (branch.currency !== args[0]) branch.menu_version++;
        branch.currency = args[0];
      } else if (sql.startsWith("UPDATE mera_branches SET settings"))
        branch.settings = JSON.parse(args[0]);
      else if (!sql.startsWith("INSERT INTO mera_records")) throw Error(sql);
      return { rows: [] };
    },
  };
  const router = createMeraRouter(db);
  const route = router.stack.find(
    (l) =>
      l.route?.path ===
        "/organizations/:organizationId/branches/:branchId/settings" &&
      l.route.methods.patch,
  ).route;
  async function patch(currency) {
    const req = {
      params: { organizationId: "org", branchId: "branch" },
      body: { currency },
      user: { id: "owner" },
      get: () => undefined,
    };
    let result;
    const res = {
      json: (v) => {
        result = v;
      },
    };
    for (const layer of route.stack) {
      let error;
      await layer.handle(req, res, (e) => {
        error = e;
      });
      if (error) throw error;
    }
    return result;
  }
  await assert.rejects(patch("JPY"));
  await patch("USD");
  assert.equal(branch.currency, "USD");
  assert.equal(branch.menu_version, 2);
  hasOrders = true;
  await assert.rejects(patch("GBP"), (e) => e.status === 409);
  assert.equal(branch.currency, "USD");
  await patch("USD");
});
test("import notice names both currencies; non-NGN collection remains blocked without removing manual methods", () => {
  assert.equal(
    importCurrencyNotice("USD", "NGN"),
    "This menu is priced in USD. Your location uses NGN.",
  );
  assert.equal(importCurrencyNotice("USD", "USD"), "");
  const providers = {
    rubies: { state: "blocked" },
    printing: { state: "browser" },
  };
  assert.equal(providersForCurrency(providers, "USD").rubies.state, "blocked");
  assert.deepEqual(
    providersForCurrency(providers, "USD").printing,
    providers.printing,
  );
});
