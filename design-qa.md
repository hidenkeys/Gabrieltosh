# Mera four-surface pilot design QA

final result: passed

Scope: UI-correction scope1.0 gate Q1 only. This accepts the four pilot compositions for wider rollout, not complete application delivery or all operational/recovery states. Prior report retained at docs/mera/ui-audit/prior-overview-pos-design-qa.md.

## Visual authority and comparison

Organization operations use actual original Bing Chun Counter/Reports, source App.tsx/styles.css and verified brand assets. Customer menu/cart adapts that design system to mobile ordering; no original customer ordering screenshot exists. Marketing uses the exact owner-selected option1 ivory/green image,1003×1568, saved under references/mera-selected-ivory-green.png.

Lead opened and inspected these combined reference/implementation boards:

- docs/mera/ui-audit/counter-comparison-current.jpg: original Counter and latest compact Mera POS, CSS1600×1111. Original catalog/cart adjacency, real photography, blue/cream surfaces and compact hierarchy retained. Fulfillment remains visible; optional customer/note fields are collapsed. Different menus/order and financial data reflect separate isolated demo sources.
- docs/mera/ui-audit/overview-comparison-current.jpg: original Reports and Mera overview, CSS1600×1111. Compact metric row, operational exceptions, service queue, payment breakdown and actual responsibility/activity replace the oversized welcome. Same original brand, spacing family and sidebar structure.
- docs/mera/ui-audit/customer-comparison-current.jpg: original Counter brand reference alongside actual narrow menu, basket and customization dialog. These are distinct jobs/viewports, not a pixel-for-pixel before/after claim. Basket payment instructions and footer were corrected after review to remove provider/approval language and the contradictory submitted-after-confirmed claim.
- docs/mera/ui-audit/marketing-comparison-final.jpg: selected visual and final implementation at CSS1003×1568; details and iteration history in MARKETING-QA.md. Real application screenshots replace generated interface imagery.

## Findings corrected

Marketing first iteration had a three-line headline, heavy wordmark, oversized header and displaced content. Instrument Serif in iteration2 was too condensed. Licensed local Libre Caslon Display and spacing corrections bring the selected two-line proportions and composition closer; this is a researched approximation, not exact font identification. Final desktop/tablet/narrow captures and navigation/CTA paths passed scoped review.

Organization/POS now use the real Bing Chun brand, existing Lucide icons, compact account disclosure and grouped sidebar. Source blue-dark token improves small white-label contrast. Optional POS metadata no longer pushes the basket hierarchy down. Current-date/selected-date reports validate the returned trading day and timezone.

Customer dialog uses focus containment/restoration, inert background, independently scrollable options and fixed action area. Browser checked the actual published no-options item, Escape/Tab behavior, cart access and basket controls. Basket instructions now tell customers how to pay without exposing provider policy. No P0/P1/P2 composition finding remains in the reviewed pilot states.

## Verification and limits

Desktop/tablet/narrow evidence is saved in screenshots/05–23,25–33 and MARKETING-QA.md. Latest comparable overview/POS measured1600×1111 with no horizontal overflow; latest customer basket433×938 with no horizontal overflow or console errors. Temporary viewport overrides were reset. Chrome extension screenshot clipping normalizes90% zoom; saved customer crop uses document coordinates. Its stitched capture can repeat the fixed basket bar; live DOM confirmed that control is hidden while the basket is visible.

Latest full regression:238 tests,236 passed,0 failed,2 skipped. Follow-up copy/recovery regression24/24; production build passed after the copy correction. Separate actual PostgreSQL integration scenario passed with no skips for guest session references and order-attempt fencing. Tests do not establish browser rendering, provider or hardware certification.

No real order/payment was submitted in this browser review. Actual published menu has no required modifier groups; long-option/required-error states have DOM-test evidence, not physical browser fixture evidence. Customer uncertain-write refresh recovery is separately tracked under C2; staff refresh journaling and authoritative attempt resolution remain pending. Remaining organization/operations/platform pages still require shell rollout and workflow review. No Android, full-WCAG, printer, email or payment-provider certification is inferred.
