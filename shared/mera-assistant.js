// Same catalog readers as the workspace snapshot. Writes still require menu.edit.
export const assistantCatalogPermissions = [
  "menu.edit",
  "menu.publish",
  "stock.adjust",
  "orders.create",
  "orders.view",
];
export const assistantPermissions = [
  ...assistantCatalogPermissions,
  "reports.view",
  "tables.manage",
  "organization.manage",
  "orders.fulfill",
  "reservations.manage",
  "payments.record",
  "refunds.approve",
];
export const canAskMera = (permissions) =>
  assistantPermissions.some((p) => permissions.includes(p));
