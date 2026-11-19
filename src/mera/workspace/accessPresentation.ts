const permissionNames: Record<string, string> = {
  "organization.manage": "Manage organization settings",
  "members.manage": "Manage staff access",
  "menu.edit": "Edit menu",
  "menu.publish": "Publish menu",
  "stock.adjust": "Adjust stock",
  "orders.view": "View orders",
  "orders.create": "Place orders",
  "orders.assign": "Assign order handlers",
  "orders.prepare": "Prepare order items",
  "orders.fulfill": "Hand over prepared items",
  "payments.record": "Record payments",
  "refunds.request": "Request refunds",
  "refunds.approve": "Approve refunds",
  "reservations.manage": "Manage reservations",
  "tables.manage": "Manage tables and visits",
  "shifts.manage": "Manage shifts",
  "reports.view": "View reports",
  "reports.export": "Export reports",
  "billing.manage": "Manage subscription billing",
};
export const permissionLabel = (permission: string) =>
  permissionNames[permission] || "Permission unavailable";
