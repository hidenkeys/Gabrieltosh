# Codex handoff: finish the Mera UX and UI modernization

Paste this whole file into Codex. Work on branch `mera-ux-screens` (create `mera-ux-screens-2` from it if you
prefer). Commit and push after each workstream. Do not start from `main`.

## First, read these (in order)

1. `.agents/skills/mera-product-design-audit/SKILL.md`. It is the rulebook for this task: principles,
   the control-choice table, content rules, motion, the audit method, the report format and the fix order.
   Follow it exactly. Where this file and the skill disagree, the skill wins.
2. `docs/codex-ux-modernization-prompt.md`. The earlier workstream brief with specifics per screen.
3. The style sheets: `src/mera/marketing/marketing-v2.css`, `customer/customer-v2.css`,
   `workspace/workspace-v2.css`, `ui/inputs-v2.css`, `workspace/preparation-v2.css`.

## State of the branches

`mera-marketing-redesign` → `mera-customer-redesign` → `mera-signup-redesign` → `mera-workspace-redesign` →
`mera-ux-inputs` (your shared controls) → **`mera-ux-screens`** (current).

Already done, do not redo:
- Marketing site, guest menu, basket and tracking, sign-up and operator sign-in, workspace look and motion.
- Shared controls in `src/mera/ui/` (Segmented, Stepper, MoneyInput, Combobox, Switch, ReasonInput,
  DateTimePicker, DateRangePresets) and `inputs-v2.css`.
- **Kitchen and bar preparation tickets** (`workspace/Tickets.tsx`, `workspace/preparation-v2.css`): ticket
  card, clock chip, progress dots, `−`/`+` stepper where `+` saves immediately, filter chips with counts.
  Reuse this pattern for any other queue. Known gap: tickets are still one grid, not three status columns.

- **Reason chips (workstream B, partly done):** item cancellation reason (`ItemCancellation.tsx`) and refund
  request and review reasons (`RefundRequests.tsx`) now use `ReasonInput`. Tests select a chip, or choose
  Other and type in "<label> details". Still to convert: the Transactions "Refund reason" and "Reason" fields,
  `MenuPublication.tsx` Reason, `ReservationRequest.tsx` and `ShiftOperation.tsx` "Reason for stopping",
  `PrintStudio.tsx` "Reason for reprint", stock "Adjustment reason" (OrganizationWorkspace ~line 2576),
  cash movement notes. Several tests guard that a private reason draft is dropped or kept across permission
  loss (print studio, reservation, shift); keep that behaviour when converting.

Tests: 833 total, 830 pass, 3 skipped, 0 fail. Keep it that way.

## Step 1: audit before you build (do not skip)

The owner's feedback: the app is not bad, but there is too much happening on screen, parts of onboarding are
repetitive, text boxes are used where a button would do, and some cards are bulky. Run the skill's **Audit
mode** across the whole app and write the report to `docs/audit/ux-audit.md` using the report format in the
skill. Cover these areas, in this order:

1. **Onboarding end to end**: sign-up (`Signup.tsx`, `ProviderSignup.tsx`), `OwnerVerification.tsx`,
   `CreateOrganization.tsx`, `OwnerSetup.tsx`, `SetupChecklist.tsx` ("Getting started"),
   `BranchAdministration.tsx`, `LaunchReadiness.tsx`. Build a table of every datum asked and where. Known
   repeats to confirm and fix: business contact, phone and public customer contact (three asks for one
   fact); timezone and currency in Getting started and again in Branch settings; service modes twice; two
   confirmation checkboxes for one publish action.
2. **Navigation and density of the workspace**: about 20 sidebar items, tab rows, Orders with four filter
   selects, Subscription mixing owner and operator settings. Propose grouping, hiding operator-only items,
   and moving rare tools under "More".
3. **Every form** (the crawl in the earlier brief lists them): free text, number inputs for money and
   counts, dropdowns with four or fewer options, checkbox walls.
4. **Guest side**: order details, help request, reservation, feedback, item customization, payment states.
5. **Screens not yet seen**: POS cart with items, bill splitting, payment dialogs, table and floor editing,
   report detail pages, print studio, platform console `/mera/platform`.
6. **Content**: internal vocabulary, vague errors, empty states, duplicate headings.

Commit the report, then continue.

## Step 2: fix in the skill's order

Do one workstream per commit and push each.

A. **Remove and merge** (biggest calm for least code). Collapse onboarding into one guided setup with steps
   Account → Business → Branch → Payments → Go live. Ask each fact once and prefill later screens. Replace the
   two publish confirmations with one review screen and one "Go live" button. Remove fields nobody reads.
   Hide operator-only settings from owners. Keep legal and readiness caveats word for word.
B. **Typed reasons to preset chips** with "Other" (`ReasonInput`): item cancellation, refund request and
   review, orders refund reason, reservation stop, receipt reprint, stock and cash movements, shift notes.
   Send the chip label as `reason`; a chip satisfies minimum-length rules.
C. **Stock**: replace per-product count and reason boxes in `OrganizationWorkspace.tsx` (~line 2576) with
   one "Adjust stock" sheet (stepper, quick chips, movement type, reason chips, live resulting balance).
   Same for `StockMovements.tsx`.
D. **Money and order pickers**: `MoneyInput` everywhere naira is entered. Cash received gets quick chips and
   change due. Refund amount gets Full and Half and a per-line picker. Cash counting becomes a note-and-coin
   counter. Replace "Choose order" selects with `Combobox`, or better, open forms from the order row prefilled.
E. **Filters and small selects** to segmented or chips with counts: Orders (four selects), Front desk, Shift
   queue, Customer requests, Tables party view, Receipt paper width, POS fulfillment, payment origin, Menu QR
   destination, guest category picker (sticky horizontal chips on mobile).
F. **Dates, times, party sizes**: `DateTimePicker`, `DateRangePresets`, `Stepper` in Reservations, Front desk,
   Subscription, Overview, Report exports and the guest reservation form. Phone fields get tel semantics.
G. **Guest forms** (`customer/CustomerExperience.tsx`): help request as four one-tap tiles, feedback rating as
   stars, order note chips, item customization with chips and a sticky "Add to basket · ₦X", optional seating
   cards on reservation.
H. **People and settings walls**: role cards with one-line descriptions then grouped switches prefilled by role;
   Getting started split into steps with Yes/No as switches; remove "Unresolved" wording; integrations scopes
   as a described list; Subscription grouped into sections.
I. **Remaining density**: group the sidebar, collapse rarely used tools, finish the three status columns on
   Preparation for tablet landscape.
J. **Wording pass** alongside every step, following the skill's content rules.

## Hard constraints

1. CSS is imported only from `src/main.tsx`. A CSS import inside a component breaks the Node test runner.
2. Never change API paths, request bodies or server code.
3. Tests find controls by accessible name. Keep names, or change the test with an equivalent assertion in the
   same commit. Never delete a test to make it pass. Run
   `node --import tsx --test --test-concurrency=2 tests/*.test.js tests/*.test.ts tests/*.test.tsx`.
4. `npx tsc --noEmit` and `npm run build` stay clean.
5. A custom control must submit the same value as the field it replaces.
6. Prepared quantity on a ticket can only go up (server minimum is the saved value).
7. `.mera-workspace label` and older sheets set widths (for example `min-width: 180px` on filter labels). Check
   computed styles when a new control looks stretched, and override with a higher-specificity selector.

## Run it

```
npm ci
npm run preview:mera
```
Run it as a non-root user. First run prints `ISOLATED MERA DEMO LOGIN: admin / <password>`; delete
`data/mera-demo-db` to reset. It serves `dist`, so run `npm run build` after each change. Workspace
`/mera/workspace`, guest menu `/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001`. To get a ticket
on Preparation: place a guest order, then in Orders press "Mark accepted" (payment may need confirming
before the ticket unlocks). Verify with Playwright at 390x844, 820x1180 and 1440x900.

## Done means

Audit report committed. Every workstream above committed and pushed. Typecheck, full tests and build clean.
Screenshots at three widths for each changed screen with no horizontal scroll and no console errors. Keyboard
and reduced-motion checked. Finish with a short summary of what changed, what was cut or merged, and anything
you chose not to do and why.
