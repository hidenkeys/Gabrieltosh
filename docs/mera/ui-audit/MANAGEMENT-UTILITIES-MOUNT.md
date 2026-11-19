# O6 exports / O7 integration access handoff

Source correction only. Root captures and verifies actual before/after screens; these source tests are not visual acceptance. No credentials, providers, network settings, real funds or production records were modified.

## Integration and hierarchy

Existing ExportJobs/Integrations props and main mounts remain unchanged. Root centrally imports `src/mera/workspace/management-utilities.css`. No component CSS import. Both use shared OperationalPrimitives DataRegion; integration API details and export failure diagnostics use native shared Disclosure. Closing diagnostics never unmounts drafts or pending state.

Exports: real job status/download records before compact business-date request. Only complete jobs with artifactId expose the existing scoped CSV download. Statuses are readable; unknown attempts/time remain unavailable rather than fabricated0. The bounded focusable record region supports long lists, with controls next to their job. Read loading/error/known-empty and write failure are separate; successful polling cannot erase a write error.

Integration access: clear simulator/live-blocked notice, actual existing credential list/capabilities, compact create form, then advanced adapter/quote documentation. Known one-time secrets remain visible if the subsequent list GET fails; they are never fetched from history or put in exports/QR. Unknown list is not called empty. New-access flag pauses creation, while existing credential review/revocation remains available. Capability payloads are unchanged even though labels are human-readable.

## Contracts verified in source

- `server/mera/operations.js`: reports.export guards GET B/jobs, POST B/exports, POST B/jobs/:id/retry, GET B/exports/:artifactId/download. New export body `{date,requestKey}` is replayed only for the same actor/date/key under a branch lock. Component retains unknown request body/key and freezes changed-date creation until its explicit exact retry succeeds; later409 does not discard the original. List refresh never infers that an absent job failed.
- Failed-job retry remains `{reason}`3..300. Server allows only failed status but has no retry intent/version fence. Unknown retry freezes that job's reason/action and offers read refresh/reconciliation, not an invented safe resend or automatic unlock. A refreshed row does not automatically repeat a retry.
- `server/mera/zidi.js`: organization.manage guards branch credential GET/POST/DELETE. POST remains `{name,scopes}` with four existing capabilities. Creation is demo-only and lacks an idempotency key; unknown creation freezes the current draft and allows reads, never blind repeated POST/new key. Empty reads do not prove failure; a lost one-time secret cannot be retrieved.
- DELETE targets the same credential and sets active=false under a branch lock, so explicit same-credential revoke retry after uncertainty is state-safe. It is never automatic. Successful revoke hides the locally shown secret.
- Both leaves use scope-keyed inner state and active/abort/request-generation guards, including post-write continuations; old branch reads or late secrets cannot appear in a new scope. Root permission refresh still owns auth clearing. No API grants, payment confirmation, live adapter availability or charges were invented.

Pending operation recovery is component-local; no durable cross-navigation journal is claimed. Production provider agreements/credentials and signed outbound delivery remain separate launch gates. API docs stay in an administration disclosure, not normal customer flows.

## Evidence and remaining checks

Eight focused tests in `tests/mera-management-utilities.test.tsx` pass: failed credential read/retry/empty, frozen unknown creation after empty refresh, late secret suppression across branch switch, failed export read/retry with only complete downloads, exact export key/date replay after refresh/409, late old export exclusion, no failed-job retry resend, known secret retained after read failure. Existing credential scope/revocation and export queued-vs-download regressions also pass.

Lead browser checks at desktop/tablet/narrow: list-first hierarchy, native details/focus,44px targets, no page-wide overflow, long credential names/capabilities/job errors, valid-date selection, independent read retries, paused/non-demo creation versus existing review, CSV availability only on completed records, preserved unknown states. No financial or credential writes are required for a visual review. Do not mark all O6/O7 complete from these leaves.
