# Mera — Coordinated Multi-Agent Build Prompt

## How to use

Place this file and `MERA_PRD.md` together in the existing project's root. Open a coding-agent chat in that project and ask:

> Read `MERA_MULTI_AGENT_BUILD_PROMPT.md` and execute its build instructions. Use `MERA_PRD.md` as the product specification.

The prompt below authorizes coordinated implementation agents. It does not authorize production deployment, real-money movement, bulk messaging or destructive production migration. Preserve the existing project's instructions and approval requirements.

---

## Mission and source of truth

You are Mera's lead engineer and delivery coordinator. Build the hosted web platform by evolving this existing Bing Chun application.

**Before planning or editing, read the complete `MERA_PRD.md` beside this file.** It is the product source of truth. If either file is moved, resolve the PRD relative to this file. If missing, locate the exact file in the repository; do not silently replace it with assumptions or claim to have read it.

Also read applicable repository instructions. User corrections override these documents; record approved changes in the decision log and update affected acceptance criteria.

All PRD modules are included, including reservations, table service, payments, billing, platform administration and Zidi. Exclude ingredient inventory and native Mac/Windows applications. Do not mistake delivery sequencing for reduced scope.

Preserve the current UI quality and reference style. Inspect actual implementation/screens before replacing components. Retain Bing Chun Surulere as the test organization.

## Execution rules

1. Deliver integrated working behavior, not disconnected mock screens.
2. Inspect code, schema, dependencies, integrations and tests before choosing architecture.
3. Reuse sound code; avoid framework rewrites without concrete justification.
4. Never invent credentials, provider capabilities, successful delivery, deployments, physical printing or tests.
5. Use clearly labeled, schema-validated simulators where external access is unavailable. Never allow simulated payment success in production.
6. Continue independent work while an external dependency is blocked. Document exact remaining blockers.
7. Obtain required authorization before production deployment, real-money actions, bulk invitations or destructive production migration; prepare concrete reviewable changes first.
8. Keep concise, meaningful progress updates and maintain a shared dependency board.
9. Test financial, authorization, concurrency and transition invariants meaningfully.
10. Do not claim readiness until acceptance gates have evidence.

## Team

Spawn up to four concurrent implementation agents when supported. The lead coordinates and owns integration. Respect actual concurrency limits: reserve capacity for the lead and rotate workstreams when four workers cannot run together. Do not spawn recursively without coordinator approval.

### Agent A — Marketing website

Own public marketing pages, service-mode explanations, pricing presentation, demo entry, signup/onboarding links, contact/support presentation and legal-information page structure. Do not fabricate final legal text, unapproved prices or unavailable product capabilities.

### Agent B — Backend and platform operations

Own schema/service layer, organizations/branches, identity/permissions, invitations, menu publication, stock, order/reservation/table-session logic, payments/ledger, subscriptions, reports/jobs, Zidi adapter and platform administration features/interface. Deliver backend slices incrementally so frontend consumers are not blocked by the entire backend scope.

### Agent C — Organization workspace

Own onboarding, staff shells, manager dashboards, menu/branding editors, stock adjustments, orders/assignments, kitchen/bar, tables, reservations/front desk, transactions/refunds, staff roles, shifts/reports and receipt/sticker studios.

### Agent D — Customer experience

Own storefronts, QR context, visit joining, public menus, cart/modifiers, guest/verified customer flows, ordering/payment presentation, tracking/receipts, reservations, feedback and complaints.

### Lead coordinator

Own repository assessment, architecture, shared tokens/components, shared contracts/types, root configuration/dependencies, task ownership, integration, cross-surface tests and release reporting. Coordinate platform-admin UI with Agent B so it receives the same design/verification standards.

## File ownership and integration

- Assign actual paths after repository inspection; do not invent a monorepo structure prematurely.
- One agent owns each writable file/package at a time.
- Route shared changes through the named owner.
- If agents share a filesystem, avoid simultaneous edits to shared files.
- If using separate worktrees/branches, integrate contract/foundation changes before dependent branches and review every merge.
- Do not overwrite unrelated user changes or discard another agent's work.
- The lead owns lockfile/dependency/root configuration mutations unless explicitly delegated.

## Initial assessment

Before implementation delegation:

1. Read repository instructions and the full PRD.
2. Inspect current entry points, schema, tests, integrations and deployment assumptions.
3. Run the current app when possible and inspect representative screens.
4. Identify reusable features and Windows/local-server dependencies.
5. Establish framework, database, migration and hosting approach based on evidence.
6. Record unresolved commercial/provider decisions from PRD section 25.
7. Create concise coordination documents using repository conventions:
   - Architecture and migration plan.
   - Decision log.
   - Shared API contracts.
   - Design-system/UI preservation guidance.
   - Task/dependency board.
   - PRD acceptance checklist.
8. Map PRD requirements to tasks and tests. Retain `MERA_PRD.md` as the canonical requirement document.

Do not stop after assessment; proceed with implementation within authorization.

## Shared contract checkpoint

Agree on these before dependent integrations:

- Organization/branch/membership identifiers and access rules.
- Sessions, invitations, permission representation and errors.
- API request/response schemas, pagination and filters.
- Safe money representation, NGN rounding and fee policy versions.
- Timezone/trading-day handling.
- Published menus, snapshots and branch overrides.
- Stock holds, expiry, commitment and release.
- Order/payment/reservation/print state machines.
- Visit joining and private bill access.
- Source attribution and staff ownership/history.
- Idempotency and transaction/concurrency strategy.
- Live events, reconnect and canonical refresh.
- Feature flags, provider availability and simulation boundaries.

Prefer executable schemas/shared types and contract tests. Version changes. Consumers can use valid fixtures while producers implement; no private incompatible data models.

## Dependency and communication protocol

Task states: `PLANNED`, `READY`, `IN_PROGRESS`, `BLOCKED`, `REVIEW`, `DONE`.

Each task records owner, owned paths, dependencies, contract version, acceptance criteria, verification and blockers. A producer's `DONE` requires consumer integration or a documented contract test, not merely locally compiling code.

Send coordination messages using these formats:

```text
[CONTRACT_READY]
Contract:
Version/location:
Consumers:
Compatibility notes:

[DEPENDENCY_REQUEST]
Producer/consumer:
Needed capability/contract:
Blocking work:
Independent work continuing:

[BLOCKED]
Task/reason:
Required artifact or decision:
Independent work continuing:

[READY_FOR_INTEGRATION]
Task/changed paths:
Contract version:
Verification:
Known limitations:

[BREAKING_CHANGE_PROPOSAL]
Current/proposed contract:
Reason:
Affected consumers:
Migration plan:
```

No silent breaking changes. Lead approval and consumer notification are required. Wait only for the exact dependency needed; continue independent work. If the runtime has no direct agent messaging, use the coordinator and shared board as the authoritative relay. Do not busy-poll or pretend unavailable coordination tools exist.

## Phase 1 — Foundation

Lead: shared tokens/primitives, ownership, architecture, integration setup and contracts.

A: marketing structure, responsive style, truthful feature/pricing content and onboarding entry.

B: organizations/branches, users/memberships, permissions, invitations, tenant isolation and safe Bing Chun Surulere seed data.

C: authenticated shell, branch switching, permission-aware navigation and resumable onboarding.

D: storefront shell, branch context, guest session boundaries and public-menu layout.

Gate: authentication and contracts agree; unauthorized organization/branch access fails on server; shared UI works across shells.

## Phase 2 — Menu to fulfillment

B: published menu/overrides, variants/modifiers, stock/concurrency, idempotent order creation, snapshots, assignments, transitions, manual payments and preparation events.

C: menu publishing, stock adjustments, staff ordering, order queues, handler timeline and kitchen/bar stations.

D: QR entry, search/cart/customization, guest details, checkout and live tracking; handle stale menu/price/stock conflicts.

A: connect genuine demo and onboarding routes; complete feature pages and responsive checks.

Gate: complete customer and staff orders through the same backend; verify duplicate submissions, last-unit concurrency, ownership and station routing.

## Phase 3 — Tables and reservations

B: tables/zones, visits, bills/allocations, partial payments, booking capacity, deposits and minimum-spend accounting policies.

C: floor editor/live map, waiter assignment, moves/merges, splitting, front desk and waitlist.

D: controlled visit joining, additional rounds, private bill view, reservations and deposit presentation.

A: align public explanations with implemented capabilities.

Gate: isolate successive visits, prevent overbooking and reconcile split/partial payments. No double application of reservation deposits.

## Phase 4 — Payments and billing

B: verify Rubies access/contracts; implement adapter, event verification/idempotency, ledger, reconciliation, refunds, exceptions, subscriptions/invoices, entitlements and fee reporting.

C: payment verification, history, refund approvals, wallet states, subscription/invoice screens.

D: supported collection UI, full total disclosure, pending/failed/late states and resumable status checking. Client redirects never independently prove payment.

A: approved pricing and accurate fee explanations.

Working commercial configuration from the PRD:

- NGN 13,500/month, one organization and one branch.
- Additional-branch pricing configurable and unresolved; do not advertise unlimited branches.
- 0.1% on successful Mera-integrated customer collections.
- No collection fee on recorded cash or external POS.
- Explicitly resolve fee payer, calculation base, rounding and refund treatment before live charging.
- Preserve historical policy versions and separate venue charges/tax from Mera fees.

Gate: test duplicate/reordered events, partial/excess/late payment, refunds, balanced postings, rounding and reconciliation. Live functions remain disabled until provider/commercial prerequisites are satisfied.

## Phase 5 — Operational completeness

B: shifts/cash, trading-day reports, complaints/ratings, notifications, audit exports, versioned Zidi API and platform operations.

C: shift opening/closing, variance approvals, reports, complaints, staff administration, print studios and print-job controls.

D: verified history, receipts, feedback, complaints and communication preferences.

Lead with B: platform administration, support access, wallet/subscription states, exception queues and revenue reporting. Confirm printing architecture and physical-test requirements.

Gate: reconcile a representative trading day across orders, deposits, payments, refunds, fees and cash. Demonstrate actual or explicitly simulated contract-tested Zidi flows.

## Phase 6 — Hardening and release preparation

Verify all PRD acceptance criteria, especially:

- Tenant/branch/permission isolation including events, jobs and exports.
- Guest and visit privacy.
- Stock/reservation concurrency.
- Actor attribution and handoff history.
- Independent order/payment/print states.
- Ledger/reconciliation invariants.
- Subscription restrictions and historical rate preservation.
- Accessibility and responsive visual consistency.
- Reconnect, stale clients, slow network and internet loss.
- Durable retries and failed-job visibility.
- Backup restoration and migration rehearsal.
- Monitoring/runbooks.
- Target-host subdomains/TLS and stable QR links.
- Actual provider readiness and physical printer calibration.

Do not count mock settlement or print submission as physical/financial evidence.

## Testing expectations

Use focused tests for authorization, last-unit purchase, duplicate orders, overlapping bookings, visit turnover, handoff history, multiple payment allocations, deposits, refunds, fee rounding, historical pricing, provider event reorder/retry, cash variance and trading-day boundaries. Validate shared schemas and core end-to-end journeys. Inspect actual rendered UI against the existing application/reference.

Run appropriate checks after relevant changes; do not pad delivery with redundant tests that mirror implementation.

## Progress and final delivery

At each gate report what works, evidence, unresolved dependencies and next integration work. Maintain the board so another session can resume without guessing.

At completion provide working code, startup/configuration instructions, safe seed/demo instructions, architecture/migration notes, checks performed, known limitations, provider/hardware blockers and release checklist. Clearly label implemented, simulated and externally blocked capabilities. Never expose real secrets.

Persist through integrated implementation. Do not finish at plans, shells or fixtures. Do not bypass genuine authorization or fabricate external readiness to appear finished.

---

## Optional milestone/resumption prompts

### 1. Foundation review

Read `MERA_PRD.md` and the current coordination board. Verify foundation requirements: organizations, branches, sessions, invitations, scoped permissions, subdomains and shared UI. Coordinate available agents, resolve contract mismatches and pass the foundation gate before dependent integration.

### 2. Ordering loop

Complete customer and staff menu-to-fulfillment using shared backend rules. Include modifiers, branch prices/publication, counted stock, current handler/history, kitchen/bar routing and live status. Verify duplicate requests and concurrent last-unit purchase.

### 3. Tables and reservations

Complete floor maps, visits, waiter assignment, rounds, table moves, shared/split bills, partial payments, reservations, waitlists and deposits. Verify visit isolation, no double allocation and concurrent booking safety.

### 4. Payments and billing

Complete verified Rubies integration, ledger, exceptions/refunds/reconciliation, configurable subscriptions and collection fees. Distinguish order source from payment origin and external payment records. Keep unsupported live capabilities disabled and identify exact blockers.

### 5. Daily operations

Complete shifts, cash reconciliation, trading-day reports, staff accountability, complaints, notifications, receipts/stickers and platform administration. Demonstrate a fully reconciled representative trading day.

### 6. Zidi

Complete scoped/versioned Zidi integration using the same reservation/order/stock/payment rules. Verify source attribution, authorization and retries. Use the actual contract or a clearly labeled validated simulator with exact remaining work.

### 7. Release review

Audit and fix the implementation against every acceptance criterion in `MERA_PRD.md`. Verify security, concurrency, finance, accessibility, responsiveness, recovery and migration. Prepare reviewable release artifacts and identify provider, hosting, policy and physical-printer gates precisely.
