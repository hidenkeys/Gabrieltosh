---
name: mera-design-excellence
description: Design, implement and visually verify Mera marketing, owner onboarding and platform administration while preserving the existing Bing Chun operational UI. Use for this repository's interface work, not unrelated products or backend-only changes.
---

# Mera design excellence

Read [verified foundations](references/foundations.md) before changing an interface. This skill extends `mera-ui`; the November 20 staging/redesign brief supersedes its earlier marketing treatment. It does not change operational authority or authorize external actions. Shared Zidi principles inform hierarchy, task architecture, forms, navigation, motion and verification; no Zidi brand or product assumptions belong here.

## Choose the design context

**Mera marketing:** a distinctive hospitality technology identity using the supplied geometric mark, strong sans-serif headings, paper/white/forest section contrast and restrained lime emphasis. Explain the service journey with actual product captures. A cream page, serif title and repeated cards are not an acceptable redesign. Establish a common header/content/footer grid, then vary composition by purpose: editorial promise, legible product demonstration, sequential service journey, service-mode exploration, clear commercial disclosure, FAQ and action. Never fabricate customers, scale, delivery or live integrations.

**Owner signup, onboarding and Mera operators:** use the same identity at business-software density. Registration is separate from sign-in, demo and operator authentication. Keep initial account creation short and later setup resumable. Use a step rail, useful-width form and contextual preview on desktop; a focused single column on mobile. A visited step is not a completed step. Show exact saved/unsaved/uncertain status. Platform operators need compact grouped navigation, filters, readable records and contextual details, not a marketing hero. Preserve MFA, scope checks and reasoned audit actions.

**Organization operations:** preserve Bing Chun's actual source styling, photos, controls and familiar interactions. Follow `../mera-ui/references/bing-chun.md`. POS needs catalog/current-order adjacency; preparation needs station tickets; administration needs compact task headings and grouped navigation; customers need venue-branded browsing and checkout. Do not apply Mera-owned marketing colors globally or replace working forms with decorative mockups.

## Shared contracts and layout

One owner edits a shared file at a time. Reuse `MeraBrand`, the scoped foundation variables and existing focus/dialog helpers. Inspect their current implementation before changing them. New tokens are deliberate Mera proposals, never claimed to be original Bing Chun values.

- Use a bounded shared content grid with consistent outer gutters; headings and controls align with their content.
- Use one clear primary action per task. Keep row actions beside records, advanced configuration in contextual sections and optional steps honestly skippable.
- Avoid giant welcome areas, excessive empty form surroundings, endless horizontal module bars and internal implementation language on ordinary screens.
- Labels remain visible. Errors explain correction and link to fields. Password visibility, keyboard focus, busy states and retries must be usable. Keep user's input across recoverable failures.
- Data tables may scroll within a named region; the whole page must not overflow. Mobile menus must expose the current location and keyboard dismissal.
- Use Lucide icons already installed. Never approximate the supplied logo with text, tracing or CSS shapes.
- Motion uses shared short timings, transform/opacity for entrances and explicit reduced-motion handling. Content is present without animation; no scroll hijacking or reveal-dependent visibility.

## Functional and commercial boundaries

Preserve routes/contracts, tenant/branch authorization, server pricing, stock, financial journals, idempotency, guest privacy and uncertain-write recovery. Explain any necessary backend change with a demonstrated workflow blocker. Server configuration remains the authority for readiness. Unavailable email must not become fake ownership verification; demo paths must say demo and cannot grant platform access. Proposed subscription and fee policies are not approved prices or live collections.

## Evidence and completion

Capture before edits where accessible. Use Product Design Audit for flow review, Mobbin for a specific researched pattern when useful, and Image to Code only for an explicitly selected visual. Read relevant available skills. Report tooling failures without inventing inspection.

After implementation, inspect actual rendered routes at mobile, tablet, laptop and wide desktop; record actual CSS viewport sizes. Save and open screenshots. Compare before/after at matching viewport/state in one comparison artifact; show representative results. Exercise CTAs, menus, forms, resume/reload, errors, keyboard focus, reduced motion and relevant permissions. Test authentic protected states through normal login; login screenshots do not prove protected screens were checked.

Builds and DOM tests support functional evidence but do not prove visual acceptance. Record implementation, runtime integration, responsive review and final acceptance separately in the progress tracker. Keep staging health, UI completion and production readiness distinct. Never claim user approval without an explicit response.
