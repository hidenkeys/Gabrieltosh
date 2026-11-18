# Mera UI correction progress

Goal: Correct Mera's complete web experience to preserve the original Bing Chun UI, implement the supplied Mera visual direction where appropriate, and verify all in-scope screens and workflows without regressing functionality.

Scope **1.0** · revision `cfce7e7` · updated 2026-11-18T23:28:34+01:00

**UI correction: 41% complete | 59% remaining.** Weighted evidence: 41.2/100. This is checklist completion, not a time estimate.

Weights retained exactly as requested. Initial evidence11.2 weighted points (floor11%). Previous pilot is capped60% and reopened under the expanded scope. No backend completion credited.

## Current milestone

Preparation integration verified at cfce7e7 with partial-to-ready browser checks. Next verify durable reservation recovery in the browser, restricted preparation roles and remaining management, operational, customer and platform workflows.

## Measurement

Weights are frozen in scope1.0. Checkpoints:0 planned/not implemented;40 real interfaces and required states implemented;60 integrated and exercised;80 reference/size/accessibility review corrected;100 acceptance/regressions/evidence/lead review passed. The highest fully supported checkpoint applies. Changes can reopen tasks and remove credit. Source/backend completeness alone earns no UI credit.

## Workstreams

| Workstream | Weight | Verified completion | Owner |
| --- | ---: | ---: | --- |
| References, design system and application shell | 15% | 81% | lead |
| Organization management | 25% | 32% | workspace / lead overview |
| POS and operational roles | 20% | 29% | lead / rotating operational agent |
| Customer experience | 20% | 40% | customer |
| Marketing and platform administration | 10% | 40% | backend (presentation workstream A) |
| Integration, accessibility and delivery | 10% | 30% | lead |

## Task board

| ID | Task | Weight | Checkpoint | Status / owner | Evidence |
| --- | --- | ---: | ---: | --- | --- |
| F1 | Original Counter/Reports source and visual evidence | 3% | 100% | VERIFIED · lead | [01-bing-chun-counter.jpg](docs/mera/ui-audit/screenshots/01-bing-chun-counter.jpg), [02-bing-chun-overview.jpg](docs/mera/ui-audit/screenshots/02-bing-chun-overview.jpg), [App.tsx](src/App.tsx) |
| F2 | New Mera visual direction and explicit selection | 2% | 100% | VERIFIED · lead | [MERA-VISUAL-SELECTION.md](docs/mera/ui-audit/MERA-VISUAL-SELECTION.md), [mera-selected-ivory-green.png](docs/mera/ui-audit/references/mera-selected-ivory-green.png), [marketing.md](.agents/skills/mera-ui/references/marketing.md) |
| F3 | Project UI skill and verified source map | 2% | 100% | VERIFIED · lead | [SKILL.md](.agents/skills/mera-ui/SKILL.md), [bing-chun.md](.agents/skills/mera-ui/references/bing-chun.md) |
| F4 | Shared primitives and preservation specification | 2% | 0% | IN_PROGRESS · lead | [PRIMITIVES.md](docs/mera/ui-audit/PRIMITIVES.md) |
| F5 | Compact shared shell, account menu and role landing | 4% | 80% | IN_PROGRESS · lead | [WorkspaceAccount.tsx](src/mera/workspace/WorkspaceAccount.tsx), [mera-ui-pilot.test.tsx](tests/mera-ui-pilot.test.tsx), [presentation.ts](src/mera/workspace/presentation.ts), [mera-workspace.test.tsx](tests/mera-workspace.test.tsx), [SHELL-BROWSER-CHECK.json](docs/mera/ui-audit/SHELL-BROWSER-CHECK.json), [SHARED-SHELL-CHECKPOINT.md](docs/mera/ui-audit/SHARED-SHELL-CHECKPOINT.md) |
| F6 | Durable progress and complete screen inventory | 2% | 100% | VERIFIED · lead | [MERA_UI_PROGRESS.json](MERA_UI_PROGRESS.json), [mera-ui-progress.js](scripts/mera-ui-progress.js) |
| O1 | Overview layout pilot | 2% | 80% | IN_PROGRESS · lead | [05-mera-overview-after.jpg](docs/mera/ui-audit/screenshots/05-mera-overview-after.jpg), [10-mera-overview-narrow.jpg](docs/mera/ui-audit/screenshots/10-mera-overview-narrow.jpg), [design-qa.md](design-qa.md), [overview-comparison-current.jpg](docs/mera/ui-audit/overview-comparison-current.jpg) |
| O2 | Overview actionable content and date context | 3% | 40% | IN_PROGRESS · lead | [OverviewAttention.tsx](src/mera/workspace/OverviewAttention.tsx), [mera-ui-pilot.test.tsx](tests/mera-ui-pilot.test.tsx), [PILOT-CHECKPOINT-2026-11-18.md](docs/mera/ui-audit/PILOT-CHECKPOINT-2026-11-18.md), [OverviewActivity.tsx](src/mera/workspace/OverviewActivity.tsx), [mera-overview-activity.test.tsx](tests/mera-overview-activity.test.tsx), [21-overview-selected-date.jpg](docs/mera/ui-audit/screenshots/21-overview-selected-date.jpg), [23-overview-activity-narrow.jpg](docs/mera/ui-audit/screenshots/23-overview-activity-narrow.jpg) |
| O3 | Onboarding, branding and branch setup | 4% | 60% | IN_PROGRESS · workspace | [mera-management-ui.test.tsx](tests/mera-management-ui.test.tsx), [management.css](src/mera/workspace/management.css), [SetupChecklist.tsx](src/mera/workspace/SetupChecklist.tsx), [SETUP-MOUNT.md](docs/mera/ui-audit/SETUP-MOUNT.md), [35-setup-desktop.jpg](docs/mera/ui-audit/screenshots/35-setup-desktop.jpg), [36-setup-narrow.jpg](docs/mera/ui-audit/screenshots/36-setup-narrow.jpg), [37-setup-tablet.jpg](docs/mera/ui-audit/screenshots/37-setup-tablet.jpg), [BranchAdministration.tsx](src/mera/workspace/BranchAdministration.tsx), [BusinessDetails.tsx](src/mera/workspace/BusinessDetails.tsx), [mera-branch-administration.test.tsx](tests/mera-branch-administration.test.tsx), [mera-business-details.test.tsx](tests/mera-business-details.test.tsx), [MENU-BRANCH-CHECKPOINT.md](docs/mera/ui-audit/MENU-BRANCH-CHECKPOINT.md) |
| O4 | Menu, categories, modifiers and stock management | 5% | 60% | IN_PROGRESS · workspace | [MenuManagement.tsx](src/mera/workspace/MenuManagement.tsx), [MenuPublication.tsx](src/mera/workspace/MenuPublication.tsx), [mera-menu-management.test.tsx](tests/mera-menu-management.test.tsx), [mera-menu-publication.test.tsx](tests/mera-menu-publication.test.tsx), [menu-management-comparison.jpg](docs/mera/ui-audit/menu-management-comparison.jpg), [MENU-BRANCH-CHECKPOINT.md](docs/mera/ui-audit/MENU-BRANCH-CHECKPOINT.md) |
| O5 | Staff, invitations, scopes and custom roles | 3% | 0% | NOT_STARTED · workspace | Pending |
| O6 | Transactions, shifts, reports and exports | 4% | 0% | NOT_STARTED · workspace | Pending |
| O7 | Subscriptions, printing, QR and customer/support care | 4% | 0% | NOT_STARTED · workspace | Pending |
| P1 | Original-style POS catalog and current order | 5% | 80% | IN_PROGRESS · lead | [06-mera-pos-after-empty.jpg](docs/mera/ui-audit/screenshots/06-mera-pos-after-empty.jpg), [07-mera-pos-tablet.jpg](docs/mera/ui-audit/screenshots/07-mera-pos-tablet.jpg), [09-mera-pos-narrow-basket.jpg](docs/mera/ui-audit/screenshots/09-mera-pos-narrow-basket.jpg), [mera-ui-pilot.test.tsx](tests/mera-ui-pilot.test.tsx), [counter-comparison-current.jpg](docs/mera/ui-audit/counter-comparison-current.jpg) |
| P2 | Order lists, details, responsibility and help | 4% | 0% | NOT_STARTED · lead | Pending |
| P3 | Waiter tables, rounds, bills and handoffs | 4% | 0% | NOT_STARTED · lead | Pending |
| P4 | Kitchen and bar preparation | 3% | 60% | IN_PROGRESS · lead | [PREPARATION-MOUNT.md](docs/mera/ui-audit/PREPARATION-MOUNT.md), [56-preparation-partial-desktop.jpg](docs/mera/ui-audit/screenshots/56-preparation-partial-desktop.jpg), [57-preparation-ready-tablet.jpg](docs/mera/ui-audit/screenshots/57-preparation-ready-tablet.jpg), [58-preparation-ready-narrow.jpg](docs/mera/ui-audit/screenshots/58-preparation-ready-narrow.jpg), [mera-preparation.test.tsx](tests/mera-preparation.test.tsx) |
| P5 | Front desk reservations, arrivals and waitlist | 4% | 0% | NOT_STARTED · lead | Pending |
| C1 | Mobile menu and persistent cart pilot | 6% | 80% | IN_PROGRESS · customer | [CustomerExperience.tsx](src/mera/customer/CustomerExperience.tsx), [mera-customer-ui-correction.test.tsx](tests/mera-customer-ui-correction.test.tsx), [PILOT-CHECKPOINT-2026-11-18.md](docs/mera/ui-audit/PILOT-CHECKPOINT-2026-11-18.md), [13-customer-narrow-menu.jpg](docs/mera/ui-audit/screenshots/13-customer-narrow-menu.jpg), [14-customer-narrow-basket.jpg](docs/mera/ui-audit/screenshots/14-customer-narrow-basket.jpg), [15-customer-tablet.jpg](docs/mera/ui-audit/screenshots/15-customer-tablet.jpg), [customer-comparison-current.jpg](docs/mera/ui-audit/customer-comparison-current.jpg) |
| C2 | Checkout, pending recovery, tracking and receipts | 5% | 40% | IN_PROGRESS · customer | [mera-customer-ui-correction.test.tsx](tests/mera-customer-ui-correction.test.tsx), [checkoutRecovery.ts](src/mera/customer/checkoutRecovery.ts), [quoteClock.ts](src/mera/customer/quoteClock.ts), [mera-customer-recovery.test.tsx](tests/mera-customer-recovery.test.tsx), [mera-customer-quote-clock.test.js](tests/mera-customer-quote-clock.test.js), [39-customer-unpaid-tracking.jpg](docs/mera/ui-audit/screenshots/39-customer-unpaid-tracking.jpg) |
| C3 | Visit joining, bills, rounds and help | 4% | 0% | IN_PROGRESS · customer | [HelpRequests.tsx](src/mera/customer/HelpRequests.tsx), [40-customer-help-narrow.jpg](docs/mera/ui-audit/screenshots/40-customer-help-narrow.jpg), [41-customer-join-narrow.jpg](docs/mera/ui-audit/screenshots/41-customer-join-narrow.jpg) |
| C4 | Reservations, activity and consent | 3% | 40% | IN_PROGRESS · customer | [53-reservation-form-narrow.jpg](docs/mera/ui-audit/screenshots/53-reservation-form-narrow.jpg), [MENU-BRANCH-CHECKPOINT.md](docs/mera/ui-audit/MENU-BRANCH-CHECKPOINT.md) |
| C5 | Customization dialogs and organization themes | 2% | 0% | IN_PROGRESS · customer | [mera-customer-ui-correction.test.tsx](tests/mera-customer-ui-correction.test.tsx), [22-customer-dialog-narrow.jpg](docs/mera/ui-audit/screenshots/22-customer-dialog-narrow.jpg) |
| M1 | Marketing homepage pilot | 4% | 100% | VERIFIED · backend | [MARKETING-QA.md](docs/mera/ui-audit/MARKETING-QA.md), [marketing-comparison-final.jpg](docs/mera/ui-audit/marketing-comparison-final.jpg), [24-mera-home-selected-width-final.jpg](docs/mera/ui-audit/screenshots/24-mera-home-selected-width-final.jpg), [29-mera-home-wide.jpg](docs/mera/ui-audit/screenshots/29-mera-home-wide.jpg), [30-mera-home-narrow.jpg](docs/mera/ui-audit/screenshots/30-mera-home-narrow.jpg), [32-mera-home-tablet.jpg](docs/mera/ui-audit/screenshots/32-mera-home-tablet.jpg), [mera-marketing-ui.test.tsx](tests/mera-marketing-ui.test.tsx) |
| M2 | Marketing features, pricing, legal and signup | 2% | 0% | IN_PROGRESS · backend | [mera-signup-ui.test.tsx](tests/mera-signup-ui.test.tsx) |
| M3 | Mera platform administration | 4% | 0% | IN_PROGRESS · backend | [Platform.tsx](src/mera/Platform.tsx), [mera-platform-ui.test.tsx](tests/mera-platform-ui.test.tsx), [38-platform-access-state.jpg](docs/mera/ui-audit/screenshots/38-platform-access-state.jpg) |
| Q1 | Four-surface reference comparison gate | 3% | 100% | VERIFIED · lead | [design-qa.md](design-qa.md), [MARKETING-QA.md](docs/mera/ui-audit/MARKETING-QA.md), [overview-comparison-current.jpg](docs/mera/ui-audit/overview-comparison-current.jpg), [counter-comparison-current.jpg](docs/mera/ui-audit/counter-comparison-current.jpg), [customer-comparison-current.jpg](docs/mera/ui-audit/customer-comparison-current.jpg), [marketing-comparison-final.jpg](docs/mera/ui-audit/marketing-comparison-final.jpg) |
| Q2 | Cross-screen states, accessibility and responsiveness | 3% | 0% | NOT_STARTED · lead | Pending |
| Q3 | Functional integration and regression gate | 3% | 0% | NOT_STARTED · lead | Pending |
| Q4 | Final evidence, review and handoff | 1% | 0% | NOT_STARTED · lead | Pending |

Task acceptance criteria, dependency IDs, change history and blockers are in [MERA_UI_PROGRESS.json](MERA_UI_PROGRESS.json). Every implemented surface/workflow is mapped below; section locators do not claim new browser routes.

## Screen and workflow inventory

| Screen | Route / section | Role | Tasks | Components / primary job | State / visual acceptance |
| --- | --- | --- | --- | --- | --- |
| WS-overview | /mera/workspace#overview | Owner/manager | O1, O2 | OperationalOverview | Prior pilot reopened; Prior pilot evidence only for overview/counter; full scope pending |
| WS-onboarding | /mera/workspace#onboarding | Owner/admin | O3 | BranchSettings/LaunchReadiness/policies/MediaUpload | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-menu | /mera/workspace#menu | Manager/stock | O4 | Categories/SharedMenus/CatalogOperations/variants/modifiers/StockMovements | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-orders | /mera/workspace#orders | Cashier/waiter/manager | P2 | OrderHistory/OrderInstructions/RefundRequests | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-counter | /mera/workspace#counter | Cashier | P1 | StaffPos/StaffOrderItems | Prior pilot reopened; Prior pilot evidence only for overview/counter; full scope pending |
| WS-preparation | /mera/workspace#preparation | Kitchen/bar | P4 | Tickets/OrderInstructions/ItemFulfillment | Integrated partial-preparation and ready-state captures56–58; no original preparation-screen comparison claimed; Browser reviewed desktop,751×1075 and390×844; no document overflow at tablet/narrow |
| WS-tables | /mera/workspace#tables | Waiter/front desk | P3 | FloorMap/TableEditor/VisitTables/Bills/PrivateVisitAccess | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-reservations | /mera/workspace#reservations | Front desk | P5 | ReservationSettlement/DepositOutcomes/minimum spend | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-payments | /mera/workspace#payments | Cashier/manager | O6 | Transactions/refunds/writeoff/recovery | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-shifts | /mera/workspace#shifts | Cashier/manager | O6 | CashMovement/ShiftActions | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-team | /mera/workspace#team | Owner/admin | O5 | RoleManager/member list | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-billing | /mera/workspace#billing | Owner | O7 | Invoices/PolicyEditor/Reconciliation | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-printing | /mera/workspace#printing | Manager | O7 | PrintStudio/PrintDocument | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-qr | /mera/workspace#qr | Manager | O7 | QrCodes | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-integrations | /mera/workspace#integrations | Owner/admin | O7 | Integrations | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-care | /mera/workspace#care | Owner/admin | O7 | Complaints | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-waitlist | /mera/workspace#waitlist | Front desk | P5 | Waitlist | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-exports | /mera/workspace#exports | Reports/manager | O6 | ExportJobs | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-help | /mera/workspace#help | Staff | P2 | HelpRequests | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| WS-support | /mera/workspace#support | Org-wide admin | O7 | SupportCases | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
| CU-menu | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: menu | Guest/customer | C1 | menu | Integrated browser pilot; final source comparison and complete states pending; Desktop/tablet/narrow inspected; exact dimensions/evidence in pilot checkpoint |
| CU-cart | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: cart | Guest/customer | C1 | cart | Integrated browser pilot; final source comparison and complete states pending; Desktop/tablet/narrow inspected; exact dimensions/evidence in pilot checkpoint |
| CU-checkout | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: checkout | Guest/customer | C2 | checkout | NOT_STARTED; NOT_VERIFIED |
| CU-tracking-receipt-history | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: tracking-receipt-history | Guest/customer | C2 | tracking-receipt-history | NOT_STARTED; NOT_VERIFIED |
| CU-table-visit-bills | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: table-visit-bills | Guest/customer | C3 | table-visit-bills | NOT_STARTED; NOT_VERIFIED |
| CU-help | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: help | Guest/customer | C3 | help | NOT_STARTED; NOT_VERIFIED |
| CU-reservations | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: reservations | Guest/customer | C4 | reservations | NOT_STARTED; NOT_VERIFIED |
| CU-activity-consent | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: activity-consent | Guest/customer | C4 | activity-consent | NOT_STARTED; NOT_VERIFIED |
| CU-customization-theme | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: customization-theme | Guest/customer | C5 | customization-theme | NOT_STARTED; NOT_VERIFIED |
| PUB-homepage | /mera | Prospective business | M1 | homepage | Option1 selected; implementation comparison pending; NOT_VERIFIED |
| PUB-features-pricing-modes-support | /mera#experience,#pricing,#modes,#support | Prospective business | M2 | features-pricing-modes-support | NOT_STARTED; NOT_VERIFIED |
| PUB-legal | /mera/legal | Public | M2 | legal | NOT_STARTED; NOT_VERIFIED |
| PUB-signup | /mera/signup | Owner | M2 | signup | NOT_STARTED; NOT_VERIFIED |
| PUB-staff-login | /mera/workspace (signed out) | Staff | F5 | staff-login | NOT_STARTED; NOT_VERIFIED |
| PUB-platform-auth | /mera/platform (unverified) | Platform operator | M3 | platform-auth | NOT_STARTED; NOT_VERIFIED |
| PUB-platform-directory-support-finance-health | /mera/platform (verified) | MFA-verified operator | M3 | platform-directory-support-finance-health | NOT_STARTED; NOT_VERIFIED |

## Separate PRD coverage

Status: INVENTORY_DRAFT_REVIEW_PENDING. 208 requirement IDs inventoried in docs/mera/PRD-COVERAGE.md. Denominator/classification needs lead review; no PRD percentage inferred. UI weights remain independent. Counts/percentage remain unestablished until the atomic PRD map is complete. Historical evidence remains in [ACCEPTANCE](docs/mera/ACCEPTANCE.md) and [BOARD](docs/mera/BOARD.md), including explicit incomplete implementation work.

## Production readiness

**NOT_READY**. UI completion does not clear these gates:

- Rubies agreements/verified API and credentials
- Zidi versioned contract/access
- Authorized email identity/delivery
- Target domains/TLS/hosting and deployment approval
- Physical receipt/sticker output and calibration
- Approved pricing/fee/tax/retention policies
- Production operator/key custody/monitoring/load/device verification

## Current dependencies and next actions

- F2: owner selected option1, ivory and green. Exact reference saved and homepage comparison accepted; platform adapts the identity with task-appropriate layouts.
- F4/F5: lead owns shared shell/primitives; workers request mounts rather than competing edits to OrganizationWorkspace/main/global styles.
- C1: menu/cart and dialog pilot integrated and exercised. Source comparison passed; complete broader checkout, visit, reservation and theme state acceptance.
- Stock-history, refund-requests and workspace-admin are now mounted with actual PostgreSQL integration checks. Dedicated print/alias/end-session assertions remain pending. Show real unavailability, never mock success or label an error as empty data.
- Overview/POS comparisons and all-page shell review passed. Full role/state and operational workflow acceptance remain open; screenshots prove only their captured states.
- Preserve current uncommitted work. No production deployment, real funds, external sending or production data changes authorized.

## Scope history

- 2026-11-18T15:56:52+01:00: Baseline1.0 frozen before new implementation; weight 100; 11.2 points / 11% rounded.
- 2026-11-18T16:10:03+01:00: Customer menu/cart integrated and exercised; account/settings/signup pilots remain partial; no scope change; weight 100; 14.8 points / 14% rounded.
- 2026-11-18T16:32:27+01:00: Exact Mera visual selected; overview required sections implemented; no scope change or backend visual credit; weight 100; 18 points / 18% rounded.
- 2026-11-18T17:08:29+01:00: Selected Mera homepage visual/state review corrected; global pilot gate still pending; scope unchanged; weight 100; 21.2 points / 21% rounded.
- 2026-11-18T17:17:08+01:00: Four-surface comparison gate passed; customer wording corrected; broader shell and workflow rollout next, scope unchanged; weight 100; 27.6 points / 27% rounded.
- 2026-11-18T17:29:28+01:00: Shared all-page shell visual/role checks accepted; checkout recovery state implementation credited. Setup/platform/customer follow-on slices remain partial; scope unchanged; weight 100; 32.8 points / 32% rounded.
- 2026-11-18T22:52:35+01:00: Menu/branch integrated and exercised with actual publication recovery; basic reservation interface corrected; scope unchanged; weight 100; 39.4 points / 39% rounded.
- 2026-11-18T23:28:34+01:00: Station preparation browser integration verified; published POS pricing and reservation recovery integrated with regressions; reservation browser review remains pending; scope unchanged; weight 100; 41.2 points / 41% rounded.

Regenerate this report with `node scripts/mera-ui-progress.js`. The calculation validates weights, task IDs, mapped screens and local evidence paths; the lead still reviews whether evidence supports each checkpoint.
