# Order management checkpoint

Scope1.0 baseline65.0/100, P2 at40. Current work addresses the real waiter preparation-data gap and inconsistent history evidence, preserving the existing Bing Chun page composition and version/payment/stock gates.

## Evidence and findings

Actual Chrome baseline247 shows original Orders hierarchy;248 shows read-only history/detail. Both saved files were opened. Live order dates already include Africa/Lagos; history used device locale. Live history omitted monetary zero and labeled missing identities System. Waiter permission orders.fulfill does not imply orders.prepare; tickets were correctly withheld, but the handoff composer depended on them.

## Integration contract

Add workspace.preparationFacts only for actors with orders.view and orders.fulfill. Each order has orderId and item orderLineId/preparedQuantity only, excluding ticket/station/staff/private-note data. Server handoff authorization and quantity/payment/version checks remain unchanged. Client uses projected facts when provided and rejects missing/duplicate/unsafe counts; it does not silently fall back to privileged ticket data after a malformed projection. Existing older workspace compatibility retains tickets only when the new field is absent.

History and live detail reuse OrderTimeline with explicit branch timezone, allowlisted labels, honest missing identities, zero amounts and recorded assignment changes. Historical table names cannot be reconstructed from a missing snapshot; no current table is invented as historical evidence.

## Open acceptance

No new business mutation, cash movement, grants or production changes are needed for read verification. Full integration tests/build and actual after screenshots remain pending until recorded below. HelpRequests uncertain non-idempotent notes and draft retention require their own fix: refresh cannot prove absence of a previous write. Existing status writes use version guards, without new automatic retry. P2 remains40 because its full help/recovery/state acceptance is incomplete; no additional percentage credit is claimed for this subset.

## Verified slice at8149ed2

Full regression639total/637pass/0fail/2skip45.75s; finalfocused23pass; productionbuildpassed. Disposable PostgreSQL integration passed including actual service-role preparation facts with tickets withheld and station mutation403. This used its own temporary test database, not the store preview. Actual Chrome matched248/252desktop2782×1110 saved/opened/comparison inspected; responsive250/251 actualCSS926/433 (Chrome90% zoom, requested834/390), no page overflow. Native responsive table scroll remains intentional; narrow rows reflow. Order-detail heading focus and close returns to original View button verified. Missing actorType stays Identity unavailable even where an opaque actorID exists. Intermediate249–251 preceded this final actor correction;252 final confirms it. Viewport reset; preview remains open. No live waiter handoff mutation/browser role grant claimed.

Shared board and P2 evidence updated without increasing checkpoint/percentage; remaining help/recovery work prevents broader acceptance.
