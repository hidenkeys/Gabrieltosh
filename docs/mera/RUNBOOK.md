# Development and release runbook

## Run locally

`npm run build` then `npm run preview:mera` starts isolated PostgreSQL on loopback55441 and Mera at http://localhost:3003/mera. Data lives in ignored data/mera-demo-db. The first startup prints a random demonstration admin password; later startups preserve users. Do not reuse development credentials in production. Existing Bing Chun preview uses3002/55440 and is unchanged.

Routes: /mera marketing, /mera/workspace organization operations, /mera/menu/bing-chun/20000000-0000-4000-8000-000000000001 customer demo, /mera/platform restricted platform entry, /mera/legal policy preparation. No production provider calls or notifications.

MERA_ENABLED opts into the new API. MERA_DEMO explicitly enables development seed/simulator behavior and must never be enabled in production. Hosted non-demo mode excludes legacy unscoped data endpoints. New schema migration is explicit via migrateMera; do not point migration tools at production without approval and a reviewed backup/reconciliation plan.

## Validation

`npm test` includes legacy compatibility, shared domain/contract tests and consumer retry/privacy tests. `RUN_MERA_PG_TESTS=true node --import tsx --test tests/mera.integration.test.js` creates a separate temporary PostgreSQL cluster55442; it never uses the store database. Do not run simultaneous copies on the same port.

## Launch remains gated

Production deployment has not been authorized. Verify domain/TLS, identities/MFA/email delivery, Rubies/Zidi contracts, scoped jobs/exports, migration and backup restore rehearsal, live policy approval, load/accessibility profiles and physical printer output before any readiness claim. Subscription fees remain proposed/configurable and integrated collections remain blocked.

## Export worker and operational recovery

`MERA_ENABLED=true MERA_RUN_JOBS=true npm run worker:mera` starts the separate persistent-job worker with the configured database. The isolated preview launcher starts its own worker automatically. Jobs live in tenant-scoped database records, recheck requester permissions, have leases/bounded retries, expose failure states and support an audited retry. Monitor queued/failed jobs and worker heartbeat in the target hosting environment; these host alerts are not provisioned by local tests.

The isolated recovery drill is `node scripts/mera-restore-rehearsal.js`. It creates its own loopback PostgreSQL fixture, dumps/restores into a separate database, compares every table and balanced financial records, detects tampering and cleans up. It refuses production mode or caller-controlled target databases. A production backup plan still requires approved storage, encryption/key custody, retention and scheduled restore exercises.

## Platform access

Platform membership alone does not grant operator data. `MERA_PLATFORM_MFA_KEY` must be a unique secret 32-byte key encoded as 64 hexadecimal characters; keep it outside source control and backed up separately. Operators require explicitly provisioned encrypted authenticator factors, an active staff session and fresh six-digit verification. Codes cannot be replayed; step-up lasts ten minutes and failure lockout persists. The local-only `scripts/mera-enroll-demo-operator.js` refuses production and any database outside the isolated loopback55441 demo. It never replaces an existing factor. No production enrollment/recovery or operator promotion has been performed.

Subscription status changes and configuration-only support reads require step-up and append-only operator audit reasons. Support does not impersonate staff or retrieve customer order histories. Live fund movement remains unavailable. Before any deployment, review production operator provisioning/recovery, session revocation, monitoring and audit access policy.
