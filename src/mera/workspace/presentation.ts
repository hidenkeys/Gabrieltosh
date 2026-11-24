/** Presentation only: role names prioritize existing grants; they never grant access. */
export const sectionPresentation = {
  overview: {
    title: "Location overview",
    description:
      "See today’s service, money received and work needing attention.",
  },
  onboarding: {
    title: "Branch setup",
    description:
      "Set your operating preferences, appearance and customer policies.",
  },
  menu: {
    title: "Menu & stock",
    description: "Manage products, availability and stock for this branch.",
  },
  orders: {
    title: "Orders",
    description: "Review orders, follow progress and find the next action.",
  },
  counter: {
    title: "The counter",
    description: "Find an item, build the order and review the total.",
  },
  preparation: {
    title: "Preparation",
    description: "Follow station tickets and mark items ready for service.",
  },
  tables: {
    title: "Tables & visits",
    description: "Manage tables, current parties and their bills.",
  },
  reservations: {
    title: "Reservations",
    description: "Review bookings, upcoming arrivals and deposit records.",
  },
  payments: {
    title: "Transactions",
    description:
      "Review received payments, completed returns and outstanding balances.",
  },
  shifts: {
    title: "Shifts & cash",
    description: "Open a shift, record cash movements and review the handover.",
  },
  team: {
    title: "People & access",
    description: "Manage staff invitations, roles and branch access.",
  },
  billing: {
    title: "Subscription",
    description: "Review your plan, invoices and available services.",
  },
  printing: {
    title: "Receipts & stickers",
    description: "Set document layouts and review the print queue.",
  },
  qr: {
    title: "Menu QR codes",
    description: "Create and download codes for your menu, branch or tables.",
  },
  integrations: {
    title: "Integrations",
    description:
      "Manage connected-service access and review connection status.",
  },
  care: {
    title: "Customer care",
    description: "Review feedback and follow up on customer concerns.",
  },
  waitlist: {
    title: "Front desk",
    description: "Manage walk-ins, the waitlist and party arrivals.",
  },
  exports: {
    title: "Report exports",
    description: "Choose a business date and download prepared reports.",
  },
  help: {
    title: "Customer requests",
    description: "Respond to service, payment and reservation questions.",
  },
  support: {
    title: "Mera support",
    description: "Contact Mera and follow progress on your support cases.",
  },
} as const;
export type WorkspaceSection = keyof typeof sectionPresentation;
export function getSectionPresentation(section: string) {
  return Object.prototype.hasOwnProperty.call(sectionPresentation, section)
    ? sectionPresentation[section as WorkspaceSection]
    : {
        title: "Workspace",
        description: "Choose an available task from the workspace menu.",
      };
}
const sectionPermissions: Record<WorkspaceSection, readonly string[]> = {
  overview: ["reports.view"],
  onboarding: ["organization.manage"],
  menu: ["menu.edit", "stock.adjust"],
  orders: ["orders.view"],
  counter: ["orders.create"],
  preparation: ["orders.prepare"],
  tables: ["tables.manage"],
  reservations: ["reservations.manage"],
  payments: ["payments.record"],
  shifts: ["shifts.manage"],
  team: ["members.manage"],
  billing: ["billing.manage"],
  printing: ["menu.edit"],
  qr: ["menu.publish", "tables.manage"],
  integrations: ["organization.manage"],
  care: ["organization.manage"],
  waitlist: ["reservations.manage"],
  exports: ["reports.export"],
  help: [
    "orders.fulfill",
    "tables.manage",
    "payments.record",
    "refunds.approve",
    "reservations.manage",
    "organization.manage",
  ],
  support: ["organization.manage"],
};
const rolePriorities: Record<string, readonly WorkspaceSection[]> = {
  owner: ["overview"],
  organization_admin: ["overview"],
  branch_manager: ["overview"],
  kitchen: ["preparation", "orders"],
  bar: ["preparation", "orders"],
  waiter: ["tables", "orders"],
  cashier: ["counter", "orders"],
  front_desk: ["reservations", "waitlist", "tables"],
  stock_controller: ["menu"],
  reports_only: ["overview", "exports"],
};
export type LandingInput = {
  role?: string | null;
  permissions: readonly string[];
  visibleSectionIds: readonly string[];
  organizationWide?: boolean;
  /** Caller supplies actor + organization + branch identity; never reuse a selection across accounts. */
  scopeKey: string;
  selection?: { section: string; scopeKey: string } | null;
};
export function chooseWorkspaceLanding({
  role,
  permissions,
  visibleSectionIds,
  organizationWide = false,
  scopeKey,
  selection,
}: LandingInput): WorkspaceSection | null {
  const visible = visibleSectionIds.filter(
    (section): section is WorkspaceSection =>
      Object.prototype.hasOwnProperty.call(sectionPermissions, section) &&
      sectionPermissions[section as WorkspaceSection].some((permission) =>
        permissions.includes(permission),
      ) &&
      (section !== "support" || organizationWide),
  );
  if (
    selection?.scopeKey === scopeKey &&
    visible.includes(selection.section as WorkspaceSection)
  )
    return selection.section as WorkspaceSection;
  const priorities =
    role && Object.prototype.hasOwnProperty.call(rolePriorities, role)
      ? rolePriorities[role]
      : [];
  return (
    priorities.find((section) => visible.includes(section)) ||
    visible[0] ||
    null
  );
}
