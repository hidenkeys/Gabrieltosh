# People and access checkpoint

Scope1.0 unchanged. This is partial O5 acceptance; no production readiness or complete role matrix is claimed.

## Audit and implementation

1. **People baseline — correction needed.** Actual185 viewport screenshot opened and inspected. The existing member row showed name/role/status but no branch scope, search or dedicated loading/retry. Invitation/role tools were nested inside the member card. An initial repeated full-page provider capture was rejected and replaced.
2. **Member search and access review — verified subset.** MemberAccess.tsx now owns the sole members GET, scoped generation/denial handling and exact existing PATCH `{active}`. Members-first table includes human role, actual organization/branch scope, status and separate inline review. Unknown identities/branches are labeled, never opaque IDs as names. Browser no-results/reset passed; own review explains the restriction; closing returns focus. No actual member suspension/restoration submitted. API last-owner protection preserved.
3. **Invitations and role editing — verified subset.** Existing RoleManager API preserved. Current-grant checks, synchronous write serialization, uncertain create/update/revoke pauses, sticky authorization clearing and dirty-editor protection added. Development invitation token concealed until deliberate reveal, then cleared on scope/authority loss. Selected role access is disclosed with human permission labels. Actual kitchen-role review and unsaved role-name close/reopen retention passed; draft explicitly discarded without saving. No invitation, credential or custom role was created in browser.
4. **Responsive layout — corrected and verified subset.** Same main organization baseline185/final187, matched3091×1233 saved captures (final CSS viewport2782×1110; existing Chrome zoom), paired in people-comparison.html/JPEG and opened together. Actual390px phone188/189 and834px tablet190 show document width equal to viewport. First phone draft overflow744px was rejected; minmax grid correction bounds the690px table in its own320px scroll region. Keyboard Tab scrolls the focused review button into view; Enter opens review. Added narrow scroll hint. Low-contrast inherited row-header color corrected to existing ink17,27,47; final13px name verified. Saved final images opened. Not a full accessibility certification.

## Contracts and recovery

Parent membership state/effect removed to avoid two read owners; MemberAccess and RoleManager remain separately mounted under the existing permission-aware People section. Role/branch reassignment APIs do not exist here and are explicitly unavailable.

Review caught unknown guards resetting on branch/navigation unmount. Shared accessWriteJournal.ts writes and verifies a minimal actor+organization marker before dispatch. Only the original acknowledged success or definitive4xx response removes it, including late acknowledgement after unmount; reads never unlock uncertainty. Blocked/corrupt/unavailable storage fails closed. Root passes actual userId to both consumers. Marker contains only kind/time, no email/token/permissions/payload. This protects navigation/reload within the current browser session/tab, not cross-tab or cross-device serialization. No authoritative abandon/reconciliation endpoint exists; unresolved writes require administrator investigation. No browser storage reset/bypass was performed.

## Validation status

Focused member/role guards19pass; existing custom-role parent test passed after human delivery/permission selectors were updated. Final build passed. Final full regression:562 tests,560pass,0fail,2skip,38430ms. First run found an outdated Delivery:not_sent assertion. Corrected selectors preserve authority assertions. A rerun then stalled in the existing background-refresh test; confirmed live/high-CPU processes were interrupted for isolation. Broad customer-text readiness wait reproduced the stall alone; exact Transactions-tab readiness passed isolated and paired tests. Only that fixture wait changed, with every payment-error/poll/read-recovery assertion preserved. Final full suite passed after this correction.

## Remaining acceptance

Populated membership/invitation/custom-role browser matrix, accepted/revoked/expired delivery states, full read/denial/recovery device matrix, and normal staff logins remain open. Real email delivery requires authorized provider/sender. No new access, real message, production mutation or physical output performed. Existing3003/3007 previews use unchanged databases; backend was not changed/restarted for this UI milestone.
