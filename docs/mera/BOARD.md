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
