# O5 RoleManager correction handoff

Source slice only; lead owns People screen member list, main composition and browser acceptance. RoleManager keeps its existing props and mount. Import `src/mera/workspace/staff-management.css` centrally in main.tsx; no component stylesheet import.

Hierarchy: short branch-scoped invitation form first, existing invitation history, then reusable custom-role list. The advanced role editor is a native closed disclosure; Edit role opens the correct existing draft/version. Closing retains its state. No role/grant/access API was invented.

Read states: roles and invitation history each distinguish loading, explicit retryable failure and successful empty. A failed invitation GET never says no invitations. A failed roles GET no longer remains loading forever. Scope-keyed inner state and active/request-generation/abort guards prevent old organization/branch results or callbacks from affecting current content. Existing post-write refreshes use the same guarded reads. Errors do not imply invitation email delivery.

Mutation contracts unchanged:
- POST org/invitations `{email,role,branchIds:[currentBranch]}`; DELETE invitation; no requestKey or automatic retry.
- POST custom role `{name,permissions}`; PATCH existing role includes its exact version and active state. Permissions remain limited to actual actor grants, owner role is available only with canGrantOwner. Role edits refresh access context through existing callback.
- Disabling a role still warns that linked memberships/invitations are affected and restoring does not automatically restore them.

Unknown invitation POST outcomes freeze the current invitation draft and allow **read-only** history refresh, never a blind resend. Empty history is not proof creation failed. Known POST success followed by history-read failure remains known-created and shows a read failure. There is no invented safe abandonment or token recovery endpoint.

Limits: this invitation uncertainty state is component-local and not durable across navigation/reload. Backend POST lacks an idempotency key/canonical intent lookup. New custom-role creation also retains its existing non-idempotent API behavior; this slice adds no automatic write retries and does not claim durable unknown-write resolution. Multi-branch invitations, membership role/scope editing, member-list raw-ID fallback and broader staff customer workflows remain separate tasks.

Evidence: four focused `tests/mera-role-management-ui.test.tsx` tests passed: independent failed reads/retry/real empty, stale organization response suppression, unknown invitation freeze after history refresh without resend, closed editor plus exact versioned limited-grant save. Existing custom-role/grant/invitation workspace regression passed. Compiler check passed during this slice. No browser screenshots/visual acceptance are claimed.

Lead checks: capture same People screen before/after at desktop/tablet/narrow; invitation fields and history scanability, long emails/role names, disclosure focus and draft retention, grant-limited options, role consequences, loading/error/empty/retry, actual context refresh after role changes, unknown invite handling and scope revocation. Preserve44px controls and no page-wide overflow. Do not mark O5 complete from this isolated leaf.

## Lead integration

Central import mounted. Actual normal owner People screen before/after captured61/62 at1440×1000 and narrow64 at390×844; no document overflow. Native disclosure keyboard Enter opens/closes without a write. Stretched invitation control corrected and measured44px. Root comparison was opened with both images loaded. No invitation, membership mutation or role/security grant was submitted. Full read/recovery and custom-role regressions pass in the combined324-test suite; full O5 acceptance remains pending. See RESERVATION-STAFF-CHECKPOINT.md for limits.
