---
name: mera-design-excellence
description: Design and verify MeraTech company pages, Mera QR onboarding, planned MeraTravel interest, consultancy enquiries and platform administration while preserving Bing Chun operations in this repository.
---

# Mera design excellence

Read [verified foundations](references/foundations.md) and [company architecture](references/company-architecture.md) before changing an interface. This skill extends `mera-ui`; the consolidated MeraTech brief supersedes earlier website/brand/onboarding interpretations. It does not change operational authority or authorize external actions. Shared Zidi principles inform hierarchy, task architecture, forms, navigation, motion and verification; no Zidi brand or product assumptions belong here.

## Choose the design context

**MeraTech company and products:** MeraTech is the parent, Mera QR is the existing hospitality product, MeraTravel Suite is planned, and Consultancy is bespoke discovery/design/development/implementation. Keep their routes, status and CTAs distinct. Use the supplied geometric mark, strong sans-serif hierarchy and meaningful surface contrast. A cream page, serif title and repeated cards are not an acceptable redesign. Establish a common header/content/footer grid and vary composition by purpose. Do not publish unapproved prices, invented customers, offices, response times or integrations.

The supplied `meratech` HTML is context only: do not port its layout, execute its mock authentication, copy pricing, ingredient inventory or live Travel/payment claims. Marketing demonstrations use a coherent explicitly fictional venue and legible editable HTML/components. Interactions must actually switch examples or navigate; no fake payment, booking or submission success. Label Travel visuals as planned concepts. Bing Chun stays in an explicit test/demo context, never the universal MeraTech identity.

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

## Entry and loading

Use the original mark for a brief nonblocking first-session website introduction. Persist only the session-seen flag; failure to store it must not block content. Never impose a timer before showing a ready page or replay a full introduction on every route. For QR entry, show a lightweight Mera status only while actual organization/branch/table/menu resolution is pending, then defer to venue identity. Provide bounded loading, error and explicit retry where a real request can fail. No fake percentages, indefinite hidden content or automatic repeated announcements. Reduced motion skips decorative movement; content and controls remain usable if animation fails.

## Enquiry and interest integrity

Consultancy submissions are requests for review, not accepted projects or quotations. Travel interest is not product signup or a launch promise. Require clear field validation and necessary privacy acknowledgement; retain exact uncertain submissions for explicit retry with duplicate protection. Supporting documents remain private, validated and bounded. Operator list/details/assignment/notes/follow-up require existing platform authorization and auditing. Never claim email delivery without an actual configured provider.

## Functional and commercial boundaries

Preserve routes/contracts, tenant/branch authorization, server pricing, stock, financial journals, idempotency, guest privacy and uncertain-write recovery. Explain any necessary backend change with a demonstrated workflow blocker. Server configuration remains the authority for readiness. Unavailable email must not become fake ownership verification; demo paths must say demo and cannot grant platform access. Proposed subscription and fee policies are not approved prices or live collections.

## Evidence and completion

Capture before edits where accessible. Use Product Design Audit for flow review, Mobbin for a specific researched pattern when useful, and Image to Code only for an explicitly selected visual. Read relevant available skills. Report tooling failures without inventing inspection.

After implementation, inspect actual rendered routes at mobile, tablet, laptop and wide desktop; record actual CSS viewport sizes. Save and open screenshots. Compare before/after at matching viewport/state in one comparison artifact; show representative results. Exercise CTAs, menus, forms, resume/reload, errors, keyboard focus, reduced motion and relevant permissions. Test authentic protected states through normal login; login screenshots do not prove protected screens were checked.

Builds and DOM tests support functional evidence but do not prove visual acceptance. Record implementation, runtime integration, responsive review and final acceptance separately in the progress tracker. Keep staging health, UI completion and production readiness distinct. Never claim user approval without an explicit response.
