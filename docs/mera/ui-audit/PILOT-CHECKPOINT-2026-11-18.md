# Pilot integration checkpoint — 18 November 2026

Scope 1.0 remains unchanged. This checkpoint supports C1 at 60% (integrated and exercised), not visual completion or Q1 acceptance. Marketing selection remains pending. No production deployment, live payment or physical printing occurred.

## Customer menu/cart

Source: `src/mera/customer/CustomerExperience.tsx`, `customer.css`; checks in `tests/mera-customer-ui-correction.test.tsx`. Existing actual Bing Chun imagery and venue branding are retained. Compact menu header, category/search controls and a mobile basket shortcut replace the oversized promotion and catalog-length checkout discovery.

Actual local demo at `/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001`: choose Fresh Lemonade Juice, add to basket, quantity changes, basket focus, Back to menu/search focus, zero-result recovery, clear filters and Toppings category all exercised. No order was submitted in this UI session. Existing demo order records were not created by this checkpoint. Empty/paused/unpublished/failure handling has DOM-test coverage; those states were not all induced in the browser.

Found and corrected: the fixed basket shortcut could cover the checkout action. The shortcut now hides when viewing the basket and restores on return to the menu. A visibility observer also handles normal scrolling. Removed animated scroll from these actions. Customer checkout now also has a separate exact-intent protection change under review; this does not certify the full C2 workflow.

Saved and opened captures: `screenshots/12-customer-desktop.jpg`, `13-customer-narrow-menu.jpg`, `14-customer-narrow-basket.jpg`, `15-customer-tablet.jpg`. Desktop default CSS viewport1618×960. Temporary browser dimensions390×844 yielded computed CSS433×938 because the existing Chrome zoom is90%;834×1194 yielded926×1326. No horizontal document overflow at either measured breakpoint. Screenshot clip coordinates were adjusted for the browser zoom: the basket crop used y5472 for DOM scrollY6080. These are actual page captures, not a claim of native Android testing. Temporary viewport override reset afterwards. Unrelated active Chrome windows were not modified.

Remaining C1 acceptance: source-versus-result comparison board, complete required state/keyboard/contrast checks and lead final acceptance. No original customer-menu before screenshot exists for this correction: do not invent one. The earlier Bing Chun POS is a design-system reference, not the same customer screen.

## Workspace account pilot

`WorkspaceAccount.tsx` is mounted only on overview/POS until Q1 permits wider rollout. Organization/branch selectors and the original sign-out reconciliation handler remain in `OrganizationWorkspace.tsx`. The popup exposes current name/role and sign out; Escape restores summary focus, outside pointer closes it, and busy state disables sign out. Native details/summary semantics are retained.

Saved/opened captures16-overview-account-menu.jpg and17-pos-narrow-account.jpg. The browser exercised open, Escape, navigation and narrow access; sign out was deliberately not invoked in the live demo. Inspection found an undefined panel-color alias, corrected in source to the verified original sidebar surface#fffefa. The two captures precede that solid-background fix and must be refreshed before visual acceptance. No console errors observed during the exercised pilot.

`node --import tsx --test tests/mera-ui-pilot.test.tsx tests/mera-workspace.test.tsx`:65passed. The existing suite emits a duplicate branch-key warning in a fixture; do not label the run warning-free.

## Integration evidence and limits

TypeScript/Vite build passed after account/C1 integration. The signup/management/customer correction batch passed12/12 in the lead rerun after an earlier unexplained signup-file-level failure; the worker also reran it twice successfully without weakening assertions. Post-C2 TypeScript/Vite build passed. Full suite rerun with temporary loopback test-server access:199 tests,197 passed,0 failed,2 skipped. The two skipped PostgreSQL integrations remain separate required checks; no Postgres credit is inferred. The initial sandbox run failed with EPERM on127.0.0.1 binds, then the authorized loopback rerun passed. Backend Postgres/provider/printer gates are not certified by these UI tests.
