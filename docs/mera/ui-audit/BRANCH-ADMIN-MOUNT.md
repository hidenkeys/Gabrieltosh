# O3 branch administration handoff

Source consumer ready for review; browser verification and overall O3 acceptance remain pending.

`src/mera/workspace/BranchAdministration.tsx` default props:

- `actorId`: current **confirmed authenticated context** user ID, not an unconfirmed cached identity. Missing actor disables creation and journal hydration.
- `organizationId`, `branches` (canonical permitted branch records), `activeBranchId`.
- `loading`, `listError`: missing list (`null`/undefined), real empty array, failed fetch and loading remain distinct.
- `canManage`: actual organization.manage grant; `organizationWide`: explicit canonical membership flag. Both are required to expose create.
- `creationIdempotencyReady`: defaults false; pass true only after the restarted server includes the verified requestKey branch-creation contract.
- `disabled`, `onChoose(id)`, `onRefresh():Promise`, `save(path,method,body,message):Promise` using the existing scoped mutation wrapper.

Root imports `branch-admin.css` centrally in main.tsx, mounts this leaf in the authorized setup composition and owns branch/context changes. The component imports no CSS. No new update/delete branch APIs are assumed. Existing branch policies stay in the current setup slot.

Backend evidence: `server/mera/workspace-admin.js`, mounted in index.js. POST `/organizations/:organizationId/branches` requires UUID requestKey, name1..100, valid IANA timezone, NGN, one to four supported service modes, cutoff0..1439. Organization-wide organization.manage is required. Backend separately reported actual PostgreSQL replay/concurrent isolation tests passing; this consumer's tests do not duplicate that integration claim. New branches are paused/unpublished drafts; creation neither publishes nor charges.

Recovery: strict sessionStorage prefix `mera:branch-create:v1:` keyed by actor+organization. Only exact requestKey/name/timezone/currency/serviceModes/cutoff are retained, bounded to4096 characters and shape-validated. No auth/customer data. The original body is persisted and verified **before** POST; unavailable storage fails closed. Restored requests never auto-submit. Unknown outcomes freeze edits and expose exact original retry; later4xx never discards a previously uncertain original. Only an initial explicit400/422 validation rejection permits clearing. List refresh never proves a missing request failed and never unlocks it. Confirmed matching actor/org POST result clears recovery; explicit `mera:logout` clears all branch-create journals. A different actor or organization cannot render the old draft.

When a confirmed creation's list refresh fails, UI says the draft exists and asks for refresh; it does not retry creation. A created branch can be opened only once it appears in the canonical branch list.

Required lead browser checks: current/other branch selection, organization-wide versus branch-scoped management, create draft and canonical list refresh, invalid timezone, server rejection, offline/uncertain retry, navigation/remount recovery, account/org scope hiding, explicit logout cleanup, storage failure, list loading/error/empty, native disclosure focus,44px controls, desktop/tablet/narrow layout. Do not call O3 visually complete from DOM tests.

Source evidence: `tests/mera-branch-administration.test.tsx` six passing tests cover scope/selection, remount exact retry and uncertain→4xx preservation, actor/org isolation, pre-POST storage failure, known-success cleanup/no publishing, loading/error versus empty, logout and malformed-journal fail-closed behavior.
