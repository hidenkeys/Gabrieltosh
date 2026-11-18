# Backend integration check — 18 November 2026

Purpose: verify preserved backend behavior independently of the pending UI visual selection. No running preview restart, production data, external provider, real funds or physical printing was involved.

## Isolation inspected before execution

`scripts/test-mera-postgres.js` runs `tests/mera.integration.test.js` with `RUN_MERA_PG_TESTS=true`. The scenario creates a fresh `mkdtemp` cluster (`mera-integration-*`), binds embedded PostgreSQL to127.0.0.1:55442, creates schema and fixtures, starts an ephemeral loopback HTTP test server, and closes/removes the cluster in `finally`. It does not connect to the running original3002 or Mera3003 databases. Test authentication is a fixture header, not a production authentication certification.

## Actual runs and minimal authorized fix

1. Default sandbox execution: failed before assertions because PostgreSQL initdb could not allocate shared memory (`shmget: Operation not permitted`).
2. Approved local execution of `npm run test:mera:postgres`: failed at concurrent stock assertion (then line160), expected `[201,409]`, actual `[201,201]`, with preceding `Mera request failed ReferenceError`.
3. Read-only root cause: alias-schema replacement had removed `const uuid = z.string().uuid();` while `/stock` and other schemas still referenced `uuid`. The initial fixture `/stock` request therefore failed; its response was unchecked, leaving the seeded product unlimited. This result did not demonstrate a branch-lock race.
4. Lead authorized only restoring that declaration in `server/mera/index.js` and asserting setup response in `tests/mera.integration.test.js`. Added exact status200, stockMode`counted`, stock1 assertions; concurrent last-unit expectation and locking remain unchanged. Source edits were inspected on disk before execution.
5. Fresh actual execution (session89010), same command: **pass1, fail0, skipped0**, scenario2481.79975ms, total2697.451875ms, exit0.

```text
✔ isolated Mera PostgreSQL integration: tenant boundaries, last-unit concurrency, payments, guest/visit privacy and capacity (2481.79975ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 2697.451875
```

## Scope and limits of that pass

The single named scenario contains extensive assertions for tenant/branch permissions, last-unit and variant stock, stable idempotent requests, guest/visit privacy, reservation capacity, bills/deposits/refunds, ledger balance/immutability and recognition, pricing/tax cancellation, role/invitation restrictions, station preparation/handoffs, platform session MFA, commercial approval/subscription restrictions, scoped Zidi simulator, jobs/lease fencing, assets, minimum spend/write-offs/deposit outcomes, support/features, bounded order history and date/DST report equivalence. This is actual database/API evidence for those assertions, not a fresh full frontend suite, browser workflow, load test or production acceptance.

The current router includes printing/alias additions, so the pass demonstrates migration/router compatibility and existing exercised paths did not fail with them present. It **does not** establish new dedicated contracts absent from the scenario:

- Uniform paid-document batching: missing dedicated direct/bill/deposit settlement and duplicate/concurrent receipt/per-unit sticker assertions, old-line identifiers and cancellation/refund edge review, browser submission audit integration and physical calibration. Existing general payment tests are not enough to certify every new document output.
- Alias creation/rename/old-slug resolution/canonical cookie continuity: mounted and unit-tested separately, but no dedicated new PG alias assertions in this run.
- Latest guest-owned paginated history and explicit end-session revocation: mounted followup additions lack dedicated new PG coverage in this run.
- `workspace-admin.js`, `refund-requests.js`, `stock-history.js`: still unmounted at inspection. Their leaf tests or frontend consumers do not imply integrated branch creation/customer records/eligible staff, requester-approver refund separation or typed stock-history APIs.

No actual Rubies/Zidi partner verification, provider settlement, email delivery, target-host DNS/TLS, cloud upload or physical receipt/sticker result is claimed. UI progress remains governed separately by `MERA_UI_PROGRESS.json`; this backend pass adds no visual-completion credit.
