# Staff reservation recovery checkpoint

Baseline remains 63.8/100, scope 1.0 unchanged. This is a verified recovery slice within P5, not completion of the broader front-desk/role/platform acceptance matrix.

## Change and contract

The original staff creation form generated a fresh UUID on each submit and shared editable state with other tools. `ReservationRequest.tsx` now owns a strictly validated actor/organization/branch-scoped session journal before dispatch. Parent mutation preserves its exact request key and sends an expected-actor header. Staff lookup and explicit stop endpoints use the existing branch lock, own createdBy identity and guestId-null constraint; authenticated permission checks remain authoritative. Optional actor expectation rejects a changed cookie actor before mutation, without granting authority.

A missing lookup is not proof of failure. Only an exact recorded proof or a durable abandoned fence clears the original intent. Retry keeps original dates/body/key after policy or time changes; restore checks but never submits automatically. New booking fields and acknowledgements clear after recorded success. Sign-out redacts guest data before the parent logout callback, retains only the request reference, and blocks if storage redaction fails. Access denial hides private fields. This does not add recovery guarantees to separate reservation status, arrival, seating, shift or financial writes.

Global recovery notice reopens the original disclosure with explicit focus, without resetting background-refresh focus. Existing Bing Chun surfaces and native disclosure/action components are retained. Fields use a bounded two-column layout and one column on phones. Final wide submit measures164px, form960px. Screenshot214 is an intermediate oversized-action finding, corrected before acceptance.

Browser testing exposed datetime-local input events not updating React draft state. Native input synchronization was added while preserving change events; input-only regressions verify both original UTC values. Repeated synthetic submit after success cannot dispatch another booking without new valid fields.

## Verification

- Build passed after final input correction. Full suite599 total/597 pass/0 fail/2 skip,44.07s. Explicit focused batch12/12 includes the journal `.ts` file, which the ordinary npm test glob does not include. Four additional integrated parent tests pass (also included in full suite).
- Backend owner ran actual disposable PostgreSQL integration1pass/0fail, including actor mismatch on all three routes before any mutation, staff/guest/tenant privacy, replay after policy/time changes, fencing and create-vs-stop serialization. No provider or physical-print claim follows.
- Actual main212/213 captures share2782×1110 and same two unchanged reservations; a small scroll offset differs. Combined comparison saved/opened. Intermediate214 rejected for stretched action;215/216 show final834/390layouts without document overflow.
- Normal QA browser created exactly one synthetic party1/no-table booking20November12:00–13:00Lagos.217 shows accepted requested row, correct dates and cleared creation fields. No deposit/payment/refund or confirmation/seating action submitted.
- A second deliberately past-date request was rejected by the server and retained conservatively for recovery. Orders navigation and full page reload preserved global notice; explicit review reopened/focused the original request. Authoritative lookup returned absent, leaving it locked.218/219 show original data and explicit stop.220 shows confirmed stop while the accepted booking remained requested. This is a rejected-request browser test, **not live network-drop fault injection**; dropped responses/late races are covered by component and actual PostgreSQL tests.
- Separate baseline manifest records exact existing QA record hashes/settings. The audit guard correctly rejected deletion of the four test rows and rolled back that transaction; it was not disabled. Mutable booking/resolution cleanup and retention of the two immutable synthetic audit events are recorded honestly in `RESERVATION-QA-RESTORATION.json`. Full original-count restoration is not claimed. Main database was not mutated by this milestone.

Remaining: broader staff-role/error/accessibility/device matrices, cancellation/arrival/seating and shift recovery, platform protected screens/remaining operations, provider access and physical printer output. Chrome organization download restrictions remain an independent gate. No production deployment, production data modification, money movement, access grant or external delivery occurred.
