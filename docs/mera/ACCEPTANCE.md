# Acceptance evidence

Scope remains the full PRD. Checked items have direct evidence; partial items remain unchecked. Development tests do not certify production hosting or providers.

| PRD launch gate | Evidence / remaining work |
| --- | --- |
| Repository assessment | VERIFIED: code/schema/dependencies and actual original login inspected; ARCHITECTURE.md and UI-PRESERVATION.md document reuse and Windows assumptions |
| Bing Chun/Surulere safe migration | PARTIAL: isolated seed preserves 34 products/photos; separate historical financial migration rehearsal in progress; no production or legacy preview records migrated |
| Tenant boundaries including files/jobs | PARTIAL: real PG proves cross-tenant/branch denial and scoped export downloads; queued export permission recheck implemented; broader hosted file/cache/event checks remain |
| Same customer/staff ordering rules | VERIFIED in isolated API tests and live preview: server-priced shared createOrder, guest/staff actor context |
| Actor/assignment history | PARTIAL: immutable audit and actor/order history implemented/tested; full operational review remains |
| Duplicate submissions/last stock unit | VERIFIED real PG: duplicate stable IDs, changed-intent409, concurrent last-unit201/409 |
| Successive visits/split bills/reservations | VERIFIED real PG: current-code-only joining, old visit privacy, split/merge/payment/deposit conservation, concurrent reservation capacity201/409 |
| Partial/excess/late/refund/provider retries | PARTIAL: manual partial/excess/refund and idempotency tested; live provider event retry/reorder contract unavailable |
| Trading-day reconciliation | PARTIAL: immutable fulfillment dates, deferred liabilities/receivables/contra-sales, balanced postings; scoped reports/CSV; external settlements and approved fee policy unavailable |
| Invitations/suspension | PARTIAL: hashed expiring/revocable invitations and current-membership checks; transactional email and verified identity flow unavailable |
| Pricing/entitlements/subscriptions | PARTIAL: unresolved values preserved; proposed invoice no charge, suspension denies new orders and preserves paid active order completion; policy duration/fees need approval |
| QR/domain/TLS | PARTIAL: stable QR/context and exports integrated; public published branch directory; required HTTPS origin outside demo; actual DNS/TLS target unavailable |
| Responsive/accessibility/consistency | PARTIAL: actual marketing/customer/workspace development browser views inspected; shared original visual style; full keyboard/contrast/mobile checks remain |
| Network/job/reconnect | PARTIAL: bounded guest timeout, exact retry intent, scoped canonical refresh and stale-branch discard; durable lease/retry/export implementation tested; hosted outage/load rehearsal remains |
| Backup restoration | VERIFIED isolated PG17 rehearsal: full canonical table hashes, balanced financial snapshots and tamper detection; extended platform-factor rehearsal in progress; production backup environment not configured |
| Rubies/Zidi | BLOCKED live: authorized contracts/credentials missing; scoped Zidi simulator uses shared menu/order/reservation rules with revocation/scope/idempotency tests and is disabled in production |
| Physical receipt/sticker output | BLOCKED: no actual devices/calibration; browser templates/previews and audited print records available; no physical output claim |
| Support/deployment/incidents | PARTIAL: RUNBOOK.md documents development, worker, restoration, provider gates and MFA; actual hosting alerting/runbooks require target configuration |

## Commands at the second checkpoint

- `npm run build`: passed React/TypeScript/Vite.
- `npm test`: first checkpoint43 passed/2 skipped; expanded checkpoint results recorded in BOARD.md.
- `RUN_MERA_PG_TESTS=true node --test tests/mera.integration.test.js`: passed in its own temporary database; covers finance/bills/deposits/immutable ledger, Zidi scoped simulator, exports, proposed invoices, MFA session/replay/revocation and subscription restrictions.
- `node --test tests/mera-platform.test.js`: RFC6238 published SHA-1 vectors (including post2038), replay/expiry, authenticated encryption/key/tamper tests passed.
- No production database, provider money movement, deployment or message delivery was used as test evidence.
