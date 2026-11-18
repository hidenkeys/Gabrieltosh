# Development and release runbook

## Run locally

`npm run build` then `npm run preview:mera` starts isolated PostgreSQL on loopback55441 and Mera at http://localhost:3003/mera. Data lives in ignored data/mera-demo-db. The first startup prints a random demonstration admin password; later startups preserve users. Do not reuse development credentials in production. Existing Bing Chun preview uses3002/55440 and is unchanged.

Routes: /mera marketing, /mera/workspace organization operations, /mera/menu/bing-chun/20000000-0000-4000-8000-000000000001 customer demo, /mera/platform restricted platform entry, /mera/legal policy preparation. No production provider calls or notifications.

MERA_ENABLED opts into the new API. MERA_DEMO explicitly enables development seed/simulator behavior and must never be enabled in production. Hosted non-demo mode excludes legacy unscoped data endpoints. New schema migration is explicit via migrateMera; do not point migration tools at production without approval and a reviewed backup/reconciliation plan.

## Validation

`npm test` includes legacy compatibility, shared domain/contract tests and consumer retry/privacy tests. `RUN_MERA_PG_TESTS=true node --import tsx --test tests/mera.integration.test.js` creates a separate temporary PostgreSQL cluster55442; it never uses the store database. Do not run simultaneous copies on the same port.

## Launch remains gated

Production deployment has not been authorized. Verify domain/TLS, identities/MFA/email delivery, Rubies/Zidi contracts, scoped jobs/exports, migration and backup restore rehearsal, live policy approval, load/accessibility profiles and physical printer output before any readiness claim. Subscription fees remain proposed/configurable and integrated collections remain blocked.
