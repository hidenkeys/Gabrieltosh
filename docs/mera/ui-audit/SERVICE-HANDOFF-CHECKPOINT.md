# Order responsibility and prepared handoff checkpoint

19 November 2026, partial P3 correction. Existing Bing Chun operational theme and shared disclosures reused. Source assessment derives from PRD sections10–12 and actual existing contracts.

## Baseline and correction

Actual before148 showed self-assignment only and handoff buried in item/history detail. Actual after150 keeps search/service queue first and secondary filters in a mounted disclosure. Responsibility and prepared-item handoff are distinct order actions before item/history details. Combined comparison HTML/JPEG inspected; source captures retain full resolution.

- Added scoped branch-staff selection using the existing authorized service-staff endpoint, explicit optimistic-version assignment and previous→new responsibility history. No permanent visit waiter model is implied: preparation/service actions can update current handler.
- Fixed assignment retaining the previous handler name: the server now records the actual new user name, or null if absent; membership, historical and version guards retained.
- Added assigned-to-me, unassigned and ready service queues. Filtered cards remain mounted/hidden to preserve draft and uncertain request state.
- Handoff shows ordered/prepared/already-served counts and only permits prepared waiting items. Missing preparation records remain unavailable. Original cumulative intent/key/version survive unknown→409/429 and newer props; no automatic replay.

## Actual local browser sequence

All writes below were in disposable app3007/database55444, never main/store/production data.

1. Assigned existing local order M-D128B024 to the demonstration owner. Verified updated handler and Unassigned→owner history, actor and timestamp. Queue filtering hid/revealed the same expanded panel.
2. Unprepared order correctly offered no handoff at its inactive stage. Screens149/151 show intermediate source states;153/154 are final responsive layouts.
3. Temporarily enabled the existing QA-only preparation-before-payment setting. A stale old-order acceptance was rejected409; refreshed actual records instead of assuming success.
4. Created a fresh two-drink unpaid order M-03CDF923, accepted it, started its bar ticket and saved one prepared unit.
5. Recorded cumulative handoff1. Actual screen152 confirmed ordered2/prepared1/handed-over1, no further prepared items waiting, order stillPreparing andUnpaid, no collection/payment. Final153phone and154tablet retain this persisted state after refresh.
6. Restored the QA setting toNo and verified actual control valuefalse after save. Main branch policies were never changed.

Phone390×844 and tablet834×1194 document width equaled viewport; saved captures inspected. Main before/after use the same unchanged default browser sizing/state. This does not certify Android hardware or full accessibility.

## Validation

- Production build passed after final integration.
- Full regression suite before final filter/time-display refinements:484 tests,482passed,0failed,2skipped.
- Final affected suite:90/90passed (workspace, responsibility and handoff). Includes timezone/read-only labels, filter mount preservation, permission denial, duplicate prevention and exact uncertain retries.
- Actual disposable PostgreSQL gate passed: assignment names/blank identity/version/historical/permission/inactive-assignee guards and existing platform scenarios.

## Remaining acceptance and limitations

P3 advances to60, not complete. Persistent visit waiter assignment is not supported by the present backend model. Broad least-privilege browser checks, minimum/deposit/partial-settlement outcomes, large-volume workflow and durable recovery remain. Handoff recovery is memory-only across page reload/unmount. Assignment lacks a durable idempotency key; an uncertain write freezes that panel without blind retry. Live provider credentials, platform QA credential restoration and physical printer output remain separate gates. No real payment or deployment occurred.

## Ownership

Lead: parent integration, mounted queue filtering, visual verification, board/evidence. Visit-tools agent: responsibility leaf/CSS/tests. Customer agent: handoff leaf/CSS/tests. Backend agent: narrow handler-name correctness fix and PostgreSQL regression.
