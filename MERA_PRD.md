# Mera — Product Requirements Document

Version: 1.0  
Date: 18 November 2026  
Status: Implementation specification; unresolved commercial and provider decisions remain explicit below.  
Companion: `MERA_MULTI_AGENT_BUILD_PROMPT.md`

## 1. Product objective

Mera is a hosted, web-first hospitality management platform. It manages the journey from menu discovery and reservations through ordering, preparation, payment, service and daily reconciliation.

Customers enter primarily through organization, branch or table QR codes. Staff use role-specific interfaces. Owners manage organizations and branches. Mera operators manage subscriptions, integrations, organizations and platform revenue.

Evolve the existing Bing Chun application rather than assuming a rewrite. Bing Chun Surulere remains the initial development and test business. Preserve the existing UI quality while replacing Windows-hosted, single-business assumptions with secure hosted operation.

## 2. Scope

### Included

- Marketing website and organization onboarding.
- Organization subdomains, branding and multiple branches.
- Staff invitations, template roles, custom roles and scoped permissions.
- Nested menu categories, products, variants, modifiers and publication.
- Counted sellable stock and unlimited-stock products.
- Permanent QR codes, public menus, customer ordering and tracking.
- Staff-assisted orders, counter pickup, takeaway and table service.
- Table maps, visit sessions, shared bills and split/partial payments.
- Reservations, deposits, waitlists, arrivals and no-shows.
- Kitchen/bar preparation screens and station routing.
- Receipt/sticker studios and printing workflows.
- Cash, external POS and manually verified external transfers.
- Rubies-integrated online collections, subject to verified capabilities.
- Financial ledger, refunds, reconciliation and settlement visibility.
- Subscriptions and customer-platform transaction fees.
- Shifts, cash reconciliation and trading-day reports.
- Customer records, complaints and ratings.
- Platform administration and support controls.
- Zidi integration through authenticated APIs.
- Security, accessibility, monitoring, backups and recovery.

### Excluded

- Ingredient inventory, recipes, purchasing and supplier management.
- Native Mac and Windows applications.

Finished-product stock remains included. Full offline transaction synchronization is not presumed: explicitly implement and test degraded-network behavior. Cached information must not imply an order or payment was submitted successfully.

## 3. Product surfaces and service modes

| Surface | Users | Purpose |
|---|---|---|
| Marketing website | Prospective businesses | Features, pricing, demos and signup |
| Organization workspace | Owners, managers and staff | Business operations |
| Customer storefront | Guests and customers | Browse, reserve, order, pay and track |
| Platform administration | Authorized Mera personnel | Platform operations |
| Integration API | Zidi and approved integrations | Authorized automation |

Kitchen, bar, cashier and front-desk views belong to the organization workspace.

Service modes are composable settings, not separate products:

| Mode | Capabilities |
|---|---|
| Counter/takeaway | Pickup queues, counter orders, pay-before-preparation |
| Table service | Table QR codes, waiters, open bills |
| Reservations | Availability, party sizes, arrivals, table allocation |
| Lounge/club | Table service, optional deposits and minimum spend |

## 4. Organization and branch model

Hierarchy: **Platform → organization → branch → operational records**.

An organization owns its brand, subscription, memberships and business configuration. A branch owns opening hours, stock, tables, orders, shifts and branch reports. Menu definitions may be shared with explicit branch price/availability overrides.

- Enforce organization ownership on every tenant-owned record.
- Enforce branch ownership on branch-specific records.
- Support separate memberships when a user belongs to multiple organizations.
- Organization-wide access never follows automatically from branch access.
- Names and subdomains must not be primary database identifiers.
- Apply tenant boundaries to queries, files, events, background jobs, caches and exports.

## 5. Onboarding

1. Create and verify owner account.
2. Create organization and select service modes.
3. Claim an available subdomain.
4. Add contacts and initial branch.
5. Configure timezone, currency, hours and trading-day cutoff.
6. Set branding.
7. Create/import menu and modifiers.
8. Configure stock and ordering policies.
9. Add tables/reservation policies where relevant.
10. Invite staff and assign branch access.
11. Configure payment methods and provider verification.
12. Configure receipt/sticker layouts.
13. Review subscription and fee disclosures.
14. Preview, complete readiness checks and publish.

Save resumable progress. Explain incomplete steps. Allow preview before publication. Separate organization readiness from payment-provider approval. Never label an unconfirmed wallet active. Manual-payment launch may be allowed by explicit platform policy while integrated collection remains unavailable.

## 6. UI, branding, domains and QR codes

Preserve the existing UI and supplied reference: cream backgrounds, dark primary controls, restrained accents, elegant headings, clear hierarchy and live-preview customization. Inspect actual screens before implementing changes.

Operational screens prioritize readable prices, obvious states, fast touch interactions and clear responsibility. Use shared design tokens and components across surfaces.

Customization: logo, primary/accent colors, approved fonts, cover image, description, contacts, menu presentation and receipt/sticker branding. Provide mobile/desktop previews and contrast safeguards. Do not accept arbitrary scripts or unrestricted HTML.

Proposed routing, subject to domain ownership:

- Main domain: marketing.
- Application subdomain: staff workspace and onboarding.
- Organization subdomain: customer storefront with branch context.
- Restricted route/subdomain: platform administration.

Subdomain allocation is unique and case-insensitive, validates permitted characters, reserves platform names and handles concurrent claims atomically. Stable QR identifiers survive menu updates and support managed redirects after approved renaming. Each QR resolves organization, branch and optional table context; it must not contain private customer information.

## 7. Identity, roles and invitations

### Customers

Allow anonymous browsing. Request a display name when submitting an order or joining a visit. Offer optional verified phone/email access for persistent cross-device history. Use secure guest sessions for current-visit continuity; browser storage is not durable identity. Do not use MAC addresses or fingerprinting.

Never reveal private history from a name, table number or public QR alone. Scope organization-visible customer activity appropriately even if authentication identity is shared. Marketing consent is separate from transactional communication. Define data retention and account-support workflows.

### Staff

Template roles: owner, organization administrator, branch manager, cashier, waiter, kitchen, bar, front desk, stock controller and reports-only viewer.

Custom roles combine explicit permissions and organization/branch scope. Distinguish viewing/exporting, requesting/approving refunds, creating/changing prices, recording payments/managing wallets, editing/publishing menus and managing roles/subscriptions.

Invitation flow: authorized admin supplies email, role and scope; a single-use, expiring invitation is sent; recipient verifies/accepts; membership activates. Invitations are revocable. Production email sending requires configured delivery and authorization.

Enforce permissions on the server. Apply suspensions and access changes promptly. Prevent granting privileges beyond authority and accidental removal of the last active owner. Audit privileged actions. Require stronger authentication for platform administration and high-risk financial actions.

## 8. Menu management

Support nested categories, suggested starter categories, product photos/descriptions, sizes/variants, required/optional modifier groups, modifier limits/prices, sweetness, ice, toppings, allergens, dietary labels, branch overrides, schedules, bulk availability, drafts/publication and station routing.

- Customers see only published, eligible items.
- Server determines prices and valid combinations.
- Historical order lines snapshot names, prices, modifiers, discounts and charges.
- Publication never rewrites historical receipts.
- Checkout detects relevant menu, price and availability changes.
- Publication updates do not require QR replacement.
- Store opening hours, menu schedules and manual ordering pauses are distinct controls.

## 9. Sellable stock

Each sellable item/variant has unlimited or counted stock and a manual availability override. Stock is branch-specific.

Movements include opening balance, adjustment, checkout hold, consumption, released hold, approved restocking and waste/loss.

- Cart additions do not permanently consume stock.
- Checkout holds expire predictably.
- Confirmation commits consumption exactly once.
- Concurrent orders cannot oversell.
- Rejection/expiry releases eligible holds.
- Refunds do not automatically restock prepared goods.
- Adjustments require permission and reason.
- Provide low-stock alerts and configurable hidden/shown sold-out items.
- Define when a pay-later accepted order commits stock.
- Handle late successful payment after stock-hold expiry through an explicit exception workflow.

## 10. Ordering and fulfillment

Channels: customer QR, staff-assisted and Zidi. Fulfillment: counter pickup, takeaway and table service.

Customer journey: scan → confirm branch/context → browse/search → customize → review cart → required guest details → review complete total → submit/pay according to policy → track → receipt/feedback.

Show every mandatory customer-paid charge before confirmation. Use idempotency for repeated taps and retries. Return stable references. Clearly show pending, rejected, unavailable and uncertain-payment states. Provide help requests. Never silently substitute items; record approved substitutions and cancellation outcomes.

### Responsibility and visibility

Every order shows its current handler and history. Track customer, source, staff creator, assigned waiter/service owner, preparation station, accepting/preparing staff, payment recorder/provider source, fulfillment actor and refund requester/approver.

Provide searchable organization/branch lists, filters by status/channel/payment/branch/staff/time, unassigned queues, audited reassignments and delayed-order alerts. Handoffs retain previous responsibility and timestamp the new assignment.

## 11. Independent state machines

| Domain | Core states |
|---|---|
| Order | Submitted, accepted, preparing, ready, served/collected, completed, rejected, cancelled |
| Payment | Unpaid, pending, partially paid, paid, partially refunded, refunded, failed, expired |
| Reservation | Requested, confirmed, arrived, seated, completed, cancelled, no-show |
| Print | Queued, submitted, failed, cancelled; confirmed only if supported |

Define allowed transitions, actors, side effects and reversal rules. Configure pay-before-preparation versus approved pay-later. Support financially consistent partial item cancellation/fulfillment. Kitchen/bar tickets progress independently; overall readiness derives from required stations/items. Printer failure must not recreate orders or inherently block preparation. Reprints are labeled and audited.

## 12. Tables, sessions and bills

Editable maps support zones, labels and capacities. Distinguish physical table, current visit, guests, assigned waiter, orders, bill and reservation association.

Current states: available, reserved, occupied, cleaning and unavailable. Future bookings must not incorrectly mark a table occupied now.

Support controlled guest joining, multiple guest orders, additional rounds, table moves, eligible table combinations, splitting by item/guest/amount, partial payment, closing and reset.

- New visits cannot access prior visits.
- QR possession alone does not authorize private bill access or privileged actions.
- Use configurable staff acceptance, payment or visit joining codes against remote misuse.
- Prevent double allocation when splitting/merging bills.
- Unresolved balances block closure except an authorized, audited write-off/outcome.
- Define minimum-spend shortfalls and reservation-deposit treatment explicitly.

## 13. Reservations and front desk

Capture customer contact, party size, date/time/duration, branch, optional table/zone preference, notes, deposit requirement and source.

Provide capacity/overlap checks, booking windows, buffers, concurrent-booking protection, late rules, waitlist, walk-ins, reminders, deposits, cancellation/no-show policies and logged overrides. Convert reservations into visits without duplicating guests or deposits. Define cancellation cutoffs and refund outcomes before publication.

## 14. Payments, wallets and ledger

Methods: cash, external POS, staff-verified external transfers and Rubies-integrated collections. Multiple allocations may settle one order; deposits may settle later bills through explicit allocation.

- Record amount, method, reference, source, actor and timestamps.
- Separate manual confirmation from provider verification.
- Customer “I have paid” requests verification; it is not proof.
- Handle partial, excess, late, failed, reversed and unmatched payments.
- Verify callbacks using supported provider mechanisms; handle duplicates and out-of-order delivery.
- Use safe monetary types, explicit rounding and currency.
- Maintain append-only ledger entries with balanced postings and compensating adjustments.
- Reconcile internal records against provider transactions and settlements.
- Separate sales, collections, merchant entitlement, Mera fees, provider costs, refunds and settlements.
- Never expose provider credentials to browsers.
- Protect withdrawals and destination-account changes with scoped authority and auditing.

Verify Rubies agreements/API capabilities for business verification, wallet ownership, organization/branch wallet structure, virtual accounts, matching, fee deduction, settlement, withdrawals and refunds. Do not infer approval from public API availability. Unavailable capabilities remain explicitly blocked or simulated outside production.

## 15. Subscription and transaction fees

Proposed initial policy, not a final commercial commitment:

- NGN 13,500 per organization per month, one branch included.
- Additional-branch pricing configurable and pending approval.
- 0.1% on successfully confirmed Mera-integrated customer collections.
- No collection fee on recorded cash or external POS.
- Manually recorded external transfers excluded unless an approved policy changes this.

The alternative NGN 17,500 multi-branch plan remains a pricing option, not an approved default. Do not market unlimited branches without an approved entitlement.

Model order source separately from payment origin. A customer QR order paid through external POS does not accidentally incur an integrated-collection fee.

Configure effective dates, included branches, fee payer, calculation basis, rounding, discounts, refund treatment, provider costs, trial, grace and suspension. Separate venue service charges, taxes and Mera fees. Historical transactions retain their original policy/rates.

Subscription states: trialing, active, past due, suspended, cancelled. Show invoices/history and warn before restrictions. Define permitted access/exports under suspension. Never interrupt an already paid active customer order abruptly. Do not assume recurring debit capability or consent.

## 16. Shifts and reporting

Support shift opening/closing, opening float, reasoned cash movements, expected/count comparison, variance explanation, manager approval and staff handover.

Trading-day reporting uses branch timezone and cutoff, including days that cross midnight.

Reports distinguish gross sales, discounts, taxes, venue charges, Mera fees, refunds, net sales, actual collections, outstanding balances, payment methods, quantities sold, staff activity and order states. Provide permission-controlled exports. Define each metric so sales are not confused with cash receipts or deposits.

## 17. Receipts and printing

Studios provide branded layouts, supported paper sizes, sample previews, branch information, references, lines/modifiers, totals, payments, table/pickup context, taxes/charges and preparation labels.

Support station routing, queues, retries and audited reprints. Browser printing may be the initial method. Silent printing needs verified hardware support or an explicitly scoped local bridge; do not promise generic silent browser printing. A bridge is infrastructure rather than a native desktop product, but its installation requirements must be explicit.

Physical receipt and sticker testing/calibration remains a launch gate for supported hardware. Submission does not prove physical output.

## 18. Customers, complaints and ratings

Associate feedback with completed orders/visits. Capture rating/text, complaint category, handler, status, escalation and resolution. Provide organization-scoped history and separate marketing preferences. Restrict sensitive notes. Apply abuse controls and retention policy. Publishing customer reviews is a deliberate moderated feature, not automatic exposure of complaints.

## 19. Zidi

Expose authorized menu/availability lookup, reservations, order submission/status and supported payment initiation. Use scoped credentials, branch authorization, versioned contracts, idempotency, rate limits, source attribution and supported signed outbound events.

Zidi uses the same pricing, stock, capacity and payment rules as web clients. No unrestricted database access or independent payment confirmation. Use a schema-validated, contract-tested simulator if actual access/contracts are missing; label it clearly.

## 20. Platform administration

Include organization/branch directory, contacts, onboarding, subscription/invoice states, provider verification, wallet states, transaction/settlement lookup, processed volume, assessed/refunded/collected/settled fees, provider costs, net revenue, reconciliation exceptions, integration health, failed-job queues, support cases, feature flags, suspension/restoration and audit logs.

Restrict and log support access. Any impersonation requires a time-limited authorized session with explicit audit history. Keep merchant funds distinct from Mera revenue.

## 21. Security, reliability and accessibility

Enforce tenant authorization; secure sessions/secrets; validate input/uploads; rate-limit sensitive flows; protect against common browser/request attacks. Use durable jobs, bounded retries and visible dead-letter/failure handling. Redact secrets and unnecessary personal data from logs.

Provide migrations, encrypted automated backups, tested restore procedures, monitoring, incident runbooks and alerts for stuck orders/payment exceptions. Use reconnect plus canonical state refresh for live screens. Test simultaneous updates and stale clients.

Target WCAG 2.2 AA for primary workflows. Include keyboard navigation, focus management, readable contrast, responsive layouts and meaningful loading/empty/error/recovery states.

Proposed performance targets, to validate in the actual environment:

- Menu usable within three seconds on a representative midrange mobile device/connection.
- Most internal operations complete within two seconds excluding provider latency.
- Operational updates normally appear within three seconds.
- Establish a written load profile and measured capacity before claiming scale.

## 22. Key entities

Organization, Branch, User, Membership, Role, Permission, Invitation, BrandConfiguration, SubscriptionPlan, Subscription, Invoice, MenuVersion, Category, Product, Variant, ModifierGroup, ModifierOption, BranchMenuOverride, StockBalance, StockMovement, StockHold, CustomerProfile, GuestSession, FloorZone, Table, TableSession, Reservation, WaitlistEntry, Order, OrderLineSnapshot, AssignmentHistory, PreparationTicket, Payment, PaymentAllocation, Refund, LedgerAccount, LedgerEntry, ProviderEvent, ReconciliationException, Settlement, Shift, CashMovement, PrintTemplate, PrintJob, Complaint, Rating, Notification, IntegrationCredential and AuditEvent.

Adapt entity boundaries to existing architecture while preserving invariants. This list does not require one database table per concept.

## 23. Delivery sequence

1. Repository assessment, UI preservation and migration architecture.
2. Shared contracts, organizations, branches, authentication and permissions.
3. Marketing, onboarding and customer/workspace shells in parallel.
4. Menu, stock, customer/staff ordering and preparation.
5. Tables, bills, reservations and deposits.
6. Payments, ledger, subscriptions and fee reporting.
7. Shifts, reports, complaints, printing, platform administration and Zidi.
8. Integrated verification, migration rehearsal and release preparation.

All included modules are in the build scope. Sequence does not make later modules optional.

## 24. Acceptance and launch gates

- Inspect actual Bing Chun code/data; document reuse and local-server dependencies.
- Seed/migrate Bing Chun and Surulere safely; reconcile included historical finance.
- Prove cross-organization and unauthorized-branch access is denied, including exports/jobs/files.
- Complete customer and staff orders using the same backend rules.
- Demonstrate actor/assignment history for orders and transactions.
- Test duplicate submission and concurrent purchase of the last stock unit.
- Test successive table visits, split bills and concurrent reservations.
- Test partial/excess/late payments, refunds, rounding and provider event retries/reordering.
- Reconcile a trading day across sales, allocations, refunds, fees, deposits and cash.
- Test invitation expiry/revocation and immediate staff suspension.
- Verify pricing disclosures, entitlements and subscription restrictions.
- Verify QR routes, organization subdomains and TLS in target hosting.
- Check responsive/accessibility behavior and UI consistency.
- Test network loss, job recovery and real-time reconnection.
- Restore a backup in a rehearsal environment.
- Validate actual Rubies and Zidi integrations or identify exact external blockers.
- Physically verify supported receipt/sticker hardware.
- Document support, outage, deployment and incident procedures.

Existing automated Windows tests do not establish hosted-web readiness. Do not claim completed deployment, physical output or settlement without evidence.

## 25. Decisions requiring explicit resolution

| Decision | Working treatment |
|---|---|
| Additional-branch price | Configurable; unpublished until approved |
| Fee payer/basis/refund policy | Explicit policy required before live billing |
| Trial/grace/suspension duration | Configurable; owner approval before launch |
| Rubies wallet/settlement model | Verify contract and provider approval |
| Zidi integration contract | Adapter/simulator until verified |
| Domain ownership and hosting | Verify actual environment |
| Printer models/connection method | Inspect and physically test |
| Notification providers | Adapter/configuration; no fictitious delivery |
| Retention, taxes and mandatory disclosures | Obtain appropriate business/legal/accounting decisions |
| Offline continuity level | Honest degraded behavior first; explicit additional synchronization scope |

## 26. Reference resources

These are discovery starting points, not substitutes for current integration verification:

- Rubies fintech services: https://fintech.rubies.ng/
- Rubies API documentation: https://developer.rubiesbank.io/
- NDPC guidance: https://ndpc.gov.ng/wp-content/uploads/2025/03/NDP-ACT-GAID-2025-MARCH-20TH.pdf
- Apple private Wi-Fi address explanation: https://support.apple.com/en-us/102509

The user's UI reference and existing application's actual screens are visual inputs. Copy the supplied reference image into the repository separately if available; these Markdown files do not embed that attachment.
