---
name: mera-ui
description: Correct Mera interfaces in the Gabrieltosh project using the verified original Bing Chun design system, task-specific layouts and browser screenshot comparisons. Use for Mera UI implementation or review, not backend-only work or unrelated products.
---

# Mera UI

Preserve Bing Chun's existing design system and working behavior. Start with [verified sources](references/bing-chun.md); paths are relative to this repository. Inspect the current source/cascade before using recorded values. Reuse components/assets before introducing equivalents. UI work does not authorize changing pricing, permissions, backend contracts or recovery behavior.

## Evidence workflow

1. Read repository instructions and current diffs. Coordinate file ownership; preserve uncommitted work. Capture the current screen before edits. A login page proves only that the login page was inspected.
2. Use Product Design Audit when available: capture/save/open screenshots, walk the real task, tie findings to captures, distinguish accessibility risks from tested behavior. Use the browser skill first; report failures accurately before a supported fallback. Never claim inaccessible screens were reviewed.
3. Use Mobbin Redesign Screen for a specific screen needing researched interaction patterns. Read its best-practices/search guidance, inspect returned images, retain exact screen links and borrow structure only. Keep Bing Chun's theme. If unavailable, report that and continue source-grounded work without invented precedent.
4. Use Image to Code only for an explicitly selected visual. Match that actual reference within the existing project. Do not generate an alternative or imply an unselected mock was approved.
5. Implement the smallest coherent change. Preserve real data, server-priced totals, permissions, idempotency, uncertain-write recovery and scope guards. Do not replace functioning actions with mock success.
6. Verify in the running browser at desktop, tablet and narrow widths. Exercise navigation, search, selection, basket controls, required customization, keyboard focus and relevant empty/error states. Save after captures at the same viewport/state as before. Open saved files and inspect a combined before/after comparison; fix visible issues before declaring UI completion. Builds and DOM tests alone are insufficient.

## Layout by job

- **POS:** reuse original Counter composition: searchable photo catalog, compact category selection, readable prices, separate current-order panel. Keep quantities/options/total/next action together. Retain catalog/cart adjacency where readable on tablets; explicitly reflow or offer a basket view on narrow screens, never bury checkout below the whole catalog. Preserve variants/modifiers and table-visit choice. Separate creation from history administration.
- **Organization administration:** compact contextual title, organization/branch selectors and grouped persistent navigation. Today's totals, live work and actionable exceptions lead; detailed accounting/configuration uses titled sections/disclosures. Keep honest metric definitions and unknown values. Avoid large promotional cards for ordinary data rows.
- **Kitchen/bar:** station-specific ticket grid/queue with quantities, modifiers, notes, elapsed time, actor and explicit progress actions. Prioritize scan density/touch targets, with no finance/setup distraction or dependency on print success.
- **Customer ordering:** venue/branch context, published category hierarchy, photos, readable prices, accessible customization/cart and complete charges before confirmation. Preserve secure joining, guest privacy, pending/uncertain states and reconciliation. Avoid internal accounting/provider jargon in ordinary ordering.
- **Mera platform administration:** related styling with compact tables, filtering, audited action dialogs, explicit organization scope and MFA boundaries. Separate merchant funds from platform revenue. POS density is inappropriate for sensitive operator review.
- **Marketing:** the owner confirms there is no original Mera screenshot and requests a new sophisticated enterprise identity. Read [reference status](references/marketing.md). Use the explicitly selected new visual for marketing and related platform styling. Keep Bing Chun as the organization workspace authority; do not claim an original marketing reference exists.

## Interface constraints

- No oversized welcome sections on working screens. Use a task title and remove greeting filler.
- No endless horizontal module navigation or duplicate page pickers. Use the original grouped sidebar on desktop and a labeled accessible compact navigation on small screens. Short product-category selection is distinct from module navigation.
- No implementation language on normal screens: “canonical”, “bounded snapshot”, “lease fencing”, raw API paths or similar. Explain what staff must do and what is known. Keep diagnostics in explicitly labeled administration/support details. Preserve genuine uncertainty and payment restrictions.
- Reuse verified cream surfaces, typography, blue accents, borders and real imagery. Do not invent token scales or import a different design system. Document new semantic aliases to existing values.
- Give each screen a clear task hierarchy; keep controls beside their data, statuses understandable without color, labels programmatic, focus visible and handheld hit areas usable. Scope CSS to avoid accidental changes elsewhere.
- Record exact viewports/states tested. Do not infer full WCAG, Android or printer certification from screenshots.

Completion requires verified component/asset paths, saved before/after comparison, interaction checks, appropriate build/regression evidence and honest unresolved gates. Extend shared patterns beyond overview/POS only after those two pass visual review.
