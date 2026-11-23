# Codex handoff: finish the Mera UX modernization (round 2)

Work on this branch (`mera-ux-next`, built on `mera-ux-inputs` 547f9fd). Commit and push after every
workstream. Do not start from `main`, and do not revert Codex's earlier work.

## Read first

1. `.agents/skills/mera-product-design-audit/SKILL.md`. It is the rulebook: principles, the control table,
   content rules, motion, the audit method, report format and fix order. Where this file and the skill
   disagree, the skill wins.
2. `docs/mera/ux-inputs/BOARD.md` (your own round-1 board) and the style sheets listed in the skill.

## What round 1 achieved (verified on 547f9fd)

Full tests: 890 run, 887 pass, 3 skipped, 0 fail (one run showed a single flaky failure under concurrency;
the rerun was clean). Typecheck and build clean. Native `<select>` JSX went from about 100 to 0, number inputs
from 41 to 10, "Unresolved" wording is gone. Preparation tickets (three columns, stepper, sound toggle,
fullscreen), stock adjustment sheets, reason presets, money entry, comboboxes, calendar and party controls,
guest help tiles and the six-step settings review are in. Do not redo them.

## What round 1 did NOT do (this is your work)

The owner's feedback was not only about controls. The app has too much happening on screen, parts of
onboarding repeat, and some data is asked for more than once. Round 1 left all of that untouched.

### A. Audit first (required, nothing built before it)
Run the skill's Audit mode over the whole app and commit `docs/audit/ux-audit.md` in the skill's report
format. Cover onboarding, workspace navigation and density, every form, the guest side, the screens not yet
seen (POS cart with items, bill splitting, payment dialogs, table and floor editing, report detail pages,
print studio, platform console `/mera/platform`) and content.

### B. Remove and merge repeated onboarding (highest value)
Evidence on 547f9fd: sign-up (`Signup.tsx`, `ProviderSignup.tsx`) asks name, email, password; then
`OwnerVerification.tsx`; then `CreateOrganization.tsx`; then `OwnerSetup.tsx` / `BusinessDetails.tsx`
("Business contact"); then `BranchAdministration.tsx` and `BranchSettings.tsx` (branch name, timezone,
currency, service modes); then `LaunchReadiness.tsx` ("Public customer contact", payment method checkboxes,
and further confirmation checkboxes for one publish). Confirm each in the audit, then:
- One guided setup: Account, Business, Branch, Payments, Go live. Ask each fact once and prefill later
  screens. Business contact, phone and public customer contact are one fact: ask once, reuse.
- Timezone and currency are asked in `OwnerSetup.tsx` and again in `BranchAdministration.tsx`: ask once,
  show later as read-only with an edit link.
- Service modes appear twice: keep one place.
- Replace the stack of confirmation checkboxes in `LaunchReadiness.tsx` with one review screen and one
  "Go live" button. Keep every readiness and policy caveat word for word.
- Remove fields nothing downstream reads (check the code for each).

### C. Density of the workspace
The sidebar lists about 13 items under two headings plus tab rows inside pages. Audit and propose grouping,
move rare tools under "More", hide operator-only items from owners (Subscription mixes owner and operator
settings), and trim pages that carry three unrelated forms into separate screens. Orders has several
filters: keep chips with counts, but show only the common ones first.

### D. Leftovers from the plan
- `ReservationRequest.tsx` still renders `datetime-local` (lines ~506 to 515): use the day strip plus time
  slots already built for guests.
- Policy settings still use bare `type="number"`: `PricingPolicy.tsx`, `PolicyEditor.tsx`,
  `DepositPolicy.tsx`, `ReservationPolicy.tsx`, `Categories.tsx`, `PrintStudio.tsx`, `TableEditor.tsx`. Use
  the shared Stepper or a labelled unit input (percent, minutes, naira) with sensible presets.
- Guest feedback rating (`CustomerExperience.tsx` ~line 2813, `name="rating"`) should be five tappable stars
  or faces, and the feedback category should be chips. Confirm order notes offer chips (Less ice, No sugar).
- Marketing leftovers: pricing and support block on `/mera/qr` (still old style), contact, project brief and
  travel interest forms, legal page. Keep legal and readiness wording exactly.
- Ticket sizes: ticket rows are tall because the "Preparation note" panel is large; make notes a collapsed
  one-line chip that expands on tap.
- Wording pass as you go, following the skill's content rules.

### E. Verification you have not yet done
Round 1 verified preparation, stock, POS, cash entry, branch setup and guest reservations at three widths.
Capture and review the rest, record anything not checked, and fix defects you find.

## Hard constraints

1. CSS only imported from `src/main.tsx`.
2. No API path, body or server changes.
3. Keep accessible names that tests use, or update the test with an equivalent assertion in the same commit.
   Never delete a test to make it pass.
4. `npx tsc --noEmit`, the full suite
   (`node --import tsx --test --test-concurrency=2 tests/*.test.js tests/*.test.ts tests/*.test.tsx`) and
   `npm run build` stay clean.
5. A custom control submits the same value as the field it replaces.
6. Do not deploy anywhere. In round 1 the release was pushed to Railway staging; this round is code, tests and
   evidence only unless the owner asks for a deploy.
7. Do not use real accounts, payments or customer email.

## Run it

```
npm ci
npm run preview:mera
```
Non-root user only. First run prints `ISOLATED MERA DEMO LOGIN: admin / <password>`; delete
`data/mera-demo-db` to reset. It serves `dist`: rebuild after each change. Workspace `/mera/workspace`,
guest menu `/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001`. Verify with Playwright at
390x844, 820x1180 and 1440x900.

## Done means

`docs/audit/ux-audit.md` committed. Workstreams B, C and D committed and pushed one by one. Typecheck, full
tests and build clean. Screenshots at three widths for each changed screen, no horizontal scroll, no console
errors. Finish with a short summary of what changed, what was merged or cut (with the fields removed), and
anything you chose not to do and why.
