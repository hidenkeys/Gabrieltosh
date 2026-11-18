# Menu and branch integration checkpoint

Verified implementation revision:27680f2. This is a partial UI-correction milestone, not complete application delivery.

## Integrated behavior

Menu management opens on products, with actual photos, name/code/category search, category filtering, successful-empty recovery and incremental listing. Categories, stock/availability and shared menus are four short local views. Existing forms remain mounted while changing those views. Product editor entry focuses its first field; closing restores the trigger. Stock fields are disclosed per product. Size-based products show configured size prices rather than a misleading zero base price.

Publication uses an actual server snapshot and explicit branch label. It includes real sizes, variant prices and customization adjustments. A guarded snapshot hash/version rejects changes made after review. An exact actor/scope-bound tab journal is persisted before submission. Retry, check and explicit stopping preserve the original intent. Not-found never means failure; accepted publication wins over stopping. Server replay and abandonment records are atomic under the branch lock. Existing bodyless API publication remains compatible; the corrected UI uses the reviewed contract.

Branch administration displays permitted branches and restricts draft creation to organization-wide administrators. Exact create requests are saved before submission and replay safely. New branches start paused, without reservations and without a published menu. Organization business details hydrate saved values, retain local edits during background refresh and keep uncertain retries immutable. Saving merges onboarding data without deleting published status, verification or unrelated metadata. Branch-scoped managers cannot save organization-wide details.

Category read failure now has a retry and cannot masquerade as an empty list. Scope changes discard old private rows and late callbacks.

## Browser verification

Lead inspected docs/mera/ui-audit/menu-management-comparison.jpg: actual before/after at CSS1618×960. Before is the previous Mera form stack, not an original Bing Chun administration screen. The verified Bing Chun palette, system typography, photos and sidebar remain the source authority. After also contains the intentionally added test branch; Surulere’s products/prices/menu version remain unchanged.

Screenshots42–53 record product management, branch administration, publication and the existing reservation form. Desktop matched1618×960; tablet834×1194; narrow433×937/938. Exact dimensions were read from the DOM. No page-wide overflow was found. Branch screenshots45/52 are focused document crops around the branch-management section. All temporary viewport overrides were reset; the verified Product catalog remains open at localhost:3003/mera/workspace.

Exercised product search with no results and reset, category filtering (four toppings), unsaved editor state across local views, editor focus entry/return, and publication Escape/trigger return. The initial native-cancel-only implementation did not close through the browser automation key path; an explicit Escape handler was added and then verified in-browser. Native scrolling content remains keyboard-focusable.

A single branch named “UI verification draft — unpublished” was created in the isolated preview. Invalid timezone was rejected first. Canonical list refresh exposed the branch; selecting it showed an empty service overview. DOM selected-option checks verified Pause new orders=Yes and Accept reservations=No. The branch was returned to Surulere after testing.

One test-only product was created in that isolated branch with a zero base, Large size₦3500 and required Tapioca pearls+₦500. Review showed those actual values. Menu version1 was intentionally published there. A second browser tab changed the size to₦3600; submitting the older review was rejected. Reload restored the original₦3500 review and exact request. Check returned not-found without unlocking it. Explicit reasoned stopping cleared the request and left the published version1 intact. No second publication occurred. Surulere’s published version1 was not changed. The test branch remains ordering-paused and unlaunched; a menu snapshot is distinct from launching a hosted branch.

The Surulere reservation form was inspected at narrow width. Venue/device timezone guidance was visible. Submitting blank required fields focused the invalid contact field; no booking was created. This browser observation is for the committed basic C4 form, not the later staged refresh-recovery work.

No real funds, customer messages, provider activation or production deployment occurred. Test records exist only in the ignored isolated demo database.

## Exact-revision verification

A detached temporary checkout of27680f2 reused installed dependencies without modifying the ongoing worktree. All processes exited0:

- npm test:284 tests,282 pass,0 fail,2 skip;20.73s.
- npm run build:TypeScript and Vite pass;0.99s Vite build.
- npm run test:mera:postgres:actual disposable PostgreSQL scenario passes,1 test,0 fail,0 skip;3.59s. This includes branch replay/concurrency, reviewed publication/staleness/abandonment, onboarding metadata preservation and the earlier tenancy/financial/privacy assertions.

The ordinary suite’s two skips are the PostgreSQL print worker and Mera integration cases. The Mera integration case was run separately as above; this milestone does not certify the print worker or physical hardware. Worker concurrency is now bounded to4 after one earlier unbounded run ended a signup worker without an assertion result. The signup cases passed alone and the bounded exact-revision suite passed; no assertion was removed and no production API rate limit was changed.

## Remaining dependencies

O3/O4 remain at integrated/exercised checkpoints. Full cross-role, failure, stock, publication and accessibility acceptance is still pending. Business-save hydration/unknown-result behavior has component and real PostgreSQL evidence; no real organization contact was edited in the browser. No authenticated platform operator/MFA or physical printer testing exists.

Preparation-screen source and reservation refresh-recovery source are separate staged work. Their focused tests and backend evidence do not imply the root has integrated or browser-accepted them. The next milestone must mount the preparation layout, remove duplicate generic preparation rows, build/restart the recovery contract and exercise the combined flows. Preserve that uncommitted work.
