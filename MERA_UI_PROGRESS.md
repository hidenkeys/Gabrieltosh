# Mera UI correction progress

Goal: Correct Mera's complete web experience to preserve the original Bing Chun UI, implement the supplied Mera visual direction where appropriate, and verify all in-scope screens and workflows without regressing functionality.

Scope **1.0** · revision `e281670b8767bcd2f21254eb7042da4ec3e70fdd` · updated 2026-11-18T16:17:45+01:00

**UI correction: 14% complete | 86% remaining.** Weighted evidence: 14.8/100. This is checklist completion, not a time estimate.

Weights retained exactly as requested. Initial evidence11.2 weighted points (floor11%). Previous pilot is capped60% and reopened under the expanded scope. No backend completion credited.

## Current milestone

Complete the four-surface visual gate: organization overview, original-style POS, mobile customer menu/cart and new Mera marketing homepage. Before wider rollout, correct the shared shell and finish source-grounded state/interaction review.

## Measurement

Weights are frozen in scope1.0. Checkpoints:0 planned/not implemented;40 real interfaces and required states implemented;60 integrated and exercised;80 reference/size/accessibility review corrected;100 acceptance/regressions/evidence/lead review passed. The highest fully supported checkpoint applies. Changes can reopen tasks and remove credit. Source/backend completeness alone earns no UI credit.

## Workstreams

| Workstream | Weight | Verified completion | Owner |
| --- | ---: | ---: | --- |
| References, design system and application shell | 15% | 46% | lead |
| Organization management | 25% | 4% | workspace / lead overview |
| POS and operational roles | 20% | 15% | lead / rotating operational agent |
| Customer experience | 20% | 18% | customer |
| Marketing and platform administration | 10% | 0% | backend (presentation workstream A) |
| Integration, accessibility and delivery | 10% | 0% | lead |

## Task board

| ID | Task | Weight | Checkpoint | Status / owner | Evidence |
| --- | --- | ---: | ---: | --- | --- |
| F1 | Original Counter/Reports source and visual evidence | 3% | 100% | VERIFIED · lead | [01-bing-chun-counter.jpg](docs/mera/ui-audit/screenshots/01-bing-chun-counter.jpg), [02-bing-chun-overview.jpg](docs/mera/ui-audit/screenshots/02-bing-chun-overview.jpg), [App.tsx](src/App.tsx) |
| F2 | New Mera visual direction and explicit selection | 2% | 0% | IN_PROGRESS · lead | Pending |
| F3 | Project UI skill and verified source map | 2% | 100% | VERIFIED · lead | [SKILL.md](.agents/skills/mera-ui/SKILL.md), [bing-chun.md](.agents/skills/mera-ui/references/bing-chun.md) |
| F4 | Shared primitives and preservation specification | 2% | 0% | IN_PROGRESS · lead | [PRIMITIVES.md](docs/mera/ui-audit/PRIMITIVES.md) |
| F5 | Compact shared shell, account menu and role landing | 4% | 0% | IN_PROGRESS · lead | [WorkspaceAccount.tsx](src/mera/workspace/WorkspaceAccount.tsx), [mera-ui-pilot.test.tsx](tests/mera-ui-pilot.test.tsx) |
| F6 | Durable progress and complete screen inventory | 2% | 100% | VERIFIED · lead | [MERA_UI_PROGRESS.json](MERA_UI_PROGRESS.json), [mera-ui-progress.js](scripts/mera-ui-progress.js) |
| O1 | Overview layout pilot | 2% | 60% | IN_PROGRESS · lead | [05-mera-overview-after.jpg](docs/mera/ui-audit/screenshots/05-mera-overview-after.jpg), [10-mera-overview-narrow.jpg](docs/mera/ui-audit/screenshots/10-mera-overview-narrow.jpg), [design-qa.md](design-qa.md) |
| O2 | Overview actionable content and date context | 3% | 0% | IN_PROGRESS · lead | [OverviewAttention.tsx](src/mera/workspace/OverviewAttention.tsx), [mera-ui-pilot.test.tsx](tests/mera-ui-pilot.test.tsx), [PILOT-CHECKPOINT-2026-11-18.md](docs/mera/ui-audit/PILOT-CHECKPOINT-2026-11-18.md) |
| O3 | Onboarding, branding and branch setup | 4% | 0% | IN_PROGRESS · workspace | [mera-management-ui.test.tsx](tests/mera-management-ui.test.tsx), [management.css](src/mera/workspace/management.css) |
| O4 | Menu, categories, modifiers and stock management | 5% | 0% | NOT_STARTED · workspace | Pending |
| O5 | Staff, invitations, scopes and custom roles | 3% | 0% | NOT_STARTED · workspace | Pending |
| O6 | Transactions, shifts, reports and exports | 4% | 0% | NOT_STARTED · workspace | Pending |
| O7 | Subscriptions, printing, QR and customer/support care | 4% | 0% | NOT_STARTED · workspace | Pending |
| P1 | Original-style POS catalog and current order | 5% | 60% | IN_PROGRESS · lead | [06-mera-pos-after-empty.jpg](docs/mera/ui-audit/screenshots/06-mera-pos-after-empty.jpg), [07-mera-pos-tablet.jpg](docs/mera/ui-audit/screenshots/07-mera-pos-tablet.jpg), [09-mera-pos-narrow-basket.jpg](docs/mera/ui-audit/screenshots/09-mera-pos-narrow-basket.jpg), [mera-ui-pilot.test.tsx](tests/mera-ui-pilot.test.tsx) |
| P2 | Order lists, details, responsibility and help | 4% | 0% | NOT_STARTED · lead | Pending |
| P3 | Waiter tables, rounds, bills and handoffs | 4% | 0% | NOT_STARTED · lead | Pending |
| P4 | Kitchen and bar preparation | 3% | 0% | NOT_STARTED · lead | Pending |
| P5 | Front desk reservations, arrivals and waitlist | 4% | 0% | NOT_STARTED · lead | Pending |
| C1 | Mobile menu and persistent cart pilot | 6% | 60% | IN_PROGRESS · customer | [CustomerExperience.tsx](src/mera/customer/CustomerExperience.tsx), [mera-customer-ui-correction.test.tsx](tests/mera-customer-ui-correction.test.tsx), [PILOT-CHECKPOINT-2026-11-18.md](docs/mera/ui-audit/PILOT-CHECKPOINT-2026-11-18.md), [13-customer-narrow-menu.jpg](docs/mera/ui-audit/screenshots/13-customer-narrow-menu.jpg), [14-customer-narrow-basket.jpg](docs/mera/ui-audit/screenshots/14-customer-narrow-basket.jpg), [15-customer-tablet.jpg](docs/mera/ui-audit/screenshots/15-customer-tablet.jpg) |
| C2 | Checkout, pending recovery, tracking and receipts | 5% | 0% | IN_PROGRESS · customer | [mera-customer-ui-correction.test.tsx](tests/mera-customer-ui-correction.test.tsx) |
| C3 | Visit joining, bills, rounds and help | 4% | 0% | NOT_STARTED · customer | Pending |
| C4 | Reservations, activity and consent | 3% | 0% | NOT_STARTED · customer | Pending |
| C5 | Customization dialogs and organization themes | 2% | 0% | NOT_STARTED · customer | Pending |
| M1 | Marketing homepage pilot | 4% | 0% | NOT_STARTED · backend | Pending |
| M2 | Marketing features, pricing, legal and signup | 2% | 0% | IN_PROGRESS · backend | [mera-signup-ui.test.tsx](tests/mera-signup-ui.test.tsx) |
| M3 | Mera platform administration | 4% | 0% | NOT_STARTED · backend | Pending |
| Q1 | Four-surface reference comparison gate | 3% | 0% | NOT_STARTED · lead | Pending |
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
| WS-preparation | /mera/workspace#preparation | Kitchen/bar | P4 | Tickets/OrderInstructions/ItemFulfillment | NOT_STARTED; Prior pilot evidence only for overview/counter; full scope pending |
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
| CU-menu | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: menu | Guest/customer | C1 | menu | NOT_STARTED; NOT_VERIFIED |
| CU-cart | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: cart | Guest/customer | C1 | cart | NOT_STARTED; NOT_VERIFIED |
| CU-checkout | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: checkout | Guest/customer | C2 | checkout | NOT_STARTED; NOT_VERIFIED |
| CU-tracking-receipt-history | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: tracking-receipt-history | Guest/customer | C2 | tracking-receipt-history | NOT_STARTED; NOT_VERIFIED |
| CU-table-visit-bills | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: table-visit-bills | Guest/customer | C3 | table-visit-bills | NOT_STARTED; NOT_VERIFIED |
| CU-help | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: help | Guest/customer | C3 | help | NOT_STARTED; NOT_VERIFIED |
| CU-reservations | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: reservations | Guest/customer | C4 | reservations | NOT_STARTED; NOT_VERIFIED |
| CU-activity-consent | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: activity-consent | Guest/customer | C4 | activity-consent | NOT_STARTED; NOT_VERIFIED |
| CU-customization-theme | /mera/menu/:slug/:branchId or /mera/store/:slug/:branchId :: customization-theme | Guest/customer | C5 | customization-theme | NOT_STARTED; NOT_VERIFIED |
| PUB-homepage | /mera | Prospective business | M1 | homepage | NOT_STARTED; NOT_VERIFIED |
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

- F2: owner clarified there is no original Mera screenshot. Create and present visual directions, then record explicit selection before marketing/platform visual implementation.
- F4/F5: lead owns shared shell/primitives; workers request mounts rather than competing edits to OrganizationWorkspace/main/global styles.
- C1: customer agent implements the first mobile menu/cart candidate, then lead verifies screenshots before broader customer rollout.
- Some newly written backend leaves remain unmounted: stock-history, refund-requests, workspace-admin; print/alias/end-session PostgreSQL assertions remain pending. Show real unavailability, never mock success or label an error as empty data.
- The first two old pilot screens are reopened under expanded requirements (header/account menu, role landing, operational widgets). Existing screenshots prove only their captured states.
- Preserve current uncommitted work. No production deployment, real funds, external sending or production data changes authorized.

## Scope history

- 2026-11-18T15:56:52+01:00: Baseline1.0 frozen before new implementation; weight 100; 11.2 points / 11% rounded.
- 2026-11-18T16:10:03+01:00: Customer menu/cart integrated and exercised; account/settings/signup pilots remain partial; no scope change; weight 100; 14.8 points / 14% rounded.

Regenerate this report with `node scripts/mera-ui-progress.js`. The calculation validates weights, task IDs, mapped screens and local evidence paths; the lead still reviews whether evidence supports each checkpoint.
