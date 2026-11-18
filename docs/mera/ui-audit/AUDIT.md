# Organization overview and POS audit

18 November 2026. Product Design Audit, combined UX/accessibility review. Scope is the organization overview and staff order-entry task. Other surfaces are not approved by this review.

## Source and preservation

User-selected visual authority: Chrome, http://localhost:3003/ (the original Bing Chun application). Original Counter and Reports were accessed there using the existing isolated demonstration login. localhost:3002 showed only its login/failed-authentication state; no authenticated inspection is claimed there. Existing backend, DB, permission/recovery code and other uncommitted work must survive.

Preserve cream surfaces, typography, blue accents, source photographic assets, sidebar language, basket/catalog separation, all real price/stock/customization rules, private tenant/branch scope and uncertain-request handling. The user's clarification makes this running source the marketing design-language reference too; no separate marketing-page composition has been inspected.

## Captured task steps

1. **Original counter, reference** — healthy task structure. `screenshots/01-bing-chun-counter.jpg`: search/categories/catalog and current order coexist; grouped navigation stays left. Some small original text warrants accessibility caution rather than blind copying.
2. **Original overview, reference** — healthy hierarchy. `02-bing-chun-overview.jpg`: compact title, report date/actions, metrics, product/payment detail.
3. **Mera overview, before** — needs correction. `03-mera-overview-before.jpg`: welcome heading, large subscription notice and duplicate module picker/long horizontal strip push service information down. Metric descriptions use internal wording. Financial distinction between sales and receipts is useful and must stay.
4. **Mera Orders, before** — staff order entry is poorly placed. `04-mera-orders-before.jpg`: queue/filter administration leads; the ordering form starts below it. The source has no photographic POS catalog here. Public images already exist, so replacing them with text-only quantity rows lost the source's useful visual treatment.
5. **Corrected overview** — verified pilot. `05-mera-overview-after.jpg`,10/11 responsive captures: compact task title, grouped navigation, live service and totals first; full accounting remains available through disclosures.
6. **Corrected POS** — verified pilot. `06-mera-pos-after-empty.jpg`,07–09 responsive captures: real photos, searchable catalog, separate basket, quantity/customization and reviewed total preserved; explicit narrow basket switch.

Screenshots were saved from the browser and opened locally before acceptance. Browser bridge fallback was used after the in-app skill failed on a local native-module ABI mismatch. No screenshot came from an invented/mock screen.

## Findings and moves

| Finding | Task impact | Scoped move | Evidence |
| --- | --- | --- | --- |
| Duplicate page picker and long horizontal module strip | Staff cannot scan available work like the original sidebar | Local grouped navigation variant for overview/POS; keep all permission-visible destinations | Original sidebar; Square menu navigation example |
| Generic welcome dominates every page | Current task is visually secondary | Compact task-specific title/context | Original Counter/Reports; Square report example |
| Staff ordering below queue, text-only quantity catalog | Finding products and tracking current selection require separate long scans | Dedicated Point of sale section with original ProductImage/catalog/basket styling; queue remains Orders | Original Counter; Fresha and Sweatpals structural examples |
| Long financial detail precedes active service summary | Main overview makes live work hard to scan | Compact metrics, service queue and payment summary first; full definitions/details remain in disclosures | Original Reports; Square overview example |
| Internal wording in ordinary overview | Product asks staff to interpret implementation terminology | Plain task labels; genuine unknown amounts/payment restrictions remain explicit | User requirement and captured source |

## Mobbin research actually inspected

- [Square overview](https://mobbin.com/screens/fa86340e-327a-45ac-8f0e-ea1cda7d7674): left navigation and compact location/customer/category/item reporting. One product example, not multi-product precedent.
- [Square report](https://mobbin.com/screens/fbf2f148-8ab2-4c0e-b93e-6efb653bf49f): report heading, period and compact metrics/product rows.
- [Square menus](https://mobbin.com/screens/f985214d-d81e-4c58-a0ba-d0d0d7145302): grouped sidebar and menu-administration list. This is not an order-entry screen.
- [Fresha cart](https://mobbin.com/screens/45f24034-843e-467a-adf6-b4489e665a53) and [Sweatpals POS](https://mobbin.com/screens/a85506a2-994f-4576-b45b-9f87f62ef1f7): catalog left/current order right. Both are outside hospitality; structural examples only, not borrowed palettes, assets or copy.

The first general dashboard pull returned metadata/images that were not successfully inspected; those captures are not cited. Restaurant POS search returned integration/setup/menu-administration screens rather than a usable restaurant checkout. No claim about restaurant checkout patterns follows from those results. The original Bing Chun Counter remains the strongest exact-domain source.

## Accessibility checks and limits

Inspect visible focus, labeled search/quantity/customization fields, keyboard module access, narrow reflow, readable prices, touch actions and disclosure keyboard behavior. Screenshots cannot establish screen-reader coverage, contrast compliance for every state, Android device behavior or physical printing. No full WCAG2.2AA claim is made.

## Deferred

Pilot visual comparison passed; project-root design-qa.md records evidence and limits. Other workspace pages retain their current implementation pending their own application of the verified patterns. Kitchen/bar, customer, platform and marketing requirements are recorded in .agents/skills/mera-ui; they are not silently claimed corrected by these two screens. Provider/policy restrictions are preserved; no backend/provider change is part of this UI pass.
