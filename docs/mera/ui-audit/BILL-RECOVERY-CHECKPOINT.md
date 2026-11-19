# Durable bill changes checkpoint

Integrated source4eeb5e6 includes backend1f75dcb and test-only f5d2eea. Scope1.0 baseline67.0/100; preserve original Bing Chun bill cards, disclosures, prices, allocation rules and financial authority. Existing source-specific mera-ui workflow used; this is a functional correction within the current interface, without a new selected visual or external screen-pattern replacement.

## User-visible behavior

A split or merge is saved with an original actor-bound request key. A lost response does not invite a fresh change after navigation/reload. Before dispatch the tab stores only version, actor/base, bill ID, operation and key. Bill names, selected units, amounts, source-bill list and payment references are not persisted in this marker. The exact original body remains only in the mounted component. Storage failure blocks dispatch; a malformed recovery reference blocks new writes.

A check requires own-actor, branch, bill, operation and key proof. recorded proof additionally validates the immutable original result and operation metadata, and compares the original normalized intent when still in memory. not_found and refreshed bill props do not unlock changes. An explicit same-body retry is available only while the original memory body remains. After remount, staff can check or explicitly stop the original request. A transactional stop fence prevents delayed writes; only recorded or fenced abandoned proof clears the reference. Parent mutation-key deduplication cannot replace this key. Actor expectation and current financial authority apply, with scoped late-response/denial guards. Global recovery notice and signout warning expose pending references without private bill content.

Payment collection remains its separate existing idempotent financial path; adding keys to split/merge does not misclassify those operations as collections. Source paid allocations and unpaid-charge conservation remain intact. New changes to visit-linked bills require an actual open visit; recorded replay still returns its original result after later lifecycle changes. Valid counter bill splits remain supported and explicit null visit context now reads Counter bill rather than implying missing data.

Fresh browser review found that legacy bills without unit quantities offered an empty item split. The corrected screen explains using outstanding amount instead. Item split is enabled only when at least one selected whole unit remains valid against the latest charges; stale selections cannot enable a split when units become unavailable.

## Contracts

Optional requestKey on existing POST B/bills/:id/split and /merge; legacy clients retain existing success shapes. GET B/bills/:id/change-attempts/:operation/:requestKey and POST same/abandon use current payments.record authority, actor expectation and branch lock. Proof includes requestKey/actorId/organizationId/branchId/billId/operation/status. recorded adds original result (split{source,bill}, merge bill), resultBasis recorded_operation_snapshot and original operationRecord. abandoned adds resolutionId. Changed target/operation/intent conflicts; stopped late writes reject. New bill_change_operation and bill_change_resolution records are append-only. No new financial fee/payment policy or money movement.

## Verification and limits

Final npm test:667total/665pass/0fail/2existing skips39.93s. Build passed. Final focused bill/recovery13pass; parent workspace78pass. Dedicated new recovery6case suite exercises unknown/409/refresh/not_found, exact keys/bodies, remount without auto-send/body, explicit stop, mismatched key/intent proof, scope/denial/privacy, storage failure and separate unchanged payment retry. Guard regression covers empty/stale unit selections and legacy explanation.

Actual disposable PostgreSQL gate passed1/0fail/0skip2.43s, focused backend2pass. Checks include split/merge original replay after later changes, conflict, actor expectation/current authorization/privacy, stop/late-write race, allocation conservation, conditional open-visit gates, counter splits and direct UPDATE/DELETE rejection for both immutable kinds. First new fixture run correctly returned403 for a user whose membership had not yet been established; the test now explicitly sets up/removes its temporary authorized membership inside the disposable test scope. No production or preview grant.

Actual Chrome266/267 same-tab desktop2504×999 saved/opened and combined comparison rendered/saved/opened. Read-only selected existing QA Window1 bill; blank required-name submit was stopped by native validation and focused that input. No bill split, merge, payment or other business mutation was performed in the preview. Recovery/fault/write races are component and real PostgreSQL evidence, not falsely claimed live browser interruption tests.

Intermediate268/269 exposed the missing-unit guidance issue;269 did not show the form and is not accepted as responsive-control evidence. Final270phone390px/271tablet834px full-page captures show the corrected form and disabled action; both saved files opened and inspected, no document overflow. Bill-record region retains its existing internal scrolling. Viewport reset and read-only draft name cleared. Existing main3003/QA3007 restarted with the new recovery migration, all existing data preserved. No printer/provider or protected-platform readiness claim.

P3 remains60 and Q3 remains40; weighted67.0/100 unchanged. This closes the identified split/merge durable recovery gap. Reprint/template and access/signup authoritative recovery, broader role/state/accessibility matrices, protected platform access and external provider/hardware gates remain unfinished. Goal stays active.
