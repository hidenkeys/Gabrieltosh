import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseWorkspaceLanding,
  getSectionPresentation,
  sectionPresentation,
} from "../src/mera/workspace/presentation";
const visibleSectionIds = Object.keys(sectionPresentation),
  scopeKey = "org-a/branch-a";
const pick = (role: string, permissions: string[]) =>
  chooseWorkspaceLanding({ role, permissions, visibleSectionIds, scopeKey });
test("F5 named roles prioritize real permitted job destinations", () => {
  for (const role of ["owner", "organization_admin", "branch_manager"])
    assert.equal(pick(role, ["orders.view", "reports.view"]), "overview");
  for (const role of ["kitchen", "bar"])
    assert.equal(pick(role, ["orders.view", "orders.prepare"]), "preparation");
  assert.equal(pick("waiter", ["orders.view", "tables.manage"]), "tables");
  assert.equal(pick("waiter", ["orders.view"]), "orders");
  assert.equal(pick("cashier", ["orders.view", "orders.create"]), "counter");
  assert.equal(
    pick("front_desk", ["tables.manage", "reservations.manage"]),
    "reservations",
  );
  assert.equal(pick("stock_controller", ["menu.edit", "stock.adjust"]), "menu");
  assert.equal(pick("reports_only", ["reports.view"]), "overview");
});
test("F5 never grants access from a role name, including custom and prototype-like names", () => {
  assert.equal(pick("owner", []), null);
  assert.equal(pick("cashier", ["orders.view"]), "orders");
  assert.equal(pick("custom-role-id", ["orders.prepare"]), "preparation");
  assert.equal(pick("toString", []), null);
  assert.equal(pick("stock_controller", ["stock.adjust"]), "menu");
  assert.equal(
    chooseWorkspaceLanding({
      role: "cashier",
      permissions: ["orders.create"],
      visibleSectionIds: ["overview"],
      scopeKey,
    }),
    null,
  );
});
test("F5 preserves explicit visible selection only within the same scope and falls back after revocation", () => {
  const base = {
    role: "cashier",
    permissions: ["orders.view", "orders.create"],
    visibleSectionIds,
    scopeKey,
    selection: { section: "orders", scopeKey },
  };
  assert.equal(chooseWorkspaceLanding(base), "orders");
  assert.equal(
    chooseWorkspaceLanding({ ...base, scopeKey: "org-a/branch-b" }),
    "counter",
  );
  assert.equal(
    chooseWorkspaceLanding({ ...base, permissions: ["orders.create"] }),
    "counter",
  );
  assert.equal(
    chooseWorkspaceLanding({ ...base, visibleSectionIds: [] }),
    null,
  );
  assert.equal(
    chooseWorkspaceLanding({
      ...base,
      selection: { section: "__proto__", scopeKey },
    }),
    "counter",
  );
});
test("F5 special navigation permissions respect organization-wide support scope", () => {
  assert.equal(
    chooseWorkspaceLanding({
      permissions: ["organization.manage"],
      visibleSectionIds: ["support"],
      scopeKey,
    }),
    null,
  );
  assert.equal(
    chooseWorkspaceLanding({
      permissions: ["organization.manage"],
      visibleSectionIds: ["support"],
      organizationWide: true,
      scopeKey,
    }),
    "support",
  );
  assert.equal(
    chooseWorkspaceLanding({
      permissions: ["tables.manage"],
      visibleSectionIds: ["qr"],
      scopeKey,
    }),
    "qr",
  );
  assert.equal(
    chooseWorkspaceLanding({
      permissions: ["refunds.approve"],
      visibleSectionIds: ["help"],
      scopeKey,
    }),
    "help",
  );
});
test("F5 all twenty task titles and descriptions are concise and avoid implementation jargon", () => {
  assert.equal(Object.keys(sectionPresentation).length, 20);
  for (const item of Object.values(sectionPresentation)) {
    assert(item.title.length < 35);
    assert(item.description.length < 110);
    assert(
      !/welcome|canonical|bounded snapshot|ledger|lease fencing/i.test(
        item.title + item.description,
      ),
    );
  }
  assert.equal(getSectionPresentation("__proto__").title, "Workspace");
  assert.equal(getSectionPresentation("counter").title, "The counter");
});
