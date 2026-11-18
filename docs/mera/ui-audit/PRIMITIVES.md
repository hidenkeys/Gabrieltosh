# Mera UI preservation and primitives specification

F4 source assessment, 18 November 2026. Applies to UI correction scope 1.0. This specification records source evidence and acceptance requirements; it does not certify a screen or grant visual-completion credit. No browser/build checks were performed to write it.

## Authority and verified paths

The original running Bing Chun Counter and Reports are the operational design authority. Captures: `docs/mera/ui-audit/screenshots/01-bing-chun-counter.jpg` and `02-bing-chun-overview.jpg`. Current before captures are `03-mera-overview-before.jpg` and `04-mera-orders-before.jpg`. Source: `src/App.tsx` (`Counter`, `Reports`, internal `Modal`, shell) and `src/styles.css`. Consult the actual cascade rather than reproducing a screenshot from memory. The original Mera marketing visual is still unresolved; neither the POS nor current marketing source substitutes for it.

Reuse `src/ProductImage.tsx`, `src/brand.ts`, `public/products/`, `public/brand/brand-logo.png` for the appropriate Bing Chun venue. Never apply that venue's logo to another organization. Uploaded venue assets are supported by `src/mera/MediaUpload.tsx`; safe palette/text contrast comes from `src/mera/branding.ts`.

Current shared shell and pilot: `src/mera/workspace/OrganizationWorkspace.tsx`, `WorkspaceNavigation.tsx`, `OperationalOverview.tsx`, `StaffPos.tsx`, `workspace.css`. Management pilot: `BranchSettings.tsx`, `LaunchReadiness.tsx`, `management.css`. Customer and operator surfaces have separate `src/mera/customer/customer.css` and `src/mera/platform.css`. Stylesheet imports belong centrally to `src/main.tsx`; importing CSS directly from JSX consumers breaks the Node test environment. Lead owns shared shell/styles/primitives and central imports.

## Effective visual values, not an invented token scale

| Source/effective value | Permitted semantic use |
| --- | --- |
| `styles.css` initial root Inter, Apple/BlinkMac/Segoe UI/sans fallbacks; 14px root | Base application typography. Loading Inter is not proven merely by this font stack. |
| Initial root background `#f8f7f4`; sidebar `#fffefa`; root `--line:#e9e6e2` | Warm workspace, quieter panel/sidebar surface, dividers. Original `.panel` is white, so do not claim every legacy panel is cream. |
| Later root block `--brand:#2f7df6`, `--brand-dark:#1558c9`, `--brand-cyan:#83ddf7`, `--brand-ink:#111b2f`, `--brand-yellow:#f6dc58` | Blue action/selection, dark text, restrained venue accents. The later root color overrides initial `#29262b`; explicit component colors still override inheritance. |
| Later `.nav-item.active` color `#1558c9`, background `#e9faff`; hover `#f0f8ff` | Selected navigation, accompanied by text/selected semantics. |
| Original sidebar 232px; nav target at least44px; page title33px/550/line-height1.15 | Starting composition for desktop shell. Not universal spacing/type tokens; adapt by job and later media rules. |
| `.primary/.secondary`: inline-flex,43px minimum,11px type,padding11px17px,radius7px | Existing button geometry. Increase hit area/type where operational readability requires; do not perpetuate tiny text as an accessibility requirement. |
| `.primary`: blue `--brand`, white text; hover `#1558c9` | Primary action. Verify contrast in rendered state; the brighter original blue is not a blanket AA guarantee. |
| `.secondary`: white, border`#e4dce2`,text`#7f6878` | Source secondary styling. It retains older mauve values, so any semantic correction must be explicit rather than falsely attributed to the later blue cascade. |
| Original tables11px, headers9px, headerpadding16px18px, cellpadding18px | Density reference, not a minimum readable font size. Use semantic HTML, adequately readable labels and local overflow. |
| `.modal`:510px (wide800px),max-width100%,max-height94vh,radius15px; overlay25pxpadding | Bounded review/detail dialogs with internal scroll. Source overlay/body use older colors, not final root ink throughout. |
| Original counter:335px basket,28pxgap; >=1600px365px basket/35pxgap; <=1200px300px basket/20pxgap | Keep catalog and current order adjacent where readable. Narrow screens need explicit basket access rather than catalog-length scrolling. |

Original responsive rules include1200/980/740/600px;980px reduces sidebar to76px and600px hides it until opened. These are source behaviors, not automatic requirements for expanded Mera navigation. Current grouped sidebar plus labeled mobile menu must remain discoverable. Avoid competing module pickers/carousels.

## Reusable patterns by task

- **Operational lists and POS:** compact task heading; search/category controls immediately above real product photos; clear variants/modifiers; persistent quantities/total/next action; staff/table context near the order. Reuse `StaffPos.tsx` and existing handlers instead of a second cart state. Kitchen uses `Tickets.tsx` and `OrderInstructions.tsx`: station-specific tickets, quantity/progress, escaped chosen modifiers/order notes, and only recorded dietary/allergen snapshots. No finance/setup filler.
- **Management:** contextual title, concise description, list/detail or settings subsection hierarchy, then advanced policy disclosures. `BranchSettings.tsx` preserves operating/branding drafts while switching sections; `LaunchReadiness.tsx` separates reviewed policy from explicit publication. Styling aliases in `management.css` derive from the values above. Do not apply those aliases globally or call every management module corrected yet.
- **Tables:** reuse `.table-wrap`, semantic table headers and product/status cells where useful. Place primary row action with its row; keep long identifiers/timeline details in labeled drilldowns. A local scroll container is acceptable; page-wide overflow is not. Avoid replacing data with promotional cards.
- **Dialogs:** original internal `Modal` in `App.tsx` sets role/dialog name, initial focus, Escape, focus return and a Tab loop. It is not exported as a shared primitive. Extract centrally only with lead ownership. The current focus query includes disabled/hidden controls and omits links, so do not copy its loop uncritically: use visible enabled tabbables, guard zero-tabbable dialogs, restore the actual opener and test nested/long content. Unknown financial operations must remain recoverable when the dialog closes.
- **Customer:** use organization branding and real photos, immediate browsing, useful branch/table context, accessible customization and persistent cart. Preserve complete charges before confirmation. Keep staff accounting/provider diagnostics out of normal customer screens.
- **Platform administration:** distinct compact lookup/filter/detail composition and MFA boundary; separate merchant funds from Mera revenue. Its intended marketing identity awaits the original visual; do not transplant a POS layout or invent provenance.

## Behavioral invariants the correction cannot change

1. Keep organization/branch/actor identity and permission checks, context refresh, request-generation guards, protected-data clearing and late-response protection. A hidden navigation item is not authorization. Do not broaden backend grants or fabricate empty results after denial.
2. Keep `workspace/api.ts` response deadlines, caller aborts, explicit errors and no silent write retries. Keep financial exact-intent request keys/bodies, scoped `financialJournal.ts`, canonical lookup and fenced abandonment; `not_found` is not proof a timed-out write failed. Explicit logout clears scoped journals; transient connectivity/auth loss does not silently discard recovery.
3. Keep server-issued quotes, minor-unit amounts, immutable pricing/policy snapshots, versions and concurrency errors. Catalog drafts must not alter published customer snapshots. Stock edits must use the guarded inventory endpoints, never catalog PUT to reset balances.
4. Preserve money distinctions: sales versus receipts versus deposit liability; refund recording means an actual manually completed return, with method/reference and approval. Provider observations and simulations do not confirm collections. Writeoffs/waivers are not payments. Unknown tax/revenue stays unresolved, not zero.
5. Preserve current-party table privacy. Joining codes stay private in-memory staff panels; never place them in permanent QR, exports or recovery journals. Existing guest access and old-visit boundaries must survive UI edits.
6. Keep original uncertain-order retry intent, variants/modifier IDs and required-choice rules, prepared/fulfilled limits, historical read-only records, ticket station guards and actual actor timelines. Physical print success is independent of preparation progress. Browser dialogs/queued jobs do not prove output.
7. Keep explicit policy approvals, null unresolved values, feature flags and immutable existing-visit terms. Menu publication is not DNS/TLS deployment or live-provider activation. Never move real funds or production data through a visual correction.

## Required acceptance evidence

Each corrected task needs before/after captures of the same state/viewport, source/API paths and actual interactions at desktop, tablet and narrow widths. Open and compare saved images. Existing JPG captures prove only their recorded states; builds/backend tests do not prove visual acceptance.

- **Focus/inputs:** programmatic visible labels; keyboard-reachable actions; visible focus (original global3px`#b697b2`/3pxoffset or explicitly scoped accessible equivalent); no focus clipped behind sticky panels. Selected states/statuses cannot depend on color alone. Test mobile menu/dialog Escape, focus containment/return, touch targets and long labels/content. Honor reduced motion. Do not claim WCAG certification from a screenshot.
- **Loading:** concise task-specific status; stale data not presented as current after scope switch. Keep navigation/context available where safe. Unknown policy/data differs from zero.
- **Empty:** explain why the list is empty and offer a permitted next step; distinguish no records, filters matching nothing, disabled feature and inaccessible data. No production-looking fixtures.
- **Error/recovery:** actionable inline error, explicit retry where safe, preserved drafts and original uncertain intents. Do not endlessly show loading after a failed readiness request. Do not claim success before the API response.
- **Permission:** verify both visible navigation and direct mounted-content state against role and branch grants, including revocation while open. Owner/operator controls remain separate. Permission denial must clear protected cached content promptly.
- **Responsive/data:** no page-wide horizontal overflow; readable totals and next action without excessive scrolling; meaningful table/list fallback; long names, amounts, notes, labels and empty/error states tested. Record exact viewport and role; Android hardware, printers, live providers and DNS remain separate gates.

F4 remains source specification pending lead review; this document alone does not complete the shared-primitives implementation or Q1 visual gate.
