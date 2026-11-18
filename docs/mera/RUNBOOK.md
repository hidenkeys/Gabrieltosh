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

## Host routing and publication

`MERA_ROOT_DOMAIN` enables exact marketing, app, platform and organization host resolution. Unknown/reserved/deeper hostnames do not resolve as organization slugs. Routing only selects a destination; API membership/guest authorization remains mandatory. DNS ownership, wildcard routing and TLS are not configured by this setting.

A non-demo branch storefront requires published organization and branch flags. The readiness endpoint reports missing verified owner, contact, menu snapshot, print layout and explicit manual-payment policy. `MERA_ALLOW_MANUAL_LAUNCH=true` is a platform configuration decision; it does not approve an online wallet or collections. Demo registration returns a visibly simulated verification flow and never claims an email was delivered. Production registration remains blocked pending verified delivery integration.

## Incident triage

For delayed orders, inspect canonical order/ticket/payment states before resubmitting. Export workers use fenced leases: an interrupted or stale worker cannot publish an artifact for a newer lease; creator authorization is checked again at completion. Review failed jobs and retry with a recorded reason. Application operational signals show queue counts and orders older than15 minutes; host-level alerts still need configuration.

For uncertain writes, preserve the original request key and payload. Refresh canonical state and retry the same intent; a conflicting payload receives409. Do not tell a customer payment succeeded based on a network timeout, browser return page or simulated provider event. Escalate unmatched/late/provider-discrepant records for reconciliation; live provider actions remain blocked.

For data recovery, stop writes only under an approved incident procedure, identify the backup and encryption-key version, restore into a separate database, compare scoped counts/amounts/ledger balance before redirecting traffic, and retain an audit trail. Local fixture rehearsals do not authorize production restore or destructive migration.

## Media, subscription and financial review

Images are limited to PNG/JPEG/WebP raster uploads,512KB each and4096px per side. Stored bytes remain in PostgreSQL so database recovery includes media; the fixture restore verifies a real image hash. Staff previews require tenant authorization. Public image URLs are only served for exact published menu/brand references. Storage quota currently limits an organization to500 images; retention/replacement policy needs business approval before production use.

Platform status changes can configure trial end/paid-through/due dates explicitly. Proposed merchant commercial edits do not replace the approved snapshot used for entitlements. A production trial without an explicit date stays restricted; unknown grace periods do not silently become an unlimited trial. Paid active service and authorized exports continue. Commercial approval requires resolved fee/duration choices and an audit reason, and always leaves live billing disabled.

Financial validation rule: make source/test edits in normal calls, inspect assertions on disk, then run the isolated PG command separately. An approval timeout means the command did not execute; never report intended edits or tests as completed. Review the exact assertion and actual stdout before closing a financial gate.

## Opt-in encrypted hosted backups

Set `MERA_BACKUPS_ENABLED=true` only in an approved environment with a protected persistent backup directory, a unique `BACKUP_ENCRYPTION_KEY`, explicit `BACKUP_INTERVAL_HOURS` (1–168) and `BACKUP_RETENTION_DAYS` (1–3650). The preview forces DISABLE_BACKUPS=true. Its worker does not make cloud backup calls.

The worker uses a database advisory transaction lease so concurrent workers cannot duplicate a scheduled snapshot. It limits failed snapshots to3 attempts per configured interval with backoff. Ciphertext is streamed to a0600 partial file, authenticated and atomically renamed using the existing BC01 format. Libpq variables are reconstructed from the configured database URL; inherited PG service/options cannot redirect the dump. Verify pg_dump/server version compatibility in the target environment.

Encrypted local files follow explicit retention; when cloud is configured, local pruning waits for successful upload. Cloud uploads use encrypted files, bounded SDK retries and a row lock to prevent concurrent upload claims. Failed transfers remain visible and require an audited platform-MFA retry reason. Snapshot metadata excludes artifact paths and ciphertext from the web API. No actual S3 destination or transfer has been validated. Key custody, storage IAM/lifecycle, host alerts, capacity and a target-environment restore exercise remain deployment requirements.

Session financial journals contain only allowlisted operational request fields; they are scoped to the authenticated actor and branch and never contain session tokens or passwords. A restored intent is unconfirmed until the server resolves it. Explicit logout warns before clearing local recovery; it does not cancel a server request. Use the fenced abandonment outcome when an unrecorded request needs to be cancelled safely.
