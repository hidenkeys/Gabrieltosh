# Verified source map

Verified 18 November 2026 in Gabrieltosh. Paths below are repository-relative.

## Visual evidence

localhost:3002 showed the original login with a failed sign-in; authenticated screens were **not** accessed there. The exact legacy React UI was then opened at localhost:3003 `/` using the existing isolated demo session and seeded legacy products. This is original running application code, not a reconstruction or production database.

- Original counter: `docs/mera/ui-audit/screenshots/01-bing-chun-counter.jpg`. Grouped left sidebar, cream workspace, compact heading, searchable photo catalog and separate right basket.
- Original overview: `docs/mera/ui-audit/screenshots/02-bing-chun-overview.jpg`. Date/actions row, compact metrics, product table/payment breakdown.
- Current Mera baseline: `03-mera-overview-before.jpg` and `04-mera-orders-before.jpg` in that same folder.

Only the captured states were inspected. Original authenticated kitchen/bar screens were not reviewed in this audit; inspect before claiming their visual behavior.

## Components and assets

| Purpose | Verified source |
| --- | --- |
| Original shell | `src/App.tsx` default App; `src/styles.css` `.app-shell`, `.sidebar`, `.nav-item`, `.topbar`, `.page-heading` |
| Original POS | `src/App.tsx` Counter; `.counter-layout`, `.counter-toolbar`, `.search-field`, `.categories`, `.product-grid`, `.product-card`, `.basket`, `.basket-lines`, `.basket-summary` |
| Original reporting | `src/App.tsx` Reports; `.metric-grid`, `.report-grid`, `.panel`, `.toolbar` |
| Photos | `src/ProductImage.tsx`, `src/brand.ts`, `public/products/` and existing mappings; uploaded image support already exists |
| Bing Chun logo | `public/brand/brand-logo.png`; existing store.logo/branding usage in App |
| Current Mera shell/handlers | `src/mera/workspace/OrganizationWorkspace.tsx`; preserve mutations, permissions, journals, quote checks and scope guards |
| Staff customization | `src/mera/workspace/StaffOrderItems.tsx`; preserve variants, modifiers and quantity behavior |
| Workspace styles | `src/mera/workspace/workspace.css`; stylesheet imports belong to `src/main.tsx`, not JSX consumers, so Node tests remain usable |
| Kitchen consumers | `src/mera/workspace/Tickets.tsx` and `OrderInstructions.tsx`; preserve immutable line selections/notes, station scope and versioned progress |
| Other surfaces | `src/mera/customer/CustomerExperience.tsx`/customer.css; `src/mera/Platform.tsx`/platform.css; `src/mera/marketing/Marketing.tsx`/marketing.css |

## Values found in source, not invented tokens

`src/styles.css` defines Inter with system fallbacks, background `#f8f7f4`, panels/sidebar `#fffefa`, `--line: #e9e6e2`, `--brand: #2f7df6`. Its later brand block defines `--brand-dark: #1558c9`, `--brand-cyan: #83ddf7`, `--brand-ink: #111b2f`, `--brand-yellow: #f6dc58`, overriding earlier ink. Read the effective cascade; the earlier root `#29262b` is not the final original ink.

Original definitions include a232px sidebar,44px nav targets,33px heading,11px product radius and335px basket, with responsive overrides. These are existing component values, not a universal spacing/type scale. Check later overrides and actual rendered viewport. Some original tiny labels need larger text for operational accessibility.

No generated imagery is needed for this correction. Preserve existing photos. Never attach Bing Chun's mascot to another organization's branding.

## Verified pilot consumers

`src/mera/workspace/WorkspaceNavigation.tsx`, `OperationalOverview.tsx` and `StaffPos.tsx` now compose the source-derived pilot. Their mount is in OrganizationWorkspace.tsx; styles remain centrally imported through main.tsx. Browser evidence05–11 and the combined boards live in docs/mera/ui-audit. See project-root design-qa.md for actual viewport sizes, tested interactions and limits. The grouped shell now serves all20 destinations; detailed module acceptance remains tracked separately. MenuManagement.tsx, MenuPublication.tsx, BranchAdministration.tsx and BusinessDetails.tsx reuse this authority; see MENU-BRANCH-CHECKPOINT.md and comparison screenshots42–53 for actual verification.
