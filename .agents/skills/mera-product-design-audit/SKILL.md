---
name: mera-product-design-audit
description: Design, UX and audit rules for the Mera platform. Use when building or changing any Mera screen, form, onboarding step, ticket or dashboard, and when auditing what to add, remove, merge, remodel or update.
---

# Mera product design, UX and audit

Use this skill in three modes. Pick the mode first, then follow its section.

- **Build**: you are creating or changing a screen. Follow Principles, Controls, Content, Motion.
- **Audit**: you are asked what is wrong, missing, repeated or outdated. Follow the Audit method and
  produce the report format at the end. Do not change code in an audit.
- **Fix**: you are applying audit findings. Work in the Fix order, one workstream per commit.

Read `src/mera/marketing/marketing-v2.css` (tokens, easing, type), `customer/customer-v2.css`,
`workspace/workspace-v2.css`, `ui/inputs-v2.css` and `workspace/preparation-v2.css` before designing.
The existing app is not bad. The problem is too much happening on screen, repeated asks, and
text boxes where a tap would do. Prefer removing and merging over adding.

## 1. Principles

### Product
1. **One job per screen.** A screen answers one question or completes one task. If a page has three
   tabs of unrelated forms, it is three screens.
2. **Ask once.** Data a person has already given is never asked again. Prefill, or skip the step.
3. **Show the next action.** Every screen has one primary action, visually dominant. Secondary actions
   are quiet. Destructive actions are separated and confirmed by naming what will happen.
4. **Progressive disclosure.** Show the 20% that 80% of people need. Put the rest behind
   "More options". Never show a setting the person cannot meaningfully change yet.
5. **Honest state.** Always show what is happening: saved, saving, waiting for payment, failed and how
   to retry. Never use internal words (unresolved, uncertain, origin, version).
6. **Reduce, then polish.** Before restyling anything, ask whether it should exist.

### Visual (Mera identity)
- Ivory `#f7f6f0` paper, forest `#153f32` and lime `#d9eb92` for Mera surfaces. Organizations bring their
  own accent through `--brand` (workspace) and `--mc-primary` (guest menu). Never hard-code a venue colour.
- Type: Mera Display (Bricolage Grotesque) for headings and figures, Mera Text (Instrument Sans) for body.
  Sentence case everywhere. No tracked all-caps labels. Numbers use `font-variant-numeric: tabular-nums`.
- Metaphor: the order ticket. Perforation with side notches, dashed tear lines, stamped references. Use
  it where something is literally an order, basket, receipt or ticket. Do not decorate with it.
- Surfaces: one radius family (10, 14, 18, 24), hairline borders, shadows only to show elevation.
- Spend boldness in one place per screen. Everything else is quiet.
- Avoid the generic kit: identical rounded cards in a grid, gradient washes, a monospace face for small
  labels, numbered 01/02/03 unless the content is truly a sequence.

### Accessibility floor
Touch targets at least 44px. Visible `:focus-visible` ring. Text contrast at least 4.5:1. Every control has an
accessible name. Status is never colour alone. Keyboard path for everything. Respect reduced motion.

## 2. Choosing a control (apply, do not improvise)

| Situation | Use | Never |
| --- | --- | --- |
| 2 to 4 fixed options | Segmented control or radio cards | `<select>` |
| 5 to 12 fixed options | Single-select chips | `<select>` |
| Over 12, or options from data (orders, tables, products) | Searchable combobox showing reference, name, amount | Plain `<select>` |
| Yes / No | Switch whose label states the effect | Yes/No `<select>` |
| Small count (party size, quantity) | Stepper, chips 1 to 8 plus "9+" | Bare number input |
| Money | `MoneyInput`: ₦ prefix, decimal keypad, separators, quick amounts | `type="number"` |
| Cash handed over | Quick chips (Exact, next ₦500, next ₦1,000) and live change due | Free calculation |
| Reason or note | Preset chips first, free text only behind "Other" | A required text box |
| Date and time | Day strip plus time-slot chips from opening hours | `datetime-local` |
| Date range for reports | Presets (Today, Yesterday, This week, This month) then Custom | Two date boxes |
| 5+ related checkboxes | Grouped switches with role presets | A wall of checkboxes |
| Choosing a record to act on | Start from the record's own action so it is prefilled | A "Choose order" dropdown |
| Phone | `type="tel"`, `inputMode="tel"`, `autocomplete="tel"`, format as typed | Plain text |
| 15+ controls on one screen | Steps with progress, one concern per step | One long form |

Shared controls live in `src/mera/ui/` (Segmented, Stepper, MoneyInput, Combobox, Switch, ReasonInput,
DateTimePicker, DateRangePresets). Reuse them. Add a new one only when none fits, and make it accessible
(radiogroup semantics, arrow keys, `aria-live` for value changes). A custom control must submit the same
value the native one did.

## 3. Content rules

- Write for the person's task in plain words. A user manages orders, not tickets-with-versions.
- Sentence case, active voice, plain verbs. A button says exactly what happens ("Mark ready", not
  "Submit"). The same action keeps the same name through the flow, and the confirmation echoes it.
- Remove internal vocabulary: Unresolved, uncertain order, request origin, version, scope, handler.
- Errors say what went wrong and what to do next. They do not apologize and are never vague.
- Empty states invite the next action in one sentence.
- Do not restate a label in a helper line. One heading per section. No duplicate page title and card title.
- Keep legal, readiness and policy caveats word for word unless a human approves a change.

## 4. Motion

Motion answers an action (press, open, confirm, status change) or marks one orientation moment. Transform and
opacity only. Press `scale(0.97)`. Easing `cubic-bezier(0.22, 1, 0.36, 1)`. Hover effects only under
`@media (hover: hover) and (pointer: fine)`. No looping decoration except a single live-status dot.
`prefers-reduced-motion: reduce` turns everything off.

## 5. Audit method

Run in this order. Collect evidence, then judge.

1. **Inventory screens and flows.** List routes and tabs (crawl the demo, see Running it). For each
   screen record its job in one sentence. If you cannot, the screen is unclear.
2. **Inventory data collected.** For every field: label, control, required, where the answer is used.
   A crawl script that lists `input/select/textarea` with labels is the fastest way. Flag:
   - the same datum asked in more than one place (contacts, timezone, currency, service modes, hours)
   - free text where choices exist
   - number inputs for money, counts, dates
   - dropdowns with 4 or fewer options, Yes/No selects, checkbox walls
   - fields nobody downstream reads (ask the code: is the value used?)
3. **Trace the journeys.** Walk sign-up to first sale, an order from guest to kitchen to payment, a refund,
   a shift close. Count taps, screens, and typed characters. Note every point a person waits, repeats or
   guesses.
4. **Score each screen** against the rubric below. Anything scoring 0 or 1 is a finding.
5. **Judge keep, merge, cut, remodel, update.** Decide per screen:
   - **Keep**: does one job and passes the rubric.
   - **Merge**: two screens collect overlapping data or serve one decision.
   - **Cut**: nothing downstream reads it, or it is a duplicate confirmation.
   - **Remodel**: the job is right, the interaction is wrong (wall of inputs, bulky cards).
   - **Update**: right design, outdated control, wording or style.
   - **Add**: a missing state (empty, error, loading, success) or a missing shortcut.

### Rubric (score 0 to 3 each)
1. Job clarity: one obvious purpose and primary action.
2. Input efficiency: right control, minimum typing, sensible defaults and presets.
3. No repetition: nothing asked that is already known.
4. Density: only what the person needs now, the rest disclosed.
5. Feedback: loading, saving, success, failure with recovery all present and worded plainly.
6. Content: plain language, no internal terms, consistent verbs.
7. Visual system: tokens, type, radius, ticket metaphor used only where literal.
8. Accessibility and touch: targets, focus, names, contrast, reduced motion.
9. Responsive: works at 390, 820, 1440 without horizontal scroll.

### Known findings to start from (verify before acting)
- **Onboarding repeats itself.** Sign-up (name, email, password), owner verification, Create organization
  (name, Mera address), Getting started (`SetupChecklist`: business contact, phone, primary service, hours,
  timezone, currency, Yes/No policies), Branch administration (branch name, timezone, currency, service modes),
  and Launch readiness (public customer contact, manual payment review, two confirmation checkboxes). Business
  contact, phone and public contact are three asks for one fact. Timezone and currency are asked in Getting
  started and again in Branch settings. Service modes appear twice. Two checkboxes confirm the same publish.
  Remodel into one guided setup: Account, Business, Branch, Payments, Go live. Ask each fact once, prefill later
  screens, and replace the two publish checkboxes with one review screen and one "Go live" button.
- **Kitchen and bar tickets** were bulky (number input and save button per item). Redone on `mera-ux-screens`;
  keep that pattern for any new queue (stepper, progress dots, one big action, clock chip).
- **Stock** shows a count and reason box for every product. Replace with one "Adjust stock" sheet.
- **Typed reasons** (cancel, refund, reprint, cash, stop reservation) become chips plus "Other".
- **Money** uses `type="number"` in about 40 places. Use `MoneyInput`.
- **Order pickers** are `<select>` lists on Orders, Transactions, Refunds, Subscription.
- **Settings pages** show "Unresolved" options and about 60 controls on Getting started.
- **Too much at once:** Orders has four filter selects; Subscription mixes owner and operator settings;
  the sidebar lists about 20 items. Group them, hide operator-only items, put rare tools under "More".

### Audit report format
Return a table per area with columns: Screen, Job, Finding, Evidence (file and line or screenshot), Verdict
(keep, merge, cut, remodel, update, add), Effort (S, M, L), Impact (low, medium, high). Sort by impact over
effort. End with a prioritized list of at most 10 workstreams, each small enough for one commit.

## 6. Fix order

1. Remove and merge (repeated asks, duplicate confirmations, dead fields). Least code, most calm.
2. Replace controls using the table in section 2.
3. Remodel dense screens (steps, sheets, cards).
4. Update wording (section 3).
5. Polish visuals and motion last.

For every fix: keep API paths, bodies and server code unchanged; keep accessible names that tests use or update the
test with an equivalent assertion in the same commit; never delete a test to pass.

## 7. Running it

```
npm ci
npm run preview:mera   # embedded Postgres, demo data, http://127.0.0.1:3003 (serves dist, rebuild after edits)
npx tsc --noEmit && npm test && npm run build
```
Run the preview as a non-root user. The first run prints `ISOLATED MERA DEMO LOGIN: admin / <password>`;
delete `data/mera-demo-db` to reset it. Workspace is `/mera/workspace`, guest menu is
`/mera/menu/bing-chun/20000000-0000-4000-8000-000000000001`. Check screens with Playwright at 390x844,
820x1180 and 1440x900. Import CSS only from `src/main.tsx` (a CSS import inside a component breaks the Node
test runner).

## 8. Definition of done

Typecheck, tests and build are clean. Screenshots at three widths with no horizontal scroll and no console
errors. Keyboard path works with visible focus. Reduced motion respected. No new bare `type="number"` for
money, no `<select>` with four or fewer options, no text box where a preset answers the question. One commit
and push per workstream.
