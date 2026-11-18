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
