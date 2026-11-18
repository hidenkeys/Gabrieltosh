# Shared shell integration checkpoint

Assessment base88b8acc; continued correction scope1.0. This milestone is partial application delivery.

## Integrated

- All20 organization destinations now share the existing Bing Chun sidebar, compact account menu/context and task-specific heading. Removed the alternate horizontal module carousel/page picker and generic welcome. Navigation waits for a valid branch scope before offering choices.
- Role landing uses actual permissions and current role priorities. Explicit choices belong to actor/organization/branch; scope changes and revoked grants fall back safely. No-access accounts get an explicit state. Member loading follows the effective page. Existing write ownership and financial recovery handlers remain unchanged.
- Getting started now composes existing forms: business contact first, native disclosures for operations/appearance and optional policies, publication last. Forms remain mounted while collapsed, preserving their draft state. Existing branding controls are mounted once. Full branch-management and save/failure/launch acceptance remain outstanding.
- Refund and stock request consumers distinguish loading/failure from successful-empty results. Stock history starts only after choosing a product, matching its required backend contract. No inventory or monetary write was made during the browser check.
- Mounted existing refund-requests, stock-history and workspace-admin server modules. New refunds.request permission is recognized in templates for new builtin memberships; existing grants/custom roles are not expanded. Refund requests require a different authorized approver; optional linked request completion is atomic and idempotent. PostgreSQL fixtures prove isolation, exact replay, changed intent rejection and separation of duties.
- Customer checkout stores exact unresolved intent in tab-scoped storage, proves current guest identity before recovery and uses authoritative request resolution. Quote expiry uses HTTP Date plus conservative precision/RTT bound and monotonic elapsed time; expiry requires explicit fresh review, while uncertain original replay stays immutable.
- Customer activity/help views clear on scope/session loss and ignore stale responses. Order details print independently of unrelated panels. Customer panel headings now reuse the accepted system-font basket hierarchy instead of legacy serif styling.
- Platform administration adapts selected ivory/green identity with compact directory filters, grouped sections and focused modal review. Existing security/action logic retained. Only unauthorized/access-review screen was browser-inspected: there is no authorized platform-operator MFA browser session.

## Browser evidence

Chrome extension fallback remains in use because the bundled in-app browser runtime has an incompatible native module. No claim of an inaccessible screen was made.

SHELL-BROWSER-CHECK.json records the actual shell walkthrough:20 destinations at1440×1000 and18 additional destinations at433×938 (overview/POS narrow already reviewed during Q1). Each had one navigation, correct task heading and no document overflow. These checks do not certify every asynchronous child or action. Escape closes handheld navigation and restores Workspace menu focus.

Screenshots34–37 show Orders and setup at desktop1440×1000, narrow433×938 and tablet834×1194. Existing operating/brand selectors opened correctly; no save/publication was submitted. Final refund request GET returned an honest empty state with no alert. Selecting Fresh Lemonade Juice returned a successful empty stock history with no alert.

A single clearly named synthetic unpaid customer order was created in the isolated preview: M-E4DC42B8, one Fresh Lemonade Juice,₦1500. Server tracking showed submitted/unpaid, recorded payments₦0 and outstanding₦1500. Session refresh and a full page reload then Open order recovered the same reference. No Print payment receipt button appeared for this unpaid order. No payment or refund was recorded. Screenshot39 captures narrow tracking after matching customer typography. Screenshots40/41 show help empty state and private joining form; no help message or joining code was sent. Page overflow was absent. Browser console showed unrelated Zotero extension errors; no application error was observed in this walkthrough.

Temporary viewport overrides were reset. Customer order record is intentional isolated-demo test data, not production data.

## Validation

- Full suite:254 tests,252 pass,0 fail,2 skip,20.38s. Source fixture updates navigate the actual Counter/optional name/Account/vertical tabs before asserting original behavior. Financial/idempotency/recovery/quote/pause/sign-out assertions retained.
- Dedicated actual PostgreSQL mounted-module scenario:1 pass,0 fail,0 skip,2.30s; eight focused backend leaf tests passed.
- Focused setup and product-scoped stock history:5/5 pass.
- Latest production build passes after customer typography-only correction. Earlier full suite covers all functional changes.
- git diff --check is part of checkpoint commit validation.

## Remaining

The full organization/operational screen state matrix and detailed module hierarchy are unfinished. Branch administration, broader team/menu/finance workflows and role/device-specific browser checks remain. Platform MFA/operator views, controlled uncertain-network refresh, long required modifiers, timed quote/background-tab interaction and paid receipt print preview need dedicated authorized local fixtures. Other help/reservation/cancellation retry state remains memory-only across refresh. No Rubies/Zidi/email/public domain/physical receipt or sticker printing certification exists. No production deployment, production data or real-money operation occurred.
