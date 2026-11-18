# MERA delivery board

Contract: shared/mera-contracts.js v1.0.0. Canonical scope: /MERA_PRD.md.

| Task                                  | Owner / writable paths                                         | State       | Dependencies / acceptance                                                  |
| ------------------------------------- | -------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| Assessment, architecture, integration | Lead: root files, docs/mera, src/mera shared                   | IN_PROGRESS | Preserve legacy database and UI; isolated demo only                        |
| Tenant backend/platform               | Backend: server/mera, shared/mera-contracts.js, tests/mera*.js | IN_PROGRESS | Scoped authorization, invariants and integration tests                     |
| Organization workspace                | Workspace: src/mera/workspace                                  | IN_PROGRESS | v1 context and branch API, actual loading/error states                     |
| Customer experience                   | Customer: src/mera/customer                                    | IN_PROGRESS | Public menus, guest privacy, shared ordering rules                         |
| Marketing website                     | Lead until worker slot available: src/mera/marketing           | READY       | Truthful pricing; demo links; no production publication                    |
| Rubies live collection                | Backend                                                        | BLOCKED     | Provider credentials, agreements and verified callback/settlement contract |
| Zidi live connection                  | Backend                                                        | BLOCKED     | Authorized versioned integration contract/credentials; simulator allowed   |
| Email delivery                        | Backend                                                        | BLOCKED     | Authorized delivery provider and verified sender; no messages sent         |
| DNS/TLS hosting                       | Lead                                                           | BLOCKED     | Target domain ownership/config; production deployment requires approval    |
| Physical printing                     | Lead                                                           | BLOCKED     | Receipt/sticker hardware and calibration                                   |

DONE requires consumer integration or executable contract evidence. Further PRD modules remain in scope, not presumed complete by this board.

## Integration checkpoint

- Frontend build passed (React/Vite, preserved existing screens).
- Isolated MERA demo running at localhost:3003; legacy POS stays localhost:3002.
- Marketing work rotated to customer agent after customer slice completed; all four requested surfaces have owners within four-slot limit.
- Customer and workspace live API integration/retry/privacy tests IN_PROGRESS.
- No production deployment, production migration, message delivery or real collections performed.

## Verified integration milestone

- Existing POS plus Mera suite: 26 passed,1 hardware/real-PG-dependent legacy worker test skipped at initial checkpoint.
- First isolated PostgreSQL MERA integration: passed tenant boundaries, concurrent last-unit201/409, idempotent order/payment, private guest tracking, partial/excess allocation, balanced manual ledger postings, independent preparation/print, visit turnover, booking capacity201/409,last owner protection.
- Hosted legacy endpoint boundary test: passed. Legacy unscoped products/orders/printing/report/customer-menu return404 in non-demo MERA mode.
- Actual browser: marketing,customer menu and authenticated organization workspace rendered at3003. Screenshot /private/tmp/mera-workspace.png. Scope remains development only.
- Customer live successive table visits: old guest cannot read old closed visit or a later visit; old code rejected; new authorized guest can read only current visit.
- Remaining code tasks include bill/deposit accounting, advanced menu/stock, scoped print studios, ledger/reconciliation and hosted operations. External gates are not used to conceal these unfinished implementation tasks.

## Second integration checkpoint — 18 November

| Slice | Owner | State | Evidence / dependency |
| --- | --- | --- | --- |
| Marketing and legal preparation | Customer (rotated Agent A) | REVIEW | Working branded pages and honest proposed-price/provider disclosures; verified signup remains a separate integration task |
| Guest storefront/branch directory/consent | Customer + lead QR module | REVIEW | Shared menu/order rules; explicit consent, private visit recovery, bounded network waits; live checks after preview restart |
| Stable organization/branch/table QR + exports | Lead + workspace | REVIEW | QR API tests pass; admin consumer tested; only configured public HTTPS origins outside demo |
| Manual financial accounting/bills/deposits | Backend | REVIEW | Real PG: immutable balanced postings; collection liabilities, fulfillment recognition, compensating refunds, split/merge conservation |
| Idempotency intent protection | Backend + workspace/customer | REVIEW | Same key/different payload rejected; uncertain UI retains exact original intent |
| Scoped Zidi simulator | Backend + workspace | REVIEW | Hashed/revocable scoped credentials; common ordering/reservation rules; production disabled |
| Durable exports, complaints, waitlist, invoices | Backend + workspace | IN_PROGRESS | Executable operations routes/consumers; isolated worker started; integration tests underway |
| Platform step-up/admin/support | Lead + backend integration | IN_PROGRESS | Encrypted TOTP factors; RFC6238 vectors pass; session-bound short-lived verification; audited status and configuration-only support |
| Rehearsal backup/restore | Customer | REVIEW | Real isolated PG dump/restore passed 17 tables; extended 20-table encrypted-MFA rehearsal underway |
| Historical migration rehearsal | Customer | READY | Isolated fixtures only; preserve original snapshots and reconcile; actual production cutover not authorized |
| Variant stock/menu schedules/custom roles/station tickets | Backend + workspace | IN_PROGRESS | Following operations checkpoint; cannot infer completion from shells |

Current checkpoint: `npm run build` passed; `npm test`: 43 passed, 2 skipped (separate PostgreSQL integration passes independently; physical legacy print worker test remains excluded). No production deployment, production migration, real funds or external messages.

Lead additionally owns server/mera/qr.js, platform.js, platform-schema.sql, server/mera-security.js, src/mera/Platform.tsx, root launch/worker wiring and corresponding QR/security/platform tests. Backend retains all other server/mera files and shared contracts; customer owns recovery/migration rehearsal scripts and tests by explicit handoff. Source branch `mera-platform` is pushed separately from main.

Second checkpoint verification: expanded `npm test` **50 passed,2 skipped**, `npm run build` passed. Backend separately passed isolated real PostgreSQL for jobs/invoice policy, consent scope, MFA replay/session/revocation, subscription restrictions and previous finance/Zidi invariants. Station readiness tightening is the next coordinated additive milestone; unmounted Tickets.tsx draft is excluded from this commit.

## Third integration checkpoint

- `npm run build` passed; `npm test`: **74 passed,2 skipped**. Separate temporary PostgreSQL integration passed station readiness/partial prepared counts, role scopes/stale versions, concurrent last variant and expiry, catalog-write stock preservation, opening hours/menu schedules, scoped shared-menu overrides, provider-event simulator replay/reordering, lease fencing, demo identity expiry/replay and unpaid item-cancellation conservation.
- Workspace now has discoverable page selection, keyboard tab navigation, bounded response deadlines, promptly refreshed membership context and protected-data clearing after authorization denial. Customer current-session activity and cancellation retain exact retry intent and never imply a deposit refund.
- Application publication/readiness and opt-in host routing are implemented and tested. This does not provision DNS/TLS or establish live provider access. Owner registration is a labeled development simulator until verified email delivery is configured.
- Migration staging rehearsal passed on a newly created fixture database: three legacy orders, two payments, one refund; original amounts/snapshots/actors/timestamps retained and gross/refund/net compared. **No operational historical import or actual cutover is claimed**: staging validation is not a production importer.
- Local read-only profile:50 menu requests,10 concurrent readers,0 failures, p50=9ms,p95=50ms. Small local dataset/loopback only; no mobile/WAN/production capacity claim.
- Remaining code work: paid-item cancellation/refund allocation, full discount/tax/venue-charge checkout snapshots/disclosures, table moves/combinations/write-off outcomes, lounge/minimum-spend resolution, subscription-duration rules and remaining platform financial/support detail. Live providers, authorized email, target hosting and physical hardware remain separate external gates.

## Fourth checkpoint: financial, media and operational integration

Validation correction: earlier financial test claims were withdrawn when an approval-timeout audit showed two intended fixture edits had not reached disk. Edits were then made separately, assertions inspected on disk, and PostgreSQL tests executed separately. Corrected evidence is tests/mera.integration.test.js:1291 onwards (refund-linked cancellation, quote expiry replay, exact tax liability/reversal),1356 onwards (platform policy/date/scope),1410 onwards (cashier commercial-data denial). The latest actual PG run passed1/failed0, duration2823ms. This supersedes earlier incomplete validation claims; no production readiness follows from it.

- Combined `npm test`:103 passed,2 skipped; includes three prepared/unmounted category-module tests. TypeScript/Vite build passed; route-based splitting is being checked to keep customer delivery separate from staff/platform code.
- Server-priced quote reviews disclose discount, service and tax amounts before customer/staff order creation. Original accepted retries survive quote expiry. Manual refund credits can be consumed once by eligible paid-item cancellation; no second payout is initiated.
- Stock-safe table moves/combinations preserve the same private visit, reject another party, return released tables to cleaning and close all linked tables. Old visit re-closure cannot reset the next party. Cash movements have retry keys; shift handover/variance approvals are scoped and audited.
- Uploaded PNG/JPEG/WebP photos are size/dimension bounded, tenant scoped, previewed under authorization and served publicly only after exact published references. Full23-table isolated restore passed including actual image-byte hash, encrypted MFA factors and deliberate tamper detection.
- Membership refresh/authorization denial clears protected staff data. Internal approved commercial snapshots are hidden from noncommercial roles, including order/payment responses. Subscription projections use approved snapshots and preserve paid service/exports under new-order restrictions.
- Platform directory, audited exact-reference lookup, configured subscription dates and explicit commercial policy approval remain separate from live billing. Production email, online collection, settlement, withdrawal, DNS/TLS and physical output are unverified/unavailable external gates.
- Next local implementation: safe fenced abandonment of unrecorded uncertain writes, reviewed pricing-aware item cancellation, private partial service handoffs, category/product integration, Zidi quote integration, minimum-spend/write-off outcomes and a historical operational importer. These are code tasks, not mislabeled credential blockers.

## Fifth integration checkpoint

Contract1.1 now integrates nested category publication snapshots, credential-bound Zidi quotes, role-scoped customer help, partial handoffs and reviewed original-policy cancellation with tax/charge credit allocation. Actual PostgreSQL assertions were inspected and executed through invoice1626-1633; latest run passed1/failed0 in3000ms. The combined milestone suite passed122/failed0 with2 environment-dependent skips; the unfinished importer test file was explicitly excluded and is not part of this commit. Vite/TypeScript build passed with separate customer, workspace, platform and marketing chunks.

- Abandonment is fenced under the branch transaction lock. A committed record wins, or a durable actor/kind tombstone blocks delayed original writes. Canonical absence alone never unlocks uncertain accounting. Tab recovery retains a validated principal/org/branch journal, never autosubmits, and clears only through explicit logout choice or a canonical resolution.
- Categories support graph validation, versioned edits and snapshot publication; draft hierarchy changes do not leak into the customer menu. Low-stock thresholds and atomic bulk availability are integrated.
- Help requests require secure guest context, enforce own-order/current-private-visit access, limit unresolved requests and separate private staff notes from customer replies. They are in-app records, not delivered external messages.
- Partial handoffs cannot exceed prepared quantities and do not prematurely recognize sales. Aggregate final collection remains the recognition boundary. JSONB key-order replay defects were caught in real PG, fixed by normalized field comparisons and covered with reordered-key regressions.
- Opt-in hosted backups now validate encryption/interval/retention, stream encryption into authenticated BC01 artifacts, fence concurrent snapshot workers, bound snapshot retry attempts and expose failed cloud transfer metadata/retry under platform MFA. Encryption/tamper/environment/lease tests passed. **No real scheduled database snapshot or S3 upload was executed by this change**; the isolated23-table restore evidence remains separate.
- Remaining code slice: read-only operational legacy importing/report basis (work in progress, excluded), explicit minimum-spend and noncash write-off outcomes, structured modifier editing and remaining live UI walkthroughs. Provider agreements/credentials, verified email delivery, target hosting and physical printers remain external gates.
